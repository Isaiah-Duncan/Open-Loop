/**
 * GET /api/priority
 *
 * Returns a single JSON object: today's top-priority loop, scored using
 * the same algorithm as agent.py. Useful for lightweight integrations
 * that only need the day's action item.
 */

import { NextResponse } from 'next/server'
import { getLoops, getNotes } from '@/lib/kv'
import { pickLoop } from '@/lib/priority'

export async function GET() {
  const [loops, notes] = await Promise.all([getLoops(), getNotes()])
  const open = loops.filter((l) => l.status === 'open')
  const top = pickLoop(open)

  if (!top) {
    return NextResponse.json(
      { loop: null, morning_note: null },
      { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } }
    )
  }

  return NextResponse.json(
    {
      ...top,
      morning_note: notes.length > 0 ? notes[notes.length - 1] : null,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    }
  )
}
