"""
agent.py  -  The Note  (v2)
Morning sticky note from your open loops.

Features:
  • Warm, maternal greeting with text emoji — changes daily
  • Day-of-week color themes (7 palettes)
  • Draggable window (click + drag anywhere on the header)
  • Resizable via bottom-right corner grip
  • Expandable step-by-step breakdown of the action item
  • Category-aware "how to start" hints
  • × close button only — no accidental dismiss
  • Segoe UI for warmth, Consolas for task text

Configure the two lines below, then run:
    python agent.py

Schedule with Windows Task Scheduler for automatic morning delivery.
"""

import json
import os
import random
import tkinter as tk
from datetime import datetime
from urllib.error import URLError
from urllib.request import urlopen

# ── Configuration ──────────────────────────────────────────────────────────────
VERCEL_URL = "https://open-loop-xi.vercel.app"          # your deployed app
OPEN_LOOPS_PATH = os.path.expanduser("~/Documents/open_loops.json")  # local fallback
HTTP_TIMEOUT = 8
# ───────────────────────────────────────────────────────────────────────────────


# ── Color themes — one per weekday (Mon=0 … Sun=6) ────────────────────────────
DAY_THEMES = {
    0: {"bg": "#fff8e7", "header": "#fce4a0", "accent": "#d4820a", "text": "#3a2a00", "label": "Monday"},   # warm amber
    1: {"bg": "#eaf4f4", "header": "#b2dada", "accent": "#2a7d7d", "text": "#0d2e2e", "label": "Tuesday"},  # sage teal
    2: {"bg": "#fff0f5", "header": "#f7c5d8", "accent": "#c2185b", "text": "#3a0020", "label": "Wednesday"},# rose pink
    3: {"bg": "#f0f4ff", "header": "#b8caff", "accent": "#3949ab", "text": "#0d1440", "label": "Thursday"}, # periwinkle
    4: {"bg": "#f0fff4", "header": "#a8e6c0", "accent": "#2e7d52", "text": "#0a2a18", "label": "Friday"},   # mint green
    5: {"bg": "#fdf4ff", "header": "#d4b8f7", "accent": "#7b1fa2", "text": "#280040", "label": "Saturday"}, # lavender
    6: {"bg": "#fff4ee", "header": "#f7c8a8", "accent": "#bf4d00", "text": "#3a1400", "label": "Sunday"},   # peach coral
}

# ── Morning greetings — rotated randomly ──────────────────────────────────────
GREETINGS = [
    "Good morning. You've got this. :)",
    "Hey you, rise and shine. Today's yours. :)",
    "Morning! One thing at a time, okay? :)",
    "You showed up. That already counts. :)",
    "Good morning. Small steps, big things. :)",
    "Hey sunshine. Let's make today count. :)",
    "Morning. Be gentle with yourself today. :)",
    "You're doing better than you think. :)",
    "Good morning. One focused hour can change everything. :)",
    "Hi there. Start soft, finish strong. :)",
]

# ── Category hints — "how to start" ──────────────────────────────────────────
CATEGORY_HINTS = {
    "SHIP":     "→ Open the file. Write one line. Ship it.",
    "BUILD":    "→ Pick the smallest working piece and build that first.",
    "SPEC":     "→ Write one sentence of the spec. That's step one.",
    "DECIDE":   "→ List your two options. Pick the less scary one.",
    "RESEARCH": "→ Set a timer for 20 min. Read, take one note, stop.",
}
DEFAULT_HINT = "→ Take one concrete action in the next five minutes."


# ── Data loading ───────────────────────────────────────────────────────────────

def fetch_loops_http(base_url: str) -> list | None:
    url = base_url.rstrip("/") + "/api/export"
    try:
        with urlopen(url, timeout=HTTP_TIMEOUT) as response:
            data = json.loads(response.read().decode("utf-8"))
            loops = data.get("loops", [])
            return sorted(loops, key=lambda x: x.get("priority", 0), reverse=True)
    except (URLError, json.JSONDecodeError, Exception):
        return None


def load_loops_local(path: str) -> list:
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        loops = data if isinstance(data, list) else data.get("loops", [])
        open_loops = [l for l in loops if l.get("status", "open") == "open"]
        return sorted(open_loops, key=lambda x: x.get("priority", 0), reverse=True)
    except (FileNotFoundError, json.JSONDecodeError, Exception):
        return []


def load_loops() -> list:
    if VERCEL_URL:
        loops = fetch_loops_http(VERCEL_URL)
        if loops is not None:
            return loops
    return load_loops_local(OPEN_LOOPS_PATH)


def score_loop(loop: dict) -> float:
    base = float(loop.get("priority", 1))
    category_bonus = {"SHIP": 2.0, "DECIDE": 1.5, "SPEC": 1.0, "BUILD": 0.5, "RESEARCH": 0.0}
    cat = loop.get("category", "").upper()
    bonus = category_bonus.get(cat, 0.0)
    try:
        imported = datetime.fromisoformat(loop.get("importedAt", datetime.now().isoformat()))
        age_days = (datetime.now() - imported).days
        age_bonus = min(age_days * 0.5, 3.0)
    except Exception:
        age_bonus = 0.0
    return base + bonus + age_bonus


def pick_top_loop(loops: list) -> dict | None:
    if not loops:
        return None
    return max(loops, key=score_loop)


# ── Sticky note window ─────────────────────────────────────────────────────────

def split_action_into_steps(action: str) -> list[str]:
    """
    Try to extract steps from the action text.
    Splits on common delimiters: numbered lists, semicolons, commas (if > 2 parts).
    Falls back to a single step.
    """
    import re
    # Numbered: "1. do x 2. do y"
    numbered = re.split(r'\d+[\.\)]\s+', action.strip())
    numbered = [s.strip() for s in numbered if s.strip()]
    if len(numbered) >= 2:
        return numbered

    # Semicolons
    semi = [s.strip() for s in action.split(';') if s.strip()]
    if len(semi) >= 2:
        return semi

    # Commas with multiple meaningful chunks
    comma = [s.strip() for s in action.split(',') if s.strip()]
    if len(comma) >= 3:
        return comma

    # Single step — wrap it
    return [action.strip()]


def show_note(loop: dict, theme: dict) -> None:
    greeting = random.choice(GREETINGS)
    category = loop.get("category", "").upper()
    hint = CATEGORY_HINTS.get(category, DEFAULT_HINT)
    action = loop.get("action", "No action defined.")
    context = loop.get("context", "").strip()
    topic = loop.get("topic", "")
    project = loop.get("project", "")
    priority = loop.get("priority", 1)
    steps = split_action_into_steps(action)

    # ── Root window ──────────────────────────────────────────────────────────
    root = tk.Tk()
    root.overrideredirect(True)          # no OS chrome
    root.attributes("-topmost", True)
    root.attributes("-alpha", 0.97)
    root.configure(bg=theme["bg"])
    root.resizable(True, True)

    # Position: random spot avoiding edges
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    win_w, win_h = 420, 320
    x = random.randint(80, max(81, sw - win_w - 80))
    y = random.randint(80, max(81, sh - win_h - 200))
    root.geometry(f"{win_w}x{win_h}+{x}+{y}")
    root.minsize(320, 240)

    # ── Drag state ───────────────────────────────────────────────────────────
    _drag = {"x": 0, "y": 0}

    def on_drag_start(event):
        _drag["x"] = event.x_root - root.winfo_x()
        _drag["y"] = event.y_root - root.winfo_y()

    def on_drag_motion(event):
        root.geometry(f"+{event.x_root - _drag['x']}+{event.y_root - _drag['y']}")

    # ── Resize state (bottom-right grip) ─────────────────────────────────────
    _resize = {"x": 0, "y": 0, "w": 0, "h": 0}

    def on_resize_start(event):
        _resize["x"] = event.x_root
        _resize["y"] = event.y_root
        _resize["w"] = root.winfo_width()
        _resize["h"] = root.winfo_height()

    def on_resize_motion(event):
        new_w = max(320, _resize["w"] + (event.x_root - _resize["x"]))
        new_h = max(240, _resize["h"] + (event.y_root - _resize["y"]))
        root.geometry(f"{new_w}x{new_h}")

    # ── Header (draggable) ───────────────────────────────────────────────────
    header = tk.Frame(root, bg=theme["header"], cursor="fleur")
    header.pack(fill="x")

    header_inner = tk.Frame(header, bg=theme["header"])
    header_inner.pack(fill="x", padx=10, pady=(8, 6))

    day_label = tk.Label(
        header_inner,
        text=f"The Note  ·  {theme['label']}",
        bg=theme["header"],
        fg=theme["accent"],
        font=("Segoe UI", 9, "bold"),
        anchor="w",
    )
    day_label.pack(side="left")

    close_btn = tk.Label(
        header_inner,
        text="  ×  ",
        bg=theme["header"],
        fg=theme["accent"],
        font=("Segoe UI", 13, "bold"),
        cursor="hand2",
    )
    close_btn.pack(side="right")
    close_btn.bind("<Button-1>", lambda e: root.destroy())

    # Drag bindings — header only
    for widget in (header, header_inner, day_label):
        widget.bind("<ButtonPress-1>", on_drag_start)
        widget.bind("<B1-Motion>", on_drag_motion)

    # ── Body ─────────────────────────────────────────────────────────────────
    body = tk.Frame(root, bg=theme["bg"])
    body.pack(fill="both", expand=True, padx=14, pady=(10, 6))

    # Greeting
    greet_lbl = tk.Label(
        body,
        text=greeting,
        bg=theme["bg"],
        fg=theme["accent"],
        font=("Segoe UI", 11, "italic"),
        wraplength=380,
        justify="left",
        anchor="w",
    )
    greet_lbl.pack(fill="x", pady=(0, 8))

    # Divider
    div = tk.Frame(body, bg=theme["header"], height=1)
    div.pack(fill="x", pady=(0, 8))

    # Meta row: project · category · priority
    meta_parts = []
    if project:
        meta_parts.append(project)
    if category:
        meta_parts.append(category)
    meta_parts.append(f"P{priority}")
    meta_text = "  ·  ".join(meta_parts)

    meta_lbl = tk.Label(
        body,
        text=meta_text,
        bg=theme["bg"],
        fg=theme["text"],
        font=("Consolas", 8),
        anchor="w",
        opacity=0,   # ignored — just styling
    )
    meta_lbl.configure(fg="#888888")
    meta_lbl.pack(fill="x", pady=(0, 4))

    # Topic / title
    if topic:
        topic_lbl = tk.Label(
            body,
            text=topic,
            bg=theme["bg"],
            fg=theme["text"],
            font=("Segoe UI", 10, "bold"),
            wraplength=380,
            justify="left",
            anchor="w",
        )
        topic_lbl.pack(fill="x", pady=(0, 4))

    # Action text
    action_lbl = tk.Label(
        body,
        text=action,
        bg=theme["bg"],
        fg=theme["text"],
        font=("Consolas", 10),
        wraplength=380,
        justify="left",
        anchor="w",
    )
    action_lbl.pack(fill="x", pady=(0, 6))

    # ── Expandable steps section ──────────────────────────────────────────────
    steps_visible = tk.BooleanVar(value=False)
    steps_frame = tk.Frame(body, bg=theme["bg"])

    def build_steps_frame():
        for w in steps_frame.winfo_children():
            w.destroy()

        hint_lbl = tk.Label(
            steps_frame,
            text=hint,
            bg=theme["bg"],
            fg=theme["accent"],
            font=("Segoe UI", 9, "italic"),
            wraplength=370,
            justify="left",
            anchor="w",
        )
        hint_lbl.pack(fill="x", pady=(0, 4))

        for i, step in enumerate(steps, 1):
            step_lbl = tk.Label(
                steps_frame,
                text=f"  {i}.  {step}",
                bg=theme["bg"],
                fg=theme["text"],
                font=("Consolas", 9),
                wraplength=360,
                justify="left",
                anchor="w",
            )
            step_lbl.pack(fill="x", pady=1)

        if context:
            ctx_div = tk.Frame(steps_frame, bg=theme["header"], height=1)
            ctx_div.pack(fill="x", pady=(6, 4))
            ctx_lbl = tk.Label(
                steps_frame,
                text=context,
                bg=theme["bg"],
                fg="#888888",
                font=("Segoe UI", 8, "italic"),
                wraplength=370,
                justify="left",
                anchor="w",
            )
            ctx_lbl.pack(fill="x")

    def toggle_steps():
        if steps_visible.get():
            steps_frame.pack_forget()
            steps_visible.set(False)
            toggle_btn.config(text="▸ how to start")
        else:
            build_steps_frame()
            steps_frame.pack(fill="x", pady=(4, 0))
            steps_visible.set(True)
            toggle_btn.config(text="▾ how to start")

    # Only show toggle if there's something to expand
    show_toggle = len(steps) >= 2 or context or True  # always show — context/hint always useful
    if show_toggle:
        toggle_btn = tk.Label(
            body,
            text="▸ how to start",
            bg=theme["bg"],
            fg=theme["accent"],
            font=("Segoe UI", 9, "underline"),
            cursor="hand2",
            anchor="w",
        )
        toggle_btn.pack(fill="x", pady=(0, 2))
        toggle_btn.bind("<Button-1>", lambda e: toggle_steps())

    # ── Resize grip (bottom-right corner) ────────────────────────────────────
    grip = tk.Label(root, text="⊿", bg=theme["bg"], fg=theme["header"],
                    font=("Segoe UI", 9), cursor="size_nw_se")
    grip.place(relx=1.0, rely=1.0, anchor="se", x=-2, y=-2)
    grip.bind("<ButtonPress-1>", on_resize_start)
    grip.bind("<B1-Motion>", on_resize_motion)

    # ── Fade in ───────────────────────────────────────────────────────────────
    root.attributes("-alpha", 0.0)

    def fade_in(alpha=0.0):
        alpha = min(alpha + 0.07, 0.97)
        root.attributes("-alpha", alpha)
        if alpha < 0.97:
            root.after(16, fade_in, alpha)

    root.after(50, fade_in)
    root.mainloop()


def show_fallback_note(theme: dict) -> None:
    greeting = random.choice(GREETINGS)
    root = tk.Tk()
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    root.attributes("-alpha", 0.95)
    root.configure(bg=theme["bg"])

    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    win_w, win_h = 380, 180
    x = random.randint(80, max(81, sw - win_w - 80))
    y = random.randint(80, max(81, sh - win_h - 200))
    root.geometry(f"{win_w}x{win_h}+{x}+{y}")

    _drag = {"x": 0, "y": 0}

    def on_drag_start(event):
        _drag["x"] = event.x_root - root.winfo_x()
        _drag["y"] = event.y_root - root.winfo_y()

    def on_drag_motion(event):
        root.geometry(f"+{event.x_root - _drag['x']}+{event.y_root - _drag['y']}")

    header = tk.Frame(root, bg=theme["header"], cursor="fleur")
    header.pack(fill="x")
    header_inner = tk.Frame(header, bg=theme["header"])
    header_inner.pack(fill="x", padx=10, pady=(8, 6))

    tk.Label(header_inner, text=f"The Note  ·  {theme['label']}",
             bg=theme["header"], fg=theme["accent"],
             font=("Segoe UI", 9, "bold"), anchor="w").pack(side="left")
    close_btn = tk.Label(header_inner, text="  ×  ",
                         bg=theme["header"], fg=theme["accent"],
                         font=("Segoe UI", 13, "bold"), cursor="hand2")
    close_btn.pack(side="right")
    close_btn.bind("<Button-1>", lambda e: root.destroy())

    header.bind("<ButtonPress-1>", on_drag_start)
    header.bind("<B1-Motion>", on_drag_motion)
    header_inner.bind("<ButtonPress-1>", on_drag_start)
    header_inner.bind("<B1-Motion>", on_drag_motion)

    body = tk.Frame(root, bg=theme["bg"])
    body.pack(fill="both", expand=True, padx=14, pady=10)

    tk.Label(body, text=greeting, bg=theme["bg"], fg=theme["accent"],
             font=("Segoe UI", 11, "italic"), wraplength=340,
             justify="left", anchor="w").pack(fill="x", pady=(0, 8))

    tk.Label(body, text="No open loops found today. :)",
             bg=theme["bg"], fg=theme["text"],
             font=("Segoe UI", 10), anchor="w").pack(fill="x")

    tk.Label(body, text="Enjoy a lighter morning. You earned it.",
             bg=theme["bg"], fg="#888888",
             font=("Segoe UI", 9, "italic"), anchor="w").pack(fill="x")

    root.attributes("-alpha", 0.0)

    def fade_in(alpha=0.0):
        alpha = min(alpha + 0.07, 0.95)
        root.attributes("-alpha", alpha)
        if alpha < 0.95:
            root.after(16, fade_in, alpha)

    root.after(50, fade_in)
    root.mainloop()


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    today = datetime.now().weekday()   # Monday=0, Sunday=6
    theme = DAY_THEMES[today]

    loops = load_loops()
    top = pick_top_loop(loops)

    if top:
        show_note(top, theme)
    else:
        show_fallback_note(theme)


if __name__ == "__main__":
    main()