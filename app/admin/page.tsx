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

  const [tab, setTab] = useState<'manage' | 'schedule' | 'open_voting'>('manage');
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);
  const [livePendingMatch, setLivePendingMatch] = useState<Match | null>(null);
  const [upcomingMatch, setUpcomingMatch] = useState<Match | null>(null);
  const [allUpcomingMatches, setAllUpcomingMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Agendar
  const [schedOpponent, setSchedOpponent] = useState('');
  const [schedCompetition, setSchedCompetition] = useState('Liga Portugal');
  const [schedDateTime, setSchedDateTime] = useState('');
  const [schedIsHome, setSchedIsHome] = useState(true);
  const [schedLoading, setSchedLoading] = useState(false);

  // Votação / Jogo a decorrer
  const [voteMode, setVoteMode] = useState<'live' | 'upcoming' | 'custom'>('upcoming');
  const [voteOpponent, setVoteOpponent] = useState('');
  const [voteCompetition, setVoteCompetition] = useState('Liga Portugal');
  const [voteIsHome, setVoteIsHome] = useState(true);
  const [voteLoading, setVoteLoading] = useState(false);
  const [liveLoading, setLiveLoading] = useState(false);

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

    const nowIso = new Date().toISOString();

    // 2. Jogo que já começou (data <= agora), mas votação ainda não abriu (Jogo a decorrer)
    const { data: livePending } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', false)
      .lte('date', nowIso)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    setLivePendingMatch(livePending as Match | null);

    // 3. Próximo jogo agendado no futuro
    const { data: futureList } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', false)
      .gt('date', nowIso)
      .order('date', { ascending: true });

    if (futureList && futureList.length > 0) {
      setAllUpcomingMatches(futureList as Match[]);
      setUpcomingMatch(futureList[0] as Match);
      setVoteOpponent(futureList[0].opponent);
      setVoteCompetition(futureList[0].competition);
      setVoteIsHome(futureList[0].is_home !== false);
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

  // MUDAR JOGO PARA "A DECORRER" (SEM ABRIR VOTAÇÃO)
  const handleSetMatchLive = async () => {
    let targetId = '';
    let targetOpp = '';

    if (voteMode === 'upcoming' && upcomingMatch) {
      targetId = upcomingMatch.id;
      targetOpp = upcomingMatch.opponent;
    } else if (voteMode === 'custom') {
      if (!voteOpponent.trim()) {
        alert('Indica o adversário para marcar como jogo a decorrer.');
        return;
      }
      targetOpp = voteOpponent.trim();
    }

    setLiveLoading(true);
    setStatus('A atualizar estado para "Jogo a decorrer"...');

    try {
      if (targetId) {
        // Atualiza a data do agendado para agora, fazendo o timer chegar a 0
        const { error } = await supabase
          .from('matches')
          .update({
            date: new Date().toISOString(),
            is_open_for_voting: false,
          })
          .eq('id', targetId);

        if (error) throw error;
      } else {
        // Cria um novo jogo com a data de agora sem abrir votação
        const { error } = await supabase.from('matches').insert({
          opponent: targetOpp,
          competition: voteCompetition.trim(),
          date: new Date().toISOString(),
          is_home: voteIsHome,
          is_open_for_voting: false,
        });

        if (error) throw error;
      }

      setStatus(`✓ Jogo contra ${targetOpp} está agora marcado como "A DECORRER" no site!`);
      await loadCurrentMatches();
      setTab('manage');
    } catch (err: any) {
      setStatus('Erro: ' + (err.message || 'Falha ao atualizar'));
    } finally {
      setLiveLoading(false);
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

      setStatus('✓ Histórico e avaliações anteriores limpos com sucesso!');
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

  // ABRIR VOTAÇÃO
  const handleOpenVoting = async () => {
    let matchId = '';
    let targetOpponent = '';

    if (voteMode === 'live' && livePendingMatch) {
      matchId = livePendingMatch.id;
      targetOpponent = livePendingMatch.opponent;
    } else if (voteMode === 'upcoming' && upcomingMatch) {
      matchId = upcomingMatch.id;
      targetOpponent = upcomingMatch.opponent;
    } else {
      targetOpponent = voteOpponent.trim();
    }

    if (!targetOpponent || selectedIds.size === 0) {
      alert('Verifica o adversário e seleciona pelo menos um elemento (plantel/treinador).');
      return;
    }

    setVoteLoading(true);
    setStatus('A publicar votação...');

    // Fechar qualquer outro jogo que estivesse aberto
    await supabase
      .from('matches')
      .update({ is_open_for_voting: false })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (matchId) {
      const { error: updErr } = await supabase
        .from('matches')
        .update({
          is_open_for_voting: true,
          date: new Date().toISOString(),
        })
        .eq('id', matchId);

      if (updErr) {
        setStatus('Erro ao ativar: ' + updErr.message);
        setVoteLoading(false);
        return;
      }
    } else {
      const { data: newMatch, error: insErr } = await supabase
        .from('matches')
        .insert({
          opponent: targetOpponent,
          competition: voteCompetition.trim(),
          date: new Date().toISOString(),
          is_home: voteIsHome,
          is_open_for_voting: true,
        })
        .select()
        .single();

      if (insErr || !newMatch) {
        setStatus('Erro ao criar jogo: ' + insErr?.message);
        setVoteLoading(false);
        return;
      }
      matchId = newMatch.id;
    }

    // Associar os convocados/jogadores escolhidos
    const lineups = Array.from(selectedIds).map((id) => ({
      match_id: matchId,
      player_id: id,
      is_starter: true,
    }));

    const { error: lineErr } = await supabase.from('match_lineups').insert(lineups);
    setVoteLoading(false);

    if (lineErr) {
      setStatus('Erro ao associar plantel: ' + lineErr.message);
    } else {
      setStatus(`✓ Votação aberta com sucesso para ${targetOpponent}!`);
      await loadCurrentMatches();
      setTab('manage');
    }
  };

  // Ecrã de bloqueio
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

      {/* Abas */}
      <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 mb-5">
        <button
          onClick={() => { setTab('manage'); setStatus(''); }}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'manage' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Estado
        </button>
        <button
          onClick={() => { setTab('open_voting'); setStatus(''); }}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'open_voting' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Abrir / Decorrer
        </button>
        <button
          onClick={() => { setTab('schedule'); setStatus(''); }}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'schedule' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
          }`}
        >
          Agendar
        </button>
      </div>

      {/* ABA 1: ESTADO E GESTÃO */}
      {tab === 'manage' && (
        <div className="space-y-4">
          {/* Se houver um jogo a decorrer sem votação aberta */}
          {livePendingMatch && !activeMatch && (
            <div className="p-4 rounded-2xl bg-amber-950/20 border-2 border-amber-600/60 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  Jogo a Decorrer no Site
                </span>
              </div>
              <h2 className="text-base font-black text-white mt-1">
                {livePendingMatch.is_home !== false ? `SL Benfica vs ${livePendingMatch.opponent}` : `${livePendingMatch.opponent} vs SL Benfica`}
              </h2>
              <p className="text-xs text-zinc-400">{livePendingMatch.competition} • Timer a 00:00 (Aviso de jogo ativo)</p>

              <button
                onClick={() => {
                  setVoteMode('live');
                  setVoteOpponent(livePendingMatch.opponent);
                  setVoteCompetition(livePendingMatch.competition);
                  setVoteIsHome(livePendingMatch.is_home !== false);
                  setTab('open_voting');
                }}
                className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                ⚡ Abrir Votação Deste Jogo (Apito Final)
              </button>
            </div>
          )}

          {/* Votação Aberta */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">
              Votação Atual
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

          {/* Próximo no Calendário */}
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

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => {
                      setVoteMode('upcoming');
                      setTab('open_voting');
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-black py-2.5 rounded-xl text-[11px] uppercase tracking-wider transition-all cursor-pointer"
                  >
                    🔴 Jogo a Decorrer
                  </button>
                  <button
                    onClick={() => {
                      setVoteMode('upcoming');
                      setTab('open_voting');
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl text-[11px] uppercase tracking-wider transition-all cursor-pointer shadow"
                  >
                    ⚡ Abrir Votação
                  </button>
                </div>
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

      {/* ABA 2: ABRIR VOTAÇÃO OU MARCAR COMO JOGO A DECORRER */}
      {tab === 'open_voting' && (
        <div className="space-y-4">
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            {livePendingMatch && (
              <button
                type="button"
                onClick={() => setVoteMode('live')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  voteMode === 'live' ? 'bg-amber-600 text-white' : 'text-zinc-400'
                }`}
              >
                🔴 Decorrer ({livePendingMatch.opponent})
              </button>
            )}
            {upcomingMatch && (
              <button
                type="button"
                onClick={() => setVoteMode('upcoming')}
                className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  voteMode === 'upcoming' ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-500'
                }`}
              >
                Agendado ({upcomingMatch.opponent})
              </button>
            )}
            <button
              type="button"
              onClick={() => setVoteMode('custom')}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                voteMode === 'custom' ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-500'
              }`}
            >
              Manual / Teste
            </button>
          </div>

          {/* Detalhes do Jogo */}
          {voteMode === 'live' && livePendingMatch ? (
            <div className="p-3.5 bg-zinc-900 border border-amber-600/50 rounded-xl">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">Jogo a Decorrer:</span>
              <p className="text-sm font-black text-white mt-0.5">
                {livePendingMatch.is_home !== false ? `SL Benfica vs ${livePendingMatch.opponent}` : `${livePendingMatch.opponent} vs SL Benfica`}
              </p>
              <span className="text-[10px] text-zinc-400 font-bold">{livePendingMatch.competition}</span>
            </div>
          ) : voteMode === 'upcoming' && upcomingMatch ? (
            <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl space-y-2">
              <div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">Jogo Selecionado:</span>
                <p className="text-sm font-black text-white mt-0.5">
                  {upcomingMatch.is_home !== false ? `SL Benfica vs ${upcomingMatch.opponent}` : `${upcomingMatch.opponent} vs SL Benfica`}
                </p>
                <span className="text-[10px] text-red-400 font-bold">{upcomingMatch.competition}</span>
              </div>

              {/* Botão para colocar a decorrer no site */}
              <button
                type="button"
                onClick={handleSetMatchLive}
                disabled={liveLoading}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-600/40 font-black py-2 rounded-lg text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                {liveLoading ? 'A atualizar...' : '🔴 Marcar Este Jogo Como "A Decorrer"'}
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 p-3.5 rounded-xl space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Local</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVoteIsHome(true)}
                    className={`py-1.5 rounded-lg text-xs font-black uppercase border ${
                      voteIsHome ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    Casa (Luz)
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoteIsHome(false)}
                    className={`py-1.5 rounded-lg text-xs font-black uppercase border ${
                      !voteIsHome ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
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
                  placeholder="ex: FC Porto, Sporting CP, Teste..."
                  value={voteOpponent}
                  onChange={(e) => setVoteOpponent(e.target.value)}
                  className="w-full bgAqui tens a solução completa.

Para teres essa flexibilidade manual (sem depender de horas marcadas ou do timer chegar ao fim), o Admin passa a ter a opção explícita de colocar um jogo em **"Jogo a Decorrer"** (que atualiza a data para agora sem abrir os votos, ativando logo a mensagem `🔴 Jogo a decorrer — Votação abre no apito final` no site) e, a seguir, um botão direto para **"Abrir Votação"** desse mesmo jogo.

---

### 1. Atualização do `app/admin/page.tsx`

Substitui o teu ficheiro **`app/admin/page.tsx`** por este:

```tsx
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

  const [tab, setTab] = useState<'manage' | 'live_control' | 'open_voting' | 'schedule'>('manage');
  const [activeMatch, setActiveMatch] = useState<Match null |>(null);
  const [upcomingMatch, setUpcomingMatch] = useState<Match null |>(null);
  const [allUpcomingMatches, setAllUpcomingMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Controlar Jogo a Decorrer
  const [liveMode, setLiveMode] = useState<'select' | 'manual'>('select');
  const [selectedMatchIdToLive, setSelectedMatchIdToLive] = useState<string>('');
  const [manualOpponent, setManualOpponent] = useState('');
  const [manualCompetition, setManualCompetition] = useState('Liga Portugal');
  const [manualIsHome, setManualIsHome] = useState(true);
  const [liveLoading, setLiveLoading] = useState(false);

  // Agendar
  const [schedOpponent, setSchedOpponent] = useState('');
  const [schedCompetition, setSchedCompetition] = useState('Liga Portugal');
  const [schedDateTime, setSchedDateTime] = useState('');
  const [schedIsHome, setSchedIsHome] = useState(true);
  const [schedLoading, setSchedLoading] = useState(false);

  // Votação
  const [voteMode, setVoteMode] = useState<'upcoming' | 'custom'>('upcoming');
  const [voteOpponent, setVoteOpponent] = useState('');
  const [voteCompetition, setVoteCompetition] = useState('Liga Portugal');
  const [voteIsHome, setVoteIsHome] = useState(true);
  const [voteLoading, setVoteLoading] = useState(false);

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
    const { data: current } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', true)
      .limit(1)
      .maybeSingle();

    setActiveMatch(current as Match | null);

    // Carregar todos os agendados ou que estejam em curso sem votação aberta
    const { data: upcomings } = await supabase
      .from('matches')
      .select('*')
      .eq('is_open_for_voting', false)
      .order('date', { ascending: true });

    if (upcomings && upcomings.length > 0) {
      setAllUpcomingMatches(upcomings as Match[]);
      const next = upcomings[0] as Match;
      setUpcomingMatch(next);
      setSelectedMatchIdToLive(next.id);
      setVoteOpponent(next.opponent);
      setVoteCompetition(next.competition);
      setVoteIsHome(next.is_home !== false);
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

  // ATIVAR: JOGO A DECORRER
  const handleSetMatchLive = async () => {
    setLiveLoading(true);
    setStatus('A colocar jogo a decorrer...');

    try {
      const pastDate = new Date(Date.now() - 5000).toISOString();

      if (liveMode === 'select') {
        if (!selectedMatchIdToLive) {
          alert('Seleciona um jogo da lista.');
          setLiveLoading(false);
          return;
        }

        const { error } = await supabase
          .from('matches')
          .update({
            date: pastDate,
            is_open_for_voting: false,
          })
          .eq('id', selectedMatchIdToLive);

        if (error) throw error;
      } else {
        if (!manualOpponent.trim()) {
          alert('Escreve o nome do adversário.');
          setLiveLoading(false);
          return;
        }

        const { error } = await supabase.from('matches').insert({
          opponent: manualOpponent.trim(),
          competition: manualCompetition.trim(),
          date: pastDate,
          is_home: manualIsHome,
          is_open_for_voting: false,
        });

        if (error) throw error;
      }

      setStatus('✓ Jogo marcado como A DECORRER! Aparece a mensagem vermelha no site.');
      await loadCurrentMatches();
      setTab('manage');
    } catch (err: any) {
      setStatus('Erro: ' + (err.message || 'Falha ao atualizar'));
    } finally {
      setLiveLoading(false);
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

      setStatus('✓ Histórico limpo com sucesso! Jogos agendados mantêm-se.');
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

  const handleOpenVoting = async () => {
    const isUsingUpcoming = voteMode === 'upcoming' && upcomingMatch;
    const targetOpponent = isUsingUpcoming ? upcomingMatch.opponent : voteOpponent.trim();
    const targetCompetition = isUsingUpcoming ? upcomingMatch.competition : voteCompetition.trim();
    const targetIsHome = isUsingUpcoming ? upcomingMatch.is_home !== false : voteIsHome;

    if (!targetOpponent || selectedIds.size === 0) {
      alert('Verifica o adversário e seleciona pelo menos um jogador.');
      return;
    }

    setVoteLoading(true);
    setStatus('A publicar votação...');

    await supabase
      .from('matches')
      .update({ is_open_for_voting: false })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    let matchId = '';

    if (isUsingUpcoming) {
      const { error: updErr } = await supabase
        .from('matches')
        .update({
          is_open_for_voting: true,
          date: new Date().toISOString(),
        })
        .eq('id', upcomingMatch.id);

      if (updErr) {
        setStatus('Erro ao ativar: ' + updErr.message);
        setVoteLoading(false);
        return;
      }
      matchId = upcomingMatch.id;
    } else {
      const { data: newMatch, error: insErr } = await supabase
        .from('matches')
        .insert({
          opponent: targetOpponent,
          competition: targetCompetition,
          date: new Date().toISOString(),
          is_home: targetIsHome,
          is_open_for_voting: true,
        })
        .select()
        .single();

      if (insErr || !newMatch) {
        setStatus('Erro ao criar jogo: ' + insErr?.message);
        setVoteLoading(false);
        return;
      }
      matchId = newMatch.id;
    }

    const lineups = Array.from(selectedIds).map((id) => ({
      match_id: matchId,
      player_id: id,
      is_starter: true,
    }));

    const { error: lineErr } = await supabase.from('match_lineups').insert(lineups);
    setVoteLoading(false);

    if (lineErr) {
      setStatus('Erro ao associar plantel: ' + lineErr.message);
    } else {
      setStatus(`✓ Votação aberta para ${targetOpponent}!`);
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

  const isCurrentUpcomingLive = upcomingMatch && new Date(upcomingMatch.date).getTime() <= Date.now();

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

      {/* Abas de Navegação */}
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
          onClick={() => { setTab('live_control'); setStatus(''); }}
          className={`py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'live_control' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
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

      {/* ABA 1: ESTADO E GESTÃO */}
      {tab === 'manage' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">
              Votação Atual
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

          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Próximo Encontro
              </span>
              {isCurrentUpcomingLive && (
                <span className="text-[9px] font-black text-red-400 bg-red-950/60 border border-red-800/60 px-2 py-0.5 rounded-full animate-pulse">
                  🔴 A Decorrer no Site
                </span>
              )}
            </div>

            {upcomingMatch ? (
              <div className="mt-1">
                <h3 className="text-sm font-black text-white">
                  {upcomingMatch.is_home !== false ? `SL Benfica vs ${upcomingMatch.opponent}` : `${upcomingMatch.opponent} vs SL Benfica`}
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {upcomingMatch.competition} • {new Date(upcomingMatch.date).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' })}
                </p>

                <div className="grid grid-cols-2 gap-2 mt-3">
                  <button
                    onClick={() => {
                      setLiveMode('select');
                      setSelectedMatchIdToLive(upcomingMatch.id);
                      setTab('live_control');
                    }}
                    className="bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-800/60 font-black py-2.5 rounded-xl text-[10px] uppercase tracking-wider transition-all"
                  >
                    🔴 Pôr a Decorrer
                  </button>

                  <button
                    onClick={() => {
                      setVoteMode('upcoming');
                      setTab('open_voting');
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white font-black py-2.5 rounded-xl text-[10px] uppercase tracking-wider transition-all shadow"
                  >
                    ⚡ Abrir Votação
                  </button>
                </div>
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

          {/* ZONA DE PERIGO: LIMPAR HISTÓRICO */}
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

      {/* ABA 2: COLOCAR JOGO A DECORRER */}
      {tab === 'live_control' && (
        <div className="space-y-4 bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl shadow-xl">
          <div>
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-1">
              Controlo do Direto
            </span>
            <h2 className="text-sm font-black text-white">Marcar "Jogo a Decorrer" no Site</h2>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              Substitui os números do timer pelo aviso vermelho: <br />
              <strong className="text-red-400">🔴 "Jogo a decorrer — Votação abre no apito final"</strong>.
            </p>
          </div>

          <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => setLiveMode('select')}
              className={`flex-1 py-1.5 text-[11px] font-black uppercase rounded-lg transition-all ${
                liveMode === 'select' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
              }`}
            >
              Escolher Agendado
            </button>
            <button
              type="button"
              onClick={() => setLiveMode('manual')}
              className={`flex-1 py-1.5 text-[11px] font-black uppercase rounded-lg transition-all ${
                liveMode === 'manual' ? 'bg-zinc-800 text-white' : 'text-zinc-500'
              }`}
            >
              Criar Manual
            </button>
          </div>

          {liveMode === 'select' ? (
            <div>
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Selecionar Jogo
              </label>
              {allUpcomingMatches.length === 0 ? (
                <p className="text-xs text-zinc-500 italic p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                  Sem jogos na lista. Usa a opção "Criar Manual" ou agenda um jogo.
                </p>
              ) : (
                <select
                  value={selectedMatchIdToLive}
                  onChange={(e) => setSelectedMatchIdToLive(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-2.5 text-xs text-white outline-none"
                >
                  {allUpcomingMatches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.is_home !== false ? `Benfica vs ${m.opponent}` : `${m.opponent} vs Benfica`} ({m.competition})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Local</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualIsHome(true)}
                    className={`py-1.5 rounded-lg text-xs font-black uppercase border ${
                      manualIsHome ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    Casa (Luz)
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualIsHome(false)}
                    className={`py-1.5 rounded-lg text-xs font-black uppercase border ${
                      !manualIsHome ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
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
                  placeholder="ex: Sporting CP, FC Porto, PSG..."
                  value={manualOpponent}
                  onChange={(e) => setManualOpponent(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Competição</label>
                <select
                  value={manualCompetition}
                  onChange={(e) => setManualCompetition(e.target.value)}
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
            onClick={handleSetMatchLive}
            disabled={liveLoading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider shadow transition-all cursor-pointer"
          >
            {liveLoading ? 'A atualizar...' : '🔴 Colocar em "Jogo a Decorrer"'}
          </button>
        </div>
      )}

      {/* ABA 3: ABRIR VOTAÇÃO */}
      {tab === 'open_voting' && (
        <div className="space-y-4">
          {upcomingMatch && (
            <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setVoteMode('upcoming')}
                className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  voteMode === 'upcoming' ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-500'
                }`}
              >
                Usar Agendado / Live (vs {upcomingMatch.opponent})
              </button>
              <button
                type="button"
                onClick={() => setVoteMode('custom')}
                className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  voteMode === 'custom' ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-500'
                }`}
              >
                Manual / Teste
              </button>
            </div>
          )}

          {voteMode === 'upcoming' && upcomingMatch ? (
            <div className="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Jogo a abrir votação:</span>
              <p className="text-sm font-black text-white mt-0.5">
                {upcomingMatch.is_home !== false ? `SL Benfica vs ${upcomingMatch.opponent}` : `${upcomingMatch.opponent} vs SL Benfica`}
              </p>
              <span className="text-[10px] text-red-400 font-bold">{upcomingMatch.competition}</span>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 p-3.5 rounded-xl space-y-3">
              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Local</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setVoteIsHome(true)}
                    className={`py-1.5 rounded-lg text-xs font-black uppercase border ${
                      voteIsHome ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    Casa (Luz)
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoteIsHome(false)}
                    className={`py-1.5 rounded-lg text-xs font-black uppercase border ${
                      !voteIsHome ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'
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
                  placeholder="ex: FC Porto ou Teste Amigável"
                  value={voteOpponent}
                  onChange={(e) => setVoteOpponent(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Competição</label>
                <select
                  value={voteCompetition}
                  onChange={(e) => setVoteCompetition(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-xs text-white outline-none"
                >
                  <option value="Liga Portugal">Liga Portugal</option>
                  <option value="Liga dos Campeões">Liga dos Campeões</option>
                  <option value="Liga Europa">Liga Europa</option>
                  <option value="Taça de Portugal">Taça de Portugal</option>
                  <option value="Taça da Liga">Taça da Liga</option>
                  <option value="Jogo de Treino / Teste">Jogo de Treino / Teste</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                Quem jogou? (Clica para selecionar)
              </span>
              <span className="text-[10px] font-black text-red-400 bg-red-950/60 px-2 py-0.5 rounded border border-red-900/50">
                {selectedIds.size} convocados
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
                    <AdminPlayerAvatar name="{p.name}" src="{p.photo_url}"/>
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
            onClick={handleOpenVoting}
            disabled={voteLoading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-wider shadow-lg transition-transform active:scale-98 cursor-pointer"
          >
            {voteLoading ? 'A publicar...' : '🚀 Lançar Votação Imediata'}
          </button>
        </div>
      )}

      {/* ABA 4: AGENDAR */}
      {tab === 'schedule' && (
        <div className="space-y-4 bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl shadow-xl">
          <div>
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-1">
              Contagem Decrescente
            </span>
            <h2 className="text-sm font-black text-white">Marcar Próximo no Calendário</h2>
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