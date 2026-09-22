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

// Cores dinâmicas inspiradas no ThePlayerRatings / SofaScore
function getScoreTheme(score: number) {
  if (score >= 8.5) {
    return {
      bg: 'bg-emerald-500/20',
      border: 'border-emerald-500',
      text: 'text-emerald-400',
      glow: 'shadow-[0_0_12px_rgba(16,185,129,0.45)]',
      pill: 'bg-emerald-500 text-black',
    };
  }
  if (score >= 7.0) {
    return {
      bg: 'bg-teal-500/20',
      border: 'border-teal-500',
      text: 'text-teal-400',
      glow: 'shadow-[0_0_10px_rgba(20,184,166,0.35)]',
      pill: 'bg-teal-500 text-black',
    };
  }
  if (score >= 5.0) {
    return {
      bg: 'bg-amber-500/20',
      border: 'border-amber-500',
      text: 'text-amber-400',
      glow: 'shadow-[0_0_10px_rgba(245,158,11,0.3)]',
      pill: 'bg-amber-500 text-black',
    };
  }
  return {
    bg: 'bg-rose-500/20',
    border: 'border-rose-600',
    text: 'text-rose-400',
    glow: 'shadow-[0_0_10px_rgba(225,29,72,0.3)]',
    pill: 'bg-rose-600 text-white',
  };
}

function BenficaEmblem({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img
      src={BENFICA_LOGO_URL}
      alt="Sport Lisboa e Benfica"
      className={`${className} object-contain drop-shadow-[0_2px_10px_rgba(220,38,38,0.4)]`}
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
  const [generatingImage, setGeneratingImage] = useState(false);

  const shareCardRef = useRef<HTMLDivElement>(null);

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
      .limit(8);
    if (matches) setPastMatches(matches as Match[]);

    const { data: season } = await supabase
      .from('season_player_stats')
      .select('*')
      .limit(10);
    if (season) setSeasonStats(season as SeasonStat[]);
  }

  const handleScore = (id: string, score: number) => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
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

  const handleGenerateStoryImage = async () => {
    if (!shareCardRef.current) return;
    setGeneratingImage(true);

    try {
      const blob = await toBlob(shareCardRef.current, {
        quality: 0.95,
        cacheBust: true,
        pixelRatio: 2,
      });

      if (!blob) throw new Error('Falha ao renderizar imagem.');

      const file = new File([blob], `benficavote-${Date.now()}.png`, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'BenficaVote • Avaliações',
          text: `Notas dos adeptos para o jogo do Glorioso! #SLBenfica`,
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `BenficaVote-${activeMatch?.opponent || 'Ratings'}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
      alert('Não foi possível gerar a imagem no dispositivo.');
    } finally {
      setGeneratingImage(false);
    }
  };

  const motm = stats.find((s) => s.position !== 'TREINADOR');
  const evaluatedCount = Object.keys(ratings).length;
  const progressPercent = players.length > 0 ? (evaluatedCount / players.length) * 100 : 0;

  // Cálculo da Média Coletiva da Equipa
  const teamAverage = stats.length > 0
    ? (stats.reduce((acc, curr) => acc + Number(curr.avg_score), 0) / stats.length).toFixed(1)
    : '0.0';

  const teamTheme = getScoreTheme(Number(teamAverage));

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 font-sans pb-16 selection:bg-red-600 selection:text-white">
      {/* Topo Glassmorphism */}
      <header className="border-b border-zinc-800/80 bg-[#101013]/90 backdrop-blur-md sticky top-0 z-50">
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
              <span className="text-[10px] font-black uppercase tracking-wider">Votação Aberta</span>
            </div>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-zinc-800/60 px-2.5 py-1 rounded-lg border border-zinc-700/60">
              Arquivo
            </span>
          )}
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 pt-4">
        {/* Próximo Jogo com Cronómetro */}
        {upcomingMatch && (
          <div className="mb-4 p-5 rounded-3xl bg-gradient-to-b from-[#16161a] to-[#0f0f12] border border-zinc-800/90 text-center shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-center gap-2 mb-2">
              <BenficaEmblem className="w-5 h-5" />
              <span className="text-[10px] font-black tracking-widest text-red-500 uppercase bg-red-950/60 px-2.5 py-0.5 rounded-full border border-red-900/50">
                Próximo Encontro • {upcomingMatch.is_home !== false ? 'Casa' : 'Fora'}
              </span>
            </div>

            <h2 className="text-xl font-black text-white tracking-tight">
              {formatMatchTitle(upcomingMatch)}
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

        {/* Abas de Navegação */}
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
            <div className="mb-3 text-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {activeMatch.competition}
              </span>
              <h2 className="text-base font-black text-white">
                {formatMatchTitle(activeMatch)}
              </h2>
            </div>

            <div className="mb-4 px-1">
              <div className="flex justify-between text-[11px] font-bold text-zinc-400 mb-1.5">
                <span>Progresso das tuas notas</span>
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
                const theme = currentScore ? getScoreTheme(currentScore) : null;

                return (
                  <div
                    key={p.id}
                    className={`relative overflow-hidden rounded-2xl border transition-all duration-200 ${
                      currentScore
                        ? `${theme?.border} ${theme?.bg}${theme?.glow}`
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

                      <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 transition-all ${
                        currentScore
                          ? `${theme?.bg}${theme?.border} ${theme?.text}${theme?.glow}`
                          : 'bg-black/40 border-zinc-800 text-zinc-600'
                      }`}>
                        <span className="text-lg font-black">{currentScore || '—'}</span>
                      </div>
                    </div>

                    <div className="px-3 pb-3 pt-1 border-t border-zinc-800/50 grid grid-cols-10 gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                        const btnTheme = getScoreTheme(num);
                        const isSelected = currentScore === num;

                        return (
                          <button
                            key={num}
                            onClick={() => handleScore(p.id, num)}
                            className={`py-2 rounded-lg text-xs font-black transition-all active:scale-90 cursor-pointer ${
                              isSelected
                                ? `${btnTheme.pill}${btnTheme.glow} shadow-md`
                                : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                            }`}
                          >
                            {num}
                          </button>
                        );
                      })}
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

        {/* VISTA 2: RESULTADOS (ESTILO THE PLAYER RATINGS) */}
        {activeMatch && view === 'results' && (
          <div className="space-y-4">
            {/* Média Global da Equipa */}
            {stats.length > 0 && (
              <div className={`p-4 rounded-2xl border ${teamTheme.border} ${teamTheme.bg} flex items-center justify-between shadow-lg`}>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">
                    Exibição Coletiva
                  </span>
                  <h3 className="text-sm font-black text-white">Média Global da Equipa</h3>
                </div>
                <div className="text-right">
                  <span className={`text-3xl font-black ${teamTheme.text}`}>{teamAverage}</span>
                  <span className="text-xs text-zinc-400 font-bold"> /10</span>
                </div>
              </div>
            )}

            {/* MVP Homem do Jogo */}
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
                  <span className="text-4xl font-black text-emerald-400">{motm.avg_score}</span>
                  <span className="text-xs text-zinc-400 font-bold">/ 10</span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1">{motm.total_votes} avaliações registadas</p>
              </div>
            )}

            {/* Botão Gerar Imagem */}
            <button
              onClick={handleGenerateStoryImage}
              disabled={generatingImage}
              className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 text-white font-black py-3.5 px-4 rounded-2xl text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-[0_4px_20px_rgba(220,38,38,0.4)] transition-all active:scale-98 cursor-pointer"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {generatingImage ? 'A desenhar imagem...' : '📸 Gerar Cartão p/ Stories / X'}
            </button>

            {/* Lista com Cores Dinâmicas */}
            <div className="space-y-2">
              {stats.map((s, idx) => {
                const itemTheme = getScoreTheme(Number(s.avg_score));

                return (
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

                    <div className="text-right flex items-baseline gap-1">
                      <span className={`text-xl font-black ${itemTheme.text}`}>{s.avg_score}</span>
                      <span className="text-[10px] text-zinc-500 font-bold">/10</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* VISTA 3: HISTÓRICO */}
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
                  {seasonStats.map((s, idx) => {
                    const itemTheme = getScoreTheme(Number(s.season_avg_score));

                    return (
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
                        <div className="text-right flex items-baseline gap-1">
                          <span className={`text-base font-black ${itemTheme.text}`}>{s.season_avg_score}</span>
                          <span className="text-[9px] text-zinc-500 font-bold">/10</span>
                        </div>
                      </div>
                    );
                  })}
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
                        <p className="text-xs font-black text-white">{formatMatchTitle(m)}</p>
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

        {/* Rodapé com Aviso Legal (Não Oficial) */}
        <footer className="mt-12 pt-6 border-t border-zinc-800/80 text-center space-y-1">
          <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
            BenficaVote • Plataforma Independente
          </p>
          <p className="text-[9px] text-zinc-600 max-w-xs mx-auto leading-relaxed">
            Projeto não oficial desenvolvido por adeptos para a comunidade benfiquista. Sem qualquer ligação institucional ou afiliação comercial ao Sport Lisboa e Benfica.
          </p>
        </footer>
      </div>

      {/* Cartão de Partilha Stories 1080x1920 */}
      {activeMatch && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
          <div
            ref={shareCardRef}
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
              backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(220, 38, 38, 0.3) 0%, #09090b 70%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272a', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src={BENFICA_LOGO_URL} alt="SLB" crossOrigin="anonymous" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                <div>
                  <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.5px' }}>
                    BENFICA<span style={{ color: '#dc2626' }}>VOTE</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 700, textTransform: 'uppercase' }}>
                    Avaliações dos Adeptos
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 900, textTransform: 'uppercase' }}>
                  {activeMatch.competition}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 900 }}>
                  {formatMatchTitle(activeMatch)}
                </div>
              </div>
            </div>

            {motm && (
              <div style={{ margin: '20px 0', padding: '16px 20px', backgroundColor: '#18181b', borderRadius: '20px', border: '1px solid #dc2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <img
                    src={motm.photo_url}
                    alt={motm.player_name}
                    crossOrigin="anonymous"
                    style={{ width: '56px', height: '56px', borderRadius: '16px', objectFit: 'cover' }}
                  />
                  <div>
                    <span style={{ fontSize: '10px', color: '#f59e0b', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>
                      ★ Homem do Jogo
                    </span>
                    <div style={{ fontSize: '18px', fontWeight: 900 }}>{motm.player_name}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '32px', fontWeight: 900, color: '#10b981' }}>{motm.avg_score}</span>
                  <span style={{ fontSize: '14px', color: '#71717a', fontWeight: 700 }}> /10</span>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', flex: 1 }}>
              {stats.map((s) => (
                <div
                  key={s.player_id}
                  style={{
                    backgroundColor: '#121215',
                    border: '1px solid #27272a',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <img
                      src={s.photo_url}
                      alt={s.player_name}
                      crossOrigin="anonymous"
                      style={{ width: '28px', height: '28px', borderRadius: '8px', objectFit: 'cover' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>
                      {s.player_name}
                    </span>
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: 900, color: Number(s.avg_score) >= 7 ? '#10b981' : Number(s.avg_score) >= 5 ? '#f59e0b' : '#ef4444' }}>
                    {s.avg_score}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ borderTop: '1px solid #27272a', paddingTop: '16px', marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#71717a', fontWeight: 600 }}>
                Projeto independente de adeptos
              </span>
              <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 900, letterSpacing: '0.5px' }}>
                benficavote.vercel.app
              </span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}