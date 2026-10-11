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
  is_live?: boolean;
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
  const [liveMatch, setLiveMatch] = useState<Match | null>(null);
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 1. Criar Jogo a Decorrer do Zero ou de Agendado
  const [liveMode, setLiveMode] = useState<'manual' | 'scheduled'>('manual');
  const [liveOpponent, setLiveOpponent] = useState('');
  const [liveCompetition, setLiveCompetition] = useState('Liga Portugal');
  const [liveIsHome, setLiveIsHome] = useState(true);
  const [settingLiveLoading, setSettingLiveLoading] = useState(false);

  // 2. Abrir Votação (Apito Final)
  const [targetMatchId, setTargetMatchId] = useState<string>('');
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
    // 1. Jogo com votação aberta
    const { data: current } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', true)
      .limit(1)
      .maybeSingle();

    setActiveMatch(current as Match | null);

    // 2. Jogo em direto (is_live = true)
    const { data: live } = await supabase
      .from('matches')
      .select('*')
      .eq('is_live', true)
      .limit(1)
      .maybeSingle();

    setLiveMatch(live as Match | null);

    // 3. Próximo jogo agendado futuro
    const { data: upcoming } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', false)
      .eq('is_live', false)
      .gte('date', new Date().toISOString())
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle();

    setUpcomingMatch(upcoming as Match | null);
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

  // PASSO 1: CRIAR OU MARCAR JOGO A DECORRER (DO ZERO OU AGENDADO)
  const handleSetGameLive = async () => {
    setSettingLiveLoading(true);
    setStatus('A colocar jogo a decorrer...');

    try {
      // Se houver algum outro jogo marcado em direto, desativa-o primeiro
      await supabase.from('matches').update({ is_live: false }).eq('is_live', true);

      if (liveMode === 'scheduled' && upcomingMatch) {
        // Marca o agendado como em direto
        const { error } = await supabase
          .from('matches')
          .update({ is_live: true })
          .eq('id', upcomingMatch.id);

        if (error) throw error;
        setStatus(`✓ Jogo contra ${upcomingMatch.opponent} está A DECORRER!`);
      } else {
        // Cria um jogo NOVO do zero com is_live = true
        if (!liveOpponent.trim()) {
          alert('Por favor indica o nome do adversário.');
          setSettingLiveLoading(false);
          return;
        }

        const { error } = await supabase.from('matches').insert({
          opponent: liveOpponent.trim(),
          competition: liveCompetition.trim(),
          date: new Date().toISOString(),
          is_home: liveIsHome,
          is_live: true,
          is_open_for_voting: false,
        });

        if (error) throw error;
        setStatus(`✓ Jogo contra ${liveOpponent.trim()} criado e marcado A DECORRER!`);
      }

      await loadCurrentMatches();
      setTab('manage');
    } catch (err: any) {
      setStatus('Erro: ' + (err.message || 'Falha ao colocar a decorrer'));
    } finally {
      setSettingLiveLoading(false);
    }
  };

  // CANCELAR ESTADO A DECORRER
  const handleCancelLive = async () => {
    if (!liveMatch) return;
    const { error } = await supabase
      .from('matches')
      .update({ is_live: false })
      .eq('id', liveMatch.id);

    if (!error) {
      setStatus('✓ Jogo a decorrer cancelado.');
      await loadCurrentMatches();
    }
  };

  // PREPARAR O FORMULÁRIO DE ABERTURA DE VOTAÇÃO
  const prepareOpenVoting = (m?: Match | null) => {
    const match = m || liveMatch || upcomingMatch;
    if (match) {
      setTargetMatchId(match.id);
      setVoteOpponent(match.opponent);
      setVoteCompetition(match.competition);
      setVoteIsHome(match.is_home !== false);
    } else {
      setTargetMatchId('');
      setVoteOpponent('');
      setVoteCompetition('Liga Portugal');
      setVoteIsHome(true);
    }
    setTab('open_voting');
  };

  // PASSO 2: ABRIR VOTAÇÃO NO APITO FINAL (SELECIONANDO QUEM JOGOU)
  const handleOpenVotingNow = async () => {
    if (!voteOpponent.trim()) {
      alert('Indica o adversário.');
      return;
    }

    if (selectedIds.size === 0) {
      alert('Seleciona pelo menos um jogador/treinador que esteve em campo.');
      return;
    }

    setVoteLoading(true);
    setStatus('A publicar votação no site...');

    try {
      // Fecha qualquer outra votação e cancela lives anteriores
      await supabase
        .from('matches')
        .update({ is_open_for_voting: false, is_live: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      let currentId = targetMatchId;

      if (currentId) {
        // Ativa o jogo existente que estava a decorrer
        const { error } = await supabase
          .from('matches')
          .update({
            is_open_for_voting: true,
            is_live: false,
            date: new Date().toISOString(),
          })
          .eq('id', currentId);

        if (error) throw error;
      } else {
        // Cria um jogo novo caso não estivesse a decorrer
        const { data: newMatch, error } = await supabase
          .from('matches')
          .insert({
            opponent: voteOpponent.trim(),
            competition: voteCompetition.trim(),
            date: new Date().toISOString(),
            is_home: voteIsHome,
            is_live: false,
            is_open_for_voting: true,
          })
          .select()
          .single();

        if (error || !newMatch) throw error;
        currentId = newMatch.id;
      }

      // Regista os convocados
      await supabase.from('match_lineups').delete().eq('match_id', currentId);

      const lineups = Array.from(selectedIds).map((id) => ({
        match_id: currentId,
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
      .update({ is_open_for_voting: false, is_live: false })
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
        .eq('is_live', false)
        .lt('date', nowIso);

      if (pastMatches && pastMatches.length > 0) {
        const pastIds = pastMatches.map((m) => m.id);
        await supabase.from('ratings').delete().in('match_id', pastIds);
        await supabase.from('match_lineups').delete().in('match_id', pastIds);
        await supabase.from('matches').delete().in('id', pastIds);
      }

      setStatus('✓ Histórico limpo com sucesso!');
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
      is_live: false,
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

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[#09090b] text-zinc-100 flex items-center justify-center p-4 font-sans">
        <form
          onSubmit={handleUnlock}
          className="w-full max-w-xs bg-zinc-900/90 border border-zinc-800 p-6 rounded-3xl shadow-2xl text-center space-y-4"
        >
          <div className="w-12 h-12 mx-auto rounded-2xl bg-red-950/60 border border-red-900/60 flex items-center justify-center text-xl">
            🔒
          </div>
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-tight">Área Restrita</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Insere o código de administrador</p>
          </div>

          <input
            type="tel"
            autoComplete="off"
            placeholder="PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-center tracking-widest text-lg text-white rounded-xl p-3 outline-none focus:border-red-500"
            autoFocus
          />

          {pinError && (
            <p className="text-[11px] text-red-400 font-bold">Código incorreto. Tenta novamente.</p>
          )}

          <button
            type="submit"
            className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow"
          >
            Entrar
          </button>
        </form>
      </main>
    );
  }

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

      {/* 4 Abas */}
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
          onClick={() => { prepareOpenVoting(); setStatus(''); }}
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

      {/* ABA 1: ESTADO */}
      {tab === 'manage' && (
        <div className="space-y-4">
          {/* SE HOUVER JOGO A DECORRER */}
          {liveMatch && (
            <div className="p-4 rounded-2xl bg-red-950/20 border-2 border-red-600/80 shadow-[0_0_20px_rgba(239,68,68,0.2)]">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-red-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
                  🔴 Jogo a Decorrer no Site
                </span>
                <button
                  onClick={handleCancelLive}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
                >
                  Cancelar Direto
                </button>
              </div>

              <h2 className="text-base font-black text-white mt-1">
                {liveMatch.is_home !== false ? `SL Benfica vs ${liveMatch.opponent}` : `${liveMatch.opponent} vs SL Benfica`}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">{liveMatch.competition}</p>

              <button
                onClick={() => prepareOpenVoting(liveMatch)}
                className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                ⚡ Apito Final: Escolher Jogadores e Abrir Voto
              </button>
            </div>
          )}

          {/* Votação aberta */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">
              Votação Aberta (Adeptos a Votar)
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
                Nenhuma votação aberta de momento.
              </p>
            )}
          </div>

          {/* Próximo Jogo Agendado */}
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

                {!liveMatch && (
                  <button
                    onClick={() => {
                      setLiveMode('scheduled');
                      setTab('set_live');
                    }}
                    className="w-full mt-3 bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-800/60 font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>🔴</span> Marcar Como "Jogo a Decorrer"
                  </button>
                )}
              </div>
            ) : (
              <div>
                <p className="text-xs text-zinc-400 italic mt-1">Sem jogos agendados.</p>
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
              Remove todas as avaliações passadas e reinicia a classificação da época.
            </p>
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={clearingLoading}
              className="w-full mt-2 bg-zinc-900 hover:bg-red-950/80 text-red-400 hover:text-red-300 border border-red-900/60 font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {clearingLoading ? 'A limpar...' : 'Limpar Histórico Completo'}
            </button>
          </div>
        </div>
      )}

      {/* ABA 2: MARCAR JOGO A DECORRER (DO ZERO OU AGENDADO) */}
      {tab === 'set_live' && (
        <div className="space-y-4 bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl shadow-xl">
          <div>
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-1">
              Passo 1 • Iniciar Direto
            </span>
            <h2 className="text-sm font-black text-white">Marcar Jogo a Decorrer</h2>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              Podes criar um jogo do zero agora ou usar um agendado. No site aparece logo <strong className="text-red-400">🔴 "Jogo a decorrer — Votação abre no apito final"</strong>.
            </p>
          </div>

          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setLiveMode('manual')}
              className={`flex-1 py-1.5 text-[11px] font-black uppercase rounded-lg transition-all ${
                liveMode === 'manual' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
              }`}
            >
              Criar do Zero
            </button>
            {upcomingMatch && (
              <button
                type="button"
                onClick={() => setLiveMode('scheduled')}
                className={`flex-1 py-1.5 text-[11px] font-black uppercase rounded-lg transition-all ${
                  liveMode === 'scheduled' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
                }`}
              >
                Usar Agendado ({upcomingMatch.opponent})
              </button>
            )}
          </div>

          {liveMode === 'scheduled' && upcomingMatch ? (
            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Jogo Agendado:</span>
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
            {settingLiveLoading ? 'A atualizar...' : '🔴 Iniciar Jogo a Decorrer'}
          </button>
        </div>
      )}

      {/* ABA 3: ABRIR VOTAÇÃO NO APITO FINAL */}
      {tab === 'open_voting' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Jogo da Votação:</span>
            <p className="text-sm font-black text-white mt-0.5">
              {voteIsHome ? `SL Benfica vs ${voteOpponent || 'Adversário'}` : `${voteOpponent || 'Adversário'} vs SL Benfica`}
            </p>
            <span className="text-[10px] text-red-400 font-bold">{voteCompetition}</span>
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