'use client';
import { useEffect, useState, useRef } from 'react';
import { toBlob } from 'html-to-image';
import { supabase } from '@/lib/supabase';

interface Match {
  id: string;
  opponent: string;
  competition: string;
  date: string;
  is_home?: boolean;
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

interface MatchPlayerScore {
  match_id: string;
  player_id: string;
  avg_score: number;
}

const POSITION_ORDER: Record<string, number> = {
  'GR': 1,
  'DEF': 2,
  'MED': 3,
  'AVA': 4,
  'TREINADOR': 5,
};

const BENFICA_LOGO_URL = "https://dctsqmibhhrtormygkpg.supabase.co/storage/v1/object/public/players/slb-logo.webp";

function getScoreTheme(score: number) {
  if (score >= 8) {
    return {
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-500/80',
      text: 'text-emerald-400',
      glow: 'shadow-[0_0_15px_rgba(16,185,129,0.35)]',
      matrixBg: 'bg-emerald-950/80 border-emerald-600/70 text-emerald-400',
    };
  }
  if (score >= 6) {
    return {
      bg: 'bg-teal-500/20',
      border: 'border-teal-500/80',
      text: 'text-teal-400',
      glow: 'shadow-[0_0_12px_rgba(20,184,166,0.3)]',
      matrixBg: 'bg-teal-950/80 border-teal-600/70 text-teal-400',
    };
  }
  if (score >= 5) {
    return {
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/80',
      text: 'text-amber-400',
      glow: 'shadow-[0_0_12px_rgba(245,158,11,0.25)]',
      matrixBg: 'bg-amber-950/80 border-amber-600/70 text-amber-400',
    };
  }
  return {
    bg: 'bg-red-500/20',
    border: 'border-red-600/80',
    text: 'text-red-400',
    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.25)]',
    matrixBg: 'bg-rose-950/80 border-rose-600/70 text-rose-400',
  };
}

function BenficaEmblem({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <img
      src={BENFICA_LOGO_URL}
      alt="SL Benfica"
      className={`${className} object-contain`}
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
      <div className={`w-full h-full flex items-center justify-center font-bold text-xs select-none ${
        isCoach ? 'bg-amber-950/40 text-amber-400' : 'bg-zinc-800 text-zinc-400'
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
      crossOrigin="anonymous"
      loading="lazy"
      onError={() => setHasError(true)}
      className="w-full h-full object-cover object-top"
    />
  );
}

function formatMatchTitle(match: Match) {
  const isHome = match.is_home !== false;
  return isHome ? `SL Benfica vs ${match.opponent}` : `${match.opponent} vs SL Benfica`;
}

// Abreviação de 3 letras para o adversário (estilo F1: POR, SPO, BRA...)
function getOpponentAbbr(name: string) {
  const clean = name.replace(/^(FC|SC|CD|GD|SL)\s+/i, '').trim();
  return clean.substring(0, 3).toUpperCase();
}

export default function Home() {
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [seasonStats, setSeasonStats] = useState<SeasonStat[]>([]);
  const [pastMatches, setPastMatches] = useState<Match[]>([]);
  const [matrixScores, setMatrixScores] = useState<Record<string, Record<string, number>>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [view, setView] = useState<'vote' | 'results' | 'history' | 'matrix'>('vote');
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [generatingUserCard, setGeneratingUserCard] = useState(false);
  const [generatingCommunityCard, setGeneratingCommunityCard] = useState(false);
  const [lastRatedId, setLastRatedId] = useState<string | null>(null);

  const userCardRef = useRef<HTMLDivElement>(null);
  const communityCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadData() {
      // 1. Procurar jogo ativo
      const { data: current } = await supabase
        .from('matches')
        .select('*')
        .eq('is_open_for_voting', true)
        .limit(1)
        .maybeSingle();

      if (current) {
        const matchData = current as Match;
        setActiveMatch(matchData);

        // 2. Carregar o plantel do jogo
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

        // 3. Verificar se já votou
        const voterToken = localStorage.getItem('voter_token');
        let userAlreadyVoted = false;

        if (voterToken) {
          const { data: userRatings } = await supabase
            .from('ratings')
            .select('player_id, score')
            .eq('match_id', matchData.id)
            .eq('user_id', voterToken);

          if (userRatings && userRatings.length > 0) {
            userAlreadyVoted = true;
            const userScores: Record<string, number> = {};
            userRatings.forEach((r: any) => {
              userScores[r.player_id] = r.score;
            });
            setRatings(userScores);
            setHasVoted(true);
            setView('results');
          }
        }

        if (!userAlreadyVoted) {
          setView('vote');
        }

        loadStats(matchData.id);
      } else {
        setView('history');
      }

      // 4. Próximo jogo agendado
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

      loadHistoryAndMatrix();
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

  async function loadHistoryAndMatrix() {
    // Carregar jogos terminados por ordem cronológica (mais antigo -> mais recente para a grelha)
    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', false)
      .order('date', { ascending: true })
      .limit(20);

    if (matches) {
      setPastMatches(matches as Match[]);

      // Carregar todas as pontuações médias para construir a matriz
      const { data: allScores } = await supabase
        .from('match_player_stats')
        .select('match_id, player_id, avg_score');

      if (allScores) {
        const matrixMap: Record<string, Record<string, number>> = {};
        allScores.forEach((row: any) => {
          if (!matrixMap[row.player_id]) {
            matrixMap[row.player_id] = {};
          }
          matrixMap[row.player_id][row.match_id] = Number(row.avg_score);
        });
        setMatrixScores(matrixMap);
      }
    }

    const { data: season } = await supabase
      .from('season_player_stats')
      .select('*')
      .order('season_avg_score', { ascending: false });
    if (season) setSeasonStats(season as SeasonStat[]);
  }

  const handleScore = (id: string, score: number) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(12);
    }
    setRatings((prev) => ({ ...prev, [id]: score }));
    setLastRatedId(id);
    setTimeout(() => {
      setLastRatedId(null);
    }, 280);
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
      alert('Já tinhas submetido a tua avaliação para esta partida.');
    }

    setHasVoted(true);
    await loadStats(activeMatch.id);
    setView('results');
  };

  const exportImage = async (ref: React.RefObject<HTMLDivElement | null>, defaultName: string, title: string) => {
    if (!ref.current) return;
    try {
      const blob = await toBlob(ref.current, {
        quality: 0.95,
        cacheBust: true,
        pixelRatio: 2,
      });

      if (!blob) throw new Error('Falha ao processar imagem.');
      const file = new File([blob], `${defaultName}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text: `Avaliações no jogo do SL Benfica! #SLBenfica`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${defaultName}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      alert('Não foi possível gerar a imagem no dispositivo.');
    }
  };

  const handleGenerateUserCard = async () => {
    if (Object.keys(ratings).length === 0) {
      return alert('Não existem notas tuas registadas.');
    }
    setGeneratingUserCard(true);
    await exportImage(userCardRef, `As-Minhas-Notas-${activeMatch?.opponent || 'Benfica'}`, 'As Minhas Notas • BenficaVote');
    setGeneratingUserCard(false);
  };

  const handleGenerateCommunityCard = async () => {
    setGeneratingCommunityCard(true);
    await exportImage(communityCardRef, `Notas-Adeptos-${activeMatch?.opponent || 'Benfica'}`, 'Notas dos Adeptos • BenficaVote');
    setGeneratingCommunityCard(false);
  };

  const motm = stats.find((s) => s.position !== 'TREINADOR');
  const evaluatedCount = Object.keys(ratings).length;
  const progressPercent = players.length > 0 ? (evaluatedCount / players.length) * 100 : 0;

  const userBestPlayer = players
    .filter((p) => ratings[p.id] !== undefined && p.position !== 'TREINADOR')
    .sort((a, b) => (ratings[b.id] || 0) - (ratings[a.id] || 0))[0] || null;

  const top1 = seasonStats[0] || null;
  const top2 = seasonStats[1] || null;
  const top3 = seasonStats[2] || null;
  const remainingSeasonStats = seasonStats.slice(3);

  const allSeasonScores = seasonStats.map((s) => Number(s.season_avg_score)).filter((n) => !isNaN(n) && n > 0);
  const globalAverage = allSeasonScores.length > 0
    ? (allSeasonScores.reduce((acc, curr) => acc + curr, 0) / allSeasonScores.length).toFixed(1)
    : '0.0';

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 font-sans pb-16">
      {/* Topo Limpo */}
      <header className="border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BenficaEmblem className="w-7 h-7" />
            <h1 className="text-sm font-black tracking-tight uppercase">
              BENFICA<span className="text-red-600">VOTE</span>
            </h1>
          </div>
          {activeMatch ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-red-400 bg-red-950/40 border border-red-800/40 px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
              A decorrer
            </span>
          ) : (
            <span className="text-[10px] font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md">
              Arquivo
            </span>
          )}
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4">
        {/* Próximo Jogo */}
        {upcomingMatch && (
          <div className="mb-4 p-4 rounded-2xl bg-[#121215] border border-zinc-800/80 text-center">
            <span className="text-[10px] font-bold tracking-wider text-zinc-400 uppercase">
              Próximo Encontro • {upcomingMatch.is_home !== false ? 'Casa' : 'Fora'}
            </span>
            <h2 className="text-base font-bold text-white mt-1">
              {formatMatchTitle(upcomingMatch)}
            </h2>
            <p className="text-[11px] text-zinc-500">{upcomingMatch.competition}</p>

            <div className="grid grid-cols-4 gap-2 mt-3 max-w-xs mx-auto">
              {[
                { label: 'DIAS', val: timeLeft.d },
                { label: 'HORAS', val: timeLeft.h },
                { label: 'MIN', val: timeLeft.m },
                { label: 'SEG', val: timeLeft.s },
              ].map((t, idx) => (
                <div key={idx} className="bg-zinc-900 py-1.5 rounded-xl border border-zinc-800/60">
                  <span className="block text-base font-black text-red-500 leading-tight">{t.val}</span>
                  <span className="text-[8px] font-bold text-zinc-500">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4 ABAS MODERNAS DE NAVEGAÇÃO */}
        <div className="flex bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80 mb-4 gap-0.5">
          {activeMatch && (
            <>
              <button
                onClick={() => setView('vote')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  view === 'vote' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {hasVoted ? 'Os Meus Votos' : `Votar (${evaluatedCount}/${players.length})`}
              </button>
              <button
                onClick={() => {
                  loadStats(activeMatch.id);
                  setView('results');
                }}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                  view === 'results' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Resultados
              </button>
            </>
          )}
          <button
            onClick={() => {
              loadHistoryAndMatrix();
              setView('history');
            }}
            className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
              view === 'history' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Época
          </button>
          <button
            onClick={() => {
              loadHistoryAndMatrix();
              setView('matrix');
            }}
            className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
              view === 'matrix' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Matriz F1
          </button>
        </div>

        {/* VISTA 1: VOTAR */}
        {activeMatch && view === 'vote' && (
          <>
            <div className="mb-3">
              <div className="flex justify-between text-[11px] font-medium text-zinc-400 mb-1">
                <span>{hasVoted ? 'Voto gravado no telemóvel' : 'Progresso das notas'}</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            <div className="space-y-2.5">
              {players.map((p) => {
                const currentScore = ratings[p.id];
                const isCoach = p.position === 'TREINADOR';
                const theme = currentScore ? getScoreTheme(currentScore) : null;
                const isRecentlyChanged = lastRatedId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`rounded-2xl border transition-all ${
                      currentScore
                        ? 'bg-[#141418] border-zinc-700/60'
                        : 'bg-[#111114] border-zinc-800/70'
                    }`}
                  >
                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/50 flex-shrink-0">
                          <PlayerAvatar src={p.photo_url} name={p.name} isCoach={isCoach} />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-white">{p.name}</p>
                          <span className="text-[10px] text-zinc-500 font-medium">{p.position}</span>
                        </div>
                      </div>

                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm border transition-all duration-200 transform ${
                          isRecentlyChanged ? 'scale-115' : 'scale-100'
                        } ${
                          currentScore && theme
                            ? `${theme.bg} ${theme.border} ${theme.text} ${theme.glow}`
                            : 'bg-zinc-900 border-zinc-800 text-zinc-600'
                        }`}
                      >
                        {currentScore || '—'}
                      </div>
                    </div>

                    <div className="px-2.5 pb-2.5 grid grid-cols-10 gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <button
                          key={num}
                          onClick={() => handleScore(p.id, num)}
                          className={`py-1.5 rounded-md text-xs font-bold transition-all active:scale-90 ${
                            currentScore === num
                              ? 'bg-red-600 text-white shadow-sm'
                              : 'bg-zinc-800/70 text-zinc-400 hover:text-white'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}

              {!hasVoted ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full mt-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-98 shadow-md"
                >
                  {submitting ? 'A guardar votos...' : 'Submeter Avaliações'}
                </button>
              ) : (
                <button
                  onClick={() => setView('results')}
                  className="w-full mt-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold py-3 rounded-xl text-xs uppercase tracking-wider border border-zinc-700 flex items-center justify-center gap-2"
                >
                  Ver Resultados e Gerar Cartões ↗
                </button>
              )}
            </div>
          </>
        )}

        {/* VISTA 2: RESULTADOS */}
        {activeMatch && view === 'results' && (
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-[#121215] border border-zinc-800 text-center space-y-3">
              <div>
                <span className="text-emerald-400 text-xs font-black uppercase tracking-wider block">
                  {hasVoted ? '✓ O teu voto está registado' : 'Resultados em Direto'}
                </span>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {hasVoted
                    ? 'Podes exportar as tuas notas ou consultar a média da comunidade:'
                    : 'Avaliações em tempo real da comunidade benfiquista:'}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                {hasVoted && (
                  <button
                    onClick={handleGenerateUserCard}
                    disabled={generatingUserCard}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-98 shadow-md"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {generatingUserCard ? 'A criar imagem...' : '📸 Gerar Cartão: Os Meus Votos'}
                  </button>
                )}

                <button
                  onClick={handleGenerateCommunityCard}
                  disabled={generatingCommunityCard}
                  className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider border border-zinc-700/80 flex items-center justify-center gap-2 transition-all active:scale-98"
                >
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  {generatingCommunityCard ? 'A preparar cartão...' : '👥 Cartão: Pontuações dos Adeptos'}
                </button>
              </div>
            </div>

            {motm && Number(motm.avg_score) > 0 && (
              <div className="p-4 rounded-2xl bg-[#121215] border border-zinc-800 text-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                  ★ Homem do Jogo da Comunidade
                </span>
                <div className="w-16 h-16 mx-auto rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700 my-2">
                  <PlayerAvatar src={motm.photo_url} name={motm.player_name} />
                </div>
                <h3 className="text-sm font-bold text-white">{motm.player_name}</h3>
                <div className="text-2xl font-black text-red-500 mt-0.5">
                  {motm.avg_score} <span className="text-xs text-zinc-500 font-normal">/10</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {stats.map((s, idx) => (
                <div
                  key={s.player_id}
                  className="p-3 bg-[#111114] border border-zinc-800/70 rounded-xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-zinc-600 w-4">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700/60 flex-shrink-0">
                      <PlayerAvatar src={s.photo_url} name={s.player_name} isCoach={s.position === 'TREINADOR'} />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-white">{s.player_name}</p>
                      <span className="text-[9px] text-zinc-500">
                        {s.position} • {s.total_votes} votos {ratings[s.player_id] ? `(A tua nota: ${ratings[s.player_id]})` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-black text-red-500">{s.avg_score}</span>
                    <span className="text-[9px] text-zinc-500 font-medium"> /10</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VISTA 3: HISTÓRICO GERAL (PODIO + JOGOS) */}
        {view === 'history' && (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#141419] to-[#121215] border border-zinc-800 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-red-500 block">
                  Registo Acumulado
                </span>
                <h3 className="text-sm font-bold text-white">Média Global de Todos os Jogos</h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">{pastMatches.length} partidas disputadas</p>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-red-500">{globalAverage}</span>
                <span className="text-xs text-zinc-500 font-bold"> /10</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                  Top da Temporada
                </h3>
                <span className="text-[10px] text-zinc-500 font-medium">Médias globais</span>
              </div>

              {seasonStats.length === 0 ? (
                <p className="text-xs text-zinc-500 bg-[#121215] p-3.5 rounded-xl border border-zinc-800/80 text-center">
                  Sem dados registados nesta época.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 items-end pt-4 pb-2">
                    {top2 && (
                      <div className="bg-[#121216] border border-zinc-700/50 rounded-2xl p-2.5 text-center relative flex flex-col items-center">
                        <span className="w-5 h-5 rounded-full bg-zinc-700 text-zinc-200 text-[10px] font-black flex items-center justify-center mb-1">2</span>
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-600 mb-1.5">
                          <PlayerAvatar src={top2.photo_url} name={top2.player_name} />
                        </div>
                        <p className="font-bold text-[11px] text-white truncate w-full">{top2.player_name}</p>
                        <span className="text-xs font-black text-zinc-300 mt-0.5">{top2.season_avg_score}</span>
                      </div>
                    )}

                    {top1 && (
                      <div className="bg-gradient-to-b from-[#1c1710] to-[#121216] border-2 border-amber-500/70 rounded-2xl p-3 text-center relative flex flex-col items-center -translate-y-2 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                        <span className="text-sm -mt-2 mb-0.5">👑</span>
                        <span className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center mb-1 shadow">1</span>
                        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-800 border-2 border-amber-400 mb-1.5 shadow">
                          <PlayerAvatar src={top1.photo_url} name={top1.player_name} />
                        </div>
                        <p className="font-black text-xs text-white truncate w-full">{top1.player_name}</p>
                        <span className="text-sm font-black text-amber-400 mt-0.5">{top1.season_avg_score}</span>
                      </div>
                    )}

                    {top3 && (
                      <div className="bg-[#121216] border border-amber-900/40 rounded-2xl p-2.5 text-center relative flex flex-col items-center">
                        <span className="w-5 h-5 rounded-full bg-amber-900/80 text-amber-200 text-[10px] font-black flex items-center justify-center mb-1">3</span>
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 border border-amber-900/60 mb-1.5">
                          <PlayerAvatar src={top3.photo_url} name={top3.player_name} />
                        </div>
                        <p className="font-bold text-[11px] text-white truncate w-full">{top3.player_name}</p>
                        <span className="text-xs font-black text-amber-500 mt-0.5">{top3.season_avg_score}</span>
                      </div>
                    )}
                  </div>

                  {remainingSeasonStats.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {remainingSeasonStats.map((s, idx) => (
                        <div
                          key={s.player_id}
                          className="p-2.5 bg-[#111114] border border-zinc-800/70 rounded-xl flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] font-bold text-zinc-500 w-4 text-center">{idx + 4}</span>
                            <div className="w-7 h-7 rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700/60 flex-shrink-0">
                              <PlayerAvatar src={s.photo_url} name={s.player_name} isCoach={s.position === 'TREINADOR'} />
                            </div>
                            <p className="font-bold text-xs text-white truncate">{s.player_name}</p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-black text-red-500">{s.season_avg_score}</span>
                            <span className="text-[8px] text-zinc-500"> /10</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Histórico de Jogos
              </h3>
              {pastMatches.length === 0 ? (
                <p className="text-xs text-zinc-500 bg-[#121215] p-3.5 rounded-xl border border-zinc-800/80 text-center">
                  Sem histórico de jogos passados.
                </p>
              ) : (
                <div className="space-y-2">
                  {pastMatches.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-[#111114] border border-zinc-800/70 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs font-bold text-white">{formatMatchTitle(m)}</p>
                        <span className="text-[10px] text-zinc-500">{m.competition}</span>
                      </div>
                      <span className="text-[10px] font-medium text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        Terminado
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            VISTA 4: MATRIZ DE RENDIMENTO ESTILO FÓRMULA 1 (HEATMAP JOGO A JOGO)
            ========================================================================= */}
        {view === 'matrix' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-red-500">
                  Matriz de Rendimento
                </h3>
                <p className="text-[10px] text-zinc-500">Notas jogo a jogo ao longo da temporada</p>
              </div>
              <span className="text-[9px] font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded-md">
                Arrasta ➔
              </span>
            </div>

            {pastMatches.length === 0 || seasonStats.length === 0 ? (
              <p className="text-xs text-zinc-500 bg-[#121215] p-4 rounded-xl border border-zinc-800/80 text-center">
                Ainda não existem jogos registados suficientes para gerar a matriz.
              </p>
            ) : (
              <div className="bg-[#101014] border border-zinc-800/90 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="border-b border-zinc-800/90 bg-zinc-900/90 text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                        {/* Coluna Fixa do Jogador */}
                        <th className="py-2.5 px-3 sticky left-0 z-20 bg-zinc-900 shadow-[2px_0_5px_rgba(0,0,0,0.5)] min-w-[125px]">
                          Jogador
                        </th>

                        {/* Colunas dos Jogos Disputados */}
                        {pastMatches.map((m) => (
                          <th key={m.id} className="py-2 px-2 text-center min-w-[42px] border-l border-zinc-800/60" title={`${m.opponent} (${m.competition})`}>
                            <span className="block text-[9px] text-zinc-300 font-black">{getOpponentAbbr(m.opponent)}</span>
                            <span className="block text-[8px] text-zinc-500 font-semibold">{m.is_home !== false ? 'C' : 'F'}</span>
                          </th>
                        ))}

                        {/* Média Acumulada */}
                        <th className="py-2.5 px-3 text-center border-l border-zinc-800 min-w-[55px] text-red-400 bg-zinc-900/90">
                          Média[cite: 3]
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 text-xs">
                      {seasonStats.map((p, idx) => {
                        const playerScores = matrixScores[p.player_id] || {};
                        const seasonTheme = getScoreTheme(Number(p.season_avg_score));

                        return (
                          <tr key={p.player_id} className="hover:bg-zinc-800/30 transition-colors">
                            {/* Nome e Foto Fixos */}
                            <td className="py-2 px-3 sticky left-0 z-10 bg-[#101014] shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-zinc-600 w-3">{idx + 1}</span>
                                <div className="w-6 h-6 rounded-md overflow-hidden bg-zinc-800 flex-shrink-0 border border-zinc-700/60">
                                  <PlayerAvatar src={p.photo_url} name={p.player_name} isCoach={p.position === 'TREINADOR'} />
                                </div>
                                <span className="font-bold text-white text-[11px] truncate max-w-[85px]">
                                  {p.player_name}
                                </span>
                              </div>
                            </td>

                            {/* Células de Cada Partida com Estilo F1 */}
                            {pastMatches.map((m) => {
                              const score = playerScores[m.id];
                              const hasPlayed = score !== undefined && score > 0;
                              const cellTheme = hasPlayed ? getScoreTheme(score) : null;

                              return (
                                <td key={m.id} className="py-1.5 px-1 text-center border-l border-zinc-800/50">
                                  {hasPlayed ? (
                                    <div className={`w-8 h-7 mx-auto rounded flex items-center justify-center font-black text-[11px] border ${cellTheme?.matrixBg}`}>
                                      {score.toFixed(1)}
                                    </div>
                                  ) : (
                                    <div className="w-8 h-7 mx-auto rounded flex items-center justify-center text-zinc-600 font-bold text-[10px] bg-zinc-900/40">
                                      —
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            {/* Coluna da Média Final */}
                            <td className="py-1.5 px-2 text-center border-l border-zinc-800 bg-[#121217]">
                              <span className={`font-black text-xs ${seasonTheme.text}`}>
                                {p.season_avg_score}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Legenda de Cores Tipo F1 */}
                <div className="p-2.5 bg-zinc-900/60 border-t border-zinc-800 flex items-center justify-around text-[9px] font-bold text-zinc-400">
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>
                    <span>≥ 8.0</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded bg-teal-500"></span>
                    <span>6.0 - 7.9</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded bg-amber-500"></span>
                    <span>5.0 - 5.9</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded bg-rose-500"></span>
                    <span>&lt; 5.0</span>
                  </div>
                  <div className="flex items-center gap-1 text-zinc-500">
                    <span className="w-2.5 h-2.5 rounded bg-zinc-800 text-center leading-none">—</span>
                    <span>Ausente</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rodapé Legal */}
        <footer className="mt-12 pt-6 border-t border-zinc-800/50 text-center space-y-1">
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            BenficaVote • Plataforma de Adeptos
          </p>
          <p className="text-[9px] text-zinc-500 max-w-xs mx-auto leading-relaxed">
            Aplicação independente e não oficial criada por sócios e adeptos. Sem qualquer afiliação institucional ao Sport Lisboa e Benfica.
          </p>
        </footer>
      </div>

      {/* Cartões Invisíveis para html-to-image */}
      {activeMatch && (
        <>
          {/* Cartão Pessoal */}
          <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
            <div
              ref={userCardRef}
              style={{
                width: '540px',
                minHeight: '960px',
                backgroundColor: '#09090b',
                color: '#ffffff',
                padding: '36px 28px',
                fontFamily: 'sans-serif',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272a', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={BENFICA_LOGO_URL} alt="SLB" crossOrigin="anonymous" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 900 }}>
                      BENFICA<span style={{ color: '#dc2626' }}>VOTE</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: 800, textTransform: 'uppercase' }}>
                      Os Meus Votos no Jogo
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 800 }}>{activeMatch.competition}</div>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>{formatMatchTitle(activeMatch)}</div>
                </div>
              </div>

              {userBestPlayer && (
                <div style={{ margin: '18px 0', padding: '16px', backgroundColor: '#141418', borderRadius: '16px', border: '1px solid #dc2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                      src={userBestPlayer.photo_url}
                      alt={userBestPlayer.name}
                      crossOrigin="anonymous"
                      style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover' }}
                    />
                    <div>
                      <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase' }}>★ O Meu Melhor em Campo</span>
                      <div style={{ fontSize: '16px', fontWeight: 800 }}>{userBestPlayer.name}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#ef4444' }}>{ratings[userBestPlayer.id] || '—'}</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', flex: 1 }}>
                {players.map((p) => {
                  const score = ratings[p.id];
                  return (
                    <div
                      key={p.id}
                      style={{
                        backgroundColor: '#121215',
                        border: '1px solid #27272a',
                        borderRadius: '10px',
                        padding: '8px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 900, color: score ? '#ef4444' : '#52525b' }}>
                        {score || '—'}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ borderTop: '1px solid #27272a', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#71717a' }}>Vota também em</span>
                <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>benficavote.vercel.app</span>
              </div>
            </div>
          </div>

          {/* Cartão Comunidade */}
          <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
            <div
              ref={communityCardRef}
              style={{
                width: '540px',
                minHeight: '960px',
                backgroundColor: '#09090b',
                color: '#ffffff',
                padding: '36px 28px',
                fontFamily: 'sans-serif',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272a', paddingBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={BENFICA_LOGO_URL} alt="SLB" crossOrigin="anonymous" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 900 }}>
                      BENFICA<span style={{ color: '#dc2626' }}>VOTE</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#a1a1aa', fontWeight: 800, textTransform: 'uppercase' }}>
                      Notas Médias dos Adeptos
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 800 }}>{activeMatch.competition}</div>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>{formatMatchTitle(activeMatch)}</div>
                </div>
              </div>

              {motm && (
                <div style={{ margin: '18px 0', padding: '16px', backgroundColor: '#141418', borderRadius: '16px', border: '1px solid #dc2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                      src={motm.photo_url}
                      alt={motm.player_name}
                      crossOrigin="anonymous"
                      style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover' }}
                    />
                    <div>
                      <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase' }}>★ Homem do Jogo da Comunidade</span>
                      <div style={{ fontSize: '16px', fontWeight: 800 }}>{motm.player_name}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 900, color: '#ef4444' }}>{motm.avg_score}</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', flex: 1 }}>
                {stats.map((s) => (
                  <div
                    key={s.player_id}
                    style={{
                      backgroundColor: '#121215',
                      border: '1px solid #27272a',
                      borderRadius: '10px',
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>
                      {s.player_name}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 900, color: '#ef4444' }}>{s.avg_score}</span>
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid #27272a', paddingTop: '16px', marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#71717a' }}>Votações da Comunidade</span>
                <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700 }}>benficavote.vercel.app</span>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}