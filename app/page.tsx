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
    };
  }
  if (score >= 6) {
    return {
      bg: 'bg-teal-500/20',
      border: 'border-teal-500/80',
      text: 'text-teal-400',
      glow: 'shadow-[0_0_12px_rgba(20,184,166,0.3)]',
    };
  }
  if (score >= 5) {
    return {
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/80',
      text: 'text-amber-400',
      glow: 'shadow-[0_0_12px_rgba(245,158,11,0.25)]',
    };
  }
  return {
    bg: 'bg-red-500/20',
    border: 'border-red-600/80',
    text: 'text-red-400',
    glow: 'shadow-[0_0_12px_rgba(239,68,68,0.25)]',
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
  const [generatingUserCard, setGeneratingUserCard] = useState(false);
  const [generatingCommunityCard, setGeneratingCommunityCard] = useState(false);
  const [lastRatedId, setLastRatedId] = useState<string | null>(null);

  const userCardRef = useRef<HTMLDivElement>(null);
  const communityCardRef = useRef<HTMLDivElement>(null);

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
        setView('history');
      }

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
      .limit(15);
    if (matches) setPastMatches(matches as Match[]);

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
      alert('Já submeteste a tua avaliação para esta partida.');
    }
    await loadStats(activeMatch.id);
    setView('results');
  };

  // Exportar Imagem genérica
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
          text: `Avaliações no jogo do Benfica! #SLBenfica`,
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

  // Gerar Cartão com as notas do próprio utilizador
  const handleGenerateUserCard = async () => {
    if (Object.keys(ratings).length === 0) {
      return alert('Dá pelo menos uma nota para gerar o teu cartão!');
    }
    setGeneratingUserCard(true);
    await exportImage(userCardRef, `As-Minhas-Notas-${activeMatch?.opponent || 'Benfica'}`, 'As Minhas Notas • BenficaVote');
    setGeneratingUserCard(false);
  };

  // Gerar Cartão com as notas da comunidade
  const handleGenerateCommunityCard = async () => {
    setGeneratingCommunityCard(true);
    await exportImage(communityCardRef, `Notas-Adeptos-${activeMatch?.opponent || 'Benfica'}`, 'Notas dos Adeptos • BenficaVote');
    setGeneratingCommunityCard(false);
  };

  const motm = stats.find((s) => s.position !== 'TREINADOR');
  const evaluatedCount = Object.keys(ratings).length;
  const progressPercent = players.length > 0 ? (evaluatedCount / players.length) * 100 : 0;

  // Jogador mais votado pelo utilizador (Melhor na opinião do user)
  const userBestPlayer = players
    .filter((p) => ratings[p.id] !== undefined && p.position !== 'TREINADOR')
    .sort((a, b) => (ratings[b.id] || 0) - (ratings[a.id] || 0))[0] || null;

  // Pódio do Histórico
  const top1 = seasonStats[0] || null;
  const top2 = seasonStats[1] || null;
  const top3 = seasonStats[2] || null;
  const remainingSeasonStats = seasonStats.slice(3);

  // Média Global de TODOS os jogos no histórico
  const allSeasonScores = seasonStats.map((s) => Number(s.season_avg_score)).filter((n) => !isNaN(n) && n > 0);
  const globalAverage = allSeasonScores.length > 0
    ? (allSeasonScores.reduce((acc, curr) => acc + curr, 0) / allSeasonScores.length).toFixed(1)
    : '0.0';

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 font-sans pb-16">
      {/* Topo */}
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

        {/* Abas */}
        <div className="flex bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80 mb-4">
          {activeMatch && (
            <>
              <button
                onClick={() => setView('vote')}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  view === 'vote' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Votar ({evaluatedCount}/{players.length})
              </button>
              <button
                onClick={() => {
                  loadStats(activeMatch.id);
                  setView('results');
                }}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  view === 'results' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
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
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
              view === 'history' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Histórico & Época
          </button>
        </div>

        {/* VISTA 1: VOTAR (Com opção de gerar o cartão com as notas do utilizador) */}
        {activeMatch && view === 'vote' && (
          <>
            <div className="mb-3">
              <div className="flex justify-between text-[11px] font-medium text-zinc-400 mb-1">
                <span>Progresso</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            {/* Botão de Partilha das Notas do Utilizador */}
            {evaluatedCount > 0 && (
              <button
                onClick={handleGenerateUserCard}
                disabled={generatingUserCard}
                className="w-full mb-3 bg-[#16161b] hover:bg-[#1a1a21] border border-red-900/40 text-red-400 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {generatingUserCard ? 'A gerar imagem...' : '📸 Gerar Cartão com as Minhas Notas'}
              </button>
            )}

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
                            ? `${theme.bg}${theme.border} ${theme.text}${theme.glow}`
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

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full mt-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-98 shadow-md"
              >
                {submitting ? 'A guardar...' : 'Submeter Avaliações'}
              </button>
            </div>
          </>
        )}

        {/* VISTA 2: RESULTADOS (Com opção de gerar o cartão com a média dos adeptos) */}
        {activeMatch && view === 'results' && (
          <div className="space-y-3">
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

            {/* Botão de Retirar Cartão da Pontuação dos Adeptos */}
            <button
              onClick={handleGenerateCommunityCard}
              disabled={generatingCommunityCard}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider border border-zinc-800 flex items-center justify-center gap-2 transition-all active:scale-98 shadow-sm"
            >
              <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {generatingCommunityCard ? 'A preparar cartão...' : '📸 Gerar Cartão: Pontuações dos Adeptos'}
            </button>

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
                      <span className="text-[9px] text-zinc-500">{s.position} • {s.total_votes} votos</span>
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

        {/* VISTA 3: HISTÓRICO COM MÉDIA GLOBAL DE TODOS OS JOGOS */}
        {view === 'history' && (
          <div className="space-y-5">
            {/* Bloco de Média Global da Época */}
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

            {/* Pódio e Classificação Geral */}
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
                    {/* 2.º Lugar */}
                    {top2 && (
                      <div className="bg-[#121216] border border-zinc-700/50 rounded-2xl p-2.5 text-center relative flex flex-col items-center">
                        <span className="w-5 h-5 rounded-full bg-zinc-700 text-zinc-200 text-[10px] font-black flex items-center justify-center mb-1">
                          2
                        </span>
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-600 mb-1.5">
                          <PlayerAvatar src={top2.photo_url} name={top2.player_name} />
                        </div>
                        <p className="font-bold text-[11px] text-white truncate w-full">{top2.player_name}</p>
                        <span className="text-xs font-black text-zinc-300 mt-0.5">{top2.season_avg_score}</span>
                      </div>
                    )}

                    {/* 1.º Lugar */}
                    {top1 && (
                      <div className="bg-gradient-to-b from-[#1c1710] to-[#121216] border-2 border-amber-500/70 rounded-2xl p-3 text-center relative flex flex-col items-center -translate-y-2 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                        <span className="text-sm -mt-2 mb-0.5">👑</span>
                        <span className="w-6 h-6 rounded-full bg-amber-500 text-black text-[11px] font-black flex items-center justify-center mb-1 shadow">
                          1
                        </span>
                        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-800 border-2 border-amber-400 mb-1.5 shadow">
                          <PlayerAvatar src={top1.photo_url} name={top1.player_name} />
                        </div>
                        <p className="font-black text-xs text-white truncate w-full">{top1.player_name}</p>
                        <span className="text-sm font-black text-amber-400 mt-0.5">{top1.season_avg_score}</span>
                      </div>
                    )}

                    {/* 3.º Lugar */}
                    {top3 && (
                      <div className="bg-[#121216] border border-amber-900/40 rounded-2xl p-2.5 text-center relative flex flex-col items-center">
                        <span className="w-5 h-5 rounded-full bg-amber-900/80 text-amber-200 text-[10px] font-black flex items-center justify-center mb-1">
                          3
                        </span>
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

            {/* Lista dos Jogos Anteriores */}
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

      {/* =========================================================================
          1. CARTÃO VISUAL DAS NOTAS DO UTILIZADOR (AS MINHAS NOTAS)
          ========================================================================= */}
      {activeMatch && (
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
                    As Minhas Notas do Jogo
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
      )}

      {/* =========================================================================
          2. CARTÃO VISUAL DAS NOTAS DOS ADEPTOS (COMUNIDADE)
          ========================================================================= */}
      {activeMatch && (
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
      )}
    </main>
  );
}