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

// Símbolo Oficial alojado diretamente no teu Supabase Storage
const BENFICA_LOGO_URL = "https://dctsqmibhhrtormygkpg.supabase.co/storage/v1/object/public/players/slb-logo.png";

function BenficaEmblem({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img
      src={BENFICA_LOGO_URL}
      alt="Sport Lisboa e Benfica"
      className={`${className} object-contain drop-shadow-[0_2px_10px_rgba(220,38,38,0.45)]`}
      loading="eager"
    />
  );
}

function PlayerAvatar({ src, name, isCoach = false }: { src: string; name: string; isCoach?: boolean }) {
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
      <div className={`w-full h-full flex items-center justify-center font-black text-xs select-none ${
        isCoach ? 'bg-amber-950/60 text-amber-400' : 'bg-zinc-800 text-red-500'
      }`}>
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
  const evaluatedCount = Object.keys(ratings).length;
  const progressPercent = players.length > 0 ? (evaluatedCount / players.length) * 100 : 0;

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 font-sans pb-28 selection:bg-red-600 selection:text-white">
      {/* Barra de Topo */}
      <header className="border-b border-zinc-800/80 bg-[#121214]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-md mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BenficaEmblem className="w-8 h-8" />
            <div>
              <h1 className="text-base font-black tracking-tight uppercase leading-none">
                BENFICA<span className="text-red-600 font-extrabold">RATINGS</span>
              </h1>
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">A Voz do Adepto</span>
            </div>
          </div>
          {activeMatch && (
            <div className="flex items-center gap-1.5 bg-red-950/80 text-red-400 border border-red-800/60 px-2.5 py-1 rounded-full shadow-[0_0_12px_rgba(220,38,38,0.2)]">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-[10px] font-black uppercase tracking-wider">Votação Aberta</span>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4">
        {/* Ecrã Quando Não Há Jogo Aberto */}
        {!activeMatch && (
          <div className="mt-4 p-7 rounded-3xl bg-gradient-to-b from-[#18181c] to-[#101013] border border-zinc-800/90 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-red-600/10 rounded-full blur-2xl pointer-events-none"></div>
            
            <div className="w-16 h-16 mx-auto mb-3 flex items-center justify-center bg-zinc-900/80 border border-zinc-800 rounded-2xl p-2 shadow-inner">
              <BenficaEmblem className="w-12 h-12" />
            </div>

            <span className="text-[10px] font-black tracking-widest text-red-500 uppercase bg-red-950/60 px-2.5 py-1 rounded-full border border-red-900/50">
              Próximo Encontro
            </span>
            <h2 className="text-2xl font-black mt-3 text-white tracking-tight">
              {upcomingMatch ? `vs ${upcomingMatch.opponent}` : 'A preparar calendário...'}
            </h2>
            <p className="text-xs text-zinc-400 mt-1 font-medium">{upcomingMatch?.competition || 'Sport Lisboa e Benfica'}</p>

            {upcomingMatch && (
              <div className="grid grid-cols-4 gap-2 mt-6">
                {[
                  { label: 'DIAS', val: timeLeft.d },
                  { label: 'HORAS', val: timeLeft.h },
                  { label: 'MIN', val: timeLeft.m },
                  { label: 'SEG', val: timeLeft.s },
                ].map((t, idx) => (
                  <div key={idx} className="bg-zinc-900/90 py-3 rounded-2xl border border-zinc-800/80 shadow">
                    <span className="block text-2xl font-black text-red-500 leading-none">{t.val}</span>
                    <span className="text-[8px] font-extrabold text-zinc-400 mt-1 block">{t.label}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-zinc-500 mt-6 leading-relaxed">
              A avaliação dos jogadores fica disponível imediatamente após o apito final da partida.
            </p>
          </div>
        )}

        {/* Ecrã de Jogo Ativo */}
        {activeMatch && (
          <>
            {/* Cabeçalho do Jogo */}
            <div className="mb-4 text-center bg-gradient-to-r from-transparent via-zinc-900/80 to-transparent py-2.5 rounded-xl border-y border-zinc-800/50">
              <span className="text-[10px] text-red-400 uppercase tracking-widest font-black block">
                {activeMatch.competition}
              </span>
              <h2 className="text-lg font-black tracking-tight text-white mt-0.5">
                SL Benfica <span className="text-zinc-500 font-normal">vs</span> {activeMatch.opponent}
              </h2>
            </div>

            {/* Alternador de Vistas (Votar vs Resultados) */}
            <div className="flex bg-zinc-900/90 p-1.5 rounded-2xl border border-zinc-800 mb-4 shadow-inner">
              <button
                onClick={() => setView('vote')}
                className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  view === 'vote'
                    ? 'bg-red-600 text-white shadow-[0_2px_12px_rgba(220,38,38,0.5)]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Avaliar ({evaluatedCount}/{players.length})
              </button>
              <button
                onClick={() => {
                  loadStats(activeMatch.id);
                  setView('results');
                }}
                className={`flex-1 py-2.5 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  view === 'results'
                    ? 'bg-red-600 text-white shadow-[0_2px_12px_rgba(220,38,38,0.5)]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Médias Globais
              </button>
            </div>

            {/* Barra de Progresso no Modo Voto */}
            {view === 'vote' && (
              <div className="mb-4 px-1">
                <div className="flex justify-between text-[11px] font-bold text-zinc-400 mb-1.5">
                  <span>Progresso do teu boletim</span>
                  <span className="text-red-400">{Math.round(progressPercent)}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Lista de Jogadores para Votação */}
            {view === 'vote' && (
              <div className="space-y-3">
                {players.map((p) => {
                  const currentScore = ratings[p.id];
                  const isCoach = p.position === 'TREINADOR';

                  return (
                    <div
                      key={p.id}
                      className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
                        currentScore
                          ? isCoach
                            ? 'border-amber-500/80 bg-gradient-to-r from-[#171512] via-[#1b1713] to-amber-950/20 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                            : 'border-red-600/80 bg-gradient-to-r from-[#181214] via-[#161214] to-red-950/30 shadow-[0_0_15px_rgba(220,38,38,0.15)]'
                          : 'border-zinc-800/80 bg-[#121215]/90 hover:border-zinc-700'
                      }`}
                    >
                      <div className="p-3 flex items-center gap-3.5">
                        {/* Avatar do Jogador */}
                        <div className={`relative w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 border ${
                          isCoach ? 'border-amber-500/50 bg-amber-950/30' : 'border-zinc-700/60 bg-zinc-800'
                        } shadow-md`}>
                          <PlayerAvatar src={p.photo_url} name={p.name} isCoach={isCoach} />
                        </div>

                        {/* Nome e Posição */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[9px] font-black px-2 py-0.5 rounded-md tracking-wider uppercase ${
                                isCoach
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                                  : 'bg-red-600/20 text-red-400 border border-red-500/30'
                              }`}
                            >
                              {p.position}
                            </span>
                          </div>
                          <h3 className="font-black text-sm text-white truncate mt-1 tracking-tight">
                            {p.name}
                          </h3>
                        </div>

                        {/* Nota Atribuída em Destaque */}
                        <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 ${
                          currentScore
                            ? isCoach
                              ? 'bg-amber-500/20 border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                              : 'bg-red-600/20 border-red-600 text-red-500 shadow-[0_0_10px_rgba(220,38,38,0.3)]'
                            : 'bg-black/40 border-zinc-800 text-zinc-600'
                        }`}>
                          <span className="text-lg font-black">{currentScore || '—'}</span>
                        </div>
                      </div>

                      {/* Teclado Numérico 1 a 10 */}
                      <div className="px-3 pb-3 pt-1 border-t border-zinc-800/50 grid grid-cols-10 gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                          <button
                            key={num}
                            onClick={() => handleScore(p.id, num)}
                            className={`py-2 rounded-lg text-xs font-black transition-all active:scale-90 cursor-pointer ${
                              currentScore === num
                                ? isCoach
                                  ? 'bg-amber-500 text-black shadow-[0_0_10px_#f59e0b]'
                                  : 'bg-red-600 text-white shadow-[0_0_10px_#dc2626]'
                                : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Botão Finalizar */}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full mt-6 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-zinc-800 disabled:to-zinc-800 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm shadow-[0_4px_25px_rgba(220,38,38,0.45)] transition-all transform active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                >
                  <BenficaEmblem className="w-5 h-5" />
                  {submitting ? 'A gravar os teus votos...' : 'Submeter Avaliações'}
                </button>
              </div>
            )}

            {/* Vista de Médias Globais */}
            {view === 'results' && (
              <div className="space-y-3">
                {/* Cartão de Homem do Jogo */}
                {motm && Number(motm.avg_score) > 0 && (
                  <div className="relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-[#2a1012] via-[#1a1215] to-[#111114] border-2 border-red-500/80 shadow-[0_0_30px_rgba(220,38,38,0.3)] mb-5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-3">
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30 flex items-center gap-1">
                        ★ HOMEM DO JOGO
                      </span>
                    </div>

                    <div className="w-24 h-24 mx-auto rounded-3xl overflow-hidden border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)] bg-zinc-800">
                      <PlayerAvatar src={motm.photo_url} name={motm.player_name} />
                    </div>

                    <h3 className="text-xl font-black mt-3 text-white tracking-tight">{motm.player_name}</h3>
                    <div className="inline-flex items-baseline gap-1 mt-1">
                      <span className="text-4xl font-black text-red-500">{motm.avg_score}</span>
                      <span className="text-xs text-zinc-400 font-bold">/ 10</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">{motm.total_votes} avaliações submetidas</p>
                  </div>
                )}

                {/* Lista de Classificação Geral */}
                <div className="space-y-2">
                  {stats.map((s, idx) => (
                    <div
                      key={s.player_id}
                      className="p-3 bg-zinc-900/80 border border-zinc-800/90 rounded-2xl flex items-center justify-between shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-zinc-600 w-4 text-center">{idx + 1}</span>
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/60 flex-shrink-0">
                          <PlayerAvatar src={s.photo_url} name={s.player_name} isCoach={s.position === 'TREINADOR'} />
                        </div>
                        <div>
                          <p className="font-extrabold text-sm text-white">{s.player_name}</p>
                          <span className="text-[10px] text-zinc-400 font-semibold">
                            {s.position} • {s.total_votes} votos
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xl font-black text-red-500">{s.avg_score}</span>
                        <span className="text-[10px] text-zinc-500 font-bold"> /10</span>
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