'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Match {
  id: string;
  opponent: string;
  competition: string;
  date: string;
  is_open_for_voting: boolean;
}

interface Player {
  id: string;
  name: string;
  position: string;
  photo_url: string;
}

interface Stat {
  player_id: string;
  player_name: string;
  position: string;
  photo_url: string;
  avg_score: number;
  total_votes: number;
}

const POSITION_ORDER: Record<string, number> = {
  'GR': 1,
  'DEF': 2,
  'MED': 3,
  'AVA': 4,
  'TREINADOR': 5,
};

function PlayerAvatar({ src, name }: { src: string; name: string }) {
  const [hasError, setHasError] = useState(false);

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  if (hasError || !src) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-red-500 font-black text-xs select-none">
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setHasError(true)}
      className="w-full h-full object-cover object-top"
    />
  );
}

export default function Home() {
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [view, setView] = useState<'vote' | 'results'>('vote');
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });

  useEffect(() => {
    async function loadData() {
      const { data: current } = await supabase
        .from('matches')
        .select('*')
        .eq('is_open_for_voting', true)
        .limit(1)
        .maybeSingle();

      if (current) {
        const matchData = current as Match;
        setActiveMatch(matchData);
        const { data: lineups } = await supabase
          .from('match_lineups')
          .select('player_id, is_starter, players(*)')
          .eq('match_id', matchData.id);

        if (lineups) {
          const rawPlayers = lineups
            .map((l: any) => l.players)
            .filter(Boolean) as Player[];

          const sorted = rawPlayers.sort((a, b) => {
            const orderA = POSITION_ORDER[a.position] || 99;
            const orderB = POSITION_ORDER[b.position] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name);
          });
          setPlayers(sorted);
        }
        loadStats(matchData.id);
      } else {
        const { data: next } = await supabase
          .from('matches')
          .select('*')
          .gte('date', new Date().toISOString())
          .order('date', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (next) setUpcomingMatch(next as Match);
      }
    }
    loadData();
  }, []);

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
          s: Math.floor((diff / 1000) % 60),
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [upcomingMatch]);

  async function loadStats(matchId: string) {
    const { data } = await supabase
      .from('match_player_stats')
      .select('*')
      .eq('match_id', matchId)
      .order('avg_score', { ascending: false });
    if (data) setStats(data as Stat[]);
  }

  const handleScore = (id: string, score: number) => {
    setRatings((prev) => ({ ...prev, [id]: score }));
  };

  const handleSubmit = async () => {
    if (!activeMatch) return;
    const playerIds = Object.keys(ratings);
    if (playerIds.length === 0) return alert('Atribui pelo menos uma nota.');

    setSubmitting(true);
    let voterId = localStorage.getItem('voter_token');
    if (!voterId) {
      voterId = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('voter_token', voterId);
    }

    const payload = playerIds.map((id) => ({
      match_id: activeMatch.id,
      player_id: id,
      user_id: voterId,
      score: ratings[id],
    }));

    const { error } = await supabase.from('ratings').insert(payload);
    setSubmitting(false);

    if (error && error.message.includes('unique')) {
      alert('Já submeteste a tua avaliação para esta partida.');
    }
    await loadStats(activeMatch.id);
    setView('results');
  };

  const motm = stats.find((s) => s.position !== 'TREINADOR');

  return (
    <main className="min-h-screen bg-[#0d0d0e] text-zinc-100 font-sans pb-24 selection:bg-red-600 selection:text-white">
      <div className="border-b border-zinc-800 bg-[#121214]/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-600 shadow-[0_0_10px_#dc2626]"></span>
            <h1 className="text-lg font-black tracking-tighter uppercase italic">
              BENFICA<span className="text-red-600">VOTE</span>
            </h1>
          </div>
          {activeMatch && (
            <span className="text-[11px] font-bold uppercase tracking-wider bg-red-950/80 text-red-400 border border-red-800/50 px-2 py-0.5 rounded">
              Em Aberto
            </span>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 pt-4">
        {!activeMatch && (
          <div className="mt-4 p-6 rounded-2xl bg-gradient-to-b from-zinc-900 to-[#151518] border border-zinc-800 text-center shadow-xl">
            <span className="text-[11px] font-black tracking-widest text-red-500 uppercase">
              Próximo Jogo
            </span>
            <h2 className="text-2xl font-black mt-1 text-white tracking-tight">
              {upcomingMatch ? `vs ${upcomingMatch.opponent}` : 'A carregar calendário...'}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">{upcomingMatch?.competition || 'SL Benfica'}</p>

            {upcomingMatch && (
              <div className="grid grid-cols-4 gap-2 mt-6">
                {[
                  { label: 'DIAS', val: timeLeft.d },
                  { label: 'HORAS', val: timeLeft.h },
                  { label: 'MIN', val: timeLeft.m },
                  { label: 'SEG', val: timeLeft.s },
                ].map((t, idx) => (
                  <div key={idx} className="bg-zinc-800/60 p-2.5 rounded-xl border border-zinc-700/50">
                    <span className="block text-2xl font-black text-red-500">{t.val}</span>
                    <span className="text-[9px] font-bold text-zinc-400">{t.label}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-zinc-500 mt-5">
              A votação fica disponível logo após o apito final.
            </p>
          </div>
        )}

        {activeMatch && (
          <>
            <div className="mb-4 text-center">
              <span className="text-[11px] text-zinc-400 uppercase tracking-widest font-semibold">
                {activeMatch.competition}
              </span>
              <h2 className="text-xl font-black tracking-tight text-white">
                SL Benfica vs {activeMatch.opponent}
              </h2>
            </div>

            <div className="flex bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 mb-5">
              <button
                onClick={() => setView('vote')}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                  view === 'vote' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Avaliar ({Object.keys(ratings).length}/{players.length})
              </button>
              <button
                onClick={() => {
                  loadStats(activeMatch.id);
                  setView('results');
                }}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                  view === 'results' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Médias Globais
              </button>
            </div>

            {view === 'vote' && (
              <div className="space-y-3.5">
                {players.map((p) => {
                  const currentScore = ratings[p.id];
                  const isCoach = p.position === 'TREINADOR';

                  return (
                    <div
                      key={p.id}
                      className={`relative overflow-hidden rounded-2xl border transition-all ${
                        currentScore
                          ? 'border-red-600/70 bg-gradient-to-r from-zinc-900 via-zinc-900 to-red-950/30'
                          : 'border-zinc-800/80 bg-zinc-900/70'
                      }`}
                    >
                      <div className="p-3.5 flex items-center gap-3">
                        <div className="relative w-14 h-14 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700/60 flex-shrink-0">
                          <PlayerAvatar src={p.photo_url} name={p.name} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded tracking-wider ${
                                isCoach
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
                              }`}
                            >
                              {p.position}
                            </span>
                          </div>
                          <h3 className="font-extrabold text-sm text-white truncate mt-0.5 tracking-tight">
                            {p.name}
                          </h3>
                        </div>

                        <div className="w-10 h-10 rounded-xl bg-black/50 border border-zinc-800 flex items-center justify-center flex-shrink-0">
                          <span
                            className={`text-base font-black ${
                              currentScore ? 'text-red-500' : 'text-zinc-600'
                            }`}
                          >
                            {currentScore || '-'}
                          </span>
                        </div>
                      </div>

                      <div className="px-3 pb-3 pt-1 border-t border-zinc-800/40 grid grid-cols-10 gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <button
                            key={num}
                            onClick={() => handleScore(p.id, num)}
                            className={`py-1.5 rounded-md text-xs font-black transition-transform active:scale-95 ${
                              currentScore === num
                                ? 'bg-red-600 text-white shadow-[0_0_8px_#dc2626]'
                                : 'bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full mt-6 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black py-4 rounded-xl uppercase tracking-wider text-sm shadow-[0_0_20px_rgba(220,38,38,0.4)] transition-all cursor-pointer"
                >
                  {submitting ? 'A submeter notas...' : 'Finalizar e Submeter'}
                </button>
              </div>
            )}

            {view === 'results' && (
              <div className="space-y-3">
                {motm && Number(motm.avg_score) > 0 && (
                  <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-red-950 via-zinc-900 to-black border border-red-600/60 shadow-xl mb-4 text-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/30">
                      ★ Homem do Jogo
                    </span>
                    <div className="w-20 h-20 mx-auto mt-3 rounded-full overflow-hidden border-2 border-red-500 shadow-lg bg-zinc-800">
                      <PlayerAvatar src={motm.photo_url} name={motm.player_name} />
                    </div>
                    <h3 className="text-xl font-black mt-2 text-white">{motm.player_name}</h3>
                    <p className="text-4xl font-black text-red-500 mt-1">{motm.avg_score}</p>
                    <p className="text-[11px] text-zinc-400">{motm.total_votes} votos da comunidade</p>
                  </div>
                )}

                <div className="space-y-2">
                  {stats.map((s) => (
                    <div
                      key={s.player_id}
                      className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 flex-shrink-0">
                          <PlayerAvatar src={s.photo_url} name={s.player_name} />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-white">{s.player_name}</p>
                          <span className="text-[10px] text-zinc-400 font-semibold">
                            {s.position} • {s.total_votes} votos
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xl font-black text-red-500">{s.avg_score}</span>
                        <span className="text-xs text-zinc-500"> /10</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}