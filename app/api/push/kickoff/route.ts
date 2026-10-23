import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { isMatchLive, notifyMatch } from '@/lib/push';

/**
 * Verificação automática do apito inicial dos jogos agendados.
 * Deve ser chamada de poucos em poucos minutos por um cron externo
 * (ex.: cron-job.org a cada 5 min). É segura de chamar à vontade:
 * só envia para jogos que começaram mesmo e nunca repete.
 */
export async function GET() {
  try {
    const since = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data: matches, error } = await supabase
      .from('matches')
      .select('id, opponent, competition, date, is_live, is_open_for_voting')
      .eq('is_open_for_voting', false)
      .gte('date', since)
      .lte('date', now);

    if (error) throw error;

    const results = [];
    for (const m of matches || []) {
      if (!isMatchLive(m)) continue;
      results.push({ match: m.opponent, ...(await notifyMatch(m, 'live')) });
    }

    return NextResponse.json({ success: true, checked: matches?.length || 0, results });
  } catch (err: any) {
    console.error('Erro em /api/push/kickoff:', err);
    return NextResponse.json({ error: err.message || 'Erro' }, { status: 500 });
  }
}
