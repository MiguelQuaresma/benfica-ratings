'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AdminPage() {
  const [players, setPlayers] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [opponent, setOpponent] = useState('');
  const [competition, setCompetition] = useState('Liga Portugal');
  const [status, setStatus] = useState('');

  useEffect(() => {
    supabase.from('players').select('*').order('name').then(({ data }) => {
      if (data) setPlayers(data);
    });
  }, []);

  const togglePlayer = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const handleCreateMatch = async () => {
    if (!opponent || selectedIds.size === 0) {
      alert('Escreve o adversário e seleciona quem jogou.');
      return;
    }
    setStatus('A criar jogo...');

    // 1. Fecha jogos anteriores e cria o novo já aberto
    await supabase.from('matches').update({ is_open_for_voting: false }).neq('id', '00000000-0000-0000-0000-000000000000');

    const { data: match, error } = await supabase
      .from('matches')
      .insert({ opponent, competition, date: new Date().toISOString(), is_open_for_voting: true })
      .select()
      .single();

    if (error) { setStatus('Erro: ' + error.message); return; }

    // 2. Insere os jogadores selecionados (incluindo o treinador)
    const lineups = Array.from(selectedIds).map(id => ({
      match_id: match.id,
      player_id: id,
      is_starter: true
    }));

    await supabase.from('match_lineups').insert(lineups);
    setStatus('Jogo criado e votação aberta!');
    setSelectedIds(new Set());
    setOpponent('');
  };

  return (
    <main className="min-h-screen bg-black text-white p-4 max-w-md mx-auto font-sans pb-16">
      <h1 className="text-xl font-bold text-red-600 mb-4 text-center">Painel de Gestão - Lançar Jogo</h1>

      <div className="space-y-3 bg-zinc-900 p-4 rounded-xl mb-6 border border-zinc-800">
        <input 
          placeholder="Adversário (ex: FC Porto)"
          value={opponent}
          onChange={e => setOpponent(e.target.value)}
          className="w-full bg-zinc-800 p-2.5 rounded-lg text-white outline-none border border-zinc-700 text-sm"
        />
        <input 
          placeholder="Competição"
          value={competition}
          onChange={e => setCompetition(e.target.value)}
          className="w-full bg-zinc-800 p-2.5 rounded-lg text-white outline-none border border-zinc-700 text-sm"
        />
      </div>

      <p className="text-xs text-zinc-400 mb-2 font-bold uppercase tracking-wider">
        Seleciona quem atuou ({selectedIds.size} selecionados):
      </p>

      <div className="grid grid-cols-2 gap-2 mb-6 max-h-96 overflow-y-auto pr-1">
        {players.map(p => {
          const checked = selectedIds.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => togglePlayer(p.id)}
              className={`p-2.5 rounded-lg border text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                checked ? 'bg-red-600 border-red-500 text-white' : 'bg-zinc-900 border-zinc-800 text-zinc-300'
              }`}
            >
              <span>{p.name}</span>
              <span className="text-[10px] opacity-75">{p.position}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={handleCreateMatch}
        className="w-full bg-red-600 hover:bg-red-700 font-black py-3.5 rounded-xl cursor-pointer shadow-lg"
      >
        Lançar Jogo e Abrir Votação
      </button>

      {status && <p className="text-center text-xs mt-3 text-red-400 font-bold">{status}</p>}
    </main>
  );
}