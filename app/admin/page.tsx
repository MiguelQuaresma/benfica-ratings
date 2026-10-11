'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Player {
  id: string;
  name: string;
  position: string;
  photo_url: string;
}

interface Match {
  id: string;
  opponent: string;
  competition: string;
  date: string;
  is_home: boolean;
  is_open_for_voting: boolean;
}

const POSITION_ORDER: Record<string, number> = {
  'GR': 1,
  'DEF': 2,
  'MED': 3,
  'AVA': 4,
  'TREINADOR': 5,
};

function AdminPlayerAvatar({ src, name }: { src: string; name: string }) {
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
      <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-[10px] font-black text-red-500 flex-shrink-0 select-none">
        {initials}
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700/60 overflow-hidden flex-shrink-0">
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover object-top"
      />
    </div>
  );
}

export default function AdminPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [tab, setTab] = useState<'manage' | 'set_live' | 'open_voting' | 'schedule'>('manage');
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [livePendingMatch, setLivePendingMatch] = useState<Match | null>(null);
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null);
  const [allUpcomingMatches, setAllUpcomingMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 1. Meter a Decorrer
  const [liveChoice, setLiveChoice] = useState<'scheduled' | 'manual'>('scheduled');
  const [liveOpponent, setLiveOpponent] = useState('');
  const [liveCompetition, setLiveCompetition] = useState('Liga Portugal');
  const [liveIsHome, setLiveIsHome] = useState(true);
  const [settingLiveLoading, setSettingLiveLoading] = useState(false);

  // 2. Abrir Votação (Apito Final)
  const [votingMatchId, setVotingMatchId] = useState<string>('');
  const [voteOpponent, setVoteOpponent] = useState('');
  const [voteCompetition, setVoteCompetition] = useState('Liga Portugal');
  const [voteIsHome, setVoteIsHome] = useState(true);
  const [voteLoading, setVoteLoading] = useState(false);

  // 3. Agendar
  const [schedOpponent, setSchedOpponent] = useState('');
  const [schedCompetition, setSchedCompetition] = useState('Liga Portugal');
  const [schedDateTime, setSchedDateTime] = useState('');
  const [schedIsHome, setSchedIsHome] = useState(true);
  const [schedLoading, setSchedLoading] = useState(false);

  const [closingLoading, setClosingLoading] = useState(false);
  const [clearingLoading, setClearingLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (sessionStorage.getItem('admin_unlocked') === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    const targetPin = process.env.NEXT_PUBLIC_ADMIN_PIN || '1904';

    if (pinInput.trim() === targetPin.trim()) {
      setIsAuthenticated(true);
      sessionStorage.setItem('admin_unlocked', 'true');
      setPinError(false);
    } else {
      setPinError(true);
      setPinInput('');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_unlocked');
    setIsAuthenticated(false);
    setPinInput('');
  };

  const loadCurrentMatches = async () => {
    const nowIso = new Date().toISOString();

    // Votação aberta
    const { data: current } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', true)
      .limit(1)
      .maybeSingle();

    setActiveMatch(current as Match | null);

    // Jogo a decorrer (data já passou ou é agora, mas votação ainda não abriu)
    const { data: livePending } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', false)
      .lte('date', nowIso)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    setLivePendingMatch(livePending as Match | null);

    // Próximos jogos agendados no futuro
    const { data: futureList } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', false)
      .gt('date', nowIso)
      .order('date', { ascending: true });

    if (futureList && futureList.length > 0) {
      setAllUpcomingMatches(futureList as Match[]);
      setUpcomingMatch(futureList[0] as Match);
      setLiveOpponent(futureList[0].opponent);
      setLiveCompetition(futureList[0].competition);
      setLiveIsHome(futureList[0].is_home !== false);
    } else {
      setAllUpcomingMatches([]);
      setUpcomingMatch(null);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;

    loadCurrentMatches();

    supabase
      .from('players')
      .select('*')
      .then(({ data }) => {
        if (data) {
          const sorted = (data as Player[]).sort((a, b) => {
            const orderA = POSITION_ORDER[a.position] || 99;
            const orderB = POSITION_ORDER[b.position] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.name.localeCompare(b.name);
          });

          const coach = sorted.find((p) => p.position === 'TREINADOR');
          if (coach) setSelectedIds(new Set([coach.id]));
          setPlayers(sorted);
        }
      });
  }, [isAuthenticated]);

  const togglePlayer = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // PASSO 1: COLOCAR JOGO A DECORRER (SEM JOGADORES)
  const handleSetGameLive = async () => {
    setSettingLiveLoading(true);
    setStatus('A marcar jogo como a decorrer...');

    try {
      const pastTime = new Date(Date.now() - 5000).toISOString();

      if (liveChoice === 'scheduled' && upcomingMatch) {
        // Põe a data do agendado para o momento atual -> ativa aviso de jogo a decorrer
        const { error } = await supabase
          .from('matches')
          .update({
            date: pastTime,
            is_open_for_voting: false,
          })
          .eq('id', upcomingMatch.id);

        if (error) throw error;
        setStatus(`✓ Jogo contra ${upcomingMatch.opponent} marcado como A DECORRER!`);
      } else {
        if (!liveOpponent.trim()) {
          alert('Indica o adversário.');
          setSettingLiveLoading(false);
          return;
        }

        const { error } = await supabase.from('matches').insert({
          opponent: liveOpponent.trim(),
          competition: liveCompetition.trim(),
          date: pastTime,
          is_home: liveIsHome,
          is_open_for_voting: false,
        });

        if (error) throw error;
        setStatus(`✓ Jogo contra ${liveOpponent} marcado como A DECORRER!`);
      }

      await loadCurrentMatches();
      setTab('manage');
    } catch (err: any) {
      setStatus('Erro: ' + (err.message || 'Falha ao colocar a decorrer'));
    } finally {
      setSettingLiveLoading(false);
    }
  };

  // PASSO 2: ABRIR VOTAÇÃO NO APITO FINAL (SELECIONA OS JOGADORES QUE JOGARAM)
  const handleOpenVotingNow = async () => {
    if (!voteOpponent.trim()) {
      alert('Indica o adversário.');
      return;
    }

    if (selectedIds.size === 0) {
      alert('Seleciona pelo menos um jogador/treinador que jogou.');
      return;
    }

    setVoteLoading(true);
    setStatus('A abrir votações...');

    try {
      // Fecha qualquer outro jogo aberto
      await supabase
        .from('matches')
        .update({ is_open_for_voting: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      let targetMatchId = votingMatchId;

      if (targetMatchId) {
        // Ativa o jogo que estava a decorrer
        const { error } = await supabase
          .from('matches')
          .update({
            is_open_for_voting: true,
            date: new Date().toISOString(),
          })
          .eq('id', targetMatchId);

        if (error) throw error;
      } else {
        // Ou cria um novo caso tenha sido manual
        const { data: newMatch, error } = await supabase
          .from('matches')
          .insert({
            opponent: voteOpponent.trim(),
            competition: voteCompetition.trim(),
            date: new Date().toISOString(),
            is_home: voteIsHome,
            is_open_for_voting: true,
          })
          .select()
          .single();

        if (error || !newMatch) throw error;
        targetMatchId = newMatch.id;
      }

      // Limpa convocatórias anteriores por segurança e insere os que jogaram
      await supabase.from('match_lineups').delete().eq('match_id', targetMatchId);

      const lineups = Array.from(selectedIds).map((id) => ({
        match_id: targetMatchId,
        player_id: id,
        is_starter: true,
      }));

      const { error: lineErr } = await supabase.from('match_lineups').insert(lineups);
      if (lineErr) throw lineErr;

      setStatus(`✓ Votação aberta com sucesso para o jogo vs ${voteOpponent}!`);
      await loadCurrentMatches();
      setTab('manage');
    } catch (err: any) {
      setStatus('Erro ao abrir votação: ' + (err.message || 'Falha de comunicação'));
    } finally {
      setVoteLoading(false);
    }
  };

  const handleCloseVoting = async () => {
    if (!activeMatch) return;
    const confirmClose = window.confirm(`Encerrar votação contra ${activeMatch.opponent}?`);
    if (!confirmClose) return;

    setClosingLoading(true);
    setStatus('A encerrar a votação...');

    const { error } = await supabase
      .from('matches')
      .update({ is_open_for_voting: false })
      .eq('id', activeMatch.id);

    setClosingLoading(false);

    if (error) {
      setStatus('Erro ao fechar: ' + error.message);
    } else {
      setStatus(`✓ Votação contra ${activeMatch.opponent} encerrada!`);
      await loadCurrentMatches();
      setTab('manage');
    }
  };

  const handleClearHistory = async () => {
    const confirmText = window.prompt(
      'Tens a certeza que queres limpar todo o histórico de votos e jogos passados?\n\nEscreve "APAGAR" para confirmar:'
    );

    if (confirmText !== 'APAGAR') {
      if (confirmText !== null) alert('Ação cancelada.');
      return;
    }

    setClearingLoading(true);
    setStatus('A limpar histórico...');

    try {
      const nowIso = new Date().toISOString();
      const { data: pastMatches } = await supabase
        .from('matches')
        .select('id')
        .eq('is_open_for_voting', false)
        .lt('date', nowIso);

      if (pastMatches && pastMatches.length > 0) {
        const pastIds = pastMatches.map((m) => m.id);
        await supabase.from('ratings').delete().in('match_id', pastIds);
        await supabase.from('match_lineups').delete().in('match_id', pastIds);
        await supabase.from('matches').delete().in('id', pastIds);
      }

      setStatus('✓ Histórico e avaliações limpos com sucesso!');
      await loadCurrentMatches();
    } catch (err: any) {
      setStatus('Erro ao limpar: ' + (err.message || 'Falha de comunicação'));
    } finally {
      setClearingLoading(false);
    }
  };

  const handleScheduleMatch = async () => {
    if (!schedOpponent.trim() || !schedDateTime) {
      alert('Indica o adversário e a data/hora.');
      return;
    }

    setSchedLoading(true);
    setStatus('A agendar...');

    const { error } = await supabase.from('matches').insert({
      opponent: schedOpponent.trim(),
      competition: schedCompetition.trim(),
      date: new Date(schedDateTime).toISOString(),
      is_home: schedIsHome,
      is_open_for_voting: false,
    });

    setSchedLoading(false);

    if (error) {
      setStatus('Erro: ' + error.message);
    } else {
      setStatus(`✓ Jogo contra ${schedOpponent} agendado!`);
      setSchedOpponent('');
      setSchedDateTime('');
      await loadCurrentMatches();
      setTab('manage');
    }
  };

  // Preparar o modal de abrir votação para o jogo que está a decorrer
  const startOpeningVotingFor = (m: Match) => {
    setVotingMatchId(m.id);
    setVoteOpponent(m.opponent);
    setVoteCompetition(m.competition);
    setVoteIsHome(m.is_home !== false);
    setTab('open_voting');
  };

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 p-4 max-w-md mx-auto font-sans pb-24">
      {/* Topo */}
      <div className="pb-3 border-b border-zinc-800/80 mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-black text-red-600 tracking-tight">ADMIN • BENFICAVOTE</h1>
          <p className="text-[11px] text-zinc-400">Controlo de Jogos e Votações</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/"
            target="_blank"
            className="text-[10px] font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1.5 rounded-lg text-zinc-300 border border-zinc-700"
          >
            Ver App ↗
          </a>
          <button
            onClick={handleLogout}
            className="text-[10px] font-bold uppercase tracking-wider bg-red-950/60 hover:bg-red-900/60 px-2.5 py-1.5 rounded-lg text-red-400 border border-red-800/60 cursor-pointer"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="grid grid-cols-4 bg-zinc-900 p-1 rounded-xl border border-zinc-800 mb-5 gap-1 text-center">
        <button
          onClick={() => { setTab('manage'); setStatus(''); }}
          className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'manage' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Estado
        </button>
        <button
          onClick={() => { setTab('set_live'); setStatus(''); }}
          className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'set_live' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
          }`}
        >
          A Decorrer
        </button>
        <button
          onClick={() => { setTab('open_voting'); setStatus(''); }}
          className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'open_voting' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Abrir Voto
        </button>
        <button
          onClick={() => { setTab('schedule'); setStatus(''); }}
          className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'schedule' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Agendar
        </button>
      </div>

      {/* ABA 1: PAINEL DE CONTROLO / ESTADO */}
      {tab === 'manage' && (
        <div className="space-y-4">
          {/* Se houver um jogo a decorrer à espera do apito final */}
          {livePendingMatch && !activeMatch && (
            <div className="p-4 rounded-2xl bg-amber-950/20 border-2 border-amber-600/70 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  🔴 Jogo Atualmente a Decorrer no Site
                </span>
              </div>
              <h2 className="text-base font-black text-white mt-1">
                {livePendingMatch.is_home !== false ? `SL Benfica vs ${livePendingMatch.opponent}` : `${livePendingMatch.opponent} vs SL Benfica`}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">{livePendingMatch.competition}</p>

              <button
                onClick={() => startOpeningVotingFor(livePendingMatch)}
                className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                ⚡ Apito Final: Escolher Jogadores e Abrir Voto
              </button>
            </div>
          )}

          {/* Votação aberta atualmente */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">
              Votação Atual (Adeptos a votar)
            </span>
            {activeMatch ? (
              <div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <h2 className="text-base font-black text-white">
                    {activeMatch.is_home !== false ? `SL Benfica vs ${activeMatch.opponent}` : `${activeMatch.opponent} vs SL Benfica`}
                  </h2>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{activeMatch.competition}</p>

                <button
                  onClick={handleCloseVoting}
                  disabled={closingLoading}
                  className="w-full mt-4 bg-red-950/80 hover:bg-red-900 text-red-400 border border-red-800/80 font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  {closingLoading ? 'A fechar...' : '🔒 Fechar e Guardar no Histórico'}
                </button>
              </div>
            ) : (
              <p className="text-xs text-zinc-400 italic mt-1">
                Nenhuma votação ativa de momento.
              </p>
            )}
          </div>

          {/* Próximo Jogo Agendado no Calendário */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">
              Próximo no Calendário
            </span>
            {upcomingMatch ? (
              <div className="mt-1">
                <h3 className="text-sm font-black text-white">
                  {upcomingMatch.is_home !== false ? `SL Benfica vs ${upcomingMatch.opponent}` : `${upcomingMatch.opponent} vs SL Benfica`}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {upcomingMatch.competition} • {new Date(upcomingMatch.date).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                </p>

                <button
                  onClick={() => {
                    setLiveChoice('scheduled');
                    setTab('set_live');
                  }}
                  className="w-full mt-3 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-800/60 font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>🔴</span> Marcar Como "Jogo a Decorrer"
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-zinc-400 italic mt-1">Sem jogos agendados no futuro.</p>
                <button
                  onClick={() => setTab('schedule')}
                  className="mt-2 text-xs font-bold text-red-400 underline cursor-pointer"
                >
                  + Agendar próximo jogo
                </button>
              </div>
            )}
          </div>

          {/* Zona de Perigo */}
          <div className="p-4 rounded-2xl bg-zinc-950 border border-red-900/40 mt-6 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-red-500 block">
              Zona de Perigo
            </span>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Remove todas as avaliações passadas e reinicia a classificação da época para recomeçar do zero.
            </p>
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={clearingLoading}
              className="w-full mt-2 bg-zinc-900 hover:bg-red-950/80 text-red-400 hover:text-red-300 border border-red-900/60 font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {clearingLoading ? 'A limpar...' : 'Limpar Histórico Completo'}
            </button>
          </div>
        </div>
      )}

      {/* ABA 2: PASSO 1 - MARCAR JOGO A DECORRER */}
      {tab === 'set_live' && (
        <div className="space-y-4 bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl shadow-xl">
          <div>
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-1">
              Passo 1 • Início do Jogo
            </span>
            <h2 className="text-sm font-black text-white">Marcar Jogo a Decorrer</h2>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              Ativa imediatamente a indicação <strong className="text-red-400">🔴 "Jogo a decorrer — Votação abre no apito final"</strong> na app sem precisar de escolher jogadores agora.
            </p>
          </div>

          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setLiveChoice('scheduled')}
              className={`flex-1 py-1.5 text-[11px] font-black uppercase rounded-lg transition-all ${
                liveChoice === 'scheduled' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
              }`}
            >
              Usar Agendado
            </button>
            <button
              type="button"
              onClick={() => setLiveChoice('manual')}
              className={`flex-1 py-1.5 text-[11px] font-black uppercase rounded-lg transition-all ${
                liveChoice === 'manual' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
              }`}
            >
              Outro / Manual
            </button>
          </div>

          {liveChoice === 'scheduled' && upcomingMatch ? (
            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Jogo a colocar em direto:</span>
              <p className="text-sm font-black text-white mt-0.5">
                {upcomingMatch.is_home !== false ? `SL Benfica vs ${upcomingMatch.opponent}` : `${upcomingMatch.opponent} vs SL Benfica`}
              </p>
              <span className="text-[10px] text-red-400 font-bold">{upcomingMatch.competition}</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Local</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLiveIsHome(true)}
                    className={`py-1.5 rounded-lg text-xs font-black uppercase border ${
                      liveIsHome ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    Casa (Luz)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiveIsHome(false)}
                    className={`py-1.5 rounded-lg text-xs font-black uppercase border ${
                      !liveIsHome ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    Fora
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Adversário</label>
                <input
                  type="text"
                  placeholder="ex: Sporting CP, FC Porto, Celtic..."
                  value={liveOpponent}
                  onChange={(e) => setLiveOpponent(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Competição</label>
                <select
                  value={liveCompetition}
                  onChange={(e) => setLiveCompetition(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-2.5 text-xs text-white outline-none"
                >
                  <option value="Liga Portugal">Liga Portugal</option>
                  <option value="Liga dos Campeões">Liga dos Campeões</option>
                  <option value="Liga Europa">Liga Europa</option>
                  <option value="Taça de Portugal">Taça de Portugal</option>
                  <option value="Taça da Liga">Taça da Liga</option>
                  <option value="Jogo de Treino / Amigável">Jogo de Treino / Amigável</option>
                </select>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSetGameLive}
            disabled={settingLiveLoading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow transition-all cursor-pointer"
          >
            {settingLiveLoading ? 'A atualizar...' : '🔴 Colocar em "Jogo a Decorrer" no Site'}
          </button>
        </div>
      )}

      {/* ABA 3: PASSO 2 - ABRIR VOTAÇÃO NO APITO FINAL (SELECIONA QUEM JOGOU) */}
      {tab === 'open_voting' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Jogo da Votação:</span>
            <p className="text-sm font-black text-white mt-0.5">
              {voteIsHome ? `SL Benfica vs ${voteOpponent || upcomingMatch?.opponent || 'Adversário'}` : `${voteOpponent || upcomingMatch?.opponent || 'Adversário'} vs SL Benfica`}
            </p>
            <span className="text-[10px] text-red-400 font-bold">{voteCompetition || 'Competição'}</span>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Quem jogou? (Onze + Suplentes + Mister)
              </span>
              <span className="text-[10px] font-black text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-900/50">
                {selectedIds.size} selecionados
              </span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-[340px] overflow-y-auto pr-1">
              {players.map((p) => {
                const checked = selectedIds.has(p.id);
                const isCoach = p.position === 'TREINADOR';

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlayer(p.id)}
                    className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all active:scale-95 cursor-pointer ${
                      checked
                        ? isCoach
                          ? 'bg-amber-600/30 border-amber-500 text-white'
                          : 'bg-red-600/30 border-red-500 text-white'
                        : 'bg-zinc-900 border-zinc-800/80 text-zinc-400'
                    }`}
                  >
                    <AdminPlayerAvatar src={p.photo_url} name={p.name} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate text-white">{p.name}</p>
                      <span className={`text-[9px] font-semibold ${checked ? 'text-zinc-200' : 'text-zinc-500'}`}>
                        {p.position}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleOpenVotingNow}
            disabled={voteLoading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-wider shadow-lg transition-transform active:scale-98 cursor-pointer"
          >
            {voteLoading ? 'A publicar...' : '🚀 Lançar Votação (Apito Final)'}
          </button>
        </div>
      )}

      {/* ABA 4: AGENDAR */}
      {tab === 'schedule' && (
        <div className="space-y-4 bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl shadow-xl">
          <div>
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-1">
              Calendário
            </span>
            <h2 className="text-sm font-black text-white">Marcar Jogo Futuro</h2>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Local</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSchedIsHome(true)}
                className={`py-2 rounded-xl border text-xs font-black uppercase ${
                  schedIsHome ? 'bg-red-600 border-red-500 text-white shadow' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                🏠 Casa (Luz)
              </button>
              <button
                type="button"
                onClick={() => setSchedIsHome(false)}
                className={`py-2 rounded-xl border text-xs font-black uppercase ${
                  !schedIsHome ? 'bg-red-600 border-red-500 text-white shadow' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                ✈️ Fora
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Adversário</label>
            <input
              type="text"
              placeholder="ex: Sporting CP, FC Porto, PSG..."
              value={schedOpponent}
              onChange={(e) => setSchedOpponent(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-2.5 text-xs text-white focus:border-red-500 outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Competição</label>
            <select
              value={schedCompetition}
              onChange={(e) => setSchedCompetition(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-2.5 text-xs text-white focus:border-red-500 outline-none"
            >
              <option value="Liga Portugal">Liga Portugal</option>
              <option value="Liga dos Campeões">Liga dos Campeões</option>
              <option value="Liga Europa">Liga Europa</option>
              <option value="Taça de Portugal">Taça de Portugal</option>
              <option value="Taça da Liga">Taça da Liga</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Data e Hora de Início</label>
            <input
              type="datetime-local"
              value={schedDateTime}
              onChange={(e) => setSchedDateTime(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-2.5 text-xs text-white focus:border-red-500 outline-none"
            />
          </div>

          <button
            onClick={handleScheduleMatch}
            disabled={schedLoading}
            className="w-full mt-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow-lg transition-transform active:scale-98 cursor-pointer"
          >
            {schedLoading ? 'A guardar...' : 'Guardar Calendário'}
          </button>
        </div>
      )}

      {status && (
        <p
          className={`text-center text-xs mt-4 font-bold p-3 rounded-xl border ${
            status.startsWith('✓')
              ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50'
              : 'text-red-400 bg-red-950/40 border-red-800/50'
          }`}
        >
          {status}
        </p>
      )}
    </main>
  );
}