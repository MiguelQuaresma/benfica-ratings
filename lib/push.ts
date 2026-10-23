import webpush from 'web-push';
import { redis } from '@/lib/redis';

// Subscrições guardadas no Redis (servidor apenas): hash endpoint -> JSON da subscrição
const SUBS_KEY = 'push:subs';

export type PushType = 'live' | 'voting';

export interface MatchForPush {
  id: string;
  opponent: string;
  competition: string;
  date: string;
  is_live?: boolean;
  is_open_for_voting: boolean;
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails('mailto:benficavote@gmail.com', pub, priv);
  vapidReady = true;
  return true;
}

export function isTestMatch(m: MatchForPush) {
  return (
    m.opponent.toLowerCase().includes('teste') ||
    m.competition.toLowerCase().includes('teste')
  );
}

// O jogo está mesmo a decorrer? (mesma regra que a página principal usa)
export function isMatchLive(m: MatchForPush) {
  if (m.is_open_for_voting) return false;
  if (m.is_live) return true;
  const kickoff = new Date(m.date).getTime();
  const now = Date.now();
  // Só conta como "começou agora" nas 3 horas a seguir à hora marcada
  return kickoff <= now && now - kickoff < 3 * 60 * 60 * 1000;
}

export function isValidSubscription(sub: any): sub is webpush.PushSubscription {
  return (
    sub &&
    typeof sub.endpoint === 'string' &&
    sub.endpoint.startsWith('https://') &&
    sub.endpoint.length < 1000 &&
    sub.keys &&
    typeof sub.keys.p256dh === 'string' &&
    typeof sub.keys.auth === 'string' &&
    sub.keys.p256dh.length < 200 &&
    sub.keys.auth.length < 100
  );
}

export async function saveSubscription(sub: webpush.PushSubscription) {
  await redis.hset(SUBS_KEY, {
    [sub.endpoint]: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }),
  });
}

export async function removeSubscription(endpoint: string) {
  await redis.hdel(SUBS_KEY, endpoint);
}

function buildPayload(m: MatchForPush, type: PushType) {
  if (type === 'live') {
    return {
      title: '🔴 O jogo já começou!',
      body: `SL Benfica vs ${m.opponent} (${m.competition}) está a decorrer.`,
      url: '/',
      tag: `live-${m.id}`,
    };
  }
  return {
    title: '🗳️ A votação está aberta!',
    body: `Dá as tuas notas aos jogadores do jogo vs ${m.opponent}.`,
    url: '/',
    tag: `voting-${m.id}`,
  };
}

/**
 * Envia a notificação a todos os subscritores, no máximo UMA vez por jogo e tipo.
 * Devolve quantas foram entregues (ou o motivo de não ter enviado).
 */
export async function notifyMatch(m: MatchForPush, type: PushType) {
  if (type === 'voting') {
    // Depois de a votação abrir, o aviso de "jogo começou" já não faz sentido
    // (evita que a verificação automática o envie quando a votação fechar)
    await redis.set(`push:sent:${m.id}:live`, 'skipped', { nx: true, ex: 60 * 60 * 24 * 14 });
  }
  if (!ensureVapid()) return { sent: 0, skipped: 'Chaves VAPID em falta' };
  if (isTestMatch(m)) return { sent: 0, skipped: 'Jogo de teste' };

  // Trava anti-duplicados: só o primeiro pedido para este jogo/tipo envia
  const lock = await redis.set(`push:sent:${m.id}:${type}`, Date.now(), {
    nx: true,
    ex: 60 * 60 * 24 * 14,
  });
  if (!lock) return { sent: 0, skipped: 'Já enviada' };

  const all = (await redis.hgetall<Record<string, any>>(SUBS_KEY)) || {};
  const subs = Object.values(all).map((v) => (typeof v === 'string' ? JSON.parse(v) : v));
  const payload = JSON.stringify(buildPayload(m, type));

  let sent = 0;
  const expired: string[] = [];

  for (let i = 0; i < subs.length; i += 50) {
    const chunk = subs.slice(i, i + 50);
    const results = await Promise.allSettled(
      chunk.map((s) => webpush.sendNotification(s, payload, { TTL: 60 * 60, urgency: 'high' }))
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        sent++;
      } else {
        const code = (r.reason as any)?.statusCode;
        // 404/410 = o adepto desativou ou a subscrição expirou
        if (code === 404 || code === 410) expired.push(chunk[idx].endpoint);
        else console.warn('Falha a enviar push:', code, (r.reason as any)?.body);
      }
    });
  }

  if (expired.length > 0) await redis.hdel(SUBS_KEY, ...expired);

  return { sent, total: subs.length, removed: expired.length };
}
