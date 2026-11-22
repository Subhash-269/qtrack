import { useState, useEffect } from "react";
import * as db from "../storage";
import { projectColor } from "./projectColors";
import { rangeWindow, bucketFocus, niceMax, fmtDuration, ymd } from "./focusChartData";

// Today's focus chart: focus time per hour (Today) or per day (Week, Month, Custom), split by
// project color, across all projects or a chosen few. Range and filter are remembered per device.
// See docs/proposals/today-focus-chart.

const C = { side: "var(--side)", raise: "var(--surface)", line: "var(--line)", line2: "var(--line2)", dim: "var(--dim)", muted: "var(--muted)", sub: "var(--sub)", soft: "var(--soft)", title: "var(--title)", text: "var(--text)" };
const KEY = "qtrack_focus_chart";
const RANGE_LABEL = { today: "Today", week: "Week", month: "Month", custom: "Custom" };
const AXIS = 18; // room under the bars for labels

const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ } };

const pill = { padding: "3px 9px", fontSize: 11.5, color: C.soft, border: `1px solid ${C.line}`, borderRadius: 6, background: "transparent", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontFamily: "inherit" };
const dateInput = { minWidth: 132, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 6, color: C.soft, fontSize: 11.5, padding: "3px 8px", colorScheme: "dark", fontFamily: "'SF Mono', monospace", outline: "none" };

export default function FocusChart({ projects, mobile, refreshKey }) {
  const [prefs, setPrefs] = useState(() => {
    const p = loadPrefs(), today = ymd(new Date());
    return { range: p.range || "today", projects: Array.isArray(p.projects) ? p.projects : null, from: p.from || today, to: p.to || today };
  });
  const [sessions, setSessions] = useState(null);
  const [err, setErr] = useState(null);
  const [hover, setHover] = useState(null);
  const [picking, setPicking] = useState(false);

  const update = (patch) => setPrefs(p => { const n = { ...p, ...patch }; savePrefs(n); return n; });
  const live = projects.filter(p => !p.archived_at);
  const liveIds = new Set(live.map(p => p.id));
  // Ticked projects that were since deleted or archived drop out; nothing left means "all"
  const chosen = prefs.projects ? prefs.projects.filter(id => liveIds.has(id)) : null;
  const selected = chosen && chosen.length ? chosen : null;

  const win = rangeWindow(prefs.range, { from: prefs.from, to: prefs.to });
  const startISO = win.start.toISOString(), endISO = win.end.toISOString();
  useEffect(() => {
    let alive = true;
    db.getFocusSessionsBetween(startISO, endISO)
      .then(rows => { if (alive) { setSessions(rows); setErr(null); } })
      .catch(e => { console.error("Focus chart:", e); if (alive) setErr(e.message || "Couldn't load focus time"); });
    return () => { alive = false; };
  }, [startISO, endISO, refreshKey]);

  // Archived projects stay out of the chart, like the rest of Today
  const rows = (sessions || []).filter(s => liveIds.has(s.project_id));
  const all = bucketFocus(rows, win);                               // for the picker's per-project times
  const b = selected ? bucketFocus(rows, win, { projectIds: selected }) : all;
  const top = niceMax(Math.max(0, ...b.slots.map(s => s.seconds)), b.hourly);
  const colorOf = Object.fromEntries(live.map(p => [p.id, projectColor(p)]));
  const nameOf = Object.fromEntries(live.map(p => [p.id, p.name]));
  const legend = Object.entries(b.byProject).filter(([, s]) => s > 0).sort((x, y) => y[1] - x[1]);
  const n = b.slots.length;
  const barMax = b.hourly ? 14 : n <= 7 ? 28 : n <= 31 ? 9 : 5;
  const gap = n > 40 ? 1 : n > 20 ? 2 : 4;
  const height = b.hourly ? 112 : 132;
  const days = win.days.length;
  const sub = [
    `${b.pomodoros} ${mobile ? "poms" : "pomodoros"}`,
    !b.hourly && `${fmtDay(win.days[0])} – ${fmtDay(win.days[days - 1])}`,
    !b.hourly && days > 7 && b.totalSeconds > 0 && `avg ${fmtDuration(b.totalSeconds / days)}/day`,
  ].filter(Boolean).join(" · ");
  const pickLabel = selected ? (selected.length === 1 ? nameOf[selected[0]] : `${selected.length} projects`) : mobile ? "All" : "All projects";

  const toggleProject = (id) => {
    const cur = selected || [];
    const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    update({ projects: next.length && next.length < live.length ? next : null });
  };

  const hovered = hover != null ? b.slots[hover] : null;

  const rangeButtons = (
    <div style={{ display: mobile ? "flex" : "inline-flex", border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden", marginTop: mobile ? 10 : 0 }}>
      {Object.keys(RANGE_LABEL).map((r, i) => (
        <button key={r} onClick={() => { update({ range: r }); setHover(null); }}
          style={{ flex: mobile ? 1 : "none", padding: "3px 9px", fontSize: 11.5, border: "none", borderLeft: i ? `1px solid ${C.line}` : "none", background: prefs.range === r ? C.line : "transparent", color: prefs.range === r ? C.text : C.sub, cursor: "pointer", fontFamily: "inherit" }}>{RANGE_LABEL[r]}</button>
      ))}
    </div>
  );

  const picker = (
    <span style={{ position: "relative" }}>
      <button onClick={() => setPicking(v => !v)} style={pill} aria-expanded={picking}>
        {selected && selected.length > 1 && <span style={{ display: "inline-flex", gap: 2 }}>{selected.slice(0, 4).map(id => <i key={id} style={{ width: 6, height: 6, borderRadius: "50%", background: colorOf[id] }} />)}</span>}
        {pickLabel}<span style={{ fontSize: 9, color: C.muted }}>▾</span>
      </button>
      {picking && <>
        <div onClick={() => setPicking(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
        <div role="menu" style={{ position: "absolute", right: 0, top: 28, width: 230, zIndex: 41, background: C.side, border: `1px solid ${C.dim}`, borderRadius: 8, padding: 6, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", maxHeight: 320, overflowY: "auto" }}>
          <Option on={!selected} onClick={() => update({ projects: null })} label="All projects" />
          <div style={{ borderTop: `1px solid ${C.line}`, margin: "4px 2px" }} />
          {live.map(p => <Option key={p.id} on={!!selected?.includes(p.id)} onClick={() => toggleProject(p.id)} color={colorOf[p.id]} label={p.name} value={all.byProject[p.id] ? fmtDuration(all.byProject[p.id]) : "—"} />)}
        </div>
      </>}
    </span>
  );

  return (
    <div style={{ background: C.raise, border: `1px solid ${C.line}`, borderRadius: 8, padding: "12px 14px", minWidth: 0 }}>
      {/* Header: total on the left, filter and range on the right */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6 }}>Focus</span>
        {!mobile && <><span style={totalStyle}>{sessions ? fmtDuration(b.totalSeconds) : "–"}</span><span style={{ fontSize: 12, color: C.muted }}>{sessions ? sub : ""}</span></>}
        <span style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", alignSelf: "center" }}>{picker}{!mobile && rangeButtons}</span>
      </div>
      {mobile && <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}><span style={totalStyle}>{sessions ? fmtDuration(b.totalSeconds) : "–"}</span><span style={{ fontSize: 12, color: C.muted }}>{sessions ? sub : ""}</span></div>}
      {mobile && rangeButtons}

      {prefs.range === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          <input type="date" value={prefs.from} max={prefs.to} onChange={e => e.target.value && update({ from: e.target.value })} style={dateInput} aria-label="From" />
          <span style={{ color: C.muted, fontSize: 11 }}>→</span>
          <input type="date" value={prefs.to} min={prefs.from} max={ymd(new Date())} onChange={e => e.target.value && update({ to: e.target.value })} style={dateInput} aria-label="To" />
        </div>
      )}

      {/* Bars */}
      <div onMouseLeave={() => setHover(null)} style={{ position: "relative", height, marginTop: 14, display: "flex", alignItems: "flex-end", gap, paddingBottom: AXIS }}>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: AXIS, borderTop: `1px solid ${C.line}` }} />
        {[top / 2, top].map(g => (
          <div key={g} style={{ position: "absolute", left: 0, right: 0, bottom: AXIS + (g / top) * (height - AXIS - 4), borderTop: `1px dashed ${C.line2}` }}>
            <span style={{ position: "absolute", right: 0, top: -13, fontSize: 9.5, color: C.muted, fontFamily: "'SF Mono', monospace" }}>{fmtDuration(g)}</span>
          </div>
        ))}
        {err && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12, color: "var(--pink)" }}>{err}</div>}
        {sessions && !err && b.totalSeconds === 0 && <div style={{ position: "absolute", left: 0, right: 0, top: "35%", textAlign: "center", fontSize: 12, color: C.muted }}>{prefs.range === "today" ? "No focus yet today." : "No focus in this range."}</div>}
        {b.slots.map((s, i) => {
          const segs = Object.entries(s.byProject).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
          return (
            <div key={s.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(h => (h === i ? null : i))}
              style={{ flex: 1, minWidth: 0, height: "100%", position: "relative", display: "flex", flexDirection: "column-reverse", alignItems: "center", cursor: s.seconds ? "default" : "auto" }}>
              {s.isNow && b.hourly && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(new Date().getMinutes() / 60) * 100}%`, borderLeft: "1px solid rgba(226,75,74,0.35)" }} />}
              {segs.map(([pid, v], j) => (
                <i key={pid} style={{ display: "block", width: "100%", maxWidth: barMax, height: Math.max(2, (Math.min(v, top) / top) * (height - AXIS - 4)), background: colorOf[pid] || C.sub, opacity: hover == null || hover === i ? 1 : 0.55, marginBottom: j ? 1 : 0, borderRadius: j === segs.length - 1 ? "3px 3px 1px 1px" : 1, flexShrink: 0 }} />
              ))}
              {s.label && <span style={{ position: "absolute", bottom: -AXIS + 1, left: "50%", transform: "translateX(-50%)", fontSize: 9.5, color: s.isNow && !b.hourly ? C.soft : C.muted, fontFamily: "'SF Mono', monospace", whiteSpace: "nowrap" }}>{s.label}</span>}
            </div>
          );
        })}
        {hovered && hovered.seconds > 0 && (
          <div style={{ position: "absolute", bottom: height - 8, left: `${Math.min(80, Math.max(0, ((hover + 0.5) / n) * 100 - 10))}%`, zIndex: 3, background: "var(--raise2)", border: `1px solid ${C.dim}`, borderRadius: 6, padding: "6px 9px", fontSize: 11, color: C.text, whiteSpace: "nowrap", boxShadow: "0 6px 18px rgba(0,0,0,0.4)", lineHeight: 1.5, pointerEvents: "none" }}>
            <span style={{ display: "block", fontSize: 10, color: C.muted }}>{hovered.title}</span>
            <b style={{ fontWeight: 500, fontFamily: "'SF Mono', monospace" }}>{fmtDuration(hovered.seconds)}</b>
            {" · "}{Object.entries(hovered.byProject).sort((x, y) => y[1] - x[1]).map(([pid, v]) => `${nameOf[pid] || "Project"} ${fmtDuration(v)}`).join(", ")}
          </div>
        )}
      </div>

      {legend.length > 0 && (
        <div style={{ display: "flex", gap: mobile ? 10 : 14, marginTop: 10, flexWrap: "wrap" }}>
          {legend.map(([pid, v]) => (
            <span key={pid} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: C.sub }}>
              <i style={{ width: 7, height: 7, borderRadius: 2, background: colorOf[pid] }} />{nameOf[pid]}
              {!mobile && <em style={{ fontStyle: "normal", fontFamily: "'SF Mono', monospace", color: C.soft, fontSize: 10.5 }}>{fmtDuration(v)}</em>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const totalStyle = { fontFamily: "'SF Mono', monospace", fontSize: 20, fontWeight: 500, letterSpacing: -0.3, color: "var(--text)" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (d) => `${MON[d.getMonth()]} ${d.getDate()}`;

function Option({ on, onClick, label, color, value }) {
  return (
    <button role="menuitemcheckbox" aria-checked={on} onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px", borderRadius: 5, fontSize: 12, color: on ? C.text : C.soft, background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}
      onMouseEnter={e => { e.currentTarget.style.background = C.line2; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
      <span style={{ width: 13, height: 13, borderRadius: 3, border: `1px solid ${on ? C.title : C.dim}`, background: on ? C.title : "transparent", display: "grid", placeItems: "center", fontSize: 9, color: "var(--bg)", flexShrink: 0 }}>{on ? "✓" : ""}</span>
      {color && <i style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {value && <em style={{ fontStyle: "normal", fontFamily: "'SF Mono', monospace", fontSize: 10.5, color: C.muted }}>{value}</em>}
    </button>
  );
}
