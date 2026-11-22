import { useState, useEffect, useRef } from "react";
import * as db from "../storage";
import { projectColor } from "./projectColors";
import { TASK_STATUSES, TASK_STATUS_LABEL, normalizeTaskStatus } from "../../supabase/functions/_shared/status.js";

// Details of one task or test case, opened from Today without leaving it.
// Desktop: a panel on the right. Phone: a bottom sheet. Mount it with key={kind + id} so it starts
// fresh for each item. See docs/proposals/today-task-details.

const C = { side: "var(--side)", raise: "var(--surface)", line: "var(--line)", line2: "var(--line2)", dim: "var(--dim)", muted: "var(--muted)", sub: "var(--sub)", soft: "var(--soft)", title: "var(--title)", text: "var(--text)", green: "var(--green)", blue: "var(--blue)", amber: "var(--amber)", pink: "var(--pink)", orange: "var(--orange)", lime: "var(--lime)" };
const TEST_STATUSES = [{ value: "not_run", label: "Not run" }, { value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }, { value: "blocked", label: "Blocked" }];
const TASK_OPTIONS = TASK_STATUSES.map(v => ({ value: v, label: TASK_STATUS_LABEL[v] }));
const PRIORITIES = ["critical", "high", "medium", "low"];
const STATUS_COLOR = { todo: C.soft, in_progress: C.blue, done: C.green, skipped: C.muted, not_run: C.soft, pass: C.green, fail: C.pink, blocked: C.amber };
const PRIORITY_COLOR = { critical: C.pink, high: C.orange, medium: C.amber, low: C.lime };

const parseList = (v) => { if (Array.isArray(v)) return v; try { return JSON.parse(v || "[]"); } catch { return []; } };
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dueText = (d) => {
  if (!d) return null;
  const diff = Math.round((new Date(d + "T00:00:00") - new Date(localDate() + "T00:00:00")) / 86400000);
  if (diff === 0) return { text: "Due today", color: C.amber };
  if (diff === -1) return { text: "Due yesterday", color: C.amber };
  if (diff < 0) return { text: `${-diff} days overdue`, color: C.amber };
  if (diff === 1) return { text: "Due tomorrow", color: C.blue };
  return { text: "Due " + new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }), color: C.sub };
};
const fmtDur = (s) => { const m = Math.round(s / 60); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim(); };
const isTyping = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);

// Grids use minmax(0, 1fr): App's phone CSS collapses "1fr 1fr" / "repeat(3, 1fr)" grids to one column.
const sh = { fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" };
const field = { background: C.raise, border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 8px", minWidth: 0 };
const fieldLabel = { display: "block", fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 };
const control = { width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 12, padding: "1px 0", cursor: "pointer", colorScheme: "dark", fontFamily: "inherit" };
const btn = (primary) => ({ padding: "7px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, background: primary ? "var(--title)" : "transparent", color: primary ? "var(--surface)" : C.soft, border: primary ? "1px solid var(--title)" : `1px solid ${C.dim}`, cursor: "pointer", whiteSpace: "nowrap" });
const linkBtn = { background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.6, padding: 0 };

export default function TaskDetailsPanel({ item, projects, inQueue, mobile, focusing, onClose, onPrev, onNext, onStart, onFinish, onOpenInProject, onChanged }) {
  const isTest = item.kind === "test";
  const [row, setRow] = useState(item);
  const [extra, setExtra] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [newItem, setNewItem] = useState("");
  const [drag, setDrag] = useState(0);
  const touchY = useRef(null);

  useEffect(() => {
    let live = true;
    db.getTaskDetails(item.kind, item.id)
      .then(d => { if (live) { setExtra(d); setRow(d.row); } })
      .catch(e => { console.error("Task details:", e); if (live) setLoadErr(e.message || "Couldn't load the details"); });
    return () => { live = false; };
  }, [item.kind, item.id]);

  // Esc closes; arrow keys move through the list the item was opened from
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") { if (isTyping(e.target)) e.target.blur(); else onClose(); return; }
      if (isTyping(e.target)) return;
      if (e.key === "ArrowDown" && onNext) { e.preventDefault(); onNext(); }
      if (e.key === "ArrowUp" && onPrev) { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNext, onPrev]);

  const project = projects.find(p => p.id === row.project_id);
  const status = isTest ? row.status : normalizeTaskStatus(row.status);
  const checklist = parseList(row.scratch_checklist);
  const steps = isTest ? parseList(row.steps) : [];
  const due = dueText(row.due_date);

  // Saves as you go, like the rest of the app. Rolls back the field if the write fails.
  const save = async (fields) => {
    const before = row;
    setRow(r => ({ ...r, ...fields }));
    try {
      if ("status" in fields) await (isTest ? db.updateTestStatus(row.id, fields.status) : db.updateIssueStatus(row.id, fields.status));
      const rest = { ...fields }; delete rest.status;
      if (Object.keys(rest).length) await (isTest ? db.updateTestCase(row.id, rest) : db.updateIssue(row.id, rest));
      onChanged();
    } catch (e) {
      console.error(e); setRow(before);
      alert("Couldn't save: " + (e.message || e));
    }
  };

  const finish = async (newStatus) => {
    const prev = row.status;
    try {
      await (isTest ? db.updateTestStatus(row.id, newStatus) : db.updateIssueStatus(row.id, newStatus));
      onFinish(row, newStatus, prev);
    } catch (e) { console.error(e); alert("Couldn't save: " + (e.message || e)); }
  };

  const toggleItem = (i) => save({ scratch_checklist: checklist.map((c, j) => j === i ? { ...c, done: !c.done } : c) });
  const addItem = () => { const t = newItem.trim(); if (!t) return; setNewItem(""); save({ scratch_checklist: [...checklist, { text: t, done: false }] }); };
  const saveDesc = () => { setEditingDesc(false); if (descDraft !== (row.description || "")) save({ description: descDraft }); };

  const onTouchStart = (e) => { touchY.current = e.touches[0].clientY; };
  const onTouchMove = (e) => { if (touchY.current != null) setDrag(Math.max(0, e.touches[0].clientY - touchY.current)); };
  const onTouchEnd = () => { if (drag > 90) onClose(); setDrag(0); touchY.current = null; };

  const shell = mobile
    ? { position: "fixed", left: 0, right: 0, bottom: 0, maxHeight: "86vh", zIndex: 121, background: C.side, borderTop: `1px solid ${C.dim}`, borderRadius: "18px 18px 0 0", display: "flex", flexDirection: "column", transform: `translateY(${drag}px)`, transition: drag ? "none" : "transform 0.2s ease", paddingBottom: "env(safe-area-inset-bottom)" }
    : { position: "fixed", top: 0, right: 0, bottom: 0, width: 400, maxWidth: "100vw", zIndex: 80, background: C.side, borderLeft: `1px solid ${C.dim}`, boxShadow: "-18px 0 40px rgba(0,0,0,0.45)", display: "flex", flexDirection: "column" };

  return (<>
    {mobile && <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.55)" }} />}
    <aside role="dialog" aria-label={row.title} style={shell}>
      {/* Header */}
      <div onTouchStart={mobile ? onTouchStart : undefined} onTouchMove={mobile ? onTouchMove : undefined} onTouchEnd={mobile ? onTouchEnd : undefined}
        style={{ padding: mobile ? "6px 16px 12px" : "14px 16px 12px", borderBottom: `1px solid ${C.line}` }}>
        {mobile && <div style={{ width: 38, height: 4, borderRadius: 2, background: C.dim, margin: "2px auto 10px" }} />}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.muted }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: projectColor(project), flexShrink: 0 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {project?.name || "Project"} · {isTest ? "test case" : row.type === "bug" ? "bug" : "todo"}{inQueue ? " · in Up next" : ""}
          </span>
          <span style={{ flex: 1 }} />
          {!mobile && (onPrev || onNext) && <>
            <button title="Previous (↑)" disabled={!onPrev} onClick={onPrev} style={{ ...iconBtn, opacity: onPrev ? 1 : 0.35 }}>↑</button>
            <button title="Next (↓)" disabled={!onNext} onClick={onNext} style={{ ...iconBtn, opacity: onNext ? 1 : 0.35 }}>↓</button>
          </>}
          <button title="Close (Esc)" onClick={onClose} style={iconBtn}>✕</button>
        </div>
        <div style={{ fontSize: 16, fontWeight: 500, color: C.text, lineHeight: 1.35, margin: "8px 0 10px", wordBreak: "break-word" }}>{row.title}</div>
        <div style={{ display: "grid", gridTemplateColumns: isTest ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))", gap: 6 }}>
          <label style={field}><span style={fieldLabel}>Status</span>
            <select value={status} onChange={e => save({ status: e.target.value })} style={{ ...control, color: STATUS_COLOR[status] || C.text }}>
              {(isTest ? TEST_STATUSES : TASK_OPTIONS).map(o => <option key={o.value} value={o.value} style={{ color: C.text, background: C.raise }}>{o.label}</option>)}
            </select>
          </label>
          {!isTest && <label style={field}><span style={fieldLabel}>Priority</span>
            <select value={row.priority || "medium"} onChange={e => save({ priority: e.target.value })} style={{ ...control, color: PRIORITY_COLOR[row.priority] || C.text, textTransform: "capitalize" }}>
              {PRIORITIES.map(p => <option key={p} value={p} style={{ color: C.text, background: C.raise }}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </label>}
          <label style={field}><span style={fieldLabel}>{due ? due.text : "Due"}</span>
            <input type="date" value={row.due_date || ""} onChange={e => save({ due_date: e.target.value || null })} style={{ ...control, color: due ? due.color : C.sub }} />
          </label>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16, scrollbarWidth: "thin", scrollbarColor: `${C.line} transparent` }}>
        {loadErr && <div style={{ fontSize: 12, color: C.pink }}>{loadErr}</div>}

        {isTest ? (<>
          {row.precondition && <div><div style={sh}><span>Precondition</span></div><div style={{ fontSize: 12.5, color: C.soft, lineHeight: 1.55 }}>{row.precondition}</div></div>}
          <div>
            <div style={sh}><span>Steps</span><span>{steps.length || ""}</span></div>
            {steps.length === 0 ? <div style={{ fontSize: 12, color: C.muted }}>No steps yet.</div> :
              steps.map((s, i) => (<div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, padding: "5px 0", borderBottom: `1px solid ${C.line2}` }}>
                <span style={{ color: C.muted, fontFamily: "'SF Mono', monospace", fontSize: 11, width: 16, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0 }}><span style={{ color: C.title }}>{s.step}</span>{s.expected && <span style={{ display: "block", color: C.sub, fontSize: 11.5, marginTop: 2 }}>→ {s.expected}</span>}</span>
              </div>))}
          </div>
        </>) : (
          <div>
            <div style={sh}><span>Description</span>{!editingDesc && <button onClick={() => { setDescDraft(row.description || ""); setEditingDesc(true); }} style={linkBtn}>edit</button>}</div>
            {editingDesc
              ? <textarea autoFocus value={descDraft} onChange={e => setDescDraft(e.target.value)} onBlur={saveDesc} rows={5}
                  style={{ width: "100%", boxSizing: "border-box", background: C.raise, color: C.text, border: `1px solid ${C.dim}`, borderRadius: 6, padding: "8px 10px", fontSize: 12.5, lineHeight: 1.5, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
              : <div onClick={() => { setDescDraft(row.description || ""); setEditingDesc(true); }} style={{ fontSize: 12.5, color: row.description ? C.soft : C.muted, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word", cursor: "text" }}>{row.description || "Add a description…"}</div>}
          </div>
        )}

        <div>
          <div style={sh}><span>Checklist</span><span>{checklist.length ? `${checklist.filter(c => c.done).length} / ${checklist.length}` : ""}</span></div>
          {checklist.map((c, i) => (<label key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "4px 0", cursor: "pointer", color: c.done ? C.muted : C.title, textDecoration: c.done ? "line-through" : "none" }}>
            <input type="checkbox" checked={!!c.done} onChange={() => toggleItem(i)} style={{ accentColor: C.green, margin: 0, cursor: "pointer" }} />
            <span style={{ wordBreak: "break-word" }}>{c.text}</span>
          </label>))}
          <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addItem(); }} onBlur={addItem} placeholder="+ Add an item…"
            style={{ width: "100%", boxSizing: "border-box", background: "transparent", border: "none", borderBottom: `1px dashed ${C.line}`, color: C.text, fontSize: 12.5, padding: "6px 0", outline: "none" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
          <Stat value={extra ? extra.pomodoros : "–"} label="pomodoros" />
          <Stat value={extra ? fmtDur(extra.focusedSeconds) : "–"} label="focused" />
          <Stat value={row.estimated_pomodoros ?? "–"} label="estimated" />
        </div>

        {extra && (extra.linked.length > 0 || extra.notes.length > 0) && (
          <div>
            <div style={sh}><span>Linked</span></div>
            {extra.linked.map(l => (<div key={l.id} style={linkRow}>
              <span style={{ fontSize: 10, color: C.muted, width: 34, flexShrink: 0 }}>{l.kind === "test" ? "test" : "task"}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</span>
              <span style={{ fontSize: 10, color: STATUS_COLOR[l.kind === "test" ? l.status : normalizeTaskStatus(l.status)] || C.sub }}>{l.kind === "test" ? l.status.replace(/_/g, " ") : TASK_STATUS_LABEL[normalizeTaskStatus(l.status)]}</span>
            </div>))}
            {extra.notes.map(n => (<div key={n.id} style={linkRow}>
              <span style={{ fontSize: 10, color: C.muted, width: 34, flexShrink: 0 }}>note</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title || (n.content || "").slice(0, 80) || "Untitled note"}</span>
            </div>))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: mobile ? "10px 12px 14px" : "12px 16px", borderTop: `1px solid ${C.line}`, display: "flex", gap: 6, alignItems: "center" }}>
        {focusing
          ? <span style={{ ...btn(false), color: "var(--red)", borderColor: "var(--tint-red-bd)", cursor: "default", flex: mobile ? 1 : "none", textAlign: "center" }}>● Focusing</span>
          : <button onClick={() => onStart(row.kind, row)} style={{ ...btn(true), flex: mobile ? 1 : "none" }}>▶ Focus</button>}
        <button onClick={() => finish(isTest ? "pass" : "done")} style={{ ...btn(false), flex: mobile ? 1 : "none" }}>{isTest ? "✓ Pass" : "✓ Done"}</button>
        {!isTest && <button onClick={() => finish("skipped")} style={{ ...btn(false), flex: mobile ? 1 : "none" }}>Skip</button>}
        {!mobile && <span style={{ flex: 1 }} />}
        <button onClick={() => onOpenInProject(row.kind, row)} title="Open in project" style={mobile ? { ...btn(false), flex: "none" } : { background: "none", border: "none", color: C.sub, fontSize: 12, cursor: "pointer", padding: 0 }}>{mobile ? "↗" : "Open in project ↗"}</button>
      </div>
    </aside>
  </>);
}

const iconBtn = { width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.line}`, background: "transparent", color: C.sub, cursor: "pointer", fontSize: 11, display: "grid", placeItems: "center", padding: 0, flexShrink: 0 };
const linkRow = { display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", color: C.title, borderBottom: `1px solid ${C.line2}` };

function Stat({ value, label }) {
  return (<div style={{ background: C.raise, border: `1px solid ${C.line}`, borderRadius: 6, padding: "7px 9px" }}>
    <b style={{ display: "block", fontFamily: "'SF Mono', monospace", fontWeight: 500, fontSize: 14, color: C.text }}>{value}</b>
    <small style={{ fontSize: 10, color: C.muted }}>{label}</small>
  </div>);
}
