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

interface SeasonStat {
  player_id: string;
  player_name: string;
  position: string;
  photo_url: string;
  season_avg_score: number;
  matches_played: number;
  total_votes: number;
}

const POSITION_ORDER: Record<string, number> = {
  'GR': 1,
  'DEF': 2,
  'MED': 3,
  'AVA': 4,
  'TREINADOR': 5,
};

const BENFICA_LOGO_URL = "https://dctsqmibhhrtormygkpg.supabase.co/storage/v1/object/public/players/slb-logo.webp";

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
  const [seasonStats, setSeasonStats] = useState<SeasonStat[]>([]);
  const [pastMatches, setPastMatches] = useState<Match[]>([]);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [view, setView] = useState<'vote' | 'results' | 'history'>('vote');
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      // 1. Procurar jogo ativo para votos
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
        setView('history');
      }

      // 2. Procurar SEMPRE o próximo jogo futuro no calendário
      const { data: next } = await supabase
        .from('matches')
        .select('*')
        .eq('is_open_for_voting', false)
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (next) {
        setUpcomingMatch(next as Match);
      }

      loadHistory();
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

  async function loadHistory() {
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', false)
      .order('date', { ascending: false })
      .limit(8);
    if (matches) setPastMatches(matches as Match[]);

    const { data: season } = await supabase
      .from('season_player_stats')
      .select('*')
      .limit(10);
    if (season) setSeasonStats(season as SeasonStat[]);
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

  const handleShare = async () => {
    const opponent = activeMatch ? activeMatch.opponent : 'último jogo';
    const topPlayerText = motm && Number(motm.avg_score) > 0 ? `★ MVP: ${motm.player_name} (${motm.avg_score}/10)\n` : '';
    const shareText = `Avaliação do SL Benfica vs ${opponent} no BenficaVote!\n${topPlayerText}Vota ou consulta as notas: ${window.location.origin}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'BenficaVote • Avaliações',
          text: shareText,
          url: window.location.origin,
        });
        return;
      } catch (e) {
        // Fallback para cópia
      }
    }

    navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 font-sans pb-28 selection:bg-red-600 selection:text-white">
      {/* Topo Fixo com Emblema SVG */}
      <header className="border-b border-zinc-800/80 bg-[#121214]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-md mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BenficaEmblem className="w-8 h-8" />
            <div>
              <h1 className="text-base font-black tracking-tight uppercase leading-none">
                BENFICA<span className="text-red-600 font-extrabold">VOTE</span>
              </h1>
              <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">A Voz do Adepto</span>
            </div>
          </div>
          {activeMatch ? (
            <div className="flex items-center gap-1.5 bg-red-950/80 text-red-400 border border-red-800/60 px-2.5 py-1 rounded-full shadow-[0_0_12px_rgba(220,38,38,0.2)]">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-[10px] font-black uppercase tracking-wider">Em Aberto</span>
            </div>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-800/60 px-2.5 py-1 rounded-lg border border-zinc-700/60">
              Arquivo
            </span>
          )}
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4">
        {/* CARTÃO DO PRÓXIMO JOGO COM CONTAGEM DECRESCENTE (SEMPRE VISÍVEL SE EXISTIR) */}
        {upcomingMatch && (
          <div className="mb-4 p-5 rounded-3xl bg-gradient-to-b from-[#18181c] to-[#101013] border border-zinc-800/90 text-center shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-center gap-2 mb-2">
              <BenficaEmblem className="w-5 h-5" />
              <span className="text-[10px] font-black tracking-widest text-red-500 uppercase bg-red-950/60 px-2.5 py-0.5 rounded-full border border-red-900/50">
                Próximo Encontro
              </span>
            </div>

            <h2 className="text-xl font-black text-white tracking-tight">
              SL Benfica vs {upcomingMatch.opponent}
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5 font-medium">{upcomingMatch.competition}</p>

            <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { label: 'DIAS', val: timeLeft.d },
                { label: 'HORAS', val: timeLeft.h },
                { label: 'MIN', val: timeLeft.m },
                { label: 'SEG', val: timeLeft.s },
              ].map((t, idx) => (
                <div key={idx} className="bg-zinc-900/90 py-2.5 rounded-2xl border border-zinc-800/80 shadow">
                  <span className="block text-xl font-black text-red-500 leading-none">{t.val}</span>
                  <span className="text-[8px] font-extrabold text-zinc-400 mt-1 block">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Separadores de Navegação */}
        <div className="flex bg-zinc-900/90 p-1.5 rounded-2xl border border-zinc-800 mb-4 shadow-inner">
          {activeMatch && (
            <>
              <button
                onClick={() => setView('vote')}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  view === 'vote'
                    ? 'bg-red-600 text-white shadow-[0_2px_12px_rgba(220,38,38,0.5)]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Votar ({evaluatedCount}/{players.length})
              </button>
              <button
                onClick={() => {
                  loadStats(activeMatch.id);
                  setView('results');
                }}
                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
                  view === 'results'
                    ? 'bg-red-600 text-white shadow-[0_2px_12px_rgba(220,38,38,0.5)]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Resultados
              </button>
            </>
          )}
          <button
            onClick={() => {
              loadHistory();
              setView('history');
            }}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              view === 'history'
                ? 'bg-red-600 text-white shadow-[0_2px_12px_rgba(220,38,38,0.5)]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Histórico & Época
          </button>
        </div>

        {/* VISTA 1: VOTAR */}
        {activeMatch && view === 'vote' && (
          <>
            <div className="mb-4 px-1">
              <div className="flex justify-between text-[11px] font-bold text-zinc-400 mb-1.5">
                <span>Progresso do teu voto</span>
                <span className="text-red-400">{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

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
                      <div className={`relative w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 border ${
                        isCoach ? 'border-amber-500/50 bg-amber-950/30' : 'border-zinc-700/60 bg-zinc-800'
                      } shadow-md`}>
                        <PlayerAvatar src={p.photo_url} name={p.name} isCoach={isCoach} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <span
                          className={`text-[9px] font-black px-2 py-0.5 rounded-md tracking-wider uppercase inline-block ${
                            isCoach
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : 'bg-red-600/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {p.position}
                        </span>
                        <h3 className="font-black text-sm text-white truncate mt-1 tracking-tight">
                          {p.name}
                        </h3>
                      </div>

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

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full mt-6 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-zinc-800 disabled:to-zinc-800 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm shadow-[0_4px_25px_rgba(220,38,38,0.45)] transition-all transform active:scale-98 cursor-pointer flex items-center justify-center gap-2"
              >
                <BenficaEmblem className="w-5 h-5" />
                {submitting ? 'A gravar os teus votos...' : 'Submeter Avaliações'}
              </button>
            </div>
          </>
        )}

        {/* VISTA 2: RESULTADOS COM BOTÃO DE PARTILHA SEMPRE VISÍVEL */}
        {activeMatch && view === 'results' && (
          <div className="space-y-4">
            {/* Homem do Jogo (se já houver notas) */}
            {motm && Number(motm.avg_score) > 0 && (
              <div className="relative overflow-hidden p-6 rounded-3xl bg-gradient-to-br from-[#2a1012] via-[#1a1215] to-[#111114] border-2 border-red-500/80 shadow-[0_0_30px_rgba(220,38,38,0.3)] text-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/15 px-3 py-1 rounded-full border border-amber-500/30 inline-block mb-3">
                  ★ HOMEM DO JOGO
                </span>

                <div className="w-24 h-24 mx-auto rounded-3xl overflow-hidden border-2 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)] bg-zinc-800">
                  <PlayerAvatar src={motm.photo_url} name={motm.player_name} />
                </div>

                <h3 className="text-xl font-black mt-3 text-white tracking-tight">{motm.player_name}</h3>
                <div className="inline-flex items-baseline gap-1 mt-1">
                  <span className="text-4xl font-black text-red-500">{motm.avg_score}</span>
                  <span className="text-xs text-zinc-400 font-bold">/ 10</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">{motm.total_votes} avaliações registadas</p>
              </div>
            )}

            {/* BOTÃO DE PARTILHA SEMPRE VISÍVEL NO ECRÃ DE RESULTADOS */}
            <button
              onClick={handleShare}
              className="w-full bg-zinc-900/90 hover:bg-zinc-800 text-white font-black py-3.5 px-4 rounded-2xl text-xs uppercase tracking-wider border border-zinc-700/80 flex items-center justify-center gap-2.5 transition-all active:scale-98 shadow-md cursor-pointer"
            >
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {copied ? '✓ Link copiado para partilhar!' : 'Partilhar Médias nas Redes'}
            </button>

            {/* Lista com as Médias */}
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

        {/* VISTA 3: HISTÓRICO E RANKING DA ÉPOCA */}
        {view === 'history' && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-black uppercase tracking-wider text-red-500">
                  Melhores da Temporada
                </h3>
                <span className="text-[10px] text-zinc-500 font-bold">Médias Globais</span>
              </div>

              {seasonStats.length === 0 ? (
                <p className="text-xs text-zinc-500 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800 text-center">
                  Ainda não existem jogos encerrados registados nesta época.
                </p>
              ) : (
                <div className="space-y-2">
                  {seasonStats.map((s, idx) => (
                    <div
                      key={s.player_id}
                      className="p-3 bg-zinc-900/90 border border-zinc-800 rounded-2xl flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-zinc-500 w-4 text-center">{idx + 1}</span>
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700 flex-shrink-0">
                          <PlayerAvatar src={s.photo_url} name={s.player_name} isCoach={s.position === 'TREINADOR'} />
                        </div>
                        <div>
                          <p className="font-black text-xs text-white">{s.player_name}</p>
                          <span className="text-[9px] text-zinc-400">
                            {s.position} • {s.matches_played} jogos avaliados
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-black text-red-500">{s.season_avg_score}</span>
                        <span className="text-[9px] text-zinc-500 font-bold"> /10</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-2">
                Jogos Anteriores
              </h3>
              {pastMatches.length === 0 ? (
                <p className="text-xs text-zinc-500 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800 text-center">
                  Sem registo de jogos passados no arquivo.
                </p>
              ) : (
                <div className="space-y-2">
                  {pastMatches.map((m) => (
                    <div
                      key={m.id}
                      className="p-3.5 bg-zinc-900/60 border border-zinc-800/80 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-black text-white">SL Benfica vs {m.opponent}</p>
                        <span className="text-[10px] text-zinc-500">{m.competition}</span>
                      </div>
                      <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2 py-1 rounded">
                        Terminado
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}