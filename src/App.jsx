import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import * as db from "./storage";

const SHORT_DATE = (d) => { if (!d) return "—"; const dt = new Date(d); const diff = Date.now() - dt.getTime(); if (diff < 60000) return "just now"; if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`; return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
const FMT = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const CATEGORIES = ["extract", "transform", "load", "validate", "utils", "config", "api", "model", "other"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const ISSUE_STATUSES = ["open", "in_progress", "fixed", "verified", "wont_fix"];
const ISSUE_TYPES = ["bug", "todo"];
const DUR = { work: 25 * 60, short_break: 5 * 60, long_break: 15 * 60 };
const PC = { critical: { bg: "#2D0A0A", text: "#F09595", border: "#501313" }, high: { bg: "#2A1209", text: "#F0997B", border: "#4A1B0C" }, medium: { bg: "#261A04", text: "#FAC775", border: "#412402" }, low: { bg: "#0E1A08", text: "#C0DD97", border: "#173404" } };
const TC = { not_run: { bg: "#1A1A18", text: "#B4B2A9", border: "#2C2C2A" }, pass: { bg: "#0E1A08", text: "#97C459", border: "#173404" }, fail: { bg: "#2D0A0A", text: "#F09595", border: "#501313" }, blocked: { bg: "#261A04", text: "#FAC775", border: "#412402" } };
const SC = { work: "#E24B4A", short_break: "#5DCAA5", long_break: "#378ADD" };

const Badge = ({ label, colors, small }) => (<span style={{ display: "inline-block", fontSize: small ? 10 : 11, padding: small ? "1px 6px" : "2px 8px", borderRadius: 4, fontWeight: 500, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, whiteSpace: "nowrap" }}>{label.replace(/_/g, " ")}</span>);
const Pill = ({ children, active, onClick }) => (<button onClick={onClick} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: active ? 500 : 400, background: active ? "#2C2C2A" : "transparent", color: active ? "#F1EFE8" : "#888780", border: active ? "1px solid #444441" : "1px solid transparent", cursor: "pointer" }}>{children}</button>);
const Btn = ({ children, onClick, primary, small, style: s }) => (<button onClick={onClick} style={{ padding: small ? "4px 10px" : "6px 14px", borderRadius: 6, fontSize: small ? 11 : 12, fontWeight: 500, background: primary ? "#D3D1C7" : "transparent", color: primary ? "#1A1A18" : "#B4B2A9", border: primary ? "none" : "1px solid #444441", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, ...s }}>{children}</button>);
const Input = ({ value, onChange, placeholder, mono, style: s }) => (<input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13, background: "#1A1A18", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", width: "100%", fontFamily: mono ? "'SF Mono', monospace" : "inherit", boxSizing: "border-box", ...s }} />);
const Select = ({ value, onChange, options, style: s }) => (<select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "#1A1A18", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", cursor: "pointer", ...s }}>{options.map((o) => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o.replace(/_/g, " ") : o.label}</option>)}</select>);
const TextArea = ({ value, onChange, placeholder, rows }) => (<textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows || 2} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13, background: "#1A1A18", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />);
const EmptyState = ({ icon, title, sub, action, onAction }) => (<div style={{ textAlign: "center", padding: "48px 24px", color: "#888780" }}><div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>{icon}</div><div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, color: "#B4B2A9" }}>{title}</div><div style={{ fontSize: 12, marginBottom: 16, maxWidth: 280, margin: "0 auto 16px" }}>{sub}</div>{action && <Btn primary onClick={onAction}>+ {action}</Btn>}</div>);
const MetricCard = ({ label, value, sub, color }) => (<div style={{ background: "#1A1A18", borderRadius: 8, padding: "14px 16px", border: "1px solid #2C2C2A" }}><div style={{ fontSize: 11, color: "#888780", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 500, color: color || "#F1EFE8", fontFamily: "'SF Mono', monospace" }}>{value}</div>{sub && <div style={{ fontSize: 11, color: "#5F5E5A", marginTop: 2 }}>{sub}</div>}</div>);

function Ring({ size, stroke, timeLeft, totalTime, color }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = totalTime > 0 ? timeLeft / totalTime : 0;
  return (<svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#2C2C2A" strokeWidth={stroke} /><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - p)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s linear" }} /></svg>);
}

export default function App({ session }) {
  const [projects, setProjects] = useState([]); const [files, setFiles] = useState([]); const [issues, setIssues] = useState([]); const [testCases, setTestCases] = useState([]); const [links, setLinks] = useState([]); const [activeProjectId, setActiveProjectId] = useState(null);
  const [view, setView] = useState("dashboard"); const [modal, setModal] = useState(null); const [linkModal, setLinkModal] = useState(null);
  const [filterType, setFilterType] = useState("all"); const [filterFile, setFilterFile] = useState("all"); const [filterPriority, setFilterPriority] = useState("all"); const [searchQ, setSearchQ] = useState(""); const [expandedTC, setExpandedTC] = useState(null);
  const [loading, setLoading] = useState(true); const [editingProjectId, setEditingProjectId] = useState(null); const [editingProjectName, setEditingProjectName] = useState(""); const [todaySessions, setTodaySessions] = useState([]); const [allSessions, setAllSessions] = useState([]);
  const [tmr, setTmr] = useState({ st: "idle", left: DUR.work, total: DUR.work, type: "work", done: 0, tType: null, tId: null });
  const [notes, setNotes] = useState([]); const [columns, setColumns] = useState([]); const [cards, setCards] = useState([]);
  const tRef = useRef(null); const initRef = useRef(false);

  useEffect(() => {
    if (tmr.st === "running") { tRef.current = setInterval(() => { setTmr(p => { if (p.left <= 1) { clearInterval(tRef.current); finishSession(p); return p; } return { ...p, left: p.left - 1 }; }); }, 1000); } else { if (tRef.current) clearInterval(tRef.current); }
    return () => { if (tRef.current) clearInterval(tRef.current); };
  }, [tmr.st]);

  useEffect(() => { if (tmr.st === "running") document.title = `${FMT(tmr.left)} — ${tmr.type === "work" ? "Focus" : "Break"}`; else document.title = "QTrack"; }, [tmr.left, tmr.st, tmr.type]);

  const finishSession = async (p) => {
    try { if (Notification.permission === "granted") new Notification(p.type === "work" ? "Focus done!" : "Break over!", { body: p.type === "work" ? "Time for a break." : "Ready to focus?" }); } catch {}
    try { const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 800; g.gain.value = 0.3; o.start(); setTimeout(() => { o.frequency.value = 1000; }, 150); setTimeout(() => { o.stop(); ctx.close(); }, 400); } catch {}
    if (p.type === "work") { try { await db.saveFocusSession(activeProjectId, p.tType === "issue" ? p.tId : null, p.tType === "test" ? p.tId : null, p.type, p.total); loadToday(); } catch (e) { console.error(e); } }
    const nd = p.type === "work" ? p.done + 1 : p.done;
    let nt, nc;
    if (p.type === "work") { nt = nd >= 4 ? "long_break" : "short_break"; nc = nd >= 4 ? 0 : nd; } else { nt = "work"; nc = p.type === "long_break" ? 0 : nd; }
    setTmr({ st: "idle", left: DUR[nt], total: DUR[nt], type: nt, done: nc, tType: p.tType, tId: p.tId });
  };

  const startTmr = (tt, ti) => { if (Notification.permission === "default") Notification.requestPermission(); setTmr(p => ({ ...p, st: "running", tType: tt || p.tType, tId: ti || p.tId })); };
  const pauseTmr = () => setTmr(p => ({ ...p, st: "paused" }));
  const resumeTmr = () => setTmr(p => ({ ...p, st: "running" }));
  const resetTmr = () => { if (tmr.st !== "idle" && !confirm("Stop the current timer? Progress on this session will be lost.")) return; setTmr({ st: "idle", left: DUR.work, total: DUR.work, type: "work", done: 0, tType: null, tId: null }); };
  const focusOn = (type, id) => { if (tmr.st !== "idle" && !confirm("Switch task? The current timer will reset.")) return; setTmr({ st: "running", left: DUR.work, total: DUR.work, type: "work", done: 0, tType: type, tId: id }); setView("focus"); if (Notification.permission === "default") Notification.requestPermission(); };

  useEffect(() => { if (!initRef.current) { initRef.current = true; loadProjects(); } }, []);
  useEffect(() => { if (activeProjectId) { loadData(activeProjectId); loadToday(); } }, [activeProjectId]);

  async function loadProjects() { setLoading(true); try { const p = await db.getProjects(); setProjects(p); if (p.length > 0) setActiveProjectId(p[0].id); else { const n = await db.createProject("My first project"); setProjects([n]); setActiveProjectId(n.id); } } catch (e) { console.error(e); } setLoading(false); }
  async function loadData(pid) { try { const [f, i, t] = await Promise.all([db.getFiles(pid), db.getIssues(pid), db.getTestCases(pid)]); setFiles(f); setIssues(i); setTestCases(t); try { setLinks(await db.getLinks(pid)); } catch { setLinks([]); } try { setNotes(await db.getNotes(pid)); } catch { setNotes([]); } try { const [co, ca] = await Promise.all([db.getColumns(pid), db.getCards(pid)]); setColumns(co); setCards(ca); } catch { setColumns([]); setCards([]); } } catch (e) { console.error(e); } }
  async function loadToday() { if (!activeProjectId) return; try { setTodaySessions(await db.getTodaySessions(activeProjectId)); } catch { setTodaySessions([]); } try { setAllSessions(await db.getAllSessions(activeProjectId)); } catch { setAllSessions([]); } }
  async function reload() { if (activeProjectId) await loadData(activeProjectId); }

  const fm = useMemo(() => Object.fromEntries(files.map(f => [f.id, f])), [files]);
  const fi = useMemo(() => { let r = issues; if (filterType !== "all") r = r.filter(i => i.type === filterType); if (filterFile !== "all") r = r.filter(i => i.file_id === filterFile); if (filterPriority !== "all") r = r.filter(i => i.priority === filterPriority); if (searchQ) r = r.filter(i => i.title.toLowerCase().includes(searchQ.toLowerCase())); return r.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)); }, [issues, filterType, filterFile, filterPriority, searchQ]);
  const ft = useMemo(() => { let r = testCases; if (filterFile !== "all") r = r.filter(t => t.file_id === filterFile); if (searchQ) r = r.filter(t => t.title.toLowerCase().includes(searchQ.toLowerCase())); return r; }, [testCases, filterFile, searchQ]);

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#111110", color: "#888780" }}>Loading...</div>;

  const stats = { ob: issues.filter(i => i.type === "bug" && !["fixed","verified","wont_fix"].includes(i.status)).length, ot: issues.filter(i => i.type === "todo" && !["fixed","verified","wont_fix"].includes(i.status)).length, tp: testCases.filter(t => t.status === "pass").length, tt: testCases.length, fc: files.length, cr: issues.filter(i => i.priority === "critical" && !["fixed","verified","wont_fix"].includes(i.status)).length };
  const tw = todaySessions.filter(s => s.session_type === "work"); const tfm = Math.round(tw.reduce((a, s) => a + s.duration_seconds, 0) / 60);

  const nav = [{ id: "dashboard", l: "Dashboard", ic: "◫" }, { id: "focus", l: "Focus", ic: "◎", cnt: tmr.st !== "idle" ? "●" : 0 }, { id: "issues", l: "Issues", ic: "◉", cnt: stats.ob + stats.ot }, { id: "tests", l: "Test cases", ic: "▷", cnt: stats.tt }, { id: "files", l: "Files", ic: "⊞", cnt: stats.fc }, { id: "notes", l: "Notes", ic: "☰", cnt: notes.length || 0 }, { id: "board", l: "Board", ic: "▦", cnt: cards.length || 0 }];

  const addProject = async (n) => { const p = await db.createProject(n); setProjects([...projects, p]); setActiveProjectId(p.id); setModal(null); };
  const renameProject = async (id, n) => { if (!n.trim()) return; await db.renameProject(id, n.trim()); setProjects(projects.map(p => p.id === id ? { ...p, name: n.trim() } : p)); setEditingProjectId(null); };
  const delProject = async (id) => { if (projects.length <= 1 || !confirm("Delete project and all data?")) return; await db.deleteProject(id); const r = projects.filter(p => p.id !== id); setProjects(r); if (activeProjectId === id) setActiveProjectId(r[0]?.id); };
  const addFile = async (n, c) => { await db.createFile(activeProjectId, n, c); await reload(); setModal(null); };
  const addIssue = async (fid, t, ty, pr, d, ep, dd, rn, bn) => { await db.createIssue(activeProjectId, fid, t, ty, pr, d, ep, dd, rn, bn); await reload(); setModal(null); };
  const addTest = async (fid, t, pre, st, ep, dd, rn, bn) => { await db.createTestCase(activeProjectId, fid, t, pre, st, ep, dd, rn, bn); await reload(); setModal(null); };

  // Count completed pomodoros per task
  const pomCount = (type, id) => allSessions.filter(s => s.session_type === "work" && (type === "issue" ? s.issue_id === id : s.test_case_id === id)).length;
  const fmtDue = (d) => { if (!d) return null; const dt = new Date(d + "T00:00:00"); const today = new Date(); today.setHours(0,0,0,0); const diff = Math.ceil((dt - today) / 86400000); if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, color: "#F09595" }; if (diff === 0) return { text: "Due today", color: "#FAC775" }; if (diff === 1) return { text: "Tomorrow", color: "#85B7EB" }; return { text: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }), color: "#5F5E5A" }; };
  const updIS = async (id, s) => { await db.updateIssueStatus(id, s); await reload(); };
  const updTS = async (id, s) => { await db.updateTestStatus(id, s); await reload(); };
  const delI = async (id) => { await db.deleteIssue(id); await reload(); };
  const delT = async (id) => { await db.deleteTestCase(id); await reload(); };
  const delF = async (id) => { await db.deleteFile(id); await reload(); };
  const editIssue = async (id, fields) => { await db.updateIssue(id, fields); await reload(); setModal(null); };
  const editTest = async (id, fields) => { await db.updateTestCase(id, fields); await reload(); setModal(null); };
  const lnk = async (iid, tid) => { await db.linkIssueToTest(iid, tid); await reload(); };
  const ulnk = async (iid, tid) => { await db.unlinkIssueFromTest(iid, tid); await reload(); };

  const taskName = tmr.tType === "issue" ? issues.find(i => i.id === tmr.tId)?.title : tmr.tType === "test" ? testCases.find(t => t.id === tmr.tId)?.title : null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#111110", color: "#F1EFE8", fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 13 }}>
      <div style={{ width: 220, borderRight: "1px solid #2C2C2A", display: "flex", flexDirection: "column", flexShrink: 0, background: "#161615" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #2C2C2A" }}><div style={{ fontSize: 15, fontWeight: 500, letterSpacing: -0.5, display: "flex", alignItems: "center", gap: 8 }}><span style={{ background: "#D3D1C7", color: "#111110", width: 22, height: 22, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>Q</span>QTrack</div></div>
        <div style={{ padding: "12px 10px", flex: 1 }}>
          {nav.map(n => (<button key={n.id} onClick={() => { setView(n.id); setSearchQ(""); setFilterType("all"); setFilterFile("all"); setFilterPriority("all"); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 6, border: "none", background: view === n.id ? "#2C2C2A" : "transparent", color: view === n.id ? "#F1EFE8" : "#888780", cursor: "pointer", fontSize: 13, textAlign: "left", marginBottom: 2 }}><span style={{ fontSize: 14, width: 20, textAlign: "center", opacity: 0.7 }}>{n.ic}</span><span style={{ flex: 1 }}>{n.l}</span>{n.cnt ? <span style={{ fontSize: 10, background: n.id === "focus" ? "#2D0A0A" : "#2C2C2A", padding: "1px 6px", borderRadius: 4, color: n.id === "focus" ? "#F09595" : "#888780" }}>{n.cnt}</span> : null}</button>))}
        </div>
        {tmr.st !== "idle" && view !== "focus" && (<div onClick={() => setView("focus")} style={{ margin: "0 10px 10px", padding: "10px 12px", background: "#1A1A18", border: "1px solid #2C2C2A", borderRadius: 8, cursor: "pointer" }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ring size={32} stroke={3} timeLeft={tmr.left} totalTime={tmr.total} color={SC[tmr.type]} /><div><div style={{ fontSize: 14, fontWeight: 500, fontFamily: "'SF Mono', monospace", color: SC[tmr.type] }}>{FMT(tmr.left)}</div><div style={{ fontSize: 10, color: "#5F5E5A" }}>{tmr.type === "work" ? "Focusing" : "Break"}{tmr.st === "paused" ? " (paused)" : ""}</div></div></div>{taskName && <div style={{ fontSize: 10, color: "#888780", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{taskName}</div>}</div>)}
        <div style={{ padding: "12px 10px", borderTop: "1px solid #2C2C2A" }}>
          <div style={{ fontSize: 10, color: "#5F5E5A", padding: "0 10px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>Projects</div>
          {projects.map(p => editingProjectId === p.id ? (<div key={p.id} style={{ padding: "3px 6px", marginBottom: 1 }}><input autoFocus value={editingProjectName} onChange={e => setEditingProjectName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") renameProject(p.id, editingProjectName); if (e.key === "Escape") setEditingProjectId(null); }} onBlur={() => renameProject(p.id, editingProjectName)} style={{ width: "100%", padding: "3px 6px", borderRadius: 4, fontSize: 12, background: "#111110", color: "#F1EFE8", border: "1px solid #444441", outline: "none", boxSizing: "border-box" }} /></div>) : (<div key={p.id} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 1 }}><button onClick={() => setActiveProjectId(p.id)} onDoubleClick={() => { setEditingProjectId(p.id); setEditingProjectName(p.name); }} style={{ flex: 1, padding: "6px 10px", borderRadius: 5, border: "none", background: activeProjectId === p.id ? "#2C2C2A" : "transparent", color: activeProjectId === p.id ? "#F1EFE8" : "#888780", cursor: "pointer", fontSize: 12, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</button>{projects.length > 1 && <button onClick={() => delProject(p.id)} style={{ background: "none", border: "none", color: "#444441", cursor: "pointer", fontSize: 11, padding: "4px", opacity: 0.5 }} onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = "#F09595"; }} onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = "#444441"; }}>✕</button>}</div>))}
          <button onClick={() => setModal({ type: "project" })} style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", padding: "6px 10px", borderRadius: 5, border: "none", background: "transparent", color: "#5F5E5A", cursor: "pointer", fontSize: 11 }}>+ New project</button>
        </div>
        <div style={{ padding: "8px 10px", borderTop: "1px solid #2C2C2A" }}><button onClick={() => supabase.auth.signOut()} style={{ display: "block", width: "100%", padding: "6px 10px", borderRadius: 5, border: "none", background: "transparent", color: "#5F5E5A", cursor: "pointer", fontSize: 11, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Sign out ({session.user.email})</button></div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 28px", borderBottom: "1px solid #2C2C2A", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{nav.find(n => n.id === view)?.l || ""}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {(view === "issues" || view === "tests") && <Input value={searchQ} onChange={setSearchQ} placeholder="Search..." style={{ width: 180, fontSize: 12 }} />}
            {view === "issues" && <Btn primary onClick={() => setModal({ type: "issue" })}>+ Issue</Btn>}
            {view === "tests" && <Btn primary onClick={() => setModal({ type: "test" })}>+ Test case</Btn>}
            {view === "files" && <Btn primary onClick={() => setModal({ type: "file" })}>+ File</Btn>}
          </div>
        </div>
        <div style={{ flex: 1, padding: "24px 28px", overflowY: "auto" }}>
          {view === "dashboard" && <Dashboard stats={stats} issues={issues} tests={testCases} files={files} fm={fm} onNav={(v, f) => { setView(v); if (f) setFilterFile(f); }} tfm={tfm} tw={tw} />}
          {view === "focus" && <FocusView tmr={tmr} taskName={taskName} issues={issues} tests={testCases} start={startTmr} pause={pauseTmr} resume={resumeTmr} reset={resetTmr} focusOn={focusOn} tfm={tfm} tw={tw} />}
          {view === "issues" && <IssuesView issues={fi} files={files} fm={fm} filterType={filterType} setFilterType={setFilterType} filterFile={filterFile} setFilterFile={setFilterFile} filterPriority={filterPriority} setFilterPriority={setFilterPriority} updS={updIS} del={delI} onAdd={() => setModal({ type: "issue" })} onEdit={i => setModal({ type: "issue", edit: i })} links={links} tests={testCases} ulnk={ulnk} openLink={id => setLinkModal({ issueId: id })} focusOn={focusOn} pomCount={pomCount} fmtDue={fmtDue} />}
          {view === "tests" && <TestsView tests={ft} files={files} fm={fm} filterFile={filterFile} setFilterFile={setFilterFile} exp={expandedTC} setExp={setExpandedTC} updS={updTS} del={delT} onAdd={() => setModal({ type: "test" })} onEdit={t => setModal({ type: "test", edit: t })} links={links} allIssues={issues} ulnk={ulnk} openLink={id => setLinkModal({ testId: id })} focusOn={focusOn} pomCount={pomCount} fmtDue={fmtDue} />}
          {view === "files" && <FilesView files={files} issues={issues} tests={testCases} del={delF} onAdd={() => setModal({ type: "file" })} onNav={(v, f) => { setView(v); setFilterFile(f); }} />}
          {view === "notes" && <NotesView notes={notes} issues={issues} files={files} projectId={activeProjectId} reload={reload} />}
          {view === "board" && <BoardView columns={columns} cards={cards} projectId={activeProjectId} reload={reload} issues={issues} files={files} addIssue={addIssue} />}
        </div>
      </div>

      {modal && <Modal modal={modal} files={files} onClose={() => setModal(null)} addProject={addProject} addFile={addFile} addIssue={addIssue} addTest={addTest} editIssue={editIssue} editTest={editTest} usedRepos={[...new Set([...issues, ...testCases].map(x => x.repo_name).filter(Boolean))]} usedBranches={[...new Set([...issues, ...testCases].map(x => x.branch_name).filter(Boolean))]} />}
      {linkModal && <LinkModal lm={linkModal} issues={issues} tests={testCases} links={links} lnk={lnk} onClose={() => setLinkModal(null)} />}
    </div>
  );
}

function FocusView({ tmr, taskName, issues, tests, start, pause, resume, reset, focusOn, tfm, tw }) {
  const [picking, setPicking] = useState(false);
  const color = SC[tmr.type];
  const tasks = [...issues.map(i => ({ id: i.id, t: "issue", l: i.title })), ...tests.map(t => ({ id: t.id, t: "test", l: t.title }))];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 20 }}>
      <div style={{ position: "relative", width: 220, height: 220, marginBottom: 20 }}>
        <Ring size={220} stroke={8} timeLeft={tmr.left} totalTime={tmr.total} color={color} />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 40, fontWeight: 500, fontFamily: "'SF Mono', monospace", color, letterSpacing: -1 }}>{FMT(tmr.left)}</div>
          <div style={{ fontSize: 12, color: "#888780", marginTop: 2 }}>{tmr.type === "work" ? "Focus time" : tmr.type === "short_break" ? "Short break" : "Long break"}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>{[0,1,2,3].map(i => (<div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < tmr.done ? "#E24B4A" : "#2C2C2A" }} />))}</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        {tmr.st === "idle" && <Btn primary onClick={() => start()} style={{ padding: "10px 28px", fontSize: 14 }}>Start</Btn>}
        {tmr.st === "running" && <Btn onClick={pause} style={{ padding: "10px 28px", fontSize: 14 }}>Pause</Btn>}
        {tmr.st === "paused" && <Btn primary onClick={resume} style={{ padding: "10px 28px", fontSize: 14 }}>Resume</Btn>}
        {tmr.st !== "idle" && <Btn onClick={reset} style={{ padding: "10px 28px", fontSize: 14, color: "#5F5E5A" }}>Reset</Btn>}
      </div>
      <div style={{ background: "#1A1A18", border: "1px solid #2C2C2A", borderRadius: 8, padding: "12px 16px", width: 320, textAlign: "center", marginBottom: 24 }}>
        {taskName ? (<div><div style={{ fontSize: 10, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Focusing on</div><div style={{ fontSize: 13, fontWeight: 500 }}>{taskName}</div></div>) : (<div><div style={{ fontSize: 12, color: "#5F5E5A", marginBottom: 6 }}>No task selected</div><button onClick={() => setPicking(true)} style={{ background: "none", border: "1px dashed #444441", color: "#888780", cursor: "pointer", fontSize: 11, padding: "4px 12px", borderRadius: 4 }}>Pick a task</button></div>)}
      </div>
      {picking && (<div style={{ background: "#1A1A18", border: "1px solid #2C2C2A", borderRadius: 8, padding: 12, width: 320, maxHeight: 200, overflowY: "auto", marginBottom: 24 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 11, color: "#5F5E5A" }}>Pick a task</span><button onClick={() => setPicking(false)} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 11 }}>✕</button></div>{tasks.map(tk => (<div key={tk.id} role="button" onMouseDown={() => { focusOn(tk.t, tk.id); setPicking(false); }} style={{ padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, color: "#D3D1C7", marginBottom: 2 }} onMouseEnter={e => e.currentTarget.style.background = "#2C2C2A"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{tk.t === "issue" ? "◉" : "▷"} {tk.l}</div>))}</div>)}
      <div style={{ display: "flex", gap: 12, width: 320 }}>
        <div style={{ flex: 1, background: "#1A1A18", borderRadius: 8, padding: "12px 14px", border: "1px solid #2C2C2A" }}><div style={{ fontSize: 10, color: "#888780", textTransform: "uppercase", marginBottom: 4 }}>Today</div><div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'SF Mono', monospace", color: "#E24B4A" }}>{tw.length}</div><div style={{ fontSize: 10, color: "#5F5E5A" }}>sessions</div></div>
        <div style={{ flex: 1, background: "#1A1A18", borderRadius: 8, padding: "12px 14px", border: "1px solid #2C2C2A" }}><div style={{ fontSize: 10, color: "#888780", textTransform: "uppercase", marginBottom: 4 }}>Focus time</div><div style={{ fontSize: 20, fontWeight: 500, fontFamily: "'SF Mono', monospace", color: "#5DCAA5" }}>{tfm}</div><div style={{ fontSize: 10, color: "#5F5E5A" }}>minutes</div></div>
      </div>
    </div>
  );
}

function Dashboard({ stats, issues, tests, files, fm, onNav, tfm, tw }) {
  const pr = stats.tt > 0 ? Math.round((stats.tp / stats.tt) * 100) : 0;
  const branchColors = ["#E24B4A", "#378ADD", "#5DCAA5", "#D85A30", "#7F77DD", "#D4537E", "#BA7517", "#639922"];

  // Group issues by repo:branch
  const groups = {};
  issues.forEach(i => {
    const key = (i.repo_name && i.branch_name) ? `${i.repo_name} : ${i.branch_name}` : i.repo_name ? `${i.repo_name}` : i.branch_name ? `${i.branch_name}` : "";
    if (!groups[key]) groups[key] = [];
    groups[key].push(i);
  });

  // Sort groups: named ones first (sorted), unnamed last
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (!a && b) return 1;
    if (a && !b) return -1;
    return a.localeCompare(b);
  });

  const branchColorMap = {};
  let ci = 0;
  sortedKeys.forEach(k => { if (k) { branchColorMap[k] = branchColors[ci % branchColors.length]; ci++; } });

  return (
    <div>
      {/* Top metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        <MetricCard label="Open bugs" value={stats.ob} color={stats.ob > 0 ? "#F09595" : "#97C459"} sub={stats.cr > 0 ? `${stats.cr} critical` : "none critical"} />
        <MetricCard label="Open to-dos" value={stats.ot} color="#85B7EB" />
        <MetricCard label="Test pass rate" value={stats.tt > 0 ? `${pr}%` : "—"} color={pr >= 80 ? "#97C459" : pr >= 50 ? "#FAC775" : "#F09595"} sub={`${stats.tp}/${stats.tt} passing`} />
        <MetricCard label="Files" value={stats.fc} color="#B4B2A9" />
        <MetricCard label="Today's focus" value={`${tfm}m`} color="#E24B4A" sub={`${tw.length} sessions`} />
      </div>

      {/* Repo+branch sections */}
      {sortedKeys.length > 1 || (sortedKeys.length === 1 && sortedKeys[0] !== "") ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: "#B4B2A9" }}>Issues by repo & branch</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {sortedKeys.map(key => {
              const gi = groups[key];
              const open = gi.filter(i => !["fixed","verified","wont_fix"].includes(i.status));
              const bugs = open.filter(i => i.type === "bug").length;
              const todos = open.filter(i => i.type === "todo").length;
              const fixed = gi.filter(i => ["fixed","verified"].includes(i.status)).length;
              const color = branchColorMap[key] || "#888780";

              // Hot files for this group
              const fic = {};
              open.forEach(i => { fic[i.file_id] = (fic[i.file_id] || 0) + 1; });
              const hot = Object.entries(fic).sort((a, b) => b[1] - a[1]).slice(0, 3);

              // Recent for this group
              const recent = [...gi].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);

              return (
                <div key={key || "__none"} style={{ background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, padding: "14px 16px", borderLeft: key ? `3px solid ${color}` : "3px solid #444441", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 12, fontWeight: 500, color: key ? color : "#5F5E5A" }}>{key || "No repo/branch"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {bugs > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#2D0A0A", color: "#F09595" }}>{bugs} bug{bugs !== 1 ? "s" : ""}</span>}
                      {todos > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#0A1929", color: "#85B7EB" }}>{todos} todo{todos !== 1 ? "s" : ""}</span>}
                      {fixed > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "#081F12", color: "#5DCAA5" }}>{fixed} fixed</span>}
                    </div>
                  </div>

                  {/* Hot files */}
                  {hot.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Hot files</div>
                      {hot.map(([fid, c]) => (
                        <div key={fid} onClick={() => onNav("issues", fid)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", cursor: "pointer", fontSize: 11 }}>
                          <span style={{ fontFamily: "'SF Mono', monospace", flex: 1, color: "#D3D1C7" }}>{fm[fid]?.name || "?"}</span>
                          <div style={{ display: "flex", gap: 1 }}>{Array.from({ length: Math.min(c, 5) }).map((_, j) => (<div key={j} style={{ width: 4, height: 12, borderRadius: 1, background: color, opacity: 0.4 + (j / c) * 0.6 }} />))}</div>
                          <span style={{ color: "#888780", minWidth: 12, textAlign: "right" }}>{c}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recent issues */}
                  <div style={{ fontSize: 10, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Recent</div>
                  {recent.map(i => (
                    <div key={i.id} onClick={() => onNav("issues", i.file_id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", cursor: "pointer", fontSize: 11 }}>
                      <span style={{ color: i.type === "bug" ? "#F09595" : "#85B7EB" }}>{i.type === "bug" ? "◉" : "○"}</span>
                      <span style={{ flex: 1, color: "#D3D1C7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
                      <span style={{ fontSize: 10, color: PC[i.priority]?.text }}>{i.priority}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Fallback if no repo/branch data - show simple recent + hot */
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "#B4B2A9" }}>Recent issues</div>
            {issues.length === 0 && <div style={{ fontSize: 12, color: "#5F5E5A", padding: 16 }}>No issues yet</div>}
            {[...issues].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).map(i => (
              <div key={i.id} onClick={() => onNav("issues", i.file_id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: "#161615", border: "1px solid #1A1A18" }} onMouseEnter={e => e.currentTarget.style.background = "#1A1A18"} onMouseLeave={e => e.currentTarget.style.background = "#161615"}>
                <Badge label={i.type} colors={i.type === "bug" ? PC.critical : { bg: "#0A1929", text: "#85B7EB", border: "#042C53" }} small />
                <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
                <Badge label={i.priority} colors={PC[i.priority]} small />
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "#B4B2A9" }}>Hot files</div>
            {(() => { const fic = {}; issues.filter(i => !["fixed","verified","wont_fix"].includes(i.status)).forEach(i => { fic[i.file_id] = (fic[i.file_id] || 0) + 1; }); return Object.entries(fic).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([fid, c]) => (
              <div key={fid} onClick={() => onNav("issues", fid)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: "#161615", border: "1px solid #1A1A18" }}>
                <span style={{ fontSize: 12, fontFamily: "'SF Mono', monospace", flex: 1, color: "#D3D1C7" }}>{fm[fid]?.name || "?"}</span>
                <span style={{ fontSize: 11, color: "#888780" }}>{c}</span>
              </div>
            )); })()}
          </div>
        </div>
      )}

      {/* Recently resolved */}
      {(() => {
        const resolved = issues.filter(i => ["fixed","verified","wont_fix"].includes(i.status)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
        if (resolved.length === 0) return null;
        return (<div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "#5DCAA5" }}>Recently resolved</span>
            <span style={{ fontSize: 11, color: "#5F5E5A" }}>({resolved.length})</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {resolved.map(i => (
              <div key={i.id} onClick={() => onNav("issues", i.file_id)} style={{ background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, padding: "10px 12px", cursor: "pointer", borderLeft: "3px solid #5DCAA5", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }} onMouseEnter={e => e.currentTarget.style.background = "#1A1A18"} onMouseLeave={e => e.currentTarget.style.background = "#161615"}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#888780", textDecoration: "line-through" }}>{i.title}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#5F5E5A" }}>
                  <span style={{ color: "#5DCAA5" }}>{i.status.replace(/_/g, " ")}</span>
                  <span>·</span>
                  <span style={{ fontFamily: "'SF Mono', monospace" }}>{fm[i.file_id]?.name?.split(".")[0] || "—"}</span>
                  {i.branch_name && <><span>·</span><span style={{ fontFamily: "'SF Mono', monospace" }}>{i.branch_name}</span></>}
                </div>
              </div>
            ))}
          </div>
        </div>);
      })()}

      {/* Test summary */}
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "#B4B2A9" }}>Test summary</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {tests.length === 0 && <div style={{ fontSize: 12, color: "#5F5E5A" }}>No test cases yet</div>}
        {tests.map(t => (<div key={t.id} title={t.title} style={{ width: 28, height: 28, borderRadius: 4, background: TC[t.status].bg, border: `1px solid ${TC[t.status].border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: TC[t.status].text }}>{t.status === "pass" ? "✓" : t.status === "fail" ? "✗" : "·"}</div>))}
      </div>
    </div>
  );
}

function IssuesView({ issues, files, fm, filterType, setFilterType, filterFile, setFilterFile, filterPriority, setFilterPriority, updS, del, onAdd, onEdit, links, tests, ulnk, openLink, focusOn, pomCount, fmtDue }) {
  const ltIds = (iid) => links.filter(l => l.issue_id === iid).map(l => l.test_case_id);
  const tm = Object.fromEntries(tests.map(t => [t.id, t]));
  const open = issues.filter(i => !["fixed","verified","wont_fix"].includes(i.status));
  const resolved = issues.filter(i => ["fixed","verified","wont_fix"].includes(i.status));

  const IssueCard = ({ i, dimmed }) => { const lt = ltIds(i.id); const done = pomCount("issue", i.id); const est = i.estimated_pomodoros || 0; const due = fmtDue(i.due_date); return (
    <div style={{ background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, padding: "12px 14px", marginBottom: 8, opacity: dimmed ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><Badge label={i.type} colors={i.type === "bug" ? { bg: "#2D0A0A", text: "#F09595", border: "#501313" } : { bg: "#0A1929", text: "#85B7EB", border: "#042C53" }} /><span style={{ fontSize: 13, fontWeight: 500, textDecoration: dimmed ? "line-through" : "none", color: dimmed ? "#888780" : "#F1EFE8" }}>{i.title}</span>{dimmed && <Badge label={i.status} colors={{ bg: "#081F12", text: "#5DCAA5", border: "#04342C" }} small />}</div>
          {!dimmed && i.description && <div style={{ fontSize: 12, color: "#888780", marginBottom: 6, lineHeight: 1.5 }}>{i.description}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5F5E5A", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'SF Mono', monospace" }}>{fm[i.file_id]?.name || "—"}</span><span>·</span><span>{SHORT_DATE(i.created_at)}</span>
            {i.repo_name && <><span>·</span><span style={{ fontFamily: "'SF Mono', monospace", color: "#888780" }}>{i.repo_name}{i.branch_name ? ` : ${i.branch_name}` : ""}</span></>}
            {est > 0 && <><span>·</span><span style={{ color: done >= est ? "#97C459" : "#E24B4A" }}>{done}/{est} pomodoros</span></>}
            {due && <><span>·</span><span style={{ color: due.color }}>{due.text}</span></>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          {!dimmed && <button onClick={() => focusOn("issue", i.id)} title="Focus" style={{ background: "none", border: "1px solid #2C2C2A", color: "#E24B4A", cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4 }}>▶</button>}
          {!dimmed && <Badge label={i.priority} colors={PC[i.priority]} />}
          <Select value={i.status} onChange={s => updS(i.id, s)} options={ISSUE_STATUSES} style={{ fontSize: 11, padding: "3px 6px" }} />
          <button onClick={() => onEdit(i)} title="Edit" style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>✎</button>
          <button onClick={() => del(i.id)} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>✕</button>
        </div>
      </div>
      {!dimmed && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {lt.map(tid => { const tc = tm[tid]; if (!tc) return null; return (<span key={tid} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: TC[tc.status].bg, color: TC[tc.status].text, border: `1px solid ${TC[tc.status].border}` }}>{tc.status === "pass" ? "✓" : tc.status === "fail" ? "✗" : "▷"} {tc.title}<button onClick={() => ulnk(i.id, tid)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 10, padding: 0, marginLeft: 2, opacity: 0.6 }}>✕</button></span>); })}
        <button onClick={() => openLink(i.id)} style={{ background: "none", border: "1px dashed #444441", color: "#5F5E5A", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>+ Link test</button>
      </div>}
    </div>); };

  return (<div>
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}><Pill active={filterType === "all"} onClick={() => setFilterType("all")}>All</Pill><Pill active={filterType === "bug"} onClick={() => setFilterType("bug")}>Bugs</Pill><Pill active={filterType === "todo"} onClick={() => setFilterType("todo")}>To-dos</Pill><span style={{ width: 1, height: 16, background: "#2C2C2A", margin: "0 4px" }} /><Select value={filterFile} onChange={setFilterFile} options={[{ value: "all", label: "All files" }, ...files.map(f => ({ value: f.id, label: f.name }))]} /><Select value={filterPriority} onChange={setFilterPriority} options={[{ value: "all", label: "All priorities" }, ...PRIORITIES.map(p => ({ value: p, label: p }))]} /></div>
    {issues.length === 0 && <EmptyState icon="◉" title="No issues found" sub="Create issues to track bugs and to-dos" action="New issue" onAction={onAdd} />}
    {open.length > 0 && open.map(i => <IssueCard key={i.id} i={i} />)}
    {resolved.length > 0 && (<>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 0 10px" }}>
        <div style={{ height: 1, flex: 1, background: "#2C2C2A" }} />
        <span style={{ fontSize: 11, color: "#5DCAA5", fontWeight: 500 }}>Resolved ({resolved.length})</span>
        <div style={{ height: 1, flex: 1, background: "#2C2C2A" }} />
      </div>
      {resolved.map(i => <IssueCard key={i.id} i={i} dimmed />)}
    </>)}
  </div>);
}

function TestsView({ tests, files, fm, filterFile, setFilterFile, exp, setExp, updS, del, onAdd, onEdit, links, allIssues, ulnk, openLink, focusOn, pomCount, fmtDue }) {
  const liIds = (tid) => links.filter(l => l.test_case_id === tid).map(l => l.issue_id);
  const im = Object.fromEntries(allIssues.map(i => [i.id, i]));
  return (<div>
    <div style={{ display: "flex", gap: 6, marginBottom: 16 }}><Select value={filterFile} onChange={setFilterFile} options={[{ value: "all", label: "All files" }, ...files.map(f => ({ value: f.id, label: f.name }))]} /></div>
    {tests.length === 0 && <EmptyState icon="▷" title="No test cases yet" sub="Write test cases to verify your code." action="New test case" onAction={onAdd} />}
    {tests.map(t => { const ex = exp === t.id; const li = liIds(t.id); const done = pomCount("test", t.id); const est = t.estimated_pomodoros || 0; const due = fmtDue(t.due_date); return (
      <div key={t.id} style={{ background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, marginBottom: 8 }}>
        <div style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }} onClick={() => setExp(ex ? null : t.id)}>
          <span style={{ color: "#5F5E5A", fontSize: 12, marginTop: 2, transform: ex ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▸</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><span style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</span><Badge label={t.status} colors={TC[t.status]} small /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5F5E5A", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'SF Mono', monospace" }}>{fm[t.file_id]?.name || "—"}</span>
              {t.last_run && <><span>·</span><span>{SHORT_DATE(t.last_run)}</span></>}
              <span>·</span><span>{(t.steps||[]).length} step{(t.steps||[]).length !== 1 ? "s" : ""}</span>
              {t.repo_name && <><span>·</span><span style={{ fontFamily: "'SF Mono', monospace", color: "#888780" }}>{t.repo_name}{t.branch_name ? ` : ${t.branch_name}` : ""}</span></>}
              {est > 0 && <><span>·</span><span style={{ color: done >= est ? "#97C459" : "#E24B4A" }}>{done}/{est} pomodoros</span></>}
              {due && <><span>·</span><span style={{ color: due.color }}>{due.text}</span></>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => focusOn("test", t.id)} title="Focus" style={{ background: "none", border: "1px solid #2C2C2A", color: "#E24B4A", cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4 }}>▶</button>
            <Btn small onClick={() => updS(t.id, "pass")} style={{ color: t.status === "pass" ? "#97C459" : "#5F5E5A", borderColor: t.status === "pass" ? "#3B6D11" : undefined }}>✓</Btn>
            <Btn small onClick={() => updS(t.id, "fail")} style={{ color: t.status === "fail" ? "#F09595" : "#5F5E5A", borderColor: t.status === "fail" ? "#A32D2D" : undefined }}>✗</Btn>
            <button onClick={() => onEdit(t)} title="Edit" style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>✎</button>
            <button onClick={() => del(t.id)} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>✕</button>
          </div>
        </div>
        <div style={{ padding: "0 14px 10px 32px", display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {li.map(iid => { const issue = im[iid]; if (!issue) return null; const ic = issue.type === "bug" ? { bg: "#2D0A0A", text: "#F09595", border: "#501313" } : { bg: "#0A1929", text: "#85B7EB", border: "#042C53" }; return (<span key={iid} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: ic.bg, color: ic.text, border: `1px solid ${ic.border}` }}>{issue.type === "bug" ? "◉" : "○"} {issue.title}<button onClick={() => ulnk(iid, t.id)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 10, padding: 0, marginLeft: 2, opacity: 0.6 }}>✕</button></span>); })}
          <button onClick={() => openLink(t.id)} style={{ background: "none", border: "1px dashed #444441", color: "#5F5E5A", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>+ Link issue</button>
        </div>
        {ex && (<div style={{ padding: "0 14px 14px 32px", borderTop: "1px solid #2C2C2A" }}>
          {t.precondition && <div style={{ fontSize: 12, color: "#888780", margin: "10px 0 8px", padding: "6px 10px", background: "#1A1A18", borderRadius: 6 }}><span style={{ color: "#5F5E5A", fontSize: 10, textTransform: "uppercase" }}>Precondition: </span>{t.precondition}</div>}
          {(t.steps||[]).map((s, idx) => (<div key={idx} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: idx < (t.steps||[]).length - 1 ? "1px solid #1A1A18" : "none" }}><span style={{ color: "#5F5E5A", fontSize: 11, fontFamily: "'SF Mono', monospace", minWidth: 20 }}>{idx + 1}.</span><div style={{ flex: 1 }}><div style={{ fontSize: 12, color: "#D3D1C7", marginBottom: 2 }}>{s.step}</div><div style={{ fontSize: 11, color: "#5DCAA5", fontStyle: "italic" }}>→ {s.expected}</div></div></div>))}
        </div>)}
      </div>); })}
  </div>);
}

function FilesView({ files, issues, tests, del, onAdd, onNav }) {
  const g = {}; files.forEach(f => { if (!g[f.category]) g[f.category] = []; g[f.category].push(f); });
  const ic = (fid) => issues.filter(i => i.file_id === fid && !["fixed","verified","wont_fix"].includes(i.status)).length;
  const tc = (fid) => tests.filter(t => t.file_id === fid).length;
  const tp = (fid) => tests.filter(t => t.file_id === fid && t.status === "pass").length;
  if (files.length === 0) return <EmptyState icon="⊞" title="No files yet" sub="Add files to attach issues and tests" action="Add file" onAction={onAdd} />;
  return (<div>{CATEGORIES.filter(c => g[c]).map(cat => (<div key={cat} style={{ marginBottom: 20 }}><div style={{ fontSize: 11, fontWeight: 500, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{cat}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>{g[cat].map(f => { const a = ic(f.id), b = tc(f.id), c = tp(f.id); return (<div key={f.id} style={{ background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, padding: "12px 14px" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontFamily: "'SF Mono', monospace", fontSize: 12, fontWeight: 500, color: "#D3D1C7" }}>{f.name}</span><button onClick={() => del(f.id)} style={{ background: "none", border: "none", color: "#444441", cursor: "pointer", fontSize: 12 }}>✕</button></div><div style={{ display: "flex", gap: 12, fontSize: 11 }}><span onClick={() => onNav("issues", f.id)} style={{ cursor: "pointer", color: a > 0 ? "#F09595" : "#5F5E5A" }}>{a} issue{a !== 1 ? "s" : ""}</span><span onClick={() => onNav("tests", f.id)} style={{ cursor: "pointer", color: b > 0 ? "#85B7EB" : "#5F5E5A" }}>{c}/{b} tests</span></div></div>); })}</div></div>))}</div>);
}

// ============================================
// Notes View
// ============================================

const NOTE_CATS = ["scratch", "decision", "investigation", "meeting"];
const NOTE_CAT_COLORS = { scratch: { bg: "#1A1A18", text: "#B4B2A9", border: "#2C2C2A" }, decision: { bg: "#1A0A29", text: "#AFA9EC", border: "#26215C" }, investigation: { bg: "#0A1929", text: "#85B7EB", border: "#042C53" }, meeting: { bg: "#081F12", text: "#5DCAA5", border: "#04342C" } };
const CODE_LANGS = ["", "sql", "python"];
const LANG_LABELS = { "": "Plain text", sql: "SQL", python: "Python" };

// Auto-detect language from content
function detectLang(text) {
  if (!text) return "";
  const t = text.toLowerCase();
  const sqlScore = (t.match(/\b(select|from|where|join|insert|update|delete|create|alter|drop|table|into|values|group by|order by|having|union|coalesce|cast)\b/g) || []).length;
  const pyScore = (t.match(/\b(def |class |import |from .+ import|if __name__|elif |print\(|self\.|lambda |async def|await )\b/g) || []).length;
  if (sqlScore >= 2 && sqlScore > pyScore) return "sql";
  if (pyScore >= 2 && pyScore > sqlScore) return "python";
  return "";
}

// Simple syntax highlighter
function highlight(code, lang) {
  if (!lang || !code) return [{ text: code, color: null }];
  const tokens = [];
  let remaining = code;

  const SQL_KW = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|IN|IS|NULL|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|INTO|VALUES|SET|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|EXISTS|BETWEEN|LIKE|ILIKE|COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST|WITH|RECURSIVE|PRIMARY|KEY|REFERENCES|DEFAULT|INDEX|IF|BEGIN|COMMIT|ROLLBACK|GRANT|REVOKE|TRIGGER|VIEW|SCHEMA|DATABASE|CONSTRAINT|FOREIGN|UNIQUE|CHECK|ASC|DESC|OVER|PARTITION|ROW_NUMBER|RANK|DENSE_RANK|LAG|LEAD|FIRST_VALUE|LAST_VALUE|EXTRACT|DATE|TIMESTAMP|INTEGER|TEXT|BOOLEAN|VARCHAR|SERIAL|UUID|JSONB|FLOAT|NUMERIC|BIGINT|SMALLINT)\b/gi;
  const PY_KW = /\b(def|class|import|from|as|if|elif|else|for|while|return|yield|try|except|finally|with|lambda|and|or|not|in|is|None|True|False|pass|break|continue|raise|assert|global|nonlocal|del|async|await|self|print|len|range|enumerate|zip|map|filter|sorted|isinstance|type|dict|list|set|tuple|int|str|float|bool|open|super)\b/g;
  const STR_RE = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  const NUM_RE = /\b(\d+\.?\d*)\b/g;
  const COMMENT_SQL = /(--.*$)/gm;
  const COMMENT_PY = /(#.*$)/gm;

  // Tokenize by splitting on patterns
  const kw = lang === "sql" ? SQL_KW : PY_KW;
  const commentRe = lang === "sql" ? COMMENT_SQL : COMMENT_PY;

  // Simple line-by-line approach
  const lines = code.split("\n");
  const result = [];

  lines.forEach((line, li) => {
    if (li > 0) result.push({ text: "\n", color: null });
    // Check for comments first
    const commentMatch = lang === "sql" ? line.match(/^(.*?)(--.*$)/) : line.match(/^(.*?)(#.*$)/);
    const beforeComment = commentMatch ? commentMatch[1] : line;
    const comment = commentMatch ? commentMatch[2] : null;

    // Tokenize the non-comment part
    let pos = 0;
    const parts = [];
    // Find all strings, keywords, numbers
    const allMatches = [];

    let m;
    const strRe = new RegExp(STR_RE.source, "g");
    while ((m = strRe.exec(beforeComment)) !== null) allMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], type: "string" });
    const kwRe = new RegExp(kw.source, kw.flags);
    while ((m = kwRe.exec(beforeComment)) !== null) {
      const overlaps = allMatches.some(a => a.type === "string" && m.index >= a.start && m.index < a.end);
      if (!overlaps) allMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], type: "keyword" });
    }
    const numRe = new RegExp(NUM_RE.source, "g");
    while ((m = numRe.exec(beforeComment)) !== null) {
      const overlaps = allMatches.some(a => m.index >= a.start && m.index < a.end);
      if (!overlaps) allMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0], type: "number" });
    }

    allMatches.sort((a, b) => a.start - b.start);
    let cursor = 0;
    allMatches.forEach(match => {
      if (match.start > cursor) result.push({ text: beforeComment.slice(cursor, match.start), color: null });
      const color = match.type === "keyword" ? "#85B7EB" : match.type === "string" ? "#97C459" : "#FAC775";
      result.push({ text: match.text, color });
      cursor = match.end;
    });
    if (cursor < beforeComment.length) result.push({ text: beforeComment.slice(cursor), color: null });
    if (comment) result.push({ text: comment, color: "#5F5E5A" });
  });

  return result;
}

function CodeBlock({ content, lang }) {
  const tokens = highlight(content, lang);
  return (
    <pre style={{ fontSize: 12, fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
      {tokens.map((t, i) => t.color ? <span key={i} style={{ color: t.color }}>{t.text}</span> : <span key={i}>{t.text}</span>)}
    </pre>
  );
}

function NotesView({ notes, issues, files, projectId, reload }) {
  const [editing, setEditing] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [form, setForm] = useState({ title: "", content: "", category: "scratch", linked_issue_id: "", linked_file_id: "", code_lang: "" });

  const filtered = notes.filter(n => {
    if (filterCat !== "all" && n.category !== filterCat) return false;
    if (searchQ && !n.title.toLowerCase().includes(searchQ.toLowerCase()) && !n.content.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const setContent = (v) => {
    const detected = detectLang(v);
    setForm(f => ({ ...f, content: v, code_lang: f.code_lang || detected }));
  };

  const startNew = (cat) => { setForm({ title: "", content: "", category: cat || "scratch", linked_issue_id: "", linked_file_id: "", code_lang: "" }); setEditing("new"); };
  const startEdit = (n) => { setForm({ title: n.title, content: n.content, category: n.category, linked_issue_id: n.linked_issue_id || "", linked_file_id: n.linked_file_id || "", code_lang: n.code_lang || detectLang(n.content) }); setEditing(n.id); };
  const save = async () => {
    if (!form.content.trim() && !form.title.trim()) return;
    try {
      const payload = { ...form, linked_issue_id: form.linked_issue_id || null, linked_file_id: form.linked_file_id || null };
      if (editing === "new") await db.createNote(projectId, payload);
      else await db.updateNote(editing, payload);
      setEditing(null); await reload();
    } catch (e) { console.error(e); }
  };
  const del = async (id) => { try { await db.deleteNote(id); await reload(); } catch (e) { console.error(e); } };
  const pin = async (id, pinned) => { try { await db.updateNote(id, { pinned: !pinned }); await reload(); } catch (e) { console.error(e); } };

  if (editing) {
    const detectedLang = detectLang(form.content);
    return (
      <div style={{ maxWidth: 640 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><span style={{ fontSize: 14, fontWeight: 500 }}>{editing === "new" ? "New note" : "Edit note"}</span><Btn onClick={() => setEditing(null)}>Cancel</Btn></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {form.category !== "scratch" && <Input value={form.title} onChange={v => setForm({ ...form, title: v })} placeholder="Title (optional for scratch)" />}
          <div style={{ display: "flex", gap: 8 }}>
            <Select value={form.category} onChange={v => setForm({ ...form, category: v })} options={NOTE_CATS} style={{ flex: 1 }} />
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <Select value={form.code_lang} onChange={v => setForm({ ...form, code_lang: v })} options={CODE_LANGS.map(l => ({ value: l, label: LANG_LABELS[l] }))} style={{ flex: 1 }} />
              {detectedLang && !form.code_lang && <span style={{ fontSize: 10, color: "#5DCAA5" }}>detected: {LANG_LABELS[detectedLang]}</span>}
            </div>
          </div>
          <textarea value={form.content} onChange={e => setContent(e.target.value)} placeholder={form.category === "scratch" ? "Just start writing..." : "Paste code or write notes..."} rows={12} style={{ padding: "10px 12px", borderRadius: 6, fontSize: 13, background: "#111110", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", width: "100%", resize: "vertical", fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: 1.6, boxSizing: "border-box", tabSize: 2 }} onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); const s = e.target.selectionStart; const end = e.target.selectionEnd; const v = form.content; setForm({ ...form, content: v.substring(0, s) + "  " + v.substring(end) }); setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; }, 0); } }} />
          {/* Live preview */}
          {(form.code_lang || detectedLang) && form.content.trim() && (
            <div style={{ background: "#111110", border: "1px solid #2C2C2A", borderRadius: 6, padding: "10px 12px", maxHeight: 200, overflowY: "auto" }}>
              <div style={{ fontSize: 10, color: "#5F5E5A", marginBottom: 6 }}>Preview ({LANG_LABELS[form.code_lang || detectedLang]})</div>
              <CodeBlock content={form.content} lang={form.code_lang || detectedLang} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#5F5E5A", marginBottom: 4 }}>Link to issue</div><Select value={form.linked_issue_id} onChange={v => setForm({ ...form, linked_issue_id: v })} options={[{ value: "", label: "None" }, ...issues.map(i => ({ value: i.id, label: i.title }))]} style={{ width: "100%" }} /></div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "#5F5E5A", marginBottom: 4 }}>Link to file</div><Select value={form.linked_file_id} onChange={v => setForm({ ...form, linked_file_id: v })} options={[{ value: "", label: "None" }, ...files.map(f => ({ value: f.id, label: f.name }))]} style={{ width: "100%" }} /></div>
          </div>
          <Btn primary onClick={save}>Save note</Btn>
        </div>
      </div>
    );
  }

  return (<div>
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      <Pill active={filterCat === "all"} onClick={() => setFilterCat("all")}>All</Pill>
      {NOTE_CATS.map(c => <Pill key={c} active={filterCat === c} onClick={() => setFilterCat(c)}>{c}</Pill>)}
      <span style={{ width: 1, height: 16, background: "#2C2C2A", margin: "0 4px" }} />
      <Input value={searchQ} onChange={setSearchQ} placeholder="Search notes..." style={{ width: 160, fontSize: 12 }} />
      <span style={{ flex: 1 }} />
      <Btn onClick={() => startNew("scratch")} small>+ Scratch</Btn>
      <Btn primary onClick={() => startNew()}>+ Note</Btn>
    </div>
    {filtered.length === 0 && <EmptyState icon="☰" title="No notes yet" sub="Capture decisions, investigations, and scratch thoughts" action="New note" onAction={() => startNew()} />}
    {filtered.map(n => {
      const cc = NOTE_CAT_COLORS[n.category] || NOTE_CAT_COLORS.scratch;
      const linkedIssue = issues.find(i => i.id === n.linked_issue_id);
      const linkedFile = files.find(f => f.id === n.linked_file_id);
      const lang = n.code_lang || detectLang(n.content);
      return (
        <div key={n.id} style={{ background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, padding: "12px 14px", marginBottom: 8, borderLeft: n.pinned ? "3px solid #FAC775" : "3px solid transparent", borderTopLeftRadius: n.pinned ? 0 : 8, borderBottomLeftRadius: n.pinned ? 0 : 8 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Badge label={n.category} colors={cc} small />
                {lang && <Badge label={LANG_LABELS[lang]} colors={{ bg: "#111110", text: "#888780", border: "#2C2C2A" }} small />}
                {n.title && <span style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</span>}
                {n.pinned && <span style={{ fontSize: 10, color: "#FAC775" }}>pinned</span>}
              </div>
              {lang ? (
                <div style={{ background: "#111110", borderRadius: 6, padding: "8px 10px", maxHeight: 150, overflowY: "auto" }}>
                  <CodeBlock content={n.content} lang={lang} />
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#D3D1C7", whiteSpace: "pre-wrap", lineHeight: 1.6, maxHeight: 120, overflow: "hidden" }}>{n.content || <span style={{ color: "#5F5E5A", fontStyle: "italic" }}>Empty note</span>}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5F5E5A", marginTop: 6 }}>
                <span>{SHORT_DATE(n.updated_at)}</span>
                {linkedIssue && <><span>·</span><span style={{ color: "#F09595" }}>◉ {linkedIssue.title}</span></>}
                {linkedFile && <><span>·</span><span style={{ fontFamily: "'SF Mono', monospace" }}>{linkedFile.name}</span></>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={() => pin(n.id, n.pinned)} title={n.pinned ? "Unpin" : "Pin"} style={{ background: "none", border: "none", color: n.pinned ? "#FAC775" : "#444441", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>⊙</button>
              <button onClick={() => startEdit(n)} title="Edit" style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>✎</button>
              <button onClick={() => del(n.id)} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>✕</button>
            </div>
          </div>
        </div>
      );
    })}
  </div>);
}

// ============================================
// Board View (Kanban Sticky Notes)
// ============================================

const CARD_COLORS = { yellow: { bg: "#2A2309", text: "#FAC775", border: "#412402" }, blue: { bg: "#0A1929", text: "#85B7EB", border: "#042C53" }, green: { bg: "#0E1A08", text: "#97C459", border: "#173404" }, pink: { bg: "#2A0A1A", text: "#ED93B1", border: "#4B1528" }, purple: { bg: "#1A0A29", text: "#AFA9EC", border: "#26215C" }, coral: { bg: "#2A1209", text: "#F0997B", border: "#4A1B0C" } };
const CARD_COLOR_KEYS = Object.keys(CARD_COLORS);

function BoardView({ columns, cards, projectId, reload, issues, files, addIssue }) {
  const [newColName, setNewColName] = useState("");
  const [editingCard, setEditingCard] = useState(null);
  const [cardForm, setCardForm] = useState({ text: "", color: "yellow" });
  const [addingTo, setAddingTo] = useState(null);
  const [editColId, setEditColId] = useState(null);
  const [editColName, setEditColName] = useState("");

  const addCol = async () => { if (!newColName.trim()) return; try { await db.createColumn(projectId, newColName.trim(), columns.length); setNewColName(""); await reload(); } catch (e) { console.error(e); } };
  const delCol = async (id) => { if (!confirm("Delete column and all its cards?")) return; try { await db.deleteColumn(id); await reload(); } catch (e) { console.error(e); } };
  const renameCol = async (id) => { if (!editColName.trim()) { setEditColId(null); return; } try { await db.updateColumn(id, { name: editColName.trim() }); setEditColId(null); await reload(); } catch (e) { console.error(e); } };

  const startAddCard = (colId) => { setAddingTo(colId); setCardForm({ text: "", color: "yellow" }); setEditingCard(null); };
  const startEditCard = (card) => { setEditingCard(card.id); setCardForm({ text: card.text, color: card.color }); setAddingTo(null); };
  const saveCard = async (colId) => {
    if (!cardForm.text.trim()) return;
    try {
      if (editingCard) await db.updateCard(editingCard, { text: cardForm.text, color: cardForm.color });
      else { const colCards = cards.filter(c => c.column_id === colId); await db.createCard(colId, cardForm.text, cardForm.color, colCards.length); }
      setEditingCard(null); setAddingTo(null); await reload();
    } catch (e) { console.error(e); }
  };
  const delCard = async (id) => { try { await db.deleteCard(id); await reload(); } catch (e) { console.error(e); } };
  const moveCard = async (cardId, newColId) => { try { await db.updateCard(cardId, { column_id: newColId }); await reload(); } catch (e) { console.error(e); } };
  const convertToIssue = async (card) => {
    if (!files.length) { alert("Add a file first to create issues."); return; }
    try { await addIssue(files[0].id, card.text, "todo", "medium", "", 0, null, "", ""); await db.deleteCard(card.id); await reload(); } catch (e) { console.error(e); }
  };

  return (<div>
    {columns.length === 0 && cards.length === 0 && (
      <EmptyState icon="▦" title="No board yet" sub="Add columns to organize your sticky notes" />
    )}
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16, alignItems: "flex-start" }}>
      {columns.map(col => {
        const colCards = cards.filter(c => c.column_id === col.id);
        return (
          <div key={col.id} style={{ minWidth: 240, maxWidth: 280, flex: "0 0 260px", background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, padding: "10px 12px" }}>
            {/* Column header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              {editColId === col.id ? (
                <input autoFocus value={editColName} onChange={e => setEditColName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") renameCol(col.id); if (e.key === "Escape") setEditColId(null); }} onBlur={() => renameCol(col.id)} style={{ flex: 1, padding: "2px 6px", borderRadius: 4, fontSize: 12, fontWeight: 500, background: "#111110", color: "#F1EFE8", border: "1px solid #444441", outline: "none" }} />
              ) : (
                <span onDoubleClick={() => { setEditColId(col.id); setEditColName(col.name); }} style={{ fontSize: 12, fontWeight: 500, color: "#B4B2A9", cursor: "default" }}>{col.name}</span>
              )}
              <div style={{ display: "flex", gap: 2 }}>
                <span style={{ fontSize: 10, color: "#5F5E5A" }}>{colCards.length}</span>
                <button onClick={() => delCol(col.id)} style={{ background: "none", border: "none", color: "#444441", cursor: "pointer", fontSize: 11, padding: "0 2px" }}>✕</button>
              </div>
            </div>
            {/* Cards */}
            {colCards.map(card => {
              const cc = CARD_COLORS[card.color] || CARD_COLORS.yellow;
              if (editingCard === card.id) return (
                <div key={card.id} style={{ marginBottom: 6, padding: "8px", background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: 6 }}>
                  <TextArea value={cardForm.text} onChange={v => setCardForm({ ...cardForm, text: v })} placeholder="Card text..." rows={2} />
                  <div style={{ display: "flex", gap: 3, margin: "6px 0" }}>{CARD_COLOR_KEYS.map(k => (<div key={k} onClick={() => setCardForm({ ...cardForm, color: k })} style={{ width: 16, height: 16, borderRadius: 3, background: CARD_COLORS[k].text, cursor: "pointer", border: cardForm.color === k ? "2px solid #F1EFE8" : "2px solid transparent" }} />))}</div>
                  <div style={{ display: "flex", gap: 4 }}><Btn small primary onClick={() => saveCard(col.id)}>Save</Btn><Btn small onClick={() => setEditingCard(null)}>Cancel</Btn></div>
                </div>
              );
              return (
                <div key={card.id} style={{ marginBottom: 6, padding: "8px 10px", background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: 6 }}>
                  <div style={{ fontSize: 12, color: cc.text, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 6 }}>{card.text}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={card.column_id} onChange={e => moveCard(card.id, e.target.value)} style={{ padding: "2px 4px", borderRadius: 4, fontSize: 10, background: "#111110", color: "#888780", border: "1px solid #2C2C2A", outline: "none", cursor: "pointer" }}>
                      {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => convertToIssue(card)} title="Convert to issue" style={{ background: "none", border: "1px solid #2C2C2A", color: "#85B7EB", cursor: "pointer", fontSize: 9, padding: "2px 6px", borderRadius: 3 }}>→ issue</button>
                    <button onClick={() => startEditCard(card)} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 11, padding: "0 2px" }}>✎</button>
                    <button onClick={() => delCard(card.id)} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 11, padding: "0 2px" }}>✕</button>
                  </div>
                </div>
              );
            })}
            {/* Add card form or button */}
            {addingTo === col.id ? (
              <div style={{ padding: "6px", background: "#1A1A18", border: "1px dashed #2C2C2A", borderRadius: 6 }}>
                <TextArea value={cardForm.text} onChange={v => setCardForm({ ...cardForm, text: v })} placeholder="What's on your mind?" rows={2} />
                <div style={{ display: "flex", gap: 3, margin: "6px 0" }}>{CARD_COLOR_KEYS.map(k => (<div key={k} onClick={() => setCardForm({ ...cardForm, color: k })} style={{ width: 16, height: 16, borderRadius: 3, background: CARD_COLORS[k].text, cursor: "pointer", border: cardForm.color === k ? "2px solid #F1EFE8" : "2px solid transparent" }} />))}</div>
                <div style={{ display: "flex", gap: 4 }}><Btn small primary onClick={() => saveCard(col.id)}>Add</Btn><Btn small onClick={() => setAddingTo(null)}>Cancel</Btn></div>
              </div>
            ) : (
              <button onClick={() => startAddCard(col.id)} style={{ width: "100%", padding: "6px", borderRadius: 6, border: "1px dashed #2C2C2A", background: "transparent", color: "#5F5E5A", cursor: "pointer", fontSize: 11 }}>+ Add card</button>
            )}
          </div>
        );
      })}
      {/* Add column */}
      <div style={{ minWidth: 200, flex: "0 0 200px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <Input value={newColName} onChange={setNewColName} placeholder="New column..." style={{ fontSize: 12, flex: 1 }} />
          <Btn small primary onClick={addCol}>+</Btn>
        </div>
      </div>
    </div>
  </div>);
}

function Modal({ modal, files, onClose, addProject, addFile, addIssue, addTest, editIssue, editTest, usedRepos, usedBranches }) {
  const e = modal.edit;
  const isEdit = !!e;
  const [n, setN] = useState(e?.title || ""); const [cat, setCat] = useState("other"); const [fid, setFid] = useState(e?.file_id || files[0]?.id || ""); const [ty, setTy] = useState(e?.type || "bug"); const [pr, setPr] = useState(e?.priority || "high"); const [desc, setDesc] = useState(e?.description || ""); const [pre, setPre] = useState(e?.precondition || ""); const [steps, setSteps] = useState(e?.steps?.length ? e.steps : [{ step: "", expected: "" }]); const [saving, setSaving] = useState(false);
  const [ep, setEp] = useState(e?.estimated_pomodoros || 0); const [dd, setDd] = useState(e?.due_date || "");
  const [rn, setRn] = useState(e?.repo_name || ""); const [bn, setBn] = useState(e?.branch_name || "");
  const addStep = () => setSteps([...steps, { step: "", expected: "" }]);
  const updStep = (i, f, v) => { const s = [...steps]; s[i][f] = v; setSteps(s); };
  const submit = async () => {
    setSaving(true);
    try {
      if (modal.type === "project" && n.trim()) await addProject(n.trim());
      if (modal.type === "file" && n.trim()) await addFile(n.trim(), cat);
      if (modal.type === "issue" && n.trim() && fid) {
        if (isEdit) await editIssue(e.id, { title: n.trim(), type: ty, priority: pr, description: desc, file_id: fid, estimated_pomodoros: ep, due_date: dd || null, repo_name: rn, branch_name: bn });
        else await addIssue(fid, n.trim(), ty, pr, desc, ep, dd || null, rn, bn);
      }
      if (modal.type === "test" && n.trim() && fid) {
        const cleanSteps = steps.filter(s => s.step.trim());
        if (isEdit) await editTest(e.id, { title: n.trim(), precondition: pre, steps: cleanSteps, file_id: fid, estimated_pomodoros: ep, due_date: dd || null, repo_name: rn, branch_name: bn });
        else if (cleanSteps.length) await addTest(fid, n.trim(), pre, cleanSteps, ep, dd || null, rn, bn);
      }
    } catch (err) { console.error(err); }
    setSaving(false);
  };
  const titles = isEdit ? { issue: "Edit issue", test: "Edit test case" } : { project: "New project", file: "Add file", issue: "New issue", test: "New test case" };
  const planFields = (modal.type === "issue" || modal.type === "test") ? (<>
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#5F5E5A", marginBottom: 4 }}>Repo</div>
        <input list="repo-list" value={rn} onChange={e => setRn(e.target.value)} placeholder="Select or type repo" style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "#1A1A18", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "'SF Mono', monospace" }} />
        <datalist id="repo-list">{(usedRepos || []).map(r => <option key={r} value={r} />)}</datalist>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#5F5E5A", marginBottom: 4 }}>Branch</div>
        <input list="branch-list" value={bn} onChange={e => setBn(e.target.value)} placeholder="Select or type branch" style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "#1A1A18", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "'SF Mono', monospace" }} />
        <datalist id="branch-list">{(usedBranches || []).map(b => <option key={b} value={b} />)}</datalist>
      </div>
    </div>
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#5F5E5A", marginBottom: 4 }}>Estimated pomodoros</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min="0" max="12" step="1" value={ep} onChange={e => setEp(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "'SF Mono', monospace", color: ep > 0 ? "#E24B4A" : "#5F5E5A", minWidth: 20, textAlign: "right" }}>{ep}</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "#5F5E5A", marginBottom: 4 }}>Due date</div>
        <input type="date" value={dd} onChange={e => setDd(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "#1A1A18", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", width: "100%", boxSizing: "border-box" }} />
      </div>
    </div>
  </>) : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#1A1A18", border: "1px solid #2C2C2A", borderRadius: 12, padding: "20px 24px", width: 440, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ fontSize: 15, fontWeight: 500 }}>{titles[modal.type]}</span><button onClick={onClose} style={{ background: "none", border: "none", color: "#888780", cursor: "pointer", fontSize: 16 }}>✕</button></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {modal.type === "project" && <Input value={n} onChange={setN} placeholder="Project name" />}
          {modal.type === "file" && <><Input value={n} onChange={setN} placeholder="filename.py" mono /><Select value={cat} onChange={setCat} options={CATEGORIES} style={{ width: "100%" }} /></>}
          {modal.type === "issue" && <><Select value={fid} onChange={setFid} options={files.map(f => ({ value: f.id, label: f.name }))} style={{ width: "100%" }} /><Input value={n} onChange={setN} placeholder="Issue title" /><div style={{ display: "flex", gap: 8 }}><Select value={ty} onChange={setTy} options={ISSUE_TYPES} style={{ flex: 1 }} /><Select value={pr} onChange={setPr} options={PRIORITIES} style={{ flex: 1 }} /></div><TextArea value={desc} onChange={setDesc} placeholder="Description (optional)" />{planFields}</>}
          {modal.type === "test" && <><Select value={fid} onChange={setFid} options={files.map(f => ({ value: f.id, label: f.name }))} style={{ width: "100%" }} /><Input value={n} onChange={setN} placeholder="Test case title" /><TextArea value={pre} onChange={setPre} placeholder="Precondition (optional)" rows={1} />{planFields}<div style={{ fontSize: 11, fontWeight: 500, color: "#888780", marginTop: 4 }}>STEPS</div>{steps.map((s, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><span style={{ fontSize: 11, color: "#5F5E5A", marginTop: 8, fontFamily: "'SF Mono', monospace", minWidth: 16 }}>{i + 1}.</span><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}><Input value={s.step} onChange={v => updStep(i, "step", v)} placeholder="What to do" /><Input value={s.expected} onChange={v => updStep(i, "expected", v)} placeholder="Expected result" /></div>{steps.length > 1 && <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", marginTop: 6 }}>✕</button>}</div>))}<button onClick={addStep} style={{ background: "none", border: "1px dashed #2C2C2A", color: "#5F5E5A", cursor: "pointer", padding: 6, borderRadius: 6, fontSize: 12, width: "100%" }}>+ Add step</button></>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}><Btn onClick={onClose}>Cancel</Btn><Btn primary onClick={submit} style={{ opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : isEdit ? "Save" : "Create"}</Btn></div>
      </div>
    </div>
  );
}

function LinkModal({ lm, issues, tests, links, lnk, onClose }) {
  const [err, setErr] = useState(null); const [saving, setSaving] = useState(false);
  const isI = !!lm.issueId; const title = isI ? "Link a test case" : "Link an issue";
  let items = [];
  if (isI) { const a = links.filter(l => l.issue_id === lm.issueId).map(l => l.test_case_id); items = tests.filter(t => !a.includes(t.id)).map(t => ({ id: t.id, l: t.title, s: t.status, ic: "▷", c: TC[t.status] })); }
  else { const a = links.filter(l => l.test_case_id === lm.testId).map(l => l.issue_id); items = issues.filter(i => !a.includes(i.id)).map(i => ({ id: i.id, l: i.title, s: i.type, ic: i.type === "bug" ? "◉" : "○", c: i.type === "bug" ? { bg: "#2D0A0A", text: "#F09595", border: "#501313" } : { bg: "#0A1929", text: "#85B7EB", border: "#042C53" } })); }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background: "#1A1A18", border: "1px solid #2C2C2A", borderRadius: 12, padding: "20px 24px", width: 380, maxHeight: "60vh", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span><button onClick={onClose} style={{ background: "none", border: "none", color: "#888780", cursor: "pointer", fontSize: 16 }}>✕</button></div>
        {err && <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 10, fontSize: 12, background: "#2D0A0A", color: "#F09595" }}>{err}</div>}
        <div style={{ flex: 1 }}>
          {items.length === 0 && <div style={{ textAlign: "center", padding: 24, color: "#5F5E5A", fontSize: 13 }}>Nothing to link</div>}
          {items.map(item => (<div key={item.id} role="button" tabIndex={0} onMouseDown={async e => { e.preventDefault(); e.stopPropagation(); if (saving) return; setSaving(true); setErr(null); try { if (isI) await lnk(lm.issueId, item.id); else await lnk(item.id, lm.testId); onClose(); } catch (e) { setErr(e.message || "Failed"); setSaving(false); } }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 6, background: "transparent", color: "#F1EFE8", cursor: saving ? "wait" : "pointer", fontSize: 13, marginBottom: 2, opacity: saving ? 0.5 : 1 }} onMouseEnter={e => { if (!saving) e.currentTarget.style.background = "#2C2C2A"; }} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><span style={{ fontSize: 14 }}>{item.ic}</span><span style={{ flex: 1 }}>{item.l}</span><Badge label={item.s} colors={item.c} small /></div>))}
        </div>
      </div>
    </div>
  );
}