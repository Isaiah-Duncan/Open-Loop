"""
The Note - Morning Agent
========================
Reads open loop data, picks the highest priority open loop,
and displays it as a sticky note at a random screen position.
Click the note to dismiss it.

Data source (tried in order):
  1. VERCEL_URL/api/export  — fetched over HTTP (no local file needed)
  2. OPEN_LOOPS_PATH        — local JSON file (fallback / offline mode)

Setup:
  1. Set VERCEL_URL to your deployed app (e.g. https://open-loops.vercel.app)
     OR set OPEN_LOOPS_PATH to a local open_loops.json export
  2. Schedule with Windows Task Scheduler (see README)
"""

import json
import os
import random
import sys
import tkinter as tk
from tkinter import font as tkfont
from pathlib import Path
from datetime import datetime
from urllib.request import urlopen
from urllib.error import URLError

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

# Set this to your Vercel deployment URL (no trailing slash).
# Example: "https://open-loops.vercel.app"
# Leave as empty string to skip HTTP fetch and use local file only.
VERCEL_URL = ""

# Local file fallback — used when VERCEL_URL is empty or unreachable.
OPEN_LOOPS_PATH = os.path.expanduser("~/Documents/open_loops.json")

# HTTP request timeout in seconds
HTTP_TIMEOUT = 8

# ─────────────────────────────────────────────────────────────────────────────

# Sticky note dimensions
NOTE_WIDTH  = 340
NOTE_HEIGHT = 160

# Padding from screen edges
EDGE_PADDING = 60

# Colors
BG_COLOR     = "#F5E642"
BG_SHADOW    = "#E8D93A"
TEXT_COLOR   = "#1a1a1a"
META_COLOR   = "#5a5000"
DISMISS_COLOR = "#8a7a00"

# ─────────────────────────────────────────────────────────────────────────────


def fetch_loops_http(base_url: str) -> list | None:
    """
    Try to fetch open loops from the Vercel API endpoint.
    Returns a list of loop dicts on success, None on any failure.
    """
    url = base_url.rstrip("/") + "/api/export"
    try:
        with urlopen(url, timeout=HTTP_TIMEOUT) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw)
            loops = data.get("loops", [])
            # /api/export already filters to open loops only
            return sorted(loops, key=lambda x: x.get("priority", 0), reverse=True)
    except (URLError, json.JSONDecodeError, KeyError, Exception):
        return None


def load_loops_local(path: str) -> list:
    """
    Load loops from a local open_loops.json file.
    Returns a (possibly empty) list of loop dicts.
    """
    p = Path(path)
    if not p.exists():
        return []
    try:
        with open(p, "r", encoding="utf-8") as f:
            data = json.load(f)
        loops = data.get("loops", [])
        open_loops = [l for l in loops if l.get("status") == "open"]
        return sorted(open_loops, key=lambda x: x.get("priority", 0), reverse=True)
    except (json.JSONDecodeError, KeyError):
        return []


def load_loops() -> list:
    """
    Load loops using the configured data source(s).
    Tries HTTP first (if VERCEL_URL is set), falls back to local file.
    """
    if VERCEL_URL:
        loops = fetch_loops_http(VERCEL_URL)
        if loops is not None:
            return loops
        # HTTP failed — fall through to local file
        print(f"[agent] HTTP fetch failed, trying local file: {OPEN_LOOPS_PATH}", file=sys.stderr)

    return load_loops_local(OPEN_LOOPS_PATH)


def pick_loop(loops: list) -> dict | None:
    """
    Priority function: select today's action item.

    Scoring weights:
      - Priority field (1-5): primary signal
      - Category bonus: SHIP > DECIDE > SPEC > BUILD > RESEARCH
        (things closest to done surface first)
      - Age bonus: loops older than 3 days get +0.5 per day (capped at +3)
        (prevents things rotting indefinitely)
    """
    if not loops:
        return None

    category_bonus = {
        "SHIP":     2.0,
        "DECIDE":   1.5,
        "SPEC":     1.0,
        "BUILD":    0.5,
        "RESEARCH": 0.0,
    }

    today = datetime.now()
    scored = []

    for loop in loops:
        score = float(loop.get("priority", 3))

        cat = loop.get("category", "").upper()
        score += category_bonus.get(cat, 0)

        date_str = loop.get("importedAt") or loop.get("date", "")
        if date_str:
            try:
                imported = datetime.fromisoformat(date_str[:10])
                age_days = (today - imported).days
                score += min(age_days * 0.5, 3.0)
            except ValueError:
                pass

        scored.append((score, loop))

    scored.sort(key=lambda x: x[0], reverse=True)
    return scored[0][1]


def get_random_position(screen_w: int, screen_h: int) -> tuple[int, int]:
    """Return a random (x, y) that keeps the note fully on screen."""
    max_x = screen_w - NOTE_WIDTH  - EDGE_PADDING
    max_y = screen_h - NOTE_HEIGHT - EDGE_PADDING
    x = random.randint(EDGE_PADDING, max(EDGE_PADDING, max_x))
    y = random.randint(EDGE_PADDING, max(EDGE_PADDING, max_y))
    return x, y


def show_note(loop: dict):
    """Render the sticky note window."""
    root = tk.Tk()
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    root.attributes("-alpha", 0.96)

    screen_w = root.winfo_screenwidth()
    screen_h = root.winfo_screenheight()
    x, y = get_random_position(screen_w, screen_h)

    root.geometry(f"{NOTE_WIDTH}x{NOTE_HEIGHT}+{x}+{y}")
    root.configure(bg=BG_COLOR)

    try:
        header_font  = tkfont.Font(family="Consolas", size=9,  weight="normal")
        body_font    = tkfont.Font(family="Consolas", size=11, weight="bold")
        meta_font    = tkfont.Font(family="Consolas", size=8)
        dismiss_font = tkfont.Font(family="Consolas", size=8)
    except Exception:
        header_font  = tkfont.Font(size=9)
        body_font    = tkfont.Font(size=11, weight="bold")
        meta_font    = tkfont.Font(size=8)
        dismiss_font = tkfont.Font(size=8)

    top_bar = tk.Frame(root, bg=BG_SHADOW, height=6)
    top_bar.pack(fill="x", side="top")

    frame = tk.Frame(root, bg=BG_COLOR, padx=16, pady=10)
    frame.pack(fill="both", expand=True)

    project  = loop.get("project",  "")
    category = loop.get("category", "")
    priority = loop.get("priority", "")
    header_text = f"{project}  ·  {category}  ·  P{priority}"

    header_label = tk.Label(frame, text=header_text, font=header_font,
                            bg=BG_COLOR, fg=META_COLOR, anchor="w")
    header_label.pack(fill="x", pady=(0, 6))

    action = loop.get("action", "No action found.")
    action_label = tk.Label(frame, text=action, font=body_font, bg=BG_COLOR,
                            fg=TEXT_COLOR, anchor="w", justify="left",
                            wraplength=NOTE_WIDTH - 40)
    action_label.pack(fill="x")

    dismiss_label = tk.Label(frame, text="click anywhere to dismiss",
                             font=dismiss_font, bg=BG_COLOR, fg=DISMISS_COLOR, anchor="e")
    dismiss_label.pack(fill="x", side="bottom", pady=(6, 0))

    def dismiss(event=None):
        root.destroy()

    for widget in [root, frame, top_bar, header_label, action_label, dismiss_label]:
        widget.bind("<Button-1>", dismiss)

    root.attributes("-alpha", 0.0)

    def fade_in(alpha: float = 0.0):
        alpha = min(alpha + 0.06, 0.96)
        root.attributes("-alpha", alpha)
        if alpha < 0.96:
            root.after(16, fade_in, alpha)

    root.after(50, fade_in)
    root.mainloop()


def main():
    loops = load_loops()

    if not loops:
        # Silent fail — don't interrupt the morning
        sys.exit(0)

    loop = pick_loop(loops)
    if loop:
        show_note(loop)


if __name__ == "__main__":
    main()
