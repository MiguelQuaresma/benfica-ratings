import { NextResponse } from 'next/server';
import { isValidSubscription, removeSubscription, saveSubscription } from '@/lib/push';

// Adepto ativa as notificações
export async function POST(req: Request) {
  try {
    const sub = await req.json();
    if (!isValidSubscription(sub)) {
      return NextResponse.json({ error: 'Subscrição inválida' }, { status: 400 });
    }
    await saveSubscription(sub);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro em /api/push/subscribe:', err);
    return NextResponse.json({ error: 'Erro ao guardar subscrição' }, { status: 500 });
  }
}

// Adepto desativa as notificações
export async function DELETE(req: Request) {
  try {
    const { endpoint } = await req.json();
    if (typeof endpoint !== 'string') {
      return NextResponse.json({ error: 'Endpoint em falta' }, { status: 400 });
    }
    await removeSubscription(endpoint);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Erro em /api/push/subscribe (DELETE):', err);
    return NextResponse.json({ error: 'Erro ao remover subscrição' }, { status: 500 });
  }
}
