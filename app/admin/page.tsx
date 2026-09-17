'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Player {
  id: string;
  name: string;
  position: string;
  photo_url: string;
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
  const [tab, setTab] = useState<'schedule' | 'open_voting'>('schedule');

  // Estado para Agendar Próximo Jogo
  const [schedOpponent, setSchedOpponent] = useState('');
  const [schedCompetition, setSchedCompetition] = useState('Liga Portugal');
  const [schedDateTime, setSchedDateTime] = useState('');
  const [schedIsHome, setSchedIsHome] = useState(true);
  const [schedLoading, setSchedLoading] = useState(false);

  // Estado para Abrir Votação Imediata
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [voteOpponent, setVoteOpponent] = useState('');
  const [voteCompetition, setVoteCompetition] = useState('Liga Portugal');
  const [voteIsHome, setVoteIsHome] = useState(true);
  const [voteLoading, setVoteLoading] = useState(false);

  const [status, setStatus] = useState('');

  useEffect(() => {
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
  }, []);

  const togglePlayer = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // 1. Agendar Próximo Jogo
  const handleScheduleMatch = async () => {
    if (!schedOpponent.trim() || !schedDateTime) {
      alert('Preenche o adversário e escolhe a data/hora do jogo.');
      return;
    }

    setSchedLoading(true);
    setStatus('A agendar jogo...');

    const isoDate = new Date(schedDateTime).toISOString();

    const { error } = await supabase.from('matches').insert({
      opponent: schedOpponent.trim(),
      competition: schedCompetition.trim(),
      date: isoDate,
      is_home: schedIsHome,
      is_open_for_voting: false,
    });

    setSchedLoading(false);

    if (error) {
      setStatus('Erro ao agendar: ' + error.message);
    } else {
      const matchLabel = schedIsHome ? `SL Benfica vs ${schedOpponent}` : `${schedOpponent} vs SL Benfica`;
      setStatus(`✓ Próximo jogo (${matchLabel}) agendado!`);
      setSchedOpponent('');
      setSchedDateTime('');
    }
  };

  // 2. Abrir Votação Imediata
  const handleOpenVoting = async () => {
    if (!voteOpponent.trim() || selectedIds.size === 0) {
      alert('Preenche o adversário e seleciona pelo menos um jogador.');
      return;
    }

    setVoteLoading(true);
    setStatus('A publicar votação...');

    await supabase
      .from('matches')
      .update({ is_open_for_voting: false })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    const { data: match, error: matchErr } = await supabase
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

    if (matchErr || !match) {
      setStatus('Erro: ' + (matchErr?.message || 'Falha ao criar jogo'));
      setVoteLoading(false);
      return;
    }

    const lineups = Array.from(selectedIds).map((id) => ({
      match_id: match.id,
      player_id: id,
      is_starter: true,
    }));

    const { error: lineErr } = await supabase.from('match_lineups').insert(lineups);
    setVoteLoading(false);

    if (lineErr) {
      setStatus('Erro ao associar plantel: ' + lineErr.message);
    } else {
      const matchLabel = voteIsHome ? `SL Benfica vs ${voteOpponent}` : `${voteOpponent} vs SL Benfica`;
      setStatus(`✓ Votação aberta com sucesso (${matchLabel})!`);
      setVoteOpponent('');
    }
  };

  return (
    <main className="min-h-screen bg-[#0e0e10] text-zinc-100 p-4 max-w-md mx-auto font-sans pb-20">
      <div className="pb-4 border-b border-zinc-800 mb-5">
        <h1 className="text-lg font-black text-red-600 tracking-tight">ADMIN • GESTÃO DE JOGOS</h1>
        <p className="text-xs text-zinc-400">Agendar partidas e abrir votações pós-jogo</p>
      </div>

      <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800 mb-5">
        <button
          onClick={() => { setTab('schedule'); setStatus(''); }}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'schedule' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
          }`}
        >
          1. Agendar Próximo
        </button>
        <button
          onClick={() => { setTab('open_voting'); setStatus(''); }}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
            tab === 'open_voting' ? 'bg-red-600 text-white shadow' : 'text-zinc-400 hover:text-white'
          }`}
        >
          2. Abrir Votação
        </button>
      </div>

      {/* MODO 1: AGENDAR PRÓXIMO */}
      {tab === 'schedule' && (
        <div className="space-y-4 bg-zinc-900/90 border border-zinc-800 p-5 rounded-2xl shadow-xl">
          <div>
            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest block mb-1">
              Contagem Decrescente
            </span>
            <h2 className="text-base font-black text-white">Marcar Próximo Encontro</h2>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
              Local do Encontro
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSchedIsHome(true)}
                className={`py-2.5 px-3 rounded-xl border text-xs font-black uppercase transition-all ${
                  schedIsHome
                    ? 'bg-red-600 border-red-500 text-white shadow'
                    : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                }`}
              >
                🏠 Casa (Luz)
              </button>
              <button
                type="button"
                onClick={() => setSchedIsHome(false)}
                className={`py-2.5 px-3 rounded-xl border text-xs font-black uppercase transition-all ${
                  !schedIsHome
                    ? 'bg-red-600 border-red-500 text-white shadow'
                    : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                }`}
              >
                ✈️ Fora
              </button>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
              Adversário
            </label>
            <input
              type="text"
              placeholder="ex: FC Porto, Sporting CP, PSG..."
              value={schedOpponent}
              onChange={(e) => setSchedOpponent(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-sm text-white focus:border-red-500 outline-none"
            />
            {schedOpponent.trim() && (
              <p className="text-[11px] text-zinc-400 mt-1 font-semibold">
                Vai aparecer: <span className="text-white">{schedIsHome ? `SL Benfica vs ${schedOpponent}` : `${schedOpponent} vs SL Benfica`}</span>
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
              Competição
            </label>
            <select
              value={schedCompetition}
              onChange={(e) => setSchedCompetition(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-sm text-white focus:border-red-500 outline-none"
            >
              <option value="Liga Portugal">Liga Portugal</option>
              <option value="Liga dos Campeões">Liga dos Campeões</option>
              <option value="Liga Europa">Liga Europa</option>
              <option value="Taça de Portugal">Taça de Portugal</option>
              <option value="Taça da Liga">Taça da Liga</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
              Data e Hora de Início
            </label>
            <input
              type="datetime-local"
              value={schedDateTime}
              onChange={(e) => setSchedDateTime(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-3 text-sm text-white focus:border-red-500 outline-none"
            />
          </div>

          <button
            onClick={handleScheduleMatch}
            disabled={schedLoading}
            className="w-full mt-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black py-3.5 rounded-xl text-xs uppercase tracking-wider shadow-lg transition-transform active:scale-98 cursor-pointer"
          >
            {schedLoading ? 'A agendar...' : 'Guardar no Calendário'}
          </button>
        </div>
      )}

      {/* MODO 2: ABRIR VOTAÇÃO */}
      {tab === 'open_voting' && (
        <div className="space-y-4">
          <div className="bg-zinc-900/90 border border-zinc-800 p-4 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                Apito Final
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-red-600/20 text-red-400 border border-red-500/30 rounded-md">
                {selectedIds.size} selecionados
              </span>
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Local do Encontro
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVoteIsHome(true)}
                  className={`py-2 px-3 rounded-xl border text-xs font-black uppercase transition-all ${
                    voteIsHome
                      ? 'bg-red-600 border-red-500 text-white shadow'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                  }`}
                >
                  🏠 Casa (Luz)
                </button>
                <button
                  type="button"
                  onClick={() => setVoteIsHome(false)}
                  className={`py-2 px-3 rounded-xl border text-xs font-black uppercase transition-all ${
                    !voteIsHome
                      ? 'bg-red-600 border-red-500 text-white shadow'
                      : 'bg-zinc-800/80 border-zinc-700 text-zinc-400'
                  }`}
                >
                  ✈️ Fora
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Adversário
              </label>
              <input
                type="text"
                placeholder="ex: FC Porto, Gil Vicente..."
                value={voteOpponent}
                onChange={(e) => setVoteOpponent(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-2.5 text-sm text-white focus:border-red-500 outline-none"
              />
              {voteOpponent.trim() && (
                <p className="text-[11px] text-zinc-400 mt-1 font-semibold">
                  Vai aparecer: <span className="text-white">{voteIsHome ? `SL Benfica vs ${voteOpponent}` : `${voteOpponent} vs SL Benfica`}</span>
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Competição
              </label>
              <select
                value={voteCompetition}
                onChange={(e) => setVoteCompetition(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl p-2.5 text-sm text-white focus:border-red-500 outline-none"
              >
                <option value="Liga Portugal">Liga Portugal</option>
                <option value="Liga dos Campeões">Liga dos Campeões</option>
                <option value="Liga Europa">Liga Europa</option>
                <option value="Taça de Portugal">Taça de Portugal</option>
                <option value="Taça da Liga">Taça da Liga</option>
              </select>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Quem jogou hoje? (Clica para selecionar):
            </p>

            <div className="grid grid-cols-2 gap-2 max-h-[380px] overflow-y-auto pr-1">
              {players.map((p) => {
                const checked = selectedIds.has(p.id);
                const isCoach = p.position === 'TREINADOR';

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlayer(p.id)}
                    className={`p-2 rounded-xl border text-left flex items-center gap-2 transition-all active:scale-95 ${
                      checked
                        ? isCoach
                          ? 'bg-amber-600/30 border-amber-500 text-white'
                          : 'bg-red-600/30 border-red-500 text-white'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400'
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
            onClick={handleOpenVoting}
            disabled={voteLoading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black py-4 rounded-xl text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-98 cursor-pointer"
          >
            {voteLoading ? 'A processar...' : 'Abrir Votação Agora'}
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