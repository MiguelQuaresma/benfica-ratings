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

function getPositionBadge(position: string) {
  switch (position) {
    case 'GR':
      return 'bg-blue-950/50 text-blue-400 border-blue-800/40';
    case 'DEF':
      return 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40';
    case 'MED':
      return 'bg-amber-950/50 text-amber-400 border-amber-800/40';
    case 'AVA':
      return 'bg-red-950/50 text-red-400 border-red-800/40';
    default:
      return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  }
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

function getOpponentAbbr(name: string) {
  const clean = name.replace(/^(FC|SC|CD|GD|SL)\s+/i, '').trim();
  return clean.substring(0, 3).toUpperCase();
}

export default function Home() {
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null);
  const [allUpcomingMatches, setAllUpcomingMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [allSquad, setAllSquad] = useState<Player[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [seasonStats, setSeasonStats] = useState<SeasonStat[]>([]);
  const [pastMatches, setPastMatches] = useState<Match[]>([]);
  const [communityMatrixScores, setCommunityMatrixScores] = useState<Record<string, Record<string, number>>>({});
  const [userMatrixScores, setUserMatrixScores] = useState<Record<string, Record<string, number>>>({});
  const [progressMode, setProgressMode] = useState<'community' | 'user'>('community');
  const [matrixSector, setMatrixSector] = useState<'ALL' | 'GR' | 'DEF' | 'MED' | 'AVA'>('ALL');
  const [matrixSortMatchId, setMatrixSortMatchId] = useState<string | null>(null);

  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [view, setView] = useState<'vote' | 'results' | 'history' | 'matrix'>('vote');
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [generatingUserCard, setGeneratingUserCard] = useState(false);
  const [generatingCommunityCard, setGeneratingCommunityCard] = useState(false);
  const [lastRatedId, setLastRatedId] = useState<string | null>(null);

  const [selectedPlayerForHistogram, setSelectedPlayerForHistogram] = useState<string | null>(null);
  const [histogramData, setHistogramData] = useState<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0,
  });
  const [loadingHistogram, setLoadingHistogram] = useState(false);

  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);

  const userCardRef = useRef<HTMLDivElement>(null);
  const communityCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    const dismissed = localStorage.getItem('bv_install_dismissed');

    if (!isStandalone && !dismissed) {
      const userAgent = window.navigator.userAgent.toLowerCase();
      const isApple = /iphone|ipad|ipod/.test(userAgent);
      setIsIOS(isApple);

      const handler = (e: any) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setShowInstallPrompt(true);
      };

      window.addEventListener('beforeinstallprompt', handler);

      if (isApple) {
        const timer = setTimeout(() => {
          setShowInstallPrompt(true);
        }, 1500);
        return () => clearTimeout(timer);
      }

      return () => window.removeEventListener('beforeinstallprompt', handler);
    }
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setShowInstallPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismissInstall = () => {
    setShowInstallPrompt(false);
    localStorage.setItem('bv_install_dismissed', 'true');
  };

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

        const voterToken = typeof window !== 'undefined' ? localStorage.getItem('voter_token') : null;
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

      const nowIso = new Date().toISOString();
      const { data: upcomingList } = await supabase
        .from('matches')
        .select('*')
        .eq('is_open_for_voting', false)
        .gte('date', nowIso)
        .order('date', { ascending: true });

      if (upcomingList && upcomingList.length > 0) {
        setAllUpcomingMatches(upcomingList as Match[]);
        setUpcomingMatch(upcomingList[0] as Match);
      } else {
        setAllUpcomingMatches([]);
        setUpcomingMatch(null);
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

  async function loadHistogram(playerId: string) {
    if (!activeMatch) return;
    if (selectedPlayerForHistogram === playerId) {
      setSelectedPlayerForHistogram(null);
      return;
    }

    setSelectedPlayerForHistogram(playerId);
    setLoadingHistogram(true);

    const { data } = await supabase
      .from('ratings')
      .select('score')
      .eq('match_id', activeMatch.id)
      .eq('player_id', playerId);

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };
    if (data) {
      data.forEach((r: any) => {
        const val = Math.round(Number(r.score));
        if (counts[val] !== undefined) counts[val] += 1;
      });
    }

    setHistogramData(counts);
    setLoadingHistogram(false);
  }

  async function loadHistoryAndMatrix() {
    const nowIso = new Date().toISOString();

    const { data: matches } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', false)
      .lt('date', nowIso)
      .order('date', { ascending: true })
      .limit(20);

    const validPastMatches = (matches as Match[]) || [];
    setPastMatches(validPastMatches);
    const validMatchIds = new Set(validPastMatches.map((m) => m.id));

    const { data: allPlayersData } = await supabase
      .from('players')
      .select('*');

    if (allPlayersData) {
      const sortedSquad = (allPlayersData as Player[]).sort((a, b) => {
        const orderA = POSITION_ORDER[a.position] || 99;
        const orderB = POSITION_ORDER[b.position] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.name.localeCompare(b.name);
      });
      setAllSquad(sortedSquad);
    }

    const { data: allScores } = await supabase
      .from('match_player_stats')
      .select('match_id, player_id, avg_score');

    if (allScores) {
      const matrixMap: Record<string, Record<string, number>> = {};
      allScores.forEach((row: any) => {
        if (validMatchIds.has(row.match_id)) {
          if (!matrixMap[row.player_id]) {
            matrixMap[row.player_id] = {};
          }
          matrixMap[row.player_id][row.match_id] = Number(row.avg_score);
        }
      });
      setCommunityMatrixScores(matrixMap);
    }

    const voterToken = typeof window !== 'undefined' ? localStorage.getItem('voter_token') : null;
    if (voterToken) {
      const { data: userAllVotes } = await supabase
        .from('ratings')
        .select('match_id, player_id, score')
        .eq('user_id', voterToken);

      if (userAllVotes) {
        const userMap: Record<string, Record<string, number>> = {};
        userAllVotes.forEach((row: any) => {
          if (validMatchIds.has(row.match_id)) {
            if (!userMap[row.player_id]) {
              userMap[row.player_id] = {};
            }
            userMap[row.player_id][row.match_id] = Number(row.score);
          }
        });
        setUserMatrixScores(userMap);
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
    if (playerIds.length === 0) return alert('Atribui pelo menos uma nota para submeter.');

    const unratedPlayers = players.filter((p) => ratings[p.id] === undefined);
    if (unratedPlayers.length > 0) {
      const namesList = unratedPlayers.map((p) => p.name).join(', ');
      const confirmIncomplete = window.confirm(
        `Ainda não avaliaste ${unratedPlayers.length} elemento(s):\n(${namesList})\n\nDesejas submeter as tuas notas mesmo assim?`
      );
      if (!confirmIncomplete) return;
    }

    setSubmitting(true);
    let voterId = localStorage.getItem('voter_token');
    if (!voterId) {
      voterId = 'anon_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('voter_token', voterId);
    }

    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: activeMatch.id,
          voterId,
          ratings,
        }),
      });

      if (!res.ok) {
        throw new Error('Falha no registo do voto');
      }

      setHasVoted(true);
      await loadStats(activeMatch.id);
      setView('results');
    } catch (err) {
      console.error(err);
      alert('Erro ao submeter as tuas notas. Tenta novamente.');
    } finally {
      setSubmitting(false);
    }
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
  const communityCoachStat = stats.find((s) => s.position === 'TREINADOR');
  const evaluatedCount = Object.keys(ratings).length;
  const progressPercent = players.length > 0 ? (evaluatedCount / players.length) * 100 : 0;

  const userBestPlayer = players
    .filter((p) => ratings[p.id] !== undefined && p.position !== 'TREINADOR')
    .sort((a, b) => (ratings[b.id] || 0) - (ratings[a.id] || 0))[0] || null;

  const userCoachPlayer = players.find((p) => p.position === 'TREINADOR');

  const userRatingsArray = Object.values(ratings);
  const userMatchTeamAverage = userRatingsArray.length > 0
    ? (userRatingsArray.reduce((a, b) => a + b, 0) / userRatingsArray.length).toFixed(1)
    : '0.0';

  const validCommunityScores = stats.map((s) => Number(s.avg_score)).filter((n) => !isNaN(n) && n > 0);
  const communityMatchTeamAverage = validCommunityScores.length > 0
    ? (validCommunityScores.reduce((a, b) => a + b, 0) / validCommunityScores.length).toFixed(1)
    : '0.0';

  const seasonFieldPlayers = seasonStats.filter((s) => s.position !== 'TREINADOR');
  const top1 = seasonFieldPlayers[0] || null;
  const top2 = seasonFieldPlayers[1] || null;
  const top3 = seasonFieldPlayers[2] || null;
  const remainingSeasonStats = seasonFieldPlayers.slice(3);

  const allSeasonScores = seasonStats.map((s) => Number(s.season_avg_score)).filter((n) => !isNaN(n) && n > 0);
  const globalAverage = allSeasonScores.length > 0
    ? (allSeasonScores.reduce((acc, curr) => acc + curr, 0) / allSeasonScores.length).toFixed(1)
    : '0.0';

  const squadForMatrix = allSquad.length > 0 ? allSquad : (seasonStats as any);

  const activeMatrixScores = progressMode === 'user' ? userMatrixScores : communityMatrixScores;

  // Função unificada que calcula a média da coluna final da matriz apenas a partir dos jogos fechados
  const getMatrixPlayerAverage = (playerId: string) => {
    const pScores = activeMatrixScores[playerId];
    if (!pScores) return null;

    const validScores = pastMatches
      .map((m) => pScores[m.id])
      .filter((s) => typeof s === 'number' && !isNaN(s) && s > 0);

    if (validScores.length === 0) return null;
    return (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(1);
  };

  const outfieldSquad = squadForMatrix
    .filter((p) => p.position !== 'TREINADOR')
    .filter((p) => (matrixSector === 'ALL' ? true : p.position === matrixSector))
    .sort((a, b) => {
      if (matrixSortMatchId) {
        const scoreA = activeMatrixScores[a.id]?.[matrixSortMatchId] ?? -1;
        const scoreB = activeMatrixScores[b.id]?.[matrixSortMatchId] ?? -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      const avgA = Number(getMatrixPlayerAverage(a.id) || 0);
      const avgB = Number(getMatrixPlayerAverage(b.id) || 0);
      if (avgA !== avgB) return avgB - avgA;
      const orderA = POSITION_ORDER[a.position] || 99;
      const orderB = POSITION_ORDER[b.position] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

  const coachForMatrix = squadForMatrix.find((p) => p.position === 'TREINADOR') || null;

  const isTestMatch = activeMatch && (
    activeMatch.opponent.toLowerCase().includes('teste') ||
    activeMatch.competition.toLowerCase().includes('teste')
  );

  const countsValues = Object.values(histogramData);
  const maxHistogramCount = countsValues.length > 0 ? Math.max(...countsValues, 1) : 1;
  const totalHistogramVotes = countsValues.reduce((a, b) => a + b, 0);

  const userCardGridPlayers = players.filter((p) => {
    if (p.position === 'TREINADOR') return false;
    if (userBestPlayer && p.id === userBestPlayer.id) return false;
    return true;
  });

  const communityCardGridStats = stats.filter((s) => {
    if (s.position === 'TREINADOR') return false;
    if (motm && s.player_id === motm.player_id) return false;
    return true;
  });

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 font-sans pb-16">
      <header className="border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-md md:max-w-4xl lg:max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BenficaEmblem className="w-7 h-7" />
            <h1 className="text-sm md:text-base font-black tracking-tight uppercase">
              BENFICA<span className="text-red-600">VOTE</span>
            </h1>
          </div>
          {activeMatch ? (
            <span className={`inline-flex items-center gap-1.5 text-[10px] md:text-xs font-bold px-2.5 py-1 rounded-full ${
              isTestMatch
                ? 'text-amber-400 bg-amber-950/40 border border-amber-800/40'
                : 'text-red-400 bg-red-950/40 border border-red-800/40'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isTestMatch ? 'bg-amber-400' : 'bg-red-500'} animate-pulse`}></span>
              {isTestMatch ? 'Modo de Teste' : 'A decorrer'}
            </span>
          ) : (
            <span className="text-[10px] md:text-xs font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-md">
              Arquivo
            </span>
          )}
        </div>
      </header>

      <div className="max-w-md md:max-w-4xl lg:max-w-5xl mx-auto px-4 pt-4">
        {upcomingMatch && (
          <div className="mb-4 p-4 md:p-6 rounded-2xl bg-[#121215] border border-zinc-800/80 text-center">
            <span className="text-[10px] md:text-xs font-bold tracking-wider text-zinc-400 uppercase">
              Próximo Encontro • {upcomingMatch.is_home !== false ? 'Casa' : 'Fora'}
            </span>
            <h2 className="text-base md:text-xl font-bold text-white mt-1">
              {formatMatchTitle(upcomingMatch)}
            </h2>
            <p className="text-[11px] md:text-xs text-zinc-500">{upcomingMatch.competition}</p>

            <div className="grid grid-cols-4 gap-2 mt-3 max-w-xs md:max-w-sm mx-auto">
              {[
                { label: 'DIAS', val: timeLeft.d },
                { label: 'HORAS', val: timeLeft.h },
                { label: 'MIN', val: timeLeft.m },
                { label: 'SEG', val: timeLeft.s },
              ].map((t, idx) => (
                <div key={idx} className="bg-zinc-900 py-1.5 md:py-2 rounded-xl border border-zinc-800/60">
                  <span className="block text-base md:text-xl font-black text-red-500 leading-tight">{t.val}</span>
                  <span className="text-[8px] md:text-[9px] font-bold text-zinc-500">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80 mb-4 gap-0.5 max-w-xl mx-auto">
          {activeMatch && (
            <>
              <button
                onClick={() => setView('vote')}
                className={`flex-1 py-1.5 md:py-2 text-[11px] md:text-xs font-bold rounded-lg transition-all ${
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
                className={`flex-1 py-1.5 md:py-2 text-[11px] md:text-xs font-bold rounded-lg transition-all ${
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
            className={`flex-1 py-1.5 md:py-2 text-[11px] md:text-xs font-bold rounded-lg transition-all ${
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
            className={`flex-1 py-1.5 md:py-2 text-[11px] md:text-xs font-bold rounded-lg transition-all ${
              view === 'matrix' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Progresso Época
          </button>
        </div>

        {/* VISTA 1: VOTAR */}
        {activeMatch && view === 'vote' && (
          <>
            <div className={`mb-4 p-3.5 md:p-4 rounded-2xl border shadow-sm flex items-center justify-between ${
              isTestMatch
                ? 'bg-gradient-to-r from-[#171511] to-[#121215] border-amber-900/40'
                : 'bg-gradient-to-r from-[#141419] to-[#121215] border-red-900/40'
            }`}>
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className={`w-2 h-2 rounded-full ${isTestMatch ? 'bg-amber-500' : 'bg-red-500'} animate-pulse`}></span>
                  <span className={`text-[10px] md:text-xs font-black uppercase tracking-wider ${
                    isTestMatch ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {activeMatch.competition} • {activeMatch.is_home !== false ? 'Estádio da Luz' : 'Fora'}
                  </span>
                </div>
                <h2 className="text-sm md:text-lg font-black text-white">
                  {formatMatchTitle(activeMatch)}
                </h2>
              </div>
              <span className={`text-[9px] md:text-xs font-bold px-2.5 py-1 rounded-md border ${
                isTestMatch
                  ? 'text-amber-400 bg-amber-950/60 border-amber-800/60'
                  : 'text-zinc-400 bg-zinc-900/80 border border-zinc-800'
              }`}>
                {isTestMatch ? 'Jogo de Teste' : 'Votação Aberta'}
              </span>
            </div>

            <div className="mb-4">
              <div className="flex justify-between text-[11px] md:text-xs font-medium text-zinc-400 mb-1">
                <span>{hasVoted ? 'Voto gravado no telemóvel' : 'Progresso das notas'}</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {players.map((p) => {
                const currentScore = ratings[p.id];
                const isCoach = p.position === 'TREINADOR';
                const theme = currentScore ? getScoreTheme(currentScore) : null;
                const isRecentlyChanged = lastRatedId === p.id;
                const badgeClass = getPositionBadge(p.position);

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
                        <div className={`w-11 h-11 rounded-xl overflow-hidden bg-zinc-800 flex-shrink-0 border ${
                          isCoach ? 'border-amber-500/50' : 'border-zinc-700/50'
                        }`}>
                          <PlayerAvatar src={p.photo_url} name={p.name} isCoach={isCoach} />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-white">{p.name}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase ${badgeClass}`}>
                            {p.position}
                          </span>
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
            </div>

            <div className="max-w-md mx-auto">
              {!hasVoted ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full mt-5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-xs md:text-sm uppercase tracking-wider transition-all active:scale-98 shadow-md cursor-pointer"
                >
                  {submitting ? 'A guardar votos...' : 'Submeter Avaliações'}
                </button>
              ) : (
                <button
                  onClick={() => setView('results')}
                  className="w-full mt-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold py-3.5 rounded-xl text-xs md:text-sm uppercase tracking-wider border border-zinc-700 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Ver Resultados e Gerar Cartões ↗
                </button>
              )}
            </div>
          </>
        )}

        {/* VISTA 2: RESULTADOS */}
        {activeMatch && view === 'results' && (
          <div className="space-y-4">
            <div className="p-4 md:p-6 rounded-2xl bg-[#121215] border border-zinc-800 text-center space-y-3 max-w-xl mx-auto">
              <div>
                <span className="text-emerald-400 text-xs md:text-sm font-black uppercase tracking-wider block">
                  {hasVoted ? '✓ O teu voto está registado' : 'Resultados em Direto'}
                </span>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Clica num jogador para abrir a distribuição de votos:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {hasVoted && (
                  <button
                    onClick={handleGenerateUserCard}
                    disabled={generatingUserCard}
                    className="w-full bg-zinc-900/90 hover:bg-red-950/40 hover:border-red-600/80 active:bg-red-900/50 active:scale-98 text-zinc-200 hover:text-white border border-zinc-800 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                  >
                    <svg className="w-4 h-4 text-zinc-400 group-hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {generatingUserCard ? 'A criar imagem...' : '📸 Gerar Cartão: Os Meus Votos'}
                  </button>
                )}

                <button
                  onClick={handleGenerateCommunityCard}
                  disabled={generatingCommunityCard}
                  className="w-full bg-zinc-900/90 hover:bg-red-950/40 hover:border-red-600/80 active:bg-red-900/50 active:scale-98 text-zinc-200 hover:text-white border border-zinc-800 font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  {generatingCommunityCard ? 'A preparar cartão...' : '👥 Cartão: Pontuações dos Adeptos'}
                </button>
              </div>
            </div>

            {motm && Number(motm.avg_score) > 0 && (
              <div className="p-4 md:p-6 rounded-2xl bg-[#121215] border border-zinc-800 text-center max-w-sm mx-auto">
                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                  ★ Homem do Jogo da Comunidade
                </span>
                <div className="w-16 h-16 md:w-20 md:h-20 mx-auto rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700 my-2">
                  <PlayerAvatar src={motm.photo_url} name={motm.player_name} />
                </div>
                <h3 className="text-sm md:text-base font-bold text-white">{motm.player_name}</h3>
                <div className="text-2xl md:text-3xl font-black text-red-500 mt-0.5">
                  {motm.avg_score} <span className="text-xs md:text-sm text-zinc-500 font-normal">/10</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
              {stats.map((s, idx) => {
                const isSelected = selectedPlayerForHistogram === s.player_id;
                const userScore = ratings[s.player_id];
                const badgeClass = getPositionBadge(s.position);

                return (
                  <div
                    key={s.player_id}
                    className="p-3 bg-[#111114] border border-zinc-800/70 rounded-xl transition-all cursor-pointer hover:border-zinc-700"
                    onClick={() => loadHistogram(s.player_id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-zinc-600 w-4">{idx + 1}</span>
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-800 border border-zinc-700/60 flex-shrink-0">
                          <PlayerAvatar src={s.photo_url} name={s.player_name} isCoach={s.position === 'TREINADOR'} />
                        </div>
                        <div>
                          <p className="font-bold text-xs md:text-sm text-white">{s.player_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded border uppercase ${badgeClass}`}>
                              {s.position}
                            </span>
                            <span className="text-[9px] text-zinc-500">
                              {s.total_votes} votos {userScore ? `• Tua: ${userScore}` : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <span className="text-base md:text-lg font-black text-red-500">{s.avg_score}</span>
                          <span className="text-[9px] text-zinc-500 font-medium"> /10</span>
                        </div>
                        <span className="text-zinc-600 text-xs">{isSelected ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-3 pt-3 border-t border-zinc-800/80 cursor-default" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-2.5">
                          <span className="text-[9px] font-black uppercase text-zinc-400">
                            Volume de Votos por Nota (1 a 10)
                          </span>
                          {userScore && (
                            <span className="text-[9px] font-bold text-red-400 bg-red-950/40 px-1.5 py-0.5 rounded border border-red-900/40">
                              A tua nota: {userScore}
                            </span>
                          )}
                        </div>

                        {loadingHistogram ? (
                          <p className="text-[10px] text-zinc-500 text-center py-4">A carregar distribuição...</p>
                        ) : (
                          <div className="grid grid-cols-10 gap-1.5 items-end h-28 pt-2 bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/40">
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                              const count = histogramData[num] || 0;
                              const isUserPick = userScore === num;
                              const heightPct = maxHistogramCount > 0 ? (count / maxHistogramCount) * 100 : 0;
                              const pctOfTotal = totalHistogramVotes > 0 ? Math.round((count / totalHistogramVotes) * 100) : 0;

                              return (
                                <div key={num} className="flex flex-col items-center h-full justify-end">
                                  <span className={`text-[8px] font-bold mb-1 transition-all ${
                                    count > 0 ? (isUserPick ? 'text-red-400 font-black' : 'text-zinc-400') : 'text-transparent'
                                  }`}>
                                    {count > 0 ? count : '·'}
                                  </span>

                                  <div className="w-full bg-zinc-900 rounded-md h-full max-h-[64px] flex items-end p-0.5 overflow-hidden">
                                    <div
                                      className={`w-full transition-all duration-500 rounded-sm ${
                                        isUserPick
                                          ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                          : count === maxHistogramCount && count > 0
                                          ? 'bg-zinc-200'
                                          : count > 0
                                          ? 'bg-zinc-600'
                                          : 'bg-transparent'
                                      }`}
                                      style={{
                                        height: count > 0 ? `${Math.max(heightPct, 12)}%` : '0%',
                                      }}
                                      title={`Nota ${num}: ${count} votos (${pctOfTotal}%)`}
                                    ></div>
                                  </div>

                                  <span className={`text-[9px] font-black mt-1.5 ${
                                    isUserPick ? 'text-red-500 scale-110' : 'text-zinc-500'
                                  }`}>
                                    {num}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VISTA 3: HISTÓRICO GERAL */}
        {view === 'history' && (
          <div className="space-y-6">
            <div className="p-4 md:p-6 rounded-2xl bg-gradient-to-r from-[#141419] to-[#121215] border border-zinc-800 flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[10px] md:text-xs font-black uppercase tracking-wider text-red-500 block">
                  Registo Acumulado
                </span>
                <h3 className="text-sm md:text-lg font-bold text-white">Média Global do Plantel</h3>
                <p className="text-[11px] md:text-xs text-zinc-500 mt-0.5">{pastMatches.length} partidas disputadas</p>
              </div>
              <div className="text-right">
                <span className="text-3xl md:text-4xl font-black text-red-500">{globalAverage}</span>
                <span className="text-xs md:text-sm text-zinc-500 font-bold"> /10</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs md:text-sm font-black uppercase tracking-wider text-zinc-400">
                  Top da Temporada (Jogadores)
                </h3>
                <span className="text-[10px] md:text-xs text-zinc-500 font-medium">Médias acumuladas</span>
              </div>

              {seasonFieldPlayers.length === 0 ? (
                <p className="text-xs text-zinc-500 bg-[#121215] p-3.5 rounded-xl border border-zinc-800/80 text-center">
                  Sem dados registados nesta época.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 md:gap-4 items-end pt-4 pb-2 max-w-xl mx-auto">
                    {top2 && (
                      <div className="bg-[#121216] border border-zinc-700/50 rounded-2xl p-2.5 md:p-4 text-center relative flex flex-col items-center">
                        <span className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-zinc-700 text-zinc-200 text-[10px] md:text-xs font-black flex items-center justify-center mb-1">2</span>
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-600 mb-1.5">
                          <PlayerAvatar src={top2.photo_url} name={top2.player_name} />
                        </div>
                        <p className="font-bold text-[11px] md:text-xs text-white truncate w-full">{top2.player_name}</p>
                        <span className="text-xs md:text-sm font-black text-zinc-300 mt-0.5">{top2.season_avg_score}</span>
                      </div>
                    )}

                    {top1 && (
                      <div className="bg-gradient-to-b from-[#1c1710] to-[#121216] border-2 border-amber-500/70 rounded-2xl p-3 md:p-5 text-center relative flex flex-col items-center -translate-y-2 shadow-[0_0_20px_rgba(245,158,11,0.15)]">
                        <span className="text-sm md:text-base -mt-2 mb-0.5">👑</span>
                        <span className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-amber-500 text-black text-[11px] md:text-xs font-black flex items-center justify-center mb-1 shadow">1</span>
                        <div className="w-14 h-14 md:w-20 md:h-20 rounded-2xl overflow-hidden bg-zinc-800 border-2 border-amber-400 mb-1.5 shadow">
                          <PlayerAvatar src={top1.photo_url} name={top1.player_name} />
                        </div>
                        <p className="font-black text-xs md:text-sm text-white truncate w-full">{top1.player_name}</p>
                        <span className="text-sm md:text-base font-black text-amber-400 mt-0.5">{top1.season_avg_score}</span>
                      </div>
                    )}

                    {top3 && (
                      <div className="bg-[#121216] border border-amber-900/40 rounded-2xl p-2.5 md:p-4 text-center relative flex flex-col items-center">
                        <span className="w-5 h-5 md:w-6 md:h-6 rounded-full bg-amber-900/80 text-amber-200 text-[10px] md:text-xs font-black flex items-center justify-center mb-1">3</span>
                        <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl overflow-hidden bg-zinc-800 border border-amber-900/60 mb-1.5">
                          <PlayerAvatar src={top3.photo_url} name={top3.player_name} />
                        </div>
                        <p className="font-bold text-[11px] md:text-xs text-white truncate w-full">{top3.player_name}</p>
                        <span className="text-xs md:text-sm font-black text-amber-500 mt-0.5">{top3.season_avg_score}</span>
                      </div>
                    )}
                  </div>

                  {remainingSeasonStats.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
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
                            <span className="text-xs md:text-sm font-black text-red-500">{s.season_avg_score}</span>
                            <span className="text-[8px] text-zinc-500"> /10</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {allUpcomingMatches.length > 0 && (
              <div>
                <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">
                  Próximos Encontros
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {allUpcomingMatches.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-[#111114] border border-zinc-800/70 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs md:text-sm font-bold text-white">{formatMatchTitle(m)}</p>
                        <span className="text-[10px] md:text-xs text-zinc-500">
                          {m.competition} • {new Date(m.date).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="text-[10px] md:text-xs font-black text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2.5 py-1 rounded-md">
                        Por Jogar
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs md:text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">
                Histórico de Jogos Disputados
              </h3>
              {pastMatches.length === 0 ? (
                <p className="text-xs text-zinc-500 bg-[#121215] p-3.5 rounded-xl border border-zinc-800/80 text-center">
                  Ainda não foram disputados jogos nesta época.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {pastMatches.slice().reverse().map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-[#111114] border border-zinc-800/70 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <p className="text-xs md:text-sm font-bold text-white">{formatMatchTitle(m)}</p>
                        <span className="text-[10px] md:text-xs text-zinc-500">{m.competition}</span>
                      </div>
                      <span className="text-[10px] md:text-xs font-medium text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        Terminado
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* VISTA 4: PROGRESSO DE ÉPOCA (COM MÉDIA BLINDADA APENAS COM JOGOS FECHADOS) */}
        {view === 'matrix' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs md:text-sm font-black uppercase tracking-wider text-red-500">
                  Progresso de Época
                </h3>
                <p className="text-[10px] md:text-xs text-zinc-500">
                  Clica na coluna de um jogo para ordenar por essa partida:
                </p>
              </div>
              <span className="text-[9px] md:text-[10px] font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded-md">
                Arrasta ➔
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
              <div className="flex bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 max-w-sm">
                <button
                  type="button"
                  onClick={() => setProgressMode('community')}
                  className={`flex-1 py-1.5 md:py-2 text-[11px] md:text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                    progressMode === 'community'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  👥 Geral Adeptos
                </button>
                <button
                  type="button"
                  onClick={() => setProgressMode('user')}
                  className={`flex-1 py-1.5 md:py-2 text-[11px] md:text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                    progressMode === 'user'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  👤 Os Meus Votos
                </button>
              </div>

              <div className="flex bg-zinc-900/90 p-1 rounded-xl border border-zinc-800 gap-1 overflow-x-auto">
                {(['ALL', 'GR', 'DEF', 'MED', 'AVA'] as const).map((sector) => (
                  <button
                    key={sector}
                    type="button"
                    onClick={() => setMatrixSector(sector)}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg transition-all ${
                      matrixSector === sector
                        ? 'bg-zinc-800 text-white border border-zinc-700 shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {sector === 'ALL' ? 'Todos' : sector}
                  </button>
                ))}
              </div>
            </div>

            {pastMatches.length === 0 ? (
              <p className="text-xs text-zinc-500 bg-[#121215] p-4 rounded-xl border border-zinc-800/80 text-center">
                Ainda não existem jogos finalizados para gerar o progresso da época.
              </p>
            ) : (
              <div className="bg-[#101014] border border-zinc-800/90 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800/90 bg-zinc-900/90 text-[10px] md:text-xs font-black text-zinc-400 uppercase tracking-wider">
                        <th 
                          onClick={() => setMatrixSortMatchId(null)}
                          className="py-2.5 px-3 sticky left-0 z-20 bg-zinc-900 shadow-[2px_0_5px_rgba(0,0,0,0.5)] w-fit whitespace-nowrap cursor-pointer hover:text-white"
                          title="Repor ordenação geral por média"
                        >
                          Nome {matrixSortMatchId === null && <span className="text-red-500">↓</span>}
                        </th>

                        {pastMatches.map((m) => {
                          const isSortedByThis = matrixSortMatchId === m.id;
                          return (
                            <th
                              key={m.id}
                              onClick={() => setMatrixSortMatchId(isSortedByThis ? null : m.id)}
                              className={`py-2 px-2 text-center min-w-[50px] border-l border-zinc-800/60 cursor-pointer transition-colors ${
                                isSortedByThis
                                  ? 'bg-red-950/60 text-red-300 border-red-800/80'
                                  : 'hover:bg-zinc-800/80'
                              }`}
                              title={`Ordenar jogadores pela exibição contra ${m.opponent}`}
                            >
                              <span className={`block text-[10px] md:text-xs font-black ${isSortedByThis ? 'text-red-400' : 'text-zinc-300'}`}>
                                {getOpponentAbbr(m.opponent)} {isSortedByThis && '↓'}
                              </span>
                              <span className="block text-[8px] md:text-[9px] text-zinc-500 font-semibold">
                                {m.is_home !== false ? 'C' : 'F'}
                              </span>
                            </th>
                          );
                        })}

                        <th 
                          onClick={() => setMatrixSortMatchId(null)}
                          className="py-2.5 px-3 text-center border-l border-zinc-800 min-w-[55px] text-red-400 bg-zinc-900/90 cursor-pointer hover:text-red-300"
                          title="Ordenar por média"
                        >
                          Média
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50 text-xs">
                      {coachForMatrix && (
                        <>
                          <tr className="bg-amber-950/20 border-b border-amber-600/30">
                            <td
                              colSpan={pastMatches.length + 2}
                              className="py-1 px-3 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-amber-400 sticky left-0 z-10"
                            >
                              👔 TREINADOR
                            </td>
                          </tr>

                          <tr key={coachForMatrix.id} className="bg-amber-950/10 hover:bg-amber-950/20 transition-colors border-b-2 border-zinc-800">
                            <td className="py-2 px-3 sticky left-0 z-10 bg-[#141210] shadow-[2px_0_5px_rgba(0,0,0,0.5)] border-l-2 border-amber-500 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-amber-500 w-3 text-center">★</span>
                                <div className="w-6 h-6 rounded overflow-hidden bg-amber-950/60 flex-shrink-0 border border-amber-500/60">
                                  <PlayerAvatar src={coachForMatrix.photo_url} name={coachForMatrix.name} isCoach={true} />
                                </div>
                                <span className="font-black text-amber-200 text-[11px] md:text-xs truncate max-w-[130px]">
                                  {coachForMatrix.name}
                                </span>
                              </div>
                            </td>

                            {pastMatches.map((m) => {
                              const coachScores = activeMatrixScores[coachForMatrix.id] || {};
                              const score = coachScores[m.id];
                              const hasCoached = score !== undefined && score > 0;
                              const cellTheme = hasCoached ? getScoreTheme(score) : null;

                              return (
                                <td key={m.id} className="py-1.5 px-1 text-center border-l border-zinc-800/50 bg-amber-950/5">
                                  {hasCoached ? (
                                    <div className={`w-8 h-7 md:w-9 md:h-7 mx-auto rounded flex items-center justify-center font-black text-[11px] md:text-xs border ${cellTheme?.matrixBg}`}>
                                      {score.toFixed(1)}
                                    </div>
                                  ) : (
                                    <div className="w-8 h-7 md:w-9 md:h-7 mx-auto rounded flex items-center justify-center text-zinc-600 font-bold text-[10px] bg-zinc-900/40">
                                      —
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            <td className="py-1.5 px-2 text-center border-l border-zinc-800 bg-[#191512]">
                              {(() => {
                                const displayCoachAvg = getMatrixPlayerAverage(coachForMatrix.id);
                                return displayCoachAvg ? (
                                  <span className="font-black text-xs md:text-sm text-amber-400">
                                    {displayCoachAvg}
                                  </span>
                                ) : (
                                  <span className="font-bold text-[11px] text-zinc-600">—</span>
                                );
                              })()}
                            </td>
                          </tr>

                          <tr className="bg-zinc-900/40 border-b border-zinc-800">
                            <td
                              colSpan={pastMatches.length + 2}
                              className="py-1 px-3 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-zinc-400 sticky left-0 z-10"
                            >
                              ⚽ PLANTEL {matrixSector !== 'ALL' ? `(${matrixSector})` : ''} {matrixSortMatchId && '(Ordenado por Jogo)'}
                            </td>
                          </tr>
                        </>
                      )}

                      {outfieldSquad.map((p, idx) => {
                        const playerScores = activeMatrixScores[p.id] || {};
                        const displayAvg = getMatrixPlayerAverage(p.id);
                        const avgTheme = displayAvg ? getScoreTheme(Number(displayAvg)) : null;

                        return (
                          <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="py-2 px-3 sticky left-0 z-10 bg-[#101014] shadow-[2px_0_5px_rgba(0,0,0,0.5)] whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black text-zinc-600 w-3 text-center">{idx + 1}</span>
                                <div className="w-6 h-6 rounded overflow-hidden bg-zinc-800 flex-shrink-0 border border-zinc-700/60">
                                  <PlayerAvatar src={p.photo_url} name={p.name} />
                                </div>
                                <div>
                                  <span className="font-bold text-white text-[11px] md:text-xs truncate block max-w-[130px]">
                                    {p.name}
                                  </span>
                                  <span className="text-[8px] font-semibold text-zinc-500 uppercase">
                                    {p.position}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {pastMatches.map((m) => {
                              const score = playerScores[m.id];
                              const hasPlayed = score !== undefined && score > 0;
                              const cellTheme = hasPlayed ? getScoreTheme(score) : null;
                              const isSortedMatch = matrixSortMatchId === m.id;

                              return (
                                <td key={m.id} className={`py-1.5 px-1 text-center border-l border-zinc-800/50 ${isSortedMatch ? 'bg-red-950/20' : ''}`}>
                                  {hasPlayed ? (
                                    <div className={`w-8 h-7 md:w-9 md:h-7 mx-auto rounded flex items-center justify-center font-black text-[11px] md:text-xs border ${cellTheme?.matrixBg}`}>
                                      {score.toFixed(1)}
                                    </div>
                                  ) : (
                                    <div className="w-8 h-7 md:w-9 md:h-7 mx-auto rounded flex items-center justify-center text-zinc-600 font-bold text-[10px] bg-zinc-900/40">
                                      —
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            <td className="py-1.5 px-2 text-center border-l border-zinc-800 bg-[#121217]">
                              {displayAvg ? (
                                <span className={`font-black text-xs md:text-sm ${avgTheme?.text}`}>
                                  {displayAvg}
                                </span>
                              ) : (
                                <span className="font-bold text-[11px] text-zinc-600">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="p-3 bg-zinc-900/60 border-t border-zinc-800 flex items-center justify-around text-[9px] md:text-xs font-bold text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-emerald-500"></span>
                    <span>≥ 8.0</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-teal-500"></span>
                    <span>6.0 - 7.9</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-amber-500"></span>
                    <span>5.0 - 5.9</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded bg-rose-500"></span>
                    <span>&lt; 5.0</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <span className="w-2.5 h-2.5 rounded bg-zinc-800 text-center leading-none">—</span>
                    <span>{progressMode === 'user' ? 'Sem Voto' : 'Ausente'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <footer className="mt-12 pt-6 border-t border-zinc-800/50 text-center space-y-1">
          <p className="text-[10px] md:text-xs font-bold text-zinc-400 uppercase tracking-widest">
            BenficaVote • Plataforma de Adeptos
          </p>
          <p className="text-[9px] md:text-xs text-zinc-500 max-w-sm md:max-w-md mx-auto leading-relaxed">
            Aplicação independente e não oficial criada por sócios e adeptos. Sem qualquer afiliação institucional ao Sport Lisboa e Benfica.
          </p>
        </footer>
      </div>

      {/* BOTÃO DISCRETO DE E-MAIL */}
      <div className="fixed bottom-4 right-4 z-40">
        <a
          href="mailto:benficavote@gmail.com?subject=Feedback%20BenficaVote"
          className="group flex items-center gap-2 bg-zinc-900/80 hover:bg-zinc-800/90 text-zinc-400 hover:text-white px-3 py-2 rounded-full border border-zinc-800/80 backdrop-blur-md shadow-lg transition-all"
          title="Contacto: benficavote@gmail.com"
        >
          <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="text-[10px] font-bold tracking-tight opacity-70 group-hover:opacity-100 transition-opacity">
            benficavote@gmail.com
          </span>
        </a>
      </div>

      {/* NOTIFICAÇÃO DE INSTALAÇÃO PWA */}
      {showInstallPrompt && (
        <aside
          aria-label="Notificação de instalação"
          className="fixed bottom-14 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
          <div className="bg-[#121216]/95 border border-zinc-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BenficaEmblem className="w-10 h-10 flex-shrink-0" />
              <div>
                <p className="text-xs font-black text-white">Instalar BenficaVote</p>
                <p className="text-[10px] text-zinc-400 leading-tight mt-0.5">
                  {isIOS
                    ? 'Toca em Partilhar ⎋ e depois "Adicionar ao Ecrã Principal"'
                    : 'Adiciona a app ao ecrã para votar após cada jogo'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!isIOS && deferredPrompt && (
                <button
                  onClick={handleInstallApp}
                  className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase px-3 py-1.5 rounded-xl transition-all shadow"
                >
                  Instalar
                </button>
              )}
              <button
                onClick={handleDismissInstall}
                className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white flex items-center justify-center text-xs font-bold transition-all"
                title="Fechar"
              >
                ✕
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* CARTÕES DE PARTILHA OCULTOS */}
      {activeMatch && (
        <>
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

              <div style={{ display: 'flex', gap: '10px', margin: '14px 0 10px 0' }}>
                {userBestPlayer && (
                  <div style={{ flex: 1, padding: '12px 14px', backgroundColor: '#141418', borderRadius: '16px', border: '1px solid #dc2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img
                        src={userBestPlayer.photo_url}
                        alt={userBestPlayer.name}
                        crossOrigin="anonymous"
                        style={{ width: '42px', height: '42px', borderRadius: '10px', objectFit: 'cover' }}
                      />
                      <div>
                        <span style={{ fontSize: '9px', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase' }}>★ O Meu Melhor em Campo</span>
                        <div style={{ fontSize: '14px', fontWeight: 800 }}>{userBestPlayer.name}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#ef4444' }}>{ratings[userBestPlayer.id] || '—'}</div>
                  </div>
                )}

                <div style={{ minWidth: '125px', padding: '12px 14px', backgroundColor: '#141418', borderRadius: '16px', border: '1px solid #3f3f46', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  <span style={{ fontSize: '9px', color: '#a1a1aa', fontWeight: 800, textTransform: 'uppercase' }}>Média Equipa</span>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
                    {userMatchTeamAverage} <span style={{ fontSize: '11px', color: '#71717a' }}>/10</span>
                  </div>
                </div>
              </div>

              {userCoachPlayer && (
                <div style={{ padding: '10px 14px', backgroundColor: '#16130e', borderRadius: '14px', border: '1px solid #b45309', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                      src={userCoachPlayer.photo_url}
                      alt={userCoachPlayer.name}
                      crossOrigin="anonymous"
                      style={{ width: '36px', height: '36px', borderRadius: '9px', objectFit: 'cover', border: '1px solid #d97706' }}
                    />
                    <div>
                      <span style={{ fontSize: '8px', color: '#f59e0b', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>👔 Treinador / Mister</span>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#fef3c7' }}>{userCoachPlayer.name}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#f59e0b' }}>
                    {ratings[userCoachPlayer.id] || '—'}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '7px', flex: 1 }}>
                {userCardGridPlayers.map((p) => {
                  const score = ratings[p.id];
                  return (
                    <div
                      key={p.id}
                      style={{
                        backgroundColor: '#121215',
                        border: '1px solid #27272a',
                        borderRadius: '10px',
                        padding: '7px 10px',
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

              <div style={{ display: 'flex', gap: '10px', margin: '14px 0 10px 0' }}>
                {motm && (
                  <div style={{ flex: 1, padding: '12px 14px', backgroundColor: '#141418', borderRadius: '16px', border: '1px solid #dc2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img
                        src={motm.photo_url}
                        alt={motm.player_name}
                        crossOrigin="anonymous"
                        style={{ width: '42px', height: '42px', borderRadius: '10px', objectFit: 'cover' }}
                      />
                      <div>
                        <span style={{ fontSize: '9px', color: '#f59e0b', fontWeight: 800, textTransform: 'uppercase' }}>★ Homem do Jogo</span>
                        <div style={{ fontSize: '14px', fontWeight: 800 }}>{motm.player_name}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#ef4444' }}>{motm.avg_score}</div>
                  </div>
                )}

                <div style={{ minWidth: '125px', padding: '12px 14px', backgroundColor: '#141418', borderRadius: '16px', border: '1px solid #3f3f46', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                  <span style={{ fontSize: '9px', color: '#a1a1aa', fontWeight: 800, textTransform: 'uppercase' }}>Média Equipa</span>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#ffffff', marginTop: '2px' }}>
                    {communityMatchTeamAverage} <span style={{ fontSize: '11px', color: '#71717a' }}>/10</span>
                  </div>
                </div>
              </div>

              {communityCoachStat && (
                <div style={{ padding: '10px 14px', backgroundColor: '#16130e', borderRadius: '14px', border: '1px solid #b45309', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <img
                      src={communityCoachStat.photo_url}
                      alt={communityCoachStat.player_name}
                      crossOrigin="anonymous"
                      style={{ width: '36px', height: '36px', borderRadius: '9px', objectFit: 'cover', border: '1px solid #d97706' }}
                    />
                    <div>
                      <span style={{ fontSize: '8px', color: '#f59e0b', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>👔 Treinador / Mister</span>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#fef3c7' }}>{communityCoachStat.player_name}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#f59e0b' }}>
                    {communityCoachStat.avg_score}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '7px', flex: 1 }}>
                {communityCardGridStats.map((s) => (
                  <div
                    key={s.player_id}
                    style={{
                      backgroundColor: '#121215',
                      border: '1px solid #27272a',
                      borderRadius: '10px',
                      padding: '7px 10px',
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