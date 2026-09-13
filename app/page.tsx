'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [match, setMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState([]);
  const [ratings, setRatings] = useState({});
  const [view, setView] = useState('vote'); // 'vote' ou 'results'
  const [status, setStatus] = useState({ loading: false, msg: '' });

  useEffect(() => {
    loadActiveMatch();
  }, []);

  async function loadActiveMatch() {
    // 1. Procurar o jogo ativo
    const { data: currentMatch } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', true)
      .limit(1)
      .single();

    if (!currentMatch) return;
    setMatch(currentMatch);

    // 2. Procurar APENAS os jogadores que participaram neste jogo
    const { data: lineups } = await supabase
      .from('match_lineups')
      .select('player_id, is_starter, players(*)')
      .eq('match_id', currentMatch.id);

    if (lineups) {
      setPlayers(lineups.map(l => ({ ...l.players, is_starter: l.is_starter })));
    }

    // 3. Carregar as médias atuais da comunidade
    loadStats(currentMatch.id);
  }

  async function loadStats(matchId) {
    const { data } = await supabase
      .from('match_player_stats')
      .select('*')
      .eq('match_id', matchId)
      .order('avg_score', { ascending: false });

    if (data) setStats(data);
  }

  const handleScore = (id, score) => {
    setRatings(prev => ({ ...prev, [id]: score }));
  };

  const handleSubmit = async () => {
    const playerIds = Object.keys(ratings);
    if (playerIds.length === 0) {
      alert('Seleciona a nota de pelo menos um jogador.');
      return;
    }

    setStatus({ loading: true, msg: '' });

    let voterId = localStorage.getItem('voter_token');
    if (!voterId) {
      voterId = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('voter_token', voterId);
    }

    const payload = playerIds.map(id => ({
      match_id: match.id,
      player_id: id,
      user_id: voterId,
      score: ratings[id]
    }));

    const { error } = await supabase.from('ratings').insert(payload);

    if (error) {
      setStatus({ 
        loading: false, 
        msg: error.message.includes('unique') ? 'Já enviaste as tuas notas para este jogo!' : 'Erro ao guardar votos.' 
      });
      setView('results');
    } else {
      await loadStats(match.id);
      setStatus({ loading: false, msg: 'Notas registadas com sucesso!' });
      setView('results');
    }
  };

  const motm = stats.length > 0 ? stats[0] : null;

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-4 max-w-md mx-auto font-sans pb-12">
      {/* Cabeçalho do Jogo */}
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-black text-red-600 tracking-wider">BENFICA RATINGS</h1>
        {match ? (
          <p className="text-sm text-neutral-400 mt-1">vs <span className="text-white font-bold">{match.opponent}</span> ({match.competition})</p>
        ) : (
          <p className="text-xs text-neutral-500 mt-1">Sem jogos abertos para votação</p>
        )}
      </header>

      {/* Alternador de Abas */}
      <div className="flex bg-neutral-900 p-1 rounded-xl mb-6 border border-neutral-800">
        <button
          onClick={() => setView('vote')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${view === 'vote' ? 'bg-red-600 text-white' : 'text-neutral-400'}`}
        >
          Minha Avaliação
        </button>
        <button
          onClick={() => { loadStats(match?.id); setView('results'); }}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${view === 'results' ? 'bg-red-600 text-white' : 'text-neutral-400'}`}
        >
          Médias da Malta
        </button>
      </div>

      {status.msg && (
        <div className="p-3 mb-4 text-xs font-semibold rounded-lg bg-neutral-800 border border-neutral-700 text-center text-red-300">
          {status.msg}
        </div>
      )}

      {/* VISTA 1: Ecrã de Voto */}
      {view === 'vote' && (
        <div className="space-y-3">
          {players.map((player) => (
            <div key={player.id} className="flex items-center justify-between p-3.5 bg-neutral-900 border border-neutral-850 rounded-xl">
              <div>
                <p className="font-bold text-sm">{player.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] bg-red-950 text-red-400 px-2 py-0.5 rounded font-bold">{player.position}</span>
                  <span className="text-[11px] text-neutral-500">{player.is_starter ? 'Titular' : 'Suplente'}</span>
                </div>
              </div>

              <select
                value={ratings[player.id] || ''}
                onChange={(e) => handleScore(player.id, Number(e.target.value))}
                className="bg-neutral-800 text-red-500 font-extrabold text-base p-2 px-3 rounded-lg border border-neutral-700 outline-none"
              >
                <option value="" disabled>-</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          ))}

          <button
            onClick={handleSubmit}
            disabled={status.loading || !match}
            className="w-full mt-4 bg-red-600 hover:bg-red-700 disabled:bg-neutral-800 font-bold py-3.5 rounded-xl cursor-pointer"
          >
            {status.loading ? 'A calcular...' : 'Submeter Avaliação'}
          </button>
        </div>
      )}

      {/* VISTA 2: Médias da Comunidade & Homem do Jogo */}
      {view === 'results' && (
        <div className="space-y-4">
          {motm && Number(motm.avg_score) > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-red-950 to-neutral-900 border border-red-700 text-center">
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-red-400">🔥 Homem do Jogo</span>
              <h3 className="text-xl font-black mt-0.5">{motm.player_name}</h3>
              <p className="text-3xl font-black text-red-500 mt-1">{motm.avg_score}</p>
              <p className="text-[11px] text-neutral-400 mt-1">{motm.total_votes} votos contabilizados</p>
            </div>
          )}

          <div className="space-y-2">
            {stats.map((s) => (
              <div key={s.player_id} className="flex items-center justify-between p-3 bg-neutral-900 border border-neutral-800 rounded-xl">
                <div>
                  <p className="font-bold text-sm">{s.player_name}</p>
                  <span className="text-[11px] text-neutral-400">{s.total_votes} votos</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-red-500">{s.avg_score}</span>
                  <span className="text-xs text-neutral-500"> /10</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}