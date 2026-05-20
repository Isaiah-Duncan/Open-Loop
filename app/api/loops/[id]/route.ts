import { NextRequest, NextResponse } from 'next/server'
import { getLoops, setLoops } from '@/lib/kv'

// PATCH /api/loops/[id] — update loop status (open ↔ completed)
// Note: params is a Promise in Next.js 15+
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const loops = await getLoops()

  const idx = loops.findIndex((l) => l.id === id)
  if (idx === -1) {
    return NextResponse.json({ error: 'Loop not found' }, { status: 404 })
  }

  if (body.status === 'completed') {
    loops[idx] = { ...loops[idx], status: 'completed', completedAt: new Date().toISOString() }
  } else if (body.status === 'open') {
    const { completedAt: _removed, ...rest } = loops[idx]
    loops[idx] = { ...rest, status: 'open' }
  } else {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  await setLoops(loops)
  return NextResponse.json(loops[idx])
}

// DELETE /api/loops/[id] — remove a single loop
// Note: params is a Promise in Next.js 15+
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const loops = await getLoops()
  const filtered = loops.filter((l) => l.id !== id)

  if (filtered.length === loops.length) {
    return NextResponse.json({ error: 'Loop not found' }, { status: 404 })
  }

  await setLoops(filtered)
  return NextResponse.json({ ok: true })
}
