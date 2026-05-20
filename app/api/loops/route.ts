import { NextRequest, NextResponse } from 'next/server'
import { getLoops, setLoops, getNotes, setNotes } from '@/lib/kv'
import type { Loop } from '@/lib/kv'

// GET /api/loops — return all loops + notes
export async function GET() {
  const [loops, notes] = await Promise.all([getLoops(), getNotes()])
  return NextResponse.json({ loops, notes })
}

// POST /api/loops — bulk-import new loops from a parsed conversation export
export async function POST(request: NextRequest) {
  const body = await request.json()
  const newLoops: Loop[] = body.loops ?? []
  const morningNote: string | null = body.morningNote ?? null

  if (!newLoops.length) {
    return NextResponse.json({ error: 'No loops provided' }, { status: 400 })
  }

  const [existing, notes] = await Promise.all([getLoops(), getNotes()])

  const updated = [...existing, ...newLoops]
  const updatedNotes = morningNote ? [...notes, morningNote] : notes

  await Promise.all([setLoops(updated), setNotes(updatedNotes)])

  return NextResponse.json({ imported: newLoops.length })
}

// DELETE /api/loops — wipe all data (used by the UI's "clear all" if added later)
export async function DELETE() {
  await Promise.all([setLoops([]), setNotes([])])
  return NextResponse.json({ ok: true })
}
