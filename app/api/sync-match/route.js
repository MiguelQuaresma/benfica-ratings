import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const BENFICA_ID = 211;

export async function GET() {
  try {
    // 1. Procurar o último jogo terminado do Benfica
    const fixtureRes = await fetch(
      `https://v3.football.api-sports.io/fixtures?team=${BENFICA_ID}&last=1&status=FT`,
      {
        headers: {
          'x-apisports-key': process.env.API_FOOTBALL_KEY,
        },
      }
    );

    const fixtureData = await fixtureRes.json();
    if (!fixtureData.response || fixtureData.response.length === 0) {
      return NextResponse.json({ message: 'Nenhum jogo terminado recentemente.' });
    }

    const matchInfo = fixtureData.response[0];
    const fixtureId = matchInfo.fixture.id;
    const opponentName = matchInfo.teams.home.id === BENFICA_ID 
      ? matchInfo.teams.away.name 
      : matchInfo.teams.home.name;
    const competitionName = matchInfo.league.name;

    // 2. Registar ou obter o jogo na tabela 'matches'
    const { data: matchRecord, error: matchError } = await supabase
      .from('matches')
      .upsert(
        {
          opponent: opponentName,
          competition: competitionName,
          date: matchInfo.fixture.date,
          is_open_for_voting: true,
        },
        { onConflict: 'date' }
      )
      .select()
      .single();

    if (matchError) throw matchError;

    // 3. Obter as estatísticas dos jogadores e alinhamento oficial
    const playersRes = await fetch(
      `https://v3.football.api-sports.io/fixtures/players?fixture=${fixtureId}&team=${BENFICA_ID}`,
      {
        headers: {
          'x-apisports-key': process.env.API_FOOTBALL_KEY,
        },
      }
    );

    const playersData = await playersRes.json();
    const teamPlayers = playersData.response[0]?.players || [];

    // Filtra APENAS quem esteve em campo (minutos jogados > 0)
    const usedPlayers = teamPlayers.filter(
      (p) => p.statistics[0]?.games?.minutes > 0
    );

    for (const item of usedPlayers) {
      const pName = item.player.name;
      const pPos = item.statistics[0].games.position || 'MED';
      const pPhoto = item.player.photo;
      const isStarter = !item.statistics[0].games.substitute;

      // Garante que o jogador existe na tabela 'players'
      let { data: existingPlayer } = await supabase
        .from('players')
        .select('id')
        .eq('name', pName)
        .maybeSingle();

      if (!existingPlayer) {
        const { data: newPlayer } = await supabase
          .from('players')
          .insert({ name: pName, position: pPos, photo_url: pPhoto })
          .select()
          .single();
        existingPlayer = newPlayer;
      }

      // Adiciona à ficha de jogo do encontro
      if (existingPlayer) {
        await supabase.from('match_lineups').upsert({
          match_id: matchRecord.id,
          player_id: existingPlayer.id,
          is_starter: isStarter,
        }, { onConflict: 'match_id,player_id' });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Jogo vs ${opponentName} sincronizado com ${usedPlayers.length} jogadores que atuaram!`,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}