import { Redis } from '@upstash/redis'

// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
const redis = Redis.fromEnv()

export interface Loop {
  id: string
  date: string
  topic: string
  priority: number
  project: string
  category: string
  action: string
  context: string
  status: 'open' | 'completed'
  importedAt: string
  completedAt?: string
}

const LOOPS_KEY = 'open_loops:loops'
const NOTES_KEY = 'open_loops:notes'

// Seed data shown on first visit (mirrors the original HTML demo state)
const SEED_LOOPS: Loop[] = [
  {
    id: 'seed_1',
    date: '2026-05-18',
    topic: 'Morning Agent Concept',
    priority: 5,
    project: 'The Note',
    category: 'SPEC',
    action: 'Define the priority function logic that determines which open loop becomes the daily sticky note',
    context: 'The priority function is the core intelligence of the morning agent. Without it, the agent has no brain.',
    status: 'open',
    importedAt: new Date().toISOString(),
  },
  {
    id: 'seed_2',
    date: '2026-05-18',
    topic: 'Morning Agent Concept',
    priority: 4,
    project: 'The Note',
    category: 'BUILD',
    action: 'Build v1 of the morning agent: file reader, priority scorer, sticky note display layer',
    context: 'Architecture: local markdown file as source, scheduled Python script, always-on-top display.',
    status: 'open',
    importedAt: new Date().toISOString(),
  },
  {
    id: 'seed_3',
    date: '2026-05-18',
    topic: 'Morning Agent Concept',
    priority: 3,
    project: 'Open Loops Platform',
    category: 'SPEC',
    action: 'Decide where open_loops.json lives on disk and establish the post-conversation update habit',
    context: '',
    status: 'open',
    importedAt: new Date().toISOString(),
  },
]

const SEED_NOTES: string[] = [
  'Define the priority function for The Note — without it, the agent has no brain.',
]

export async function getLoops(): Promise<Loop[]> {
  const loops = await redis.get<Loop[]>(LOOPS_KEY)
  if (loops === null) {
    // First run — seed the store
    await redis.set(LOOPS_KEY, SEED_LOOPS)
    await redis.set(NOTES_KEY, SEED_NOTES)
    return SEED_LOOPS
  }
  return loops
}

export async function setLoops(loops: Loop[]): Promise<void> {
  await redis.set(LOOPS_KEY, loops)
}

export async function getNotes(): Promise<string[]> {
  const notes = await redis.get<string[]>(NOTES_KEY)
  return notes ?? []
}

export async function setNotes(notes: string[]): Promise<void> {
  await redis.set(NOTES_KEY, notes)
}
