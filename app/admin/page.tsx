'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Player {
  id: string;
  name: string;
  position: string;
  photo_url: string;
}

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
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [opponent, setOpponent] = useState('');
  const [competition, setCompetition] = useState('Liga Portugal');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    supabase
      .from('players')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) {
          const coach = (data as Player[]).find((p) => p.position === 'TREINADOR');
          if (coach) setSelectedIds(new Set([coach.id]));
          setPlayers(data as Player[]);
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

  const handleCreateMatch = async () => {
    if (!opponent.trim() || selectedIds.size === 0) {
      alert('Preenche o adversário e seleciona pelo menos um jogador.');
      return;
    }

    setLoading(true);
    setStatus('A publicar encontro...');

    // 1. Desativa jogos abertos anteriormente
    await supabase
      .from('matches')
      .update({ is_open_for_voting: false })
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // 2. Cria o novo encontro aberto para votos
    const { data: match, error: matchErr } = await supabase
      .from('matches')
      .insert({
        opponent: opponent.trim(),
        competition: competition.trim(),
        date: new Date().toISOString(),
        is_open_for_voting: true,
      })
      .select()
      .single();

    if (matchErr || !match) {
      setStatus('Erro: ' + (matchErr?.message || 'Falha ao criar jogo'));
      setLoading(false);
      return;
    }

    // 3. Associa apenas os jogadores selecionados
    const lineups = Array.from(selectedIds).map((id) => ({
      match_id: match.id,
      player_id: id,
      is_starter: true,
    }));

    const { error: lineErr } = await supabase.from('match_lineups').insert(lineups);
    setLoading(false);

    if (lineErr) {
      setStatus('Erro ao associar jogadores: ' + lineErr.message);
    } else {
      setStatus(`✓ Votação aberta com sucesso para vs ${opponent}!`);
      setOpponent('');
    }
  };

  return (
    <main className="min-h-screen bg-[#0e0e10] text-zinc-100 p-4 max-w-md mx-auto font-sans pb-16">
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800 mb-5">
        <div>
          <h1 className="text-lg font-black text-red-600 tracking-tight">ADMIN • LANÇAR JOGO</h1>
          <p className="text-xs text-zinc-400">Seleciona quem esteve em campo</p>
        </div>
        <span className="text-xs font-bold px-2 py-1 bg-red-600/20 text-red-400 border border-red-500/30 rounded">
          {selectedIds.size} em campo
        </span>
      </div>

      <div className="space-y-3 bg-zinc-900/90 border border-zinc-800 p-4 rounded-xl mb-5">
        <div>
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
            Adversário
          </label>
          <input
            type="text"
            placeholder="ex: FC Porto, Sporting CP, Real Madrid..."
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:border-red-500 outline-none"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
            Competição
          </label>
          <select
            value={competition}
            onChange={(e) => setCompetition(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-white focus:border-red-500 outline-none"
          >
            <option value="Liga Portugal">Liga Portugal</option>
            <option value="Liga dos Campeões">Liga dos Campeões</option>
            <option value="Liga Europa">Liga Europa</option>
            <option value="Taça de Portugal">Taça de Portugal</option>
            <option value="Taça da Liga">Taça da Liga</option>
          </select>
        </div>
      </div>

      <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
        Plantel Disponível:
      </p>
      <div className="grid grid-cols-2 gap-2 mb-6 max-h-[460px] overflow-y-auto pr-1">
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

      <button
        onClick={handleCreateMatch}
        disabled={loading}
        className="w-full bg-red-600 hover:bg-red-700 disabled:bg-zinc-800 text-white font-black py-4 rounded-xl text-sm uppercase tracking-wider shadow-lg transition-transform active:scale-98 cursor-pointer"
      >
        {loading ? 'A processar...' : 'Abrir Votações Agora'}
      </button>

      {status && (
        <p
          className={`text-center text-xs mt-3 font-bold ${
            status.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {status}
        </p>
      )}
    </main>
  );
}