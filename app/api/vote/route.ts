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

    // 1. Evitar voto duplo no Redis usando um Set
    const hasVotedKey = `match:${matchId}:voters`;
    const alreadyVoted = await redis.sismember(hasVotedKey, voterId);

    if (alreadyVoted) {
      return NextResponse.json({ message: 'Voto já registado anteriormente' }, { status: 200 });
    }

    // 2. Registar o utilizador no conjunto de votantes do jogo
    await redis.sadd(hasVotedKey, voterId);

    // 3. Pipeline atómico no Upstash: incrementa soma e contagem de cada jogador
    const pipeline = redis.pipeline();

    for (const [playerId, score] of Object.entries(ratings)) {
      const scoreNum = Number(score);
      if (scoreNum >= 1 && scoreNum <= 10) {
        // Incrementa o acumulador de notas
        pipeline.hincrbyfloat(`match:${matchId}:player:${playerId}`, 'sum', scoreNum);
        // Incrementa o número total de votos daquele jogador
        pipeline.hincrby(`match:${matchId}:player:${playerId}`, 'count', 1);
      }
    }

    // Executa tudo num único pedido HTTP
    await pipeline.exec();

    // 4. (Opcional) Guardar também no Supabase em background de forma assíncrona
    // Se o Supabase atingir limite momentâneo, o Redis já garantiu as médias intactas!
    const payload = Object.entries(ratings).map(([playerId, score]) => ({
      match_id: matchId,
      player_id: playerId,
      user_id: voterId,
      score: Number(score),
    }));

    supabase.from('ratings').insert(payload).then(() => {});

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Erro ao registar voto no Redis:', err);
    return NextResponse.json({ error: 'Erro interno ao processar voto' }, { status: 500 });
  }
}