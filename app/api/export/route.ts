/**
 * GET /api/export
 *
 * The real HTTP endpoint that replaces the local open_loops.json file.
 * agent.py fetches this URL instead of reading from disk.
 *
 * Returns only open loops, sorted by priority descending — same shape
 * as the JSON produced by the old "Export open_loops.json" button.
 */

import { NextResponse } from 'next/server'
import { getLoops, getNotes } from '@/lib/kv'

export async function GET() {
  const [loops, notes] = await Promise.all([getLoops(), getNotes()])

  const open = loops
    .filter((l) => l.status === 'open')
    .sort((a, b) => b.priority - a.priority)

  const payload = {
    exported_at: new Date().toISOString(),
    open_count: open.length,
    morning_note: notes.length > 0 ? notes[notes.length - 1] : null,
    loops: open,
  }

  return NextResponse.json(payload, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}
