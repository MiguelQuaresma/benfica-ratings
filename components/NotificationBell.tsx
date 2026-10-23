'use client';
import { useEffect, useRef, useState } from 'react';

type BellState = 'loading' | 'unsupported' | 'ios-install' | 'off' | 'on' | 'denied';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotificationBell() {
  const [state, setState] = useState<BellState>('loading');
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState<string | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTip = (text: string) => {
    setTip(text);
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), 5000);
  };

  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      // No iPhone as notificações só existem com a app instalada no ecrã principal
      setState(isIOS && !isStandalone ? 'ios-install' : 'unsupported');
      return;
    }

    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(async (reg) => {
        if (Notification.permission === 'denied') {
          setState('denied');
          return;
        }
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          // Reenvia para o servidor caso a subscrição tenha mudado
          fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sub),
          }).catch(() => {});
        }
        setState(sub ? 'on' : 'off');
      })
      .catch(() => setState('unsupported'));

    return () => {
      if (tipTimer.current) clearTimeout(tipTimer.current);
    };
  }, []);

  const subscribe = async () => {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) {
      showTip('Notificações ainda não configuradas.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'denied' : 'off');
      if (permission === 'denied') showTip('Bloqueaste as notificações. Ativa-as nas definições do browser.');
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    });
    if (!res.ok) throw new Error('Falha ao guardar');

    setState('on');
    showTip('Vais ser avisado quando o jogo começar e quando a votação abrir.');
  };

  const unsubscribe = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe();
    }
    setState('off');
    showTip('Notificações desativadas.');
  };

  const handleClick = async () => {
    if (busy) return;

    if (state === 'ios-install') {
      showTip('No iPhone, instala primeiro a app: Partilhar ⎋ → "Adicionar ao Ecrã Principal". Depois abre-a e toca no sino.');
      return;
    }
    if (state === 'denied') {
      showTip('Bloqueaste as notificações. Ativa-as nas definições do browser para este site.');
      return;
    }

    setBusy(true);
    try {
      if (state === 'on') await unsubscribe();
      else await subscribe();
    } catch {
      showTip('Não foi possível ativar as notificações. Tenta outra vez.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading' || state === 'unsupported') return null;

  const isOn = state === 'on';
  const label = isOn ? 'Desativar notificações' : 'Ativar notificações';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label={label}
        aria-pressed={isOn}
        title={label}
        className={`relative w-8 h-8 rounded-lg border flex items-center justify-center transition-all disabled:opacity-60 ${
          isOn
            ? 'bg-red-950/40 border-red-800/50 text-red-400'
            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4"
          fill={isOn ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {!isOn && state === 'off' && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-600 ring-2 ring-[#09090b]" />
        )}
      </button>

      {tip && (
        <div
          role="status"
          className="absolute right-0 top-10 w-64 bg-[#121216] border border-zinc-700/80 rounded-xl p-3 text-[11px] leading-snug text-zinc-300 shadow-2xl z-50"
        >
          {tip}
        </div>
      )}
    </div>
  );
}
