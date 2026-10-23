import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isMatchLive, notifyMatch, type PushType } from '@/lib/push';

/**
 * Chamado pelo admin depois de marcar o jogo a decorrer ou abrir a votação.
 * O texto da notificação é construído aqui a partir da base de dados e só é
 * enviado se o jogo estiver mesmo nesse estado — e só uma vez por jogo/tipo.
 * Assim ninguém consegue usar esta rota para mandar mensagens falsas ou repetidas.
 */
export async function POST(req: Request) {
  try {
    const { matchId, type } = (await req.json()) as { matchId?: string; type?: PushType };

    if (!matchId || (type !== 'live' && type !== 'voting')) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const { data: match, error } = await supabase
      .from('matches')
      .select('id, opponent, competition, date, is_live, is_open_for_voting')
      .eq('id', matchId)
      .maybeSingle();

    if (error || !match) {
      return NextResponse.json({ error: 'Jogo não encontrado' }, { status: 404 });
    }

    const stateOk = type === 'live' ? isMatchLive(match) : match.is_open_for_voting === true;
    if (!stateOk) {
      return NextResponse.json({ error: 'O jogo não está nesse estado' }, { status: 409 });
    }

    const result = await notifyMatch(match, type);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('Erro em /api/push/notify:', err);
    return NextResponse.json({ error: 'Erro ao enviar notificações' }, { status: 500 });
  }
}
