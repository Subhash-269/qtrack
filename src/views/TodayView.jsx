import { useState, useEffect } from "react";
import * as db from "../storage";
import TaskDetailsPanel from "../components/TaskDetailsPanel";

// Today: the default screen. What's running, what's next, what's due, today's meetings
// and quick scribbles, across every project.

const FMT = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const SC = { work: "#E24B4A", short_break: "#5DCAA5", long_break: "#378ADD" };
const KIND = {
  bug: { label: "bug", bg: "#1F0E0E", text: "#F09595", border: "#4A1B1B" },
  todo: { label: "todo", bg: "#1A1A18", text: "#B4B2A9", border: "#2C2C2A" },
  test: { label: "test", bg: "#0A1929", text: "#85B7EB", border: "#1B2F4A" },
};
const kindOf = (item) => item.kind === "test" ? KIND.test : item.type === "bug" ? KIND.bug : KIND.todo;
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const fmtTime = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };

const card = { background: "#1A1A18", border: "1px solid #2C2C2A", borderRadius: 8, padding: "12px 14px", minWidth: 0 };
const label = { fontSize: 10, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: 0.6, display: "flex", justifyContent: "space-between", marginBottom: 6 };
const row = { display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid #222220", fontSize: 12, minWidth: 0 };
const title = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#D3D1C7" };
const iconBtn = { width: 22, height: 22, borderRadius: 5, border: "1px solid #2C2C2A", background: "transparent", color: "#888780", cursor: "pointer", fontSize: 9, display: "grid", placeItems: "center", flexShrink: 0, padding: 0 };
const btn = (primary) => ({ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: primary ? "#D3D1C7" : "transparent", color: primary ? "#1A1A18" : "#B4B2A9", border: primary ? "none" : "1px solid #444441", cursor: "pointer" });

const Chip = ({ c, children }) => (<span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: c.bg, color: c.text, border: `1px solid ${c.border}`, whiteSpace: "nowrap", flexShrink: 0 }}>{children}</span>);
const Empty = ({ children }) => (<div style={{ fontSize: 12, color: "#5F5E5A", padding: "8px 0" }}>{children}</div>);

function Ring({ size, stroke, left, total, color }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = total > 0 ? left / total : 0;
  return (<svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2C2C2A" strokeWidth={stroke} /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - p)} strokeLinecap="round" /></svg>);
}

export default function TodayView({ projects, activeProjectId, tmr, taskName, onStart, onPause, onResume, onDone, onOpenFocus, onFocusMeeting, onAddScribble, onOpenItem, onReload, mobile, refreshOn }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [scribble, setScribble] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(null);   // { list: "queue" | "due", item } shown in the details panel
  const [toast, setToast] = useState(null); // { text, undo }

  const load = () => db.getTodayAcrossProjects().then(d => { setData(d); setErr(null); }).catch(e => { console.error("Today:", e); setErr(e.message || "Couldn't load today"); });
  // Refetch when the active project's data reloads or the timer changes task/state
  useEffect(() => { load(); }, refreshOn); // eslint-disable-line react-hooks/exhaustive-deps

  const pname = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const multi = projects.length > 1;
  const proj = (id) => multi && pname[id] ? <span style={{ fontSize: 10, color: "#5F5E5A", whiteSpace: "nowrap", flexShrink: 0, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis" }}>{pname[id]}</span> : null;

  // Toasts disappear on their own
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 8000); return () => clearTimeout(t); }, [toast]);

  const lists = { queue: (data?.queue || []).slice(0, 8).map(q => q.item), due: (data?.due || []).slice(0, 8) };
  const openItem = (list, item) => setOpen({ list, item });
  const isOpen = (list, item) => open && open.list === list && open.item.id === item.id;
  const step = (dir) => {
    if (!open) return null;
    const l = lists[open.list], i = l.findIndex(x => x.id === open.item.id), n = l[i + dir];
    return i >= 0 && n ? () => setOpen({ list: open.list, item: n }) : null;
  };
  const changed = () => { load(); onReload?.(); };
  const finished = (row, status, prev) => {
    setOpen(null); changed();
    const word = status === "skipped" ? "Skipped" : status === "pass" ? "Marked as passing" : "Marked done";
    setToast({
      text: `${word}: ${row.title}`,
      undo: async () => {
        setToast(null);
        try { await (row.kind === "test" ? db.updateTestStatus(row.id, prev) : db.updateIssueStatus(row.id, prev)); changed(); }
        catch (e) { alert("Couldn't undo: " + (e.message || e)); }
      },
    });
  };
  const titleBtn = (list, item) => ({ ...title, cursor: "pointer", ...(isOpen(list, item) ? { color: "#F1EFE8", textDecoration: "underline", textDecorationColor: "#444441", textUnderlineOffset: 3 } : null) });
  const rowStyle = (list, item) => isOpen(list, item) ? { ...row, background: "#22221F", margin: "0 -8px", padding: "7px 8px", borderRadius: 6, boxShadow: "inset 2px 0 0 #85B7EB" } : row;

  const saveScribble = async () => {
    const t = scribble.trim(); if (!t || saving) return;
    setSaving(true);
    try { await onAddScribble(t); setScribble(""); await load(); } catch (e) { console.error(e); alert("Couldn't save the scribble."); }
    setSaving(false);
  };

  const running = tmr.st !== "idle";
  const paused = tmr.st === "paused";
  const color = paused ? "#FAC775" : SC[tmr.type];
  const nowName = taskName || (tmr.type === "work" ? "Focus session" : "Break");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 1000, paddingRight: open && !mobile ? 400 : 0, transition: "padding-right 0.15s ease" }}>
      <div style={{ fontSize: 12, color: "#5F5E5A", marginTop: -8 }}>
        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}{multi ? " · all projects" : ""}
      </div>

      {/* Now */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        {running ? (<>
          <div onClick={onOpenFocus} title="Open Focus" style={{ position: "relative", width: 64, height: 64, cursor: "pointer" }}>
            <Ring size={64} stroke={4} left={tmr.left} total={tmr.total} color={color} />
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "'SF Mono', monospace", fontSize: 13, color }}>{paused ? "II" : FMT(tmr.left)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={label}><span>Now · {tmr.type === "work" ? `Focus ${Math.min(tmr.done + 1, 4)} of 4` : "Break"}{paused ? " · paused" : ""}</span></div>
            <div onClick={onOpenFocus} style={{ fontSize: 14, color: "#F1EFE8", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nowName}</div>
            {paused && tmr.pauseReason && <div style={{ fontSize: 11, color: "#FAC775", marginTop: 3 }}>{tmr.pauseReason}</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {paused ? <button onClick={onResume} style={btn(true)}>Resume</button> : <button onClick={onPause} style={btn(true)}>Pause</button>}
            {tmr.type === "work" && tmr.tId && <button onClick={onDone} style={btn(false)}>✓ Done</button>}
            <button onClick={onOpenFocus} style={btn(false)}>Open</button>
          </div>
        </>) : (<>
          <div onClick={onOpenFocus} title="Open Focus" style={{ position: "relative", width: 64, height: 64, cursor: "pointer" }}>
            <Ring size={64} stroke={4} left={0} total={1} color="#2C2C2A" />
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "'SF Mono', monospace", fontSize: 13, color: "#5F5E5A" }}>{FMT(tmr.total || 1500)}</span>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={label}><span>Now</span></div>
            <div style={{ fontSize: 13, color: "#888780" }}>Nothing running. Pick something from Up next or Due to start a focus session.</div>
          </div>
        </>)}
      </div>

      {err && <div style={{ ...card, color: "#F09595", fontSize: 12 }}>Couldn't load Today: {err} <button onClick={load} style={{ ...btn(false), marginLeft: 8, padding: "2px 10px" }}>Retry</button></div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Up next */}
        <div style={card}>
          <div style={label}><span>Up next</span><span>{data?.queue.length || ""}</span></div>
          {!data ? <Empty>Loading…</Empty> : data.queue.length === 0 ? <Empty>Queue is empty. Add tasks to it from Tasks or Test cases.</Empty> :
            data.queue.slice(0, 8).map(q => {
              const isNow = running && tmr.tId === q.item.id;
              return (<div key={q.id} style={rowStyle("queue", q.item)}>
                <button title="Start focus" onClick={() => onStart(q.item.kind, q.item)} style={{ ...iconBtn, color: isNow ? "#E24B4A" : "#888780" }}>{isNow ? "●" : "▶"}</button>
                <span title="Show details" onClick={() => openItem("queue", q.item)} style={titleBtn("queue", q.item)}>{q.item.title}</span>
                {proj(q.project_id)}
                <Chip c={kindOf(q.item)}>{kindOf(q.item).label}</Chip>
              </div>);
            })}
        </div>

        {/* Due today & overdue */}
        <div style={card}>
          <div style={label}><span>Due today &amp; overdue</span><span>{data?.due.length || ""}</span></div>
          {!data ? <Empty>Loading…</Empty> : data.due.length === 0 ? <Empty>Nothing due today.</Empty> :
            data.due.slice(0, 8).map(it => {
              const over = daysBetween(it.due_date, data.today);
              return (<div key={it.kind + it.id} style={rowStyle("due", it)}>
                <button title="Start focus" onClick={() => onStart(it.kind, it)} style={iconBtn}>▶</button>
                <span title="Show details" onClick={() => openItem("due", it)} style={titleBtn("due", it)}>{it.title}</span>
                {proj(it.project_id)}
                {over > 0 ? <Chip c={{ bg: "#1F180E", text: "#FAC775", border: "#4A3A1B" }}>{over}d over</Chip> : <span style={{ fontSize: 10, color: "#888780" }}>today</span>}
              </div>);
            })}
        </div>

        {/* Meetings today */}
        <div style={card}>
          <div style={label}><span>Meetings today</span><span>{data?.meetings.length || ""}</span></div>
          {!data ? <Empty>Loading…</Empty> : data.meetings.length === 0 ? <Empty>No meetings today.</Empty> :
            data.meetings.map(m => (<div key={m.id} style={{ ...row, opacity: m.attended ? 0.5 : 1 }}>
              <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 11, color: "#888780", width: 64, flexShrink: 0 }}>{fmtTime(m.start_time)}</span>
              <span style={title}>{m.title}</span>
              {proj(m.project_id)}
              <button title="Meeting focus" onClick={() => onFocusMeeting(m)} style={iconBtn}>◎</button>
            </div>))}
        </div>

        {/* Scribbles */}
        <div style={card}>
          <div style={label}><span>Scribbles</span>{multi && <span style={{ textTransform: "none", letterSpacing: 0 }}>saves to {pname[activeProjectId]}</span>}</div>
          <input value={scribble} onChange={e => setScribble(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveScribble(); }} placeholder="Jot something… Enter saves it as a scratch note" disabled={saving}
            style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", borderRadius: 6, fontSize: 12, background: "#111110", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", margin: "2px 0 4px" }} />
          {data && data.scribbles.length === 0 && <Empty>Nothing jotted today.</Empty>}
          {data?.scribbles.slice(0, 6).map(n => (<div key={n.id} style={{ ...row, alignItems: "flex-start", flexDirection: "column", gap: 2 }}>
            <span style={{ color: "#D3D1C7", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.content || n.title}</span>
            <span style={{ fontSize: 10, color: "#5F5E5A" }}>{n.source === "assistant" && <span style={{ color: "#AFA9EC", background: "#1A0A29", border: "1px solid #2E2950", borderRadius: 4, padding: "0 5px", marginRight: 6 }}>via assistant</span>}{new Date(n.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{multi && pname[n.project_id] ? ` · ${pname[n.project_id]}` : ""}</span>
          </div>))}
        </div>
      </div>

      {open && <TaskDetailsPanel key={open.item.kind + open.item.id} item={open.item} projects={projects} mobile={mobile}
        inQueue={!!data?.queue.some(q => q.item.id === open.item.id)} focusing={running && tmr.tId === open.item.id}
        onClose={() => setOpen(null)} onPrev={step(-1)} onNext={step(1)}
        onStart={(kind, item) => onStart(kind, item)} onFinish={finished} onChanged={changed}
        onOpenInProject={(kind, item) => { setOpen(null); onOpenItem(kind, item); }} />}

      {toast && <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: mobile ? 132 : 56, zIndex: 130, display: "flex", alignItems: "center", gap: 12, background: "#262624", border: "1px solid #444441", borderRadius: 8, padding: "9px 12px 9px 14px", fontSize: 12, color: "#F1EFE8", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxWidth: "calc(100vw - 32px)" }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.text}</span>
        <button onClick={toast.undo} style={{ background: "none", border: "none", color: "#85B7EB", fontSize: 12, fontWeight: 500, cursor: "pointer", padding: 0 }}>Undo</button>
      </div>}
    </div>
  );
}
