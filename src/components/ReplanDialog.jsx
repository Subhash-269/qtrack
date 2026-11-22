import { useState } from "react";
import * as db from "../storage";

// Replan leftovers from earlier days: each item goes to Today (due today + Up next), Tomorrow,
// Later (no date) or Let go (Skipped, tasks only). Nothing changes until Done. Returns an undo.
// See docs/proposals/adhd-borrowed-ideas. The MCP tool replan_day does the same for assistants.

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const OPTIONS = [["today", "Today"], ["tomorrow", "Tmrw"], ["later", "Later"], ["let_go", "Let go"]];

// Apply the choices; returns { summary, undo } where undo() puts everything back
async function applyReplan(items, choice) {
  const today = new Date(), tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const undo = [], counts = {};
  const queues = {};
  for (const it of items) {
    const to = choice[it.kind + it.id];
    if (!to) continue;
    const isTest = it.kind === "test";
    const setDue = (d) => (isTest ? db.updateTestCase(it.id, { due_date: d }) : db.updateIssue(it.id, { due_date: d }));
    if (to === "let_go" && !isTest) {
      await db.updateIssueStatus(it.id, "skipped");
      undo.push(() => db.updateIssueStatus(it.id, it.status));
    } else {
      const due = to === "today" ? ymd(today) : to === "tomorrow" ? ymd(tomorrow) : null;
      await setDue(due);
      undo.push(() => setDue(it.due_date || null));
      if (to === "today") {
        const q = queues[it.project_id] || (queues[it.project_id] = await db.getQueue(it.project_id));
        if (!q.some(x => x.item_id === it.id)) {
          const row = await db.addToQueue(it.project_id, isTest ? "test" : "issue", it.id, q.length ? Math.max(...q.map(x => x.position || 0)) + 1 : 0);
          q.push(row);
          undo.push(() => db.removeFromQueue(row.id));
        }
      }
    }
    counts[to] = (counts[to] || 0) + 1;
  }
  const words = { today: "today", tomorrow: "tomorrow", later: "later", let_go: "let go" };
  return {
    summary: OPTIONS.map(([k]) => k).filter(k => counts[k]).map(k => `${counts[k]} ${words[k]}`).join(" · "),
    undo: async () => { for (const fn of undo.reverse()) await fn(); },
  };
}

export default function ReplanDialog({ items, mobile, onClose, onApplied }) {
  const [choice, setChoice] = useState(() => Object.fromEntries(items.map(it => [it.kind + it.id, "today"])));
  const [saving, setSaving] = useState(false);
  const set = (key, v) => setChoice(c => ({ ...c, [key]: v }));
  const allTo = (v) => setChoice(Object.fromEntries(items.map(it => [it.kind + it.id, v === "let_go" && it.kind === "test" ? "later" : v])));

  const done = async () => {
    setSaving(true);
    try { const res = await applyReplan(items, choice); onApplied(res); }
    catch (e) { console.error(e); alert("Couldn't replan: " + (e.message || e)); setSaving(false); }
  };

  return (<>
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.45)" }} />
    <div role="dialog" aria-label="Replan" style={{ position: "fixed", zIndex: 121, ...(mobile ? { left: 0, right: 0, bottom: 0, borderRadius: "16px 16px 0 0", maxHeight: "80vh" } : { left: "50%", top: "18%", transform: "translateX(-50%)", width: 440, borderRadius: 10, maxHeight: "70vh" }), background: "var(--side)", border: "1px solid var(--dim)", boxShadow: "0 14px 36px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", paddingBottom: mobile ? "env(safe-area-inset-bottom)" : 0 }}>
      <div style={{ padding: "14px 16px 10px" }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>Replan {items.length} {items.length === 1 ? "task" : "tasks"}</div>
        <div style={{ fontSize: 12, color: "var(--sub)", marginTop: 3, lineHeight: 1.45 }}>Pick where each one goes. Nothing moves until you press Done.</div>
      </div>
      <div style={{ overflowY: "auto", padding: "0 16px" }}>
        {items.map(it => {
          const key = it.kind + it.id;
          return (<div key={key} style={{ display: "flex", alignItems: mobile ? "flex-start" : "center", flexDirection: mobile ? "column" : "row", gap: mobile ? 6 : 8, padding: "8px 0", borderTop: "1px solid var(--line2)" }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12.5, color: "var(--title)", width: mobile ? "100%" : "auto" }}>{it.title}</span>
            <span role="radiogroup" aria-label={it.title} style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {OPTIONS.filter(([k]) => !(k === "let_go" && it.kind === "test")).map(([k, l]) => {
                const on = choice[key] === k;
                return (<button key={k} role="radio" aria-checked={on} onClick={() => set(key, k)}
                  style={{ fontSize: 11, padding: "3px 8px", borderRadius: 5, border: `1px solid ${on ? "var(--dim)" : "var(--line)"}`, background: on ? "var(--line)" : "transparent", color: on ? "var(--text)" : k === "let_go" ? "var(--muted)" : "var(--sub)", cursor: "pointer", fontFamily: "inherit" }}>{l}</button>);
              })}
            </span>
          </div>);
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
        <button onClick={() => allTo("tomorrow")} style={{ background: "none", border: "none", color: "var(--blue)", fontSize: 12, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>All to tomorrow</button>
        <span style={{ display: "flex", gap: 6 }}>
          <button onClick={onClose} style={{ padding: "6px 12px", borderRadius: 6, fontSize: 12, border: "1px solid var(--dim)", background: "transparent", color: "var(--soft)", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={done} disabled={saving} style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: "none", background: "var(--title)", color: "var(--surface)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: "inherit" }}>{saving ? "Saving…" : "Done"}</button>
        </span>
      </div>
    </div>
  </>);
}
