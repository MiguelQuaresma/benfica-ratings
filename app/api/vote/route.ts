import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { matchId, voterId, ratings } = body;

    if (!matchId || !voterId || !ratings || Object.keys(ratings).length === 0) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // 1. Evitar voto duplo via Redis (se o Redis estiver configurado)
    let alreadyVoted = false;
    const hasVotedKey = `match:${matchId}:voters`;

    try {
      if (redis) {
        alreadyVoted = await redis.sismember(hasVotedKey, voterId);
      }
    } catch (e) {
      console.warn('Aviso: Redis indisponível para checagem prévia, prosseguindo com Supabase');
    }

    if (alreadyVoted) {
      return NextResponse.json({ message: 'Voto já registado anteriormente' }, { status: 200 });
    }

    // 2. Gravar no Supabase COM AWAIT e UPSERT obrigatório
    const payload = Object.entries(ratings).map(([playerId, score]) => ({
      match_id: matchId,
      player_id: playerId,
      user_id: voterId,
      score: Number(score),
    }));

    const { error: supabaseError } = await supabase
      .from('ratings')
      .upsert(payload, { onConflict: 'match_id,player_id,user_id' });

    if (supabaseError) {
      console.error('Erro crítico ao gravar no Supabase:', supabaseError);
      return NextResponse.json({ error: supabaseError.message }, { status: 500 });
    }

    // 3. Atualizar métricas no Redis em pipeline
    try {
      if (redis) {
        const pipeline = redis.pipeline();
        pipeline.sadd(hasVotedKey, voterId);

        for (const [playerId, score] of Object.entries(ratings)) {
          const scoreNum = Number(score);
          if (scoreNum >= 1 && scoreNum <= 10) {
            pipeline.hincrbyfloat(`match:${matchId}:player:${playerId}`, 'sum', scoreNum);
            pipeline.hincrby(`match:${matchId}:player:${playerId}`, 'count', 1);
          }
        }
        await pipeline.exec();
      }
    } catch (redisErr) {
      console.warn('Erro secundário no Redis (dados já seguros no Supabase):', redisErr);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Erro interno na rota /api/vote:', err);
    return NextResponse.json({ error: 'Erro interno ao processar voto' }, { status: 500 });
  }
}