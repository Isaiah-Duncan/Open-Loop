/**
 * Priority scoring function — mirrors the logic in agent.py.
 * Keep these two in sync if you change the scoring weights.
 *
 * Signals:
 *   priority field (1-5)  — primary
 *   category bonus        — SHIP > DECIDE > SPEC > BUILD > RESEARCH
 *   age bonus             — +0.5/day for loops older than 3 days, capped at +3
 */

import type { Loop } from './kv'

const CATEGORY_BONUS: Record<string, number> = {
  SHIP: 2.0,
  DECIDE: 1.5,
  SPEC: 1.0,
  BUILD: 0.5,
  RESEARCH: 0.0,
}

export function pickLoop(loops: Loop[]): Loop | null {
  if (!loops.length) return null

  const today = new Date()

  const scored = loops.map((loop) => {
    let score = loop.priority

    score += CATEGORY_BONUS[loop.category] ?? 0

    const dateStr = loop.importedAt || loop.date
    if (dateStr) {
      try {
        const imported = new Date(dateStr.slice(0, 10))
        const ageDays = Math.floor(
          (today.getTime() - imported.getTime()) / (1000 * 60 * 60 * 24)
        )
        score += Math.min(ageDays * 0.5, 3.0)
      } catch {
        // unparseable date — skip age bonus
      }
    }

    return { score, loop }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0].loop
}
