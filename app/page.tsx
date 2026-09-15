'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [activeMatch, setActiveMatch] = useState(null);
  const [upcomingMatch, setUpcomingMatch] = useState(null);
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState([]);
  const [ratings, setRatings] = useState({});
  const [view, setView] = useState('vote');
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    async function loadData() {
      // 1. Procura jogo aberto para votar
      const { data: current } = await supabase
        .from('matches')
        .select('*')
        .eq('is_open_for_voting', true)
        .limit(1)
        .maybeSingle();

      if (current) {
        setActiveMatch(current);
        const { data: lineups } = await supabase
          .from('match_lineups')
          .select('player_id, is_starter, players(*)')
          .eq('match_id', current.id);
        if (lineups) setPlayers(lineups.map(l => l.players));
        loadStats(current.id);
      } else {
        // 2. Se não houver votação, procura o próximo jogo
        const { data: next } = await supabase
          .from('matches')
          .select('*')
          .gte('date', new Date().toISOString())
          .order('date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (next) setUpcomingMatch(next);
      }
    }
    loadData();
  }, []);

  // Timer decrescente
  useEffect(() => {
    if (!upcomingMatch?.date) return;
    const interval = setInterval(() => {
      const diff = new Date(upcomingMatch.date).getTime() - new Date().getTime();
      if (diff <= 0) {
        clearInterval(interval);
      } else {
        setTimeLeft({
          d: Math.floor(diff / (1000 * 60 * 60 * 24)),
          h: Math.floor((diff / (1000 * 60 * 60)) % 24),
          m: Math.floor((diff / 1000 / 60) % 60),
          s: Math.floor((diff / 1000) % 60)
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [upcomingMatch]);

  async function loadStats(matchId) {
    const { data } = await supabase
      .from('match_player_stats')
      .select('*')
      .eq('match_id', matchId)
      .order('avg_score', { ascending: false });
    if (data) setStats(data);
  }

  const handleSubmit = async () => {
    const playerIds = Object.keys(ratings);
    if (playerIds.length === 0) return alert('Atribui pelo menos uma nota.');

    let voterId = localStorage.getItem('voter_token');
    if (!voterId) {
      voterId = 'anon_' + Math.random().toString(36).substring(2);
      localStorage.setItem('voter_token', voterId);
    }

    const payload = playerIds.map(id => ({
      match_id: activeMatch.id,
      player_id: id,
      user_id: voterId,
      score: ratings[id]
    }));

    await supabase.from('ratings').insert(payload);
    await loadStats(activeMatch.id);
    setView('results');
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 max-w-md mx-auto font-sans pb-12">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-black text-red-600 tracking-wider">BENFICA RATINGS</h1>
      </header>

      {/* Se NÃO há votação aberta: Cartão de Próximo Jogo com Contagem */}
      {!activeMatch && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center mt-6">
          <p className="text-xs uppercase font-extrabold text-red-500 tracking-widest mb-1">Próximo Jogo</p>
          <h2 className="text-2xl font-black text-white">{upcomingMatch ? `vs ${upcomingMatch.opponent}` : 'A carregar calendário...'}</h2>
          <p className="text-zinc-400 text-xs mt-1">{upcomingMatch?.competition || 'SL Benfica'}</p>

          {upcomingMatch && (
            <div className="grid grid-cols-4 gap-2 mt-6">
              {[
                { label: 'DIAS', val: timeLeft.d },
                { label: 'HORAS', val: timeLeft.h },
                { label: 'MIN', val: timeLeft.m },
                { label: 'SEG', val: timeLeft.s }
              ].map((t, idx) => (
                <div key={idx} className="bg-zinc-800 p-2.5 rounded-xl border border-zinc-700">
                  <span className="block text-2xl font-black text-red-500">{t.val}</span>
                  <span className="text-[9px] text-zinc-400 font-bold">{t.label}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-zinc-500 text-xs mt-6">A votação abre logo a seguir ao apito final!</p>
        </div>
      )}

      {/* Se HÁ votação aberta: Interface de Voto e Médias */}
      {activeMatch && (
        <>
          <div className="text-center mb-5">
            <span className="bg-red-600/20 text-red-500 border border-red-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
              Votação Aberta
            </span>
            <h2 className="text-xl font-bold mt-1">vs {activeMatch.opponent}</h2>
          </div>

          <div className="flex bg-zinc-900 p-1 rounded-xl mb-4 border border-zinc-800">
            <button
              onClick={() => setView('vote')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg ${view === 'vote' ? 'bg-red-600' : 'text-zinc-400'}`}
            >
              Minhas Notas
            </button>
            <button
              onClick={() => setView('results')}
              className={`flex-1 py-2 text-xs font-bold rounded-lg ${view === 'results' ? 'bg-red-600' : 'text-zinc-400'}`}
            >
              Médias
            </button>
          </div>

          {view === 'vote' ? (
            <div className="space-y-2.5">
              {players.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <div>
                    <p className="font-bold text-sm">{p.name}</p>
                    <span className="text-[10px] text-red-400 font-semibold">{p.position}</span>
                  </div>
                  <select
                    value={ratings[p.id] || ''}
                    onChange={e => setRatings({ ...ratings, [p.id]: Number(e.target.value) })}
                    className="bg-zinc-800 text-red-500 font-black p-2 rounded-lg border border-zinc-700 outline-none"
                  >
                    <option value="" disabled>-</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              ))}
              <button
                onClick={handleSubmit}
                className="w-full mt-4 bg-red-600 hover:bg-red-700 font-black py-3.5 rounded-xl cursor-pointer"
              >
                Submeter Notas
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.map(s => (
                <div key={s.player_id} className="flex items-center justify-between p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <div>
                    <p className="font-bold text-sm">{s.player_name}</p>
                    <span className="text-[10px] text-zinc-500">{s.position} • {s.total_votes} votos</span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-red-500">{s.avg_score}</span>
                    <span className="text-xs text-zinc-500"> /10</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}