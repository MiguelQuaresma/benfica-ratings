// app/opengraph-image/route.tsx
import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const BENFICA_LOGO_URL =
  'https://dctsqmibhhrtormygkpg.supabase.co/storage/v1/object/public/players/slb-logo.webp';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  let matchTitle = 'SL Benfica';
  let matchSubtitle = 'Avaliação dos Adeptos';
  let badgeText = 'BENFICAVOTE';
  let isLive = false;

  try {
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: current } = await supabase
        .from('matches')
        .select('*')
        .eq('is_open_for_voting', true)
        .limit(1)
        .maybeSingle();

      if (current) {
        isLive = true;
        const isHome = current.is_home !== false;
        matchTitle = isHome
          ? `SL Benfica vs ${current.opponent}`
          : `${current.opponent} vs SL Benfica`;
        matchSubtitle = `${current.competition} • Votação Oficial`;
        badgeText = '🔴 VOTAÇÃO ABERTA';
      } else {
        const { data: next } = await supabase
          .from('matches')
          .select('*')
          .eq('is_open_for_voting', false)
          .gte('date', new Date().toISOString())
          .order('date', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (next) {
          const isHome = next.is_home !== false;
          matchTitle = isHome
            ? `SL Benfica vs ${next.opponent}`
            : `${next.opponent} vs SL Benfica`;
          matchSubtitle = `Próximo Encontro • ${next.competition}`;
          badgeText = 'PRÓXIMO JOGO';
        }
      }
    }
  } catch (err) {
    console.error('Erro no OpenGraph:', err);
  }

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#09090b',
          backgroundImage:
            'radial-gradient(circle at 50% 20%, #2b0d10 0%, #09090b 70%)',
          padding: '60px 80px',
          fontFamily: 'sans-serif',
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <img
              src={BENFICA_LOGO_URL}
              alt="SLB"
              width="70"
              height="70"
              style={{ objectFit: 'contain' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: '36px',
                  fontWeight: 900,
                  letterSpacing: '-1px',
                  textTransform: 'uppercase',
                }}
              >
                BENFICA<span style={{ color: '#ef4444' }}>VOTE</span>
              </span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#a1a1aa',
                  letterSpacing: '3px',
                  textTransform: 'uppercase',
                }}
              >
                Votos dos Adeptos
              </span>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: isLive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(39, 39, 42, 0.8)',
              border: isLive ? '2px solid rgba(239, 68, 68, 0.8)' : '1px solid #3f3f46',
              padding: '10px 22px',
              borderRadius: '999px',
              fontSize: '16px',
              fontWeight: 800,
              color: isLive ? '#ef4444' : '#e4e4e7',
              letterSpacing: '1px',
            }}
          >
            {badgeText}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '40px 0' }}>
          <span
            style={{
              fontSize: '18px',
              fontWeight: 800,
              color: '#ef4444',
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}
          >
            {matchSubtitle}
          </span>
          <span
            style={{
              fontSize: '60px',
              fontWeight: 900,
              letterSpacing: '-1.5px',
              lineHeight: 1.1,
              color: '#ffffff',
            }}
          >
            {matchTitle}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid #27272a',
            paddingTop: '24px',
          }}
        >
          <span style={{ fontSize: '18px', color: '#a1a1aa', fontWeight: 600 }}>
            Avalia o onze inicial, os suplentes e o mister de 1 a 10
          </span>
          <span style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>
            benficavote.vercel.app
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}