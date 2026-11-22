import { useState, useEffect, useRef } from "react";
import * as db from "../storage";
import { PROJECT_COLORS, projectColor, projectInitials } from "./projectColors";

// Left sidebar (design: docs/proposals/sidebar-redesign). Three parts:
//   1. Views across all projects (Today, Focus with the running timer)
//   2. The selected project as a switcher, with that project's own views underneath
//   3. One account menu (show/hide views, Assistant access, tutorial, sign out)
// Collapsed, the same three parts fold into an icon rail.

const C = { side: "#161615", raise: "#1A1A18", pop: "#1E1E1C", menu: "#242422", line: "#2C2C2A", dim: "#444441", muted: "#5F5E5A", sub: "#888780", soft: "#B4B2A9", text: "#F1EFE8", red: "#E24B4A", amber: "#FAC775", green: "#5DCAA5", danger: "#F09595" };
const GLOBAL = ["today", "focus"];
const RECENT_KEY = "qtrack_recent_projects";
const FMT = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeRecent = (ids) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, 5))); } catch { /* storage blocked */ } };

const rowBase = { display: "flex", alignItems: "center", gap: 9, width: "100%", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontSize: 13, borderRadius: 6 };
const Dot = ({ color, size = 9 }) => <span style={{ width: size, height: size, borderRadius: 3, background: color, flexShrink: 0, display: "inline-block" }} />;
const Kicker = ({ children }) => <div style={{ fontSize: 9.5, color: C.muted, letterSpacing: 1, textTransform: "uppercase", padding: "6px 8px 4px" }}>{children}</div>;
const Sep = () => <div style={{ height: 1, background: C.line, margin: "6px 2px" }} />;

// Transparent full-screen layer under a popover: a click anywhere else closes it
const Backdrop = ({ onClose, z = 90 }) => <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: z }} />;

function TimerBadge({ tmr }) {
  if (tmr.st === "idle") return null;
  const paused = tmr.st === "paused";
  const color = paused ? C.amber : tmr.type === "work" ? C.red : C.green;
  return <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 11, color, display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />{paused ? "II " : ""}{FMT(tmr.left)}</span>;
}

// ---------- project list (used in the switcher popover and in the phone "More" sheet) ----------

export function ProjectList({ projects, activeProjectId, onSelect, onRename, onRecolor, onArchive, onDelete, onNewProject, autoFocus = true, big = false }) {
  const [q, setQ] = useState("");
  const [counts, setCounts] = useState({});
  const [menuFor, setMenuFor] = useState(null);
  const [colorFor, setColorFor] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameText, setRenameText] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [hover, setHover] = useState(null);
  const [recent] = useState(readRecent);

  useEffect(() => { db.getOpenTaskCounts().then(setCounts).catch(() => {}); }, []);

  const live = projects.filter(p => !p.archived_at);
  const archived = projects.filter(p => p.archived_at);
  const needle = q.trim().toLowerCase();
  const recentList = [activeProjectId, ...recent].filter((id, i, a) => id && a.indexOf(id) === i).map(id => live.find(p => p.id === id)).filter(Boolean).slice(0, 3);
  const rest = live.filter(p => !recentList.includes(p));
  const found = needle ? projects.filter(p => p.name.toLowerCase().includes(needle)) : null;
  const fs = big ? 14 : 12.5;

  const startRename = (p) => { setRenaming(p.id); setRenameText(p.name); setMenuFor(null); };
  const finishRename = (p) => { const t = renameText.trim(); setRenaming(null); if (t && t !== p.name) onRename(p.id, t); };

  const row = (p) => {
    const cur = p.id === activeProjectId, isArch = !!p.archived_at, open = menuFor === p.id;
    if (renaming === p.id) return (
      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px" }}>
        <Dot color={projectColor(p)} />
        <input autoFocus value={renameText} onChange={e => setRenameText(e.target.value)} onBlur={() => finishRename(p)}
          onKeyDown={e => { if (e.key === "Enter") finishRename(p); if (e.key === "Escape") setRenaming(null); }}
          style={{ flex: 1, minWidth: 0, padding: "4px 6px", borderRadius: 5, fontSize: fs, background: "#111110", color: C.text, border: `1px solid ${C.dim}`, outline: "none" }} />
      </div>
    );
    return (
      <div key={p.id} style={{ position: "relative" }} onMouseEnter={() => setHover(p.id)} onMouseLeave={() => setHover(h => (h === p.id ? null : h))}>
        <div style={{ ...rowBase, padding: big ? "10px 8px" : "6px 8px", background: cur ? C.line : hover === p.id || open ? "#262624" : "transparent", color: isArch ? C.muted : cur ? C.text : C.soft, fontStyle: isArch ? "italic" : "normal", cursor: "default" }}>
          <button onClick={() => onSelect(p.id)} onDoubleClick={() => startRename(p)} title={isArch ? "Open (stays archived)" : undefined}
            style={{ ...rowBase, flex: 1, minWidth: 0, padding: 0, color: "inherit", fontStyle: "inherit", fontSize: fs }}>
            <Dot color={projectColor(p)} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          </button>
          {hover === p.id || open || big
            ? <button aria-label={`Options for ${p.name}`} onClick={() => { setMenuFor(open ? null : p.id); setColorFor(null); }} style={{ border: "none", background: open ? C.dim : "transparent", color: open ? C.text : C.sub, cursor: "pointer", fontSize: 13, padding: "0 5px", borderRadius: 4, lineHeight: "18px" }}>⋯</button>
            : <span style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{cur ? "✓" : counts[p.id] ? `${counts[p.id]} open` : ""}</span>}
        </div>
        {open && (
          <div style={{ margin: "2px 0 6px 18px", background: C.menu, border: `1px solid ${C.dim}`, borderRadius: 9, padding: 5, fontStyle: "normal" }}>
            <MenuItem icon="✎" onClick={() => startRename(p)}>Rename</MenuItem>
            <MenuItem icon="●" onClick={() => setColorFor(colorFor === p.id ? null : p.id)}>Change color</MenuItem>
            {colorFor === p.id && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 8px 8px" }}>
                {PROJECT_COLORS.map(c => <button key={c} aria-label={`Color ${c}`} onClick={() => { onRecolor(p.id, c); setColorFor(null); setMenuFor(null); }} style={{ width: 18, height: 18, borderRadius: 5, background: c, border: projectColor(p) === c ? `2px solid ${C.text}` : "2px solid transparent", cursor: "pointer", padding: 0 }} />)}
              </div>
            )}
            {isArch
              ? <MenuItem icon="↺" onClick={() => { setMenuFor(null); onArchive(p.id, false); }}>Restore</MenuItem>
              : <MenuItem icon="⊟" onClick={() => { setMenuFor(null); onArchive(p.id, true); }}>Archive</MenuItem>}
            <Sep />
            <MenuItem icon="✕" danger onClick={() => { setMenuFor(null); onDelete(p); }}>Delete…</MenuItem>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#111110", border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 9px", marginBottom: 4 }}>
        <span style={{ color: C.muted, fontSize: 12 }}>⌕</span>
        <input autoFocus={autoFocus} value={q} onChange={e => setQ(e.target.value)} placeholder="Find a project…"
          onKeyDown={e => { if (e.key === "Enter" && found?.length) onSelect(found[0].id); }}
          style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: big ? 14 : 12 }} />
        {!big && <kbd style={{ fontFamily: "'SF Mono', monospace", fontSize: 9.5, color: C.muted, border: `1px solid ${C.line}`, borderRadius: 4, padding: "0 4px" }}>Ctrl K</kbd>}
      </div>
      {found ? (<>
        {found.length === 0 && <div style={{ fontSize: 12, color: C.muted, padding: "8px" }}>No project matches "{q}".</div>}
        {found.map(row)}
      </>) : (<>
        {recentList.length > 0 && <><Kicker>Recent</Kicker>{recentList.map(row)}</>}
        {rest.length > 0 && <><Kicker>All projects</Kicker>{rest.map(row)}</>}
        {archived.length > 0 && <>
          <Sep />
          <button onClick={() => setShowArchived(!showArchived)} style={{ ...rowBase, padding: "6px 8px", color: C.muted, fontStyle: "italic", fontSize: 12 }}><span style={{ width: 9, fontStyle: "normal", fontSize: 9 }}>{showArchived ? "▾" : "▸"}</span>Archived ({archived.length})</button>
          {showArchived && archived.map(row)}
        </>}
      </>)}
      <Sep />
      <button onClick={onNewProject} style={{ ...rowBase, padding: big ? "10px 8px" : "6px 8px", color: C.sub, fontSize: 12 }}>＋ New project</button>
    </div>
  );
}

function MenuItem({ icon, children, onClick, danger }) {
  return (
    <button onClick={onClick} style={{ ...rowBase, gap: 8, padding: "6px 8px", fontSize: 12, color: danger ? C.danger : C.sub }}
      onMouseEnter={e => { e.currentTarget.style.background = "#2E2E2B"; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      <span style={{ width: 14, textAlign: "center", opacity: 0.8 }}>{icon}</span><span>{children}</span>
    </button>
  );
}

// ---------- delete confirmation ----------

export function DeleteProjectDialog({ project, canDelete, onCancel, onArchive, onConfirm }) {
  const [counts, setCounts] = useState(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { db.getProjectCounts(project.id).then(setCounts).catch(() => setCounts({})); }, [project.id]);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const lost = counts && [counts.tasks && plural(counts.tasks, "task"), counts.tests && plural(counts.tests, "test case"), counts.notes && plural(counts.notes, "note"), counts.meetings && plural(counts.meetings, "meeting"), counts.sessions && plural(counts.sessions, "focus session")].filter(Boolean);
  const ok = typed.trim() === project.name && canDelete && !busy;
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={`Delete ${project.name}`} style={{ width: 380, maxWidth: "100%", background: C.raise, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: C.text }}>Delete "{project.name}"?</div>
        <div style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.55, marginBottom: 12 }}>
          {!canDelete ? "This is your only active project, so it can't be deleted. Create another project first."
            : !counts ? "Checking what's in it…"
              : `This permanently deletes ${lost.length ? lost.join(", ") : "the project"}. Archive keeps everything and just hides it.`}
        </div>
        {canDelete && <>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>Type <b style={{ color: C.soft }}>{project.name}</b> to confirm</div>
          <input autoFocus value={typed} onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && ok) { setBusy(true); onConfirm(); } }}
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 7, fontSize: 13, background: "#111110", color: C.text, border: `1px solid ${C.line}`, outline: "none", marginBottom: 14, fontFamily: "'SF Mono', monospace" }} />
        </>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 9, borderRadius: 7, fontSize: 12, fontWeight: 600, background: "transparent", border: `1px solid ${C.dim}`, color: C.soft, cursor: "pointer" }}>Cancel</button>
          {!project.archived_at && canDelete && <button onClick={onArchive} style={{ flex: 1, padding: 9, borderRadius: 7, fontSize: 12, fontWeight: 600, background: "transparent", border: `1px solid ${C.dim}`, color: C.soft, cursor: "pointer" }}>Archive instead</button>}
          {canDelete && <button disabled={!ok} onClick={() => { setBusy(true); onConfirm(); }} style={{ flex: 1, padding: 9, borderRadius: 7, fontSize: 12, fontWeight: 600, background: ok ? "#3A1414" : "transparent", border: `1px solid ${ok ? "#6B2222" : C.line}`, color: ok ? C.danger : C.dim, cursor: ok ? "pointer" : "not-allowed" }}>Delete</button>}
        </div>
      </div>
    </div>
  );
}

// ---------- sidebar ----------

export default function Sidebar(props) {
  const { sb, onToggle, nav, hideableNav, hiddenTabs, onToggleTab, view, onNav, tmr, taskName, projects, activeProjectId, onSelectProject, onRename, onRecolor, onArchive, onDelete, onNewProject, onAssistant, onTutorial, onSignOut, email, isDemo } = props;
  const [switcher, setSwitcher] = useState(null);   // anchor rect while the project switcher is open
  const [account, setAccount] = useState(null);     // anchor rect while the account menu is open
  const [showViews, setShowViews] = useState(false);
  const projBtn = useRef(null);

  const active = projects.find(p => p.id === activeProjectId);
  const global = nav.filter(n => GLOBAL.includes(n.id));
  const scoped = nav.filter(n => !GLOBAL.includes(n.id));
  const name = (email || "").split("@")[0] || "Account";

  // Remember recently opened projects for the switcher
  useEffect(() => { if (activeProjectId) writeRecent([activeProjectId, ...readRecent().filter(id => id !== activeProjectId)]); }, [activeProjectId]);

  // Ctrl/Cmd+K opens the project switcher
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSwitcher(s => (s ? null : projBtn.current?.getBoundingClientRect() || { left: 10, right: 210, bottom: 120, top: 100, width: 200 })); }
      if (e.key === "Escape") { setSwitcher(null); setAccount(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openSwitcher = (e) => setSwitcher(switcher ? null : e.currentTarget.getBoundingClientRect());
  const pick = (id) => { setSwitcher(null); onSelectProject(id); };

  const navBtn = (n) => {
    const on = view === n.id;
    const timer = n.id === "focus" && <TimerBadge tmr={tmr} />;
    return (
      <button key={n.id} onClick={() => onNav(n.id)} title={sb ? (n.id === "focus" && taskName ? `Focus: ${taskName}` : undefined) : n.l}
        style={{ ...rowBase, position: "relative", padding: sb ? "7px 10px" : "8px 0", justifyContent: sb ? "flex-start" : "center", background: on ? C.line : "transparent", color: on ? C.text : C.sub, marginBottom: 1 }}>
        <span style={{ fontSize: 13, width: 18, textAlign: "center", opacity: 0.75 }}>{n.ic}</span>
        {sb && <span style={{ flex: 1 }}>{n.l}</span>}
        {sb && (timer || (n.cnt && n.id !== "focus" ? <span style={{ fontSize: 10, background: on ? C.dim : C.line, color: on ? C.soft : C.sub, padding: "1px 6px", borderRadius: 4 }}>{n.cnt}</span> : null))}
        {!sb && n.id === "focus" && tmr.st !== "idle" && <span style={{ position: "absolute", top: 4, right: 10, width: 6, height: 6, borderRadius: "50%", background: tmr.st === "paused" ? C.amber : C.red }} />}
      </button>
    );
  };

  // Popover placement: expanded = under the anchor, full sidebar width; collapsed = to the right
  const popStyle = (r, w) => sb
    ? { left: r.left, top: r.bottom + 4, width: Math.max(r.width, w) }
    : { left: r.right + 8, top: Math.max(8, r.top - 6), width: w };

  return (
    <div style={{ width: sb ? 220 : 54, borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", background: C.side, transition: "width 0.2s ease", position: "fixed", top: 0, left: 0, height: "100vh", zIndex: 50 }}>
      {/* Brand */}
      <div style={{ padding: sb ? "14px 16px" : "14px 0", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: sb ? "space-between" : "center" }}>
        <button onClick={sb ? undefined : onToggle} title={sb ? undefined : "Expand sidebar"} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: sb ? "default" : "pointer", color: C.text, fontSize: 15, fontWeight: 500, letterSpacing: -0.4 }}>
          <span style={{ background: "#D3D1C7", color: "#111110", width: 22, height: 22, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>Q</span>{sb && "QTrack"}
        </button>
        {sb && <button onClick={onToggle} title="Collapse sidebar" aria-label="Collapse sidebar" style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 2 }}>◂</button>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0 }}>
        {/* 1. Across all projects */}
        <div style={{ padding: sb ? "10px 10px" : "10px 6px", borderBottom: `1px solid ${C.line}` }}>{global.map(navBtn)}</div>

        {/* 2. Selected project + its views */}
        <div style={{ padding: sb ? "10px 10px" : "10px 6px" }}>
          {sb ? (
            <button ref={projBtn} onClick={openSwitcher} aria-haspopup="menu" aria-expanded={!!switcher}
              style={{ ...rowBase, padding: "8px 10px", border: `1px solid ${switcher ? C.dim : C.line}`, background: C.raise, borderRadius: 7, marginBottom: 6, color: C.text }}>
              <Dot color={projectColor(active)} />
              <span style={{ flex: 1, minWidth: 0, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: active?.archived_at ? "italic" : "normal" }}>{active?.name || "Choose a project"}</span>
              {active?.archived_at && <span style={{ fontSize: 9, color: C.muted }}>archived</span>}
              <span style={{ color: C.muted, fontSize: 10 }}>{switcher ? "▴" : "▾"}</span>
            </button>
          ) : (
            <button ref={projBtn} onClick={openSwitcher} title={active?.name || "Choose a project"} aria-haspopup="menu"
              style={{ ...rowBase, justifyContent: "center", padding: "6px 0", marginBottom: 4 }}>
              <span style={{ width: 26, height: 26, borderRadius: 6, background: projectColor(active), color: "#111110", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center" }}>{projectInitials(active?.name)}</span>
            </button>
          )}
          <div style={{ paddingLeft: sb ? 4 : 0 }}>{scoped.map(navBtn)}</div>
        </div>
      </div>

      {/* 3. Account */}
      <div style={{ borderTop: `1px solid ${C.line}`, padding: sb ? 10 : "10px 6px" }}>
        <button onClick={(e) => { setShowViews(false); setAccount(account ? null : e.currentTarget.getBoundingClientRect()); }} title={sb ? undefined : email} aria-haspopup="menu"
          style={{ ...rowBase, padding: sb ? "7px 8px" : "6px 0", justifyContent: sb ? "flex-start" : "center", background: account ? C.line : "transparent", color: C.soft }}>
          <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#2E2950", color: "#AFA9EC", fontSize: 11, fontWeight: 600, display: "grid", placeItems: "center", flexShrink: 0 }}>{(name[0] || "?").toUpperCase()}</span>
          {sb && <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isDemo ? "Demo" : name}</span>}
          {sb && <span style={{ color: C.muted, letterSpacing: 1 }}>⋯</span>}
        </button>
      </div>

      {/* Project switcher */}
      {switcher && <>
        <Backdrop onClose={() => setSwitcher(null)} />
        <div role="menu" style={{ position: "fixed", ...popStyle(switcher, 250), zIndex: 91, maxHeight: "min(70vh, 560px)", overflowY: "auto", overflowX: "hidden", scrollbarWidth: "thin", scrollbarColor: `${C.dim} transparent`, background: C.pop, border: `1px solid ${C.dim}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,.55)", padding: 8 }}>
          <ProjectList projects={projects} activeProjectId={activeProjectId} onSelect={pick} onRename={onRename} onRecolor={onRecolor}
            onArchive={(id, a) => { onArchive(id, a); }} onDelete={(p) => { setSwitcher(null); onDelete(p); }} onNewProject={() => { setSwitcher(null); onNewProject(); }} />
        </div>
      </>}

      {/* Account menu */}
      {account && <>
        <Backdrop onClose={() => setAccount(null)} />
        <div role="menu" style={{ position: "fixed", zIndex: 91, ...(sb ? { left: account.left, width: account.width } : { left: account.right + 8, width: 220 }), bottom: sb ? window.innerHeight - account.top + 6 : window.innerHeight - account.bottom, maxHeight: "70vh", overflowY: "auto", background: C.menu, border: `1px solid ${C.dim}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.6)", padding: 5 }}>
          <div style={{ fontSize: 10.5, color: C.muted, padding: "4px 8px 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{isDemo ? "Demo mode · sample data" : email}</div>
          <Sep />
          <MenuItem icon="⚙" onClick={() => setShowViews(!showViews)}>Show / hide views {showViews ? "▾" : "▸"}</MenuItem>
          {showViews && <div style={{ padding: "2px 8px 6px 30px" }}>
            {hideableNav.map(n => (
              <label key={n.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12, color: hiddenTabs.includes(n.id) ? C.dim : C.soft, cursor: "pointer" }}>
                <input type="checkbox" checked={!hiddenTabs.includes(n.id)} onChange={() => onToggleTab(n.id)} style={{ cursor: "pointer" }} />
                <span style={{ opacity: 0.7, width: 14 }}>{n.ic}</span>{n.l}
              </label>
            ))}
          </div>}
          <MenuItem icon="✦" onClick={() => { setAccount(null); onAssistant(); }}>Assistant access</MenuItem>
          <MenuItem icon="?" onClick={() => { setAccount(null); onTutorial(); }}>Replay tutorial</MenuItem>
          <Sep />
          <MenuItem icon="↗" onClick={() => { setAccount(null); onSignOut(); }}>{isDemo ? "Exit demo · sign up" : "Sign out"}</MenuItem>
        </div>
      </>}
    </div>
  );
}
