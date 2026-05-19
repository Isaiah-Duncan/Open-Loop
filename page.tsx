'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Loop {
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

type Tab = 'loops' | 'import' | 'api'
type Filter = 'open' | 'completed' | 'all'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function syntaxHighlight(json: string): string {
  return json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = 'json-num'
        if (/^"/.test(match)) cls = /:$/.test(match) ? 'json-key' : 'json-str'
        else if (/true|false/.test(match)) cls = 'json-bool'
        return `<span class="${cls}">${match}</span>`
      }
    )
}

function parseMarkdown(raw: string): {
  loops: Omit<Loop, 'id' | 'importedAt' | 'status'>[]
  morningNote: string | null
  topic: string
  date: string
} {
  const lines = raw.split('\n')
  let date = ''
  let topic = ''
  let contextNotes = ''
  let morningNote: string | null = null
  const tableRows: Omit<Loop, 'id' | 'importedAt' | 'status'>[] = []
  let inTable = false
  let inContext = false
  let inNote = false

  for (let line of lines) {
    line = line.trim()
    if (line.startsWith('## ')) {
      const match = line.match(/^## (.+?) - (.+)$/)
      if (match) { date = match[1]; topic = match[2] }
      inContext = false; inNote = false; inTable = false
    } else if (line === '### Open Loops') {
      inTable = true; inContext = false; inNote = false
    } else if (line === '### Context Notes') {
      inContext = true; inTable = false; inNote = false
    } else if (line === '### Suggested Morning Note') {
      inNote = true; inContext = false; inTable = false
    } else if (
      inTable &&
      line.startsWith('|') &&
      !line.startsWith('|--') &&
      !line.toLowerCase().includes('priority')
    ) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean)
      if (cells.length >= 4) {
        tableRows.push({
          priority: parseInt(cells[0]) || 3,
          project: cells[1],
          category: cells[2].toUpperCase(),
          action: cells[3],
          context: contextNotes,
          date,
          topic,
        })
      }
    } else if (inContext && line && !line.startsWith('#')) {
      contextNotes += (contextNotes ? ' ' : '') + line
    } else if (inNote && line.startsWith('>')) {
      morningNote = line.replace(/^>\s*/, '')
    }
  }

  return { loops: tableRows, morningNote, topic, date }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [loops, setLoops] = useState<Loop[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('loops')
  const [currentFilter, setCurrentFilter] = useState<Filter>('open')
  const [search, setSearch] = useState('')
  const [importText, setImportText] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [apiPriorityHtml, setApiPriorityHtml] = useState('')
  const [apiAllHtml, setApiAllHtml] = useState('')
  const [apiCount, setApiCount] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/loops')
      const data = await res.json()
      setLoops(data.loops ?? [])
      setNotes(data.notes ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // ── Toast ───────────────────────────────────────────────────────────────────

  const toast = useCallback((msg: string) => {
    setToastMsg(msg)
    setToastVisible(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2400)
  }, [])

  // ── Stats ───────────────────────────────────────────────────────────────────

  const openCount = loops.filter((l) => l.status === 'open').length
  const doneCount = loops.filter((l) => l.status === 'completed').length
  const projectCount = new Set(
    loops.filter((l) => l.status === 'open').map((l) => l.project)
  ).size
  const lastImport =
    loops.length > 0
      ? [...loops].sort(
          (a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime()
        )[0]?.importedAt?.slice(0, 10) ?? '—'
      : '—'

  // ── Loop mutations ──────────────────────────────────────────────────────────

  async function markDone(id: string) {
    await fetch(`/api/loops/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    await fetchData()
    toast('Loop marked complete.')
  }

  async function reopen(id: string) {
    await fetch(`/api/loops/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'open' }),
    })
    await fetchData()
    toast('Loop reopened.')
  }

  async function deleteLoop(id: string) {
    await fetch(`/api/loops/${id}`, { method: 'DELETE' })
    await fetchData()
    toast('Loop deleted.')
  }

  // ── Import ──────────────────────────────────────────────────────────────────

  async function parseAndImport() {
    const raw = importText.trim()
    if (!raw) { setImportStatus('Nothing to import.'); return }

    const { loops: parsed, morningNote, topic } = parseMarkdown(raw)

    if (!parsed.length) {
      setImportStatus('No table rows found. Check format.')
      return
    }

    const now = new Date().toISOString()
    const newLoops: Loop[] = parsed.map((r) => ({
      ...r,
      id: 'loop_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      status: 'open',
      importedAt: now,
    }))

    const res = await fetch('/api/loops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loops: newLoops, morningNote }),
    })

    if (!res.ok) {
      setImportStatus('Import failed.')
      return
    }

    const { imported } = await res.json()
    setImportStatus(`Imported ${imported} loop${imported !== 1 ? 's' : ''}.`)
    toast(`${imported} loop${imported !== 1 ? 's' : ''} imported from "${topic}"`)
    await fetchData()

    setTimeout(() => setActiveTab('loops'), 800)
  }

  // ── API preview ─────────────────────────────────────────────────────────────

  const refreshApiOutputs = useCallback(() => {
    const open = [...loops]
      .filter((l) => l.status === 'open')
      .sort((a, b) => b.priority - a.priority)

    const top = open[0] ?? null
    setApiCount(`${open.length} open loop${open.length !== 1 ? 's' : ''}`)

    if (top) {
      setApiPriorityHtml(
        syntaxHighlight(
          JSON.stringify(
            {
              id: top.id,
              project: top.project,
              category: top.category,
              priority: top.priority,
              action: top.action,
              morning_note: notes[notes.length - 1] ?? null,
              date: top.date,
              status: top.status,
            },
            null,
            2
          )
        )
      )
    } else {
      setApiPriorityHtml('// No open loops found.')
    }

    setApiAllHtml(
      syntaxHighlight(
        JSON.stringify(
          open.map((l) => ({
            id: l.id,
            project: l.project,
            category: l.category,
            priority: l.priority,
            action: l.action,
            status: l.status,
            date: l.date,
          })),
          null,
          2
        )
      )
    )
  }, [loops, notes])

  useEffect(() => {
    if (activeTab === 'api') refreshApiOutputs()
  }, [activeTab, refreshApiOutputs])

  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard.'))
  }

  // ── Filtered loops ──────────────────────────────────────────────────────────

  const filtered = loops
    .filter((l) => {
      if (currentFilter === 'open') return l.status === 'open'
      if (currentFilter === 'completed') return l.status === 'completed'
      return true
    })
    .filter((l) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        l.action.toLowerCase().includes(q) ||
        l.project.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1
      return b.priority - a.priority
    })

  const latestNote = notes.length > 0 ? notes[notes.length - 1] : null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* HEADER */}
      <div className="header">
        <div className="header-left">
          <div className="logo">Open Loops</div>
          <div className="version">v0.2.0 // Agent Platform</div>
        </div>
        <div className="header-stats">
          <div className="stat-item">OPEN <span>{openCount}</span></div>
          <div className="stat-item">COMPLETED <span>{doneCount}</span></div>
          <div className="stat-item">PROJECTS <span>{projectCount}</span></div>
          <div className="stat-item">LAST IMPORT <span>{lastImport}</span></div>
        </div>
      </div>

      {/* NAV */}
      <div className="nav">
        {(['loops', 'import', 'api'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`nav-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {'// ' + (tab === 'api' ? 'Agent API' : tab.charAt(0).toUpperCase() + tab.slice(1))}
          </button>
        ))}
      </div>

      <div className="main">

        {/* ── LOOPS PANEL ── */}
        {activeTab === 'loops' && (
          <div>
            {currentFilter === 'open' && latestNote && (
              <div className="morning-note-display">
                <div className="morning-note-label">Today</div>
                <div className="morning-note-text">{latestNote}</div>
              </div>
            )}

            <div className="loops-toolbar">
              {(['open', 'completed', 'all'] as Filter[]).map((f) => (
                <button
                  key={f}
                  className={`filter-btn${currentFilter === f ? ' active' : ''}`}
                  onClick={() => setCurrentFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <input
                className="search-input"
                type="text"
                placeholder="Search loops..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <div className="empty-state" style={{ color: 'var(--text-muted)' }}>
                LOADING...
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                NO LOOPS FOUND<br />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Import a conversation export to populate the platform.
                </span>
              </div>
            ) : (
              <table className="loops-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>PRI</th>
                    <th style={{ width: '90px' }}>CATEGORY</th>
                    <th style={{ width: '130px' }}>PROJECT</th>
                    <th>ACTION</th>
                    <th style={{ width: '90px' }}>DATE</th>
                    <th style={{ width: '100px' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <tr
                      key={l.id}
                      className={`loop-row${l.status === 'completed' ? ' completed' : ''}`}
                    >
                      <td>
                        <span className={`priority-badge p${l.priority}`}>{l.priority}</span>
                      </td>
                      <td>
                        <span className={`category-tag cat-${l.category}`}>{l.category}</span>
                      </td>
                      <td>
                        <div className="project-name">{l.project}</div>
                      </td>
                      <td>
                        <div className={`action-text${l.status === 'completed' ? ' completed-text' : ''}`}>
                          {l.action}
                        </div>
                        {l.context && (
                          <div className="context-text" style={{ marginTop: '4px' }}>
                            {l.context}
                          </div>
                        )}
                        <div className="loop-date" style={{ marginTop: '4px' }}>{l.date}</div>
                      </td>
                      <td>
                        <div className="loop-date">{l.importedAt?.slice(0, 10)}</div>
                      </td>
                      <td>
                        <div className="row-actions">
                          {l.status === 'open' ? (
                            <button className="icon-btn complete-btn" onClick={() => markDone(l.id)}>
                              ✓ Done
                            </button>
                          ) : (
                            <button className="icon-btn reopen-btn" onClick={() => reopen(l.id)}>
                              ↺ Open
                            </button>
                          )}
                          <button className="icon-btn delete-btn" onClick={() => deleteLoop(l.id)}>
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── IMPORT PANEL ── */}
        {activeTab === 'import' && (
          <div className="import-grid">
            <div>
              <div className="section-label">Paste Conversation Export</div>
              <div className="import-area">
                <div className="import-area-header">
                  <span>Markdown Input</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                    Accepts skill output format
                  </span>
                </div>
                <textarea
                  className="import-textarea"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`## 2026-05-18 - Conversation Topic\n\n### Open Loops\n\n| Priority | Project | Category | Action |\n|----------|---------|----------|--------|\n| 5 | Clear Skies | SHIP | Finish the pre-turbulence countdown |\n\n### Context Notes\nOptional context for the agent.\n\n### Suggested Morning Note\n> One sentence imperative action item.`}
                />
                <div className="import-actions">
                  <button className="btn btn-primary" onClick={parseAndImport}>Import</button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => { setImportText(''); setImportStatus('') }}
                  >
                    Clear
                  </button>
                  <span className="import-status">{importStatus}</span>
                </div>
              </div>
            </div>

            <div className="import-sidebar">
              <div className="info-block">
                <div className="info-block-title">Expected Format</div>
                <div className="format-example">
                  <div><span className="key">## DATE</span> - Topic</div>
                  <div><span className="key">### Open Loops</span></div>
                  <div>| Priority | Project | Category | Action |</div>
                  <div>| 5 | ProjectName | SHIP | Task |</div>
                  <div><span className="key">### Context Notes</span></div>
                  <div>Free text context.</div>
                  <div><span className="key">### Suggested Morning Note</span></div>
                  <div>&gt; One sentence note.</div>
                </div>
              </div>
              <div className="info-block">
                <div className="info-block-title">Categories</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  {['SHIP', 'BUILD', 'SPEC', 'DECIDE', 'RESEARCH'].map((cat) => (
                    <span key={cat} className={`category-tag cat-${cat}`}>{cat}</span>
                  ))}
                </div>
              </div>
              <div className="info-block">
                <div className="info-block-title">Storage</div>
                <p>Data is stored in Vercel KV — persistent and accessible from anywhere. No export needed.</p>
              </div>
            </div>
          </div>
        )}

        {/* ── API PANEL ── */}
        {activeTab === 'api' && (
          <div>
            <div className="section-label">Agent Data Endpoints</div>
            <div className="api-grid">

              {/* Priority loop */}
              <div className="api-block">
                <div className="api-block-header">
                  <span>Today&apos;s Priority Loop</span>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '4px 10px', fontSize: '10px' }}
                    onClick={refreshApiOutputs}
                  >
                    Refresh
                  </button>
                </div>
                <div
                  className="api-output"
                  dangerouslySetInnerHTML={{ __html: apiPriorityHtml || '// Loading...' }}
                />
                <div className="api-endpoint">
                  <span className="method-get">GET</span>
                  <span className="url-chip">/api/priority</span>
                  <button
                    className="copy-btn"
                    onClick={() => copyText(JSON.stringify(
                      loops.filter(l => l.status === 'open').sort((a,b) => b.priority - a.priority)[0] ?? {},
                      null, 2
                    ))}
                  >
                    Copy JSON
                  </button>
                </div>
              </div>

              {/* All open loops */}
              <div className="api-block">
                <div className="api-block-header">
                  <span>All Open Loops</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{apiCount}</span>
                </div>
                <div
                  className="api-output"
                  style={{ maxHeight: '300px', overflowY: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: apiAllHtml || '// Loading...' }}
                />
                <div className="api-endpoint">
                  <span className="method-get">GET</span>
                  <span className="url-chip">/api/export</span>
                  <button
                    className="copy-btn"
                    onClick={() => {
                      const open = loops.filter(l => l.status === 'open').sort((a,b) => b.priority - a.priority)
                      copyText(JSON.stringify({ exported_at: new Date().toISOString(), open_count: open.length, morning_note: notes[notes.length-1] ?? null, loops: open }, null, 2))
                    }}
                  >
                    Copy JSON
                  </button>
                </div>
              </div>

              {/* Live endpoint info */}
              <div className="api-block">
                <div className="api-block-header">
                  <span>Live HTTP Endpoints</span>
                </div>
                <div
                  className="api-output"
                  style={{
                    minHeight: '80px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    fontSize: '11px',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '10px', letterSpacing: '0.1em' }}>
                      OPEN LOOPS (agent reads this)
                    </div>
                    <div style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/export
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', marginBottom: '4px', fontSize: '10px', letterSpacing: '0.1em' }}>
                      PRIORITY LOOP
                    </div>
                    <div style={{ color: 'var(--accent)', wordBreak: 'break-all' }}>
                      {typeof window !== 'undefined' ? window.location.origin : ''}/api/priority
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => {
                      const url = typeof window !== 'undefined'
                        ? `${window.location.origin}/api/export`
                        : '/api/export'
                      copyText(url)
                    }}
                  >
                    Copy Export URL
                  </button>
                </div>
              </div>

              {/* Agent instructions */}
              <div className="api-block">
                <div className="api-block-header">
                  <span>Agent Instructions</span>
                </div>
                <div className="api-output" style={{ fontSize: '11px', color: 'var(--text-dim)', minHeight: '80px' }}>
{`Fetch GET /api/export from the Vercel URL.
Filter where status == "open".
Loops arrive pre-sorted by priority.
Select loops[0] — that's today's item.
Surface as the sticky note.

Note format:
"[action] — [why it matters now]"

One sentence. Imperative. No fluff.`}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>

      {/* TOAST */}
      <div className={`toast${toastVisible ? ' show' : ''}`}>{toastMsg}</div>
    </>
  )
}
