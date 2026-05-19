# The Note — Setup Guide

## What This Is

A morning agent that reads your open loops, picks the highest priority
incomplete task, and drops a sticky note somewhere random on your screen.
Click it to dismiss. No notifications, no sound, no app. Just a note.

Data now lives in **Vercel KV** — persistent, accessible from anywhere,
no manual JSON export required.

---

## Architecture

```
open-loops/              ← Next.js app (deploy to Vercel)
├── app/
│   ├── page.tsx         ← Client UI (three-tab platform)
│   ├── globals.css      ← Industrial monospace styles
│   └── api/
│       ├── loops/       ← GET all loops, POST import
│       │   └── [id]/    ← PATCH (status), DELETE
│       ├── export/      ← GET open_loops.json (agent reads this)
│       └── priority/    ← GET top-scored loop
├── lib/
│   ├── kv.ts            ← Vercel KV read/write helpers
│   └── priority.ts      ← Scoring function (mirrors agent.py logic)
agent.py                 ← Morning sticky note (local, runs on schedule)
```

---

## Deploy to Vercel

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "init"
gh repo create open-loops --private --push
```

### Step 2: Import on Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your `open-loops` repo
3. Framework preset: **Next.js** (auto-detected)
4. Click **Deploy**

### Step 3: Create a KV Database

1. In your Vercel project → **Storage** tab → **Create Database**
2. Choose **KV** → name it anything → click **Create**
3. Go to the KV database → **.env.local** tab
4. Click **Copy Snippet** — this gives you `KV_REST_API_URL` and `KV_REST_API_TOKEN`
5. In your project → **Settings** → **Environment Variables** → paste both

Redeploy once after adding the env vars.

### Step 4: Verify

Visit `https://your-app.vercel.app/api/export` — you should see JSON with the seed loops.

---

## Local Development

```bash
cp .env.local.example .env.local
# Fill in KV_REST_API_URL and KV_REST_API_TOKEN from the Vercel KV dashboard

npm install
npm run dev
```

---

## Configure agent.py

Open `agent.py` and set your Vercel URL:

```python
VERCEL_URL = "https://your-app.vercel.app"
```

The agent fetches `VERCEL_URL/api/export` at runtime. If the request
fails (offline, bad URL), it falls back to a local file:

```python
OPEN_LOOPS_PATH = os.path.expanduser("~/Documents/open_loops.json")
```

You can keep both configured for resilience, or leave `OPEN_LOOPS_PATH`
at its default and only set `VERCEL_URL`.

---

## Requirements (agent.py)

- Python 3.10+
- tkinter (bundled with standard Python on Windows)
- No pip installs — uses stdlib only (`urllib.request`, `json`, `tkinter`)

---

## Schedule with Windows Task Scheduler

1. Open **Task Scheduler** → **Create Basic Task**
2. Name: `The Note`
3. Trigger: **Daily** at your morning time (e.g. `08:00 AM`)
4. Action: **Start a program**
5. Program: `python`
6. Arguments: `"C:\Path\To\agent.py"`
7. Save.

**To add randomness:** After creating the task, right-click → Properties →
Triggers → Edit → check **Delay task for up to: 2 hours**.
This fires it at a random time in a 2-hour window — keeps it feeling alive.

---

## Workflow

```
Conversation ends
       ↓
open-loop-exporter skill outputs markdown block
       ↓
Paste into platform // Import tab
       ↓
Loops saved to Vercel KV (no export step needed)
       ↓
agent.py fetches /api/export each morning
       ↓
Sticky note appears
```

---

## How the Priority Function Works

Same algorithm in both `lib/priority.ts` (server) and `agent.py` (local):

| Signal | Weight |
|--------|--------|
| Priority field (1-5) | Primary |
| Category: SHIP > DECIDE > SPEC > BUILD > RESEARCH | +0 to +2 |
| Age in days since import (capped at +3) | +0.5/day |

The highest-scoring open loop becomes today's note. SHIP items and
older unresolved items surface faster. Nothing rots silently.

---

## Marking Something Done

Open the platform → find the loop → click **✓ Done**.
The agent will no longer surface it tomorrow morning.
No re-export required.

---

## API Endpoints (for the agent or integrations)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/export` | GET | All open loops, priority sorted. Agent reads this. |
| `/api/priority` | GET | Single top-scored loop for today. |
| `/api/loops` | GET | All loops + notes (for the UI). |
| `/api/loops` | POST | Import new loops from a parsed conversation. |
| `/api/loops/[id]` | PATCH | Update loop status (open / completed). |
| `/api/loops/[id]` | DELETE | Remove a loop. |
