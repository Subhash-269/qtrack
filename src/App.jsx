import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { supabase, isDemo } from "./supabaseClient";
import * as db from "./storage";
import TodayView from "./views/TodayView";
import AssistantView from "./views/AssistantView";
import { TASK_STATUSES, TASK_STATUS_LABEL, isTaskDone, normalizeTaskStatus, taskStatusLabel } from "../supabase/functions/_shared/status.js";
import Sidebar, { ProjectList, DeleteProjectDialog, ThemePicker } from "./components/Sidebar";
import { getThemePref, setThemePref } from "./theme";

const SHORT_DATE = (d) => { if (!d) return "—"; const dt = new Date(d); const diff = Date.now() - dt.getTime(); if (diff < 60000) return "just now"; if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`; return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }); };
const FMT = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const FMTHR = (m) => { if (m < 60) return `${m}m`; if (m < 2880) return `${Math.floor(m / 60)}h${m % 60 > 0 ? ` ${m % 60}m` : ""}`; const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); const rm = m % 60; return `${d}d${h > 0 ? ` ${h}h` : ""}${rm > 0 ? ` ${rm}m` : ""}`; };
const CATEGORIES = ["extract", "transform", "load", "validate", "utils", "config", "api", "model", "other"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const ISSUE_STATUSES = TASK_STATUSES.map(v => ({ value: v, label: TASK_STATUS_LABEL[v] }));
const ISSUE_TYPES = ["bug", "todo"];
const DUR = { work: 25 * 60, short_break: 5 * 60, long_break: 15 * 60 };
// const DUR = { work: 5, short_break: 5 * 60, long_break: 15 * 60 };
const PC = { critical: { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" }, high: { bg: "var(--tint-orange-bg)", text: "var(--orange)", border: "var(--tint-orange-bd)" }, medium: { bg: "var(--tint-amber-bg)", text: "var(--amber)", border: "var(--tint-amber-bd)" }, low: { bg: "var(--tint-green-bg)", text: "var(--lime)", border: "var(--tint-green-bd)" } };
const parseMtags = (v) => { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return v ? [v] : []; } };
const TC = { not_run: { bg: "var(--surface)", text: "var(--soft)", border: "var(--line)" }, pass: { bg: "var(--tint-green-bg)", text: "var(--lime)", border: "var(--tint-green-bd)" }, fail: { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" }, blocked: { bg: "var(--tint-amber-bg)", text: "var(--amber)", border: "var(--tint-amber-bd)" } };
const SC = { work: "#E24B4A", short_break: "#5DCAA5", long_break: "#378ADD" };

const BREAK_TIPS = {
  office: {
    short: [
      "Walk to get water — take the long way back",
      "Look out a window or across the room to rest your eyes",
      "Stand up and just stand for a minute",
      "Roll your shoulders and stretch your neck",
      "Refill your water bottle, even if it's not empty",
      "Box breathing: in 4, hold 4, out 4, hold 4 — 3 rounds",
      "Take a short bathroom trip and walk a lap on the way",
      "Grab a snack from the kitchen, eat it away from the screen",
      "Reach under the desk and stretch your back",
      "Step into a stairwell or quiet spot for a minute",
    ],
    long: [
      "Walk outside the building for a few minutes — no phone",
      "Take the stairs up and down a flight or two",
      "Find a colleague and chat about something not-work",
      "Eat something properly, away from your desk",
      "Walk a full lap of the floor, slowly",
      "Step outside for fresh air and just stand there",
      "Do a few stretches or a quick walk to shake off the stiffness",
      "Sit somewhere different and let your mind wander",
    ],
  },
  home: {
    short: [
      "Step outside or onto the balcony for fresh air",
      "Lie on the floor for two minutes",
      "Pet your dog or cat",
      "Do a few push-ups or squats",
      "Make a proper tea or coffee and wait for it",
      "Splash cold water on your face",
      "Water a plant or look at something green",
      "Put on one song and do nothing but listen",
      "Walk into another room for a change of scene",
      "Box breathing: in 4, hold 4, out 4, hold 4 — 3 rounds",
    ],
    long: [
      "Walk around the block — no phone",
      "Cook or eat something properly",
      "Lie down with your eyes closed for a bit",
      "Do a quick stretch or yoga set",
      "Step into the garden or outside",
      "Call a friend about something not-work",
      "Make a real meal and eat away from the desk",
      "Take a short walk and let your mind wander",
    ],
  },
};

const Badge = ({ label, colors, small }) => (<span style={{ display: "inline-block", fontSize: small ? 10 : 11, padding: small ? "1px 6px" : "2px 8px", borderRadius: 4, fontWeight: 500, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, whiteSpace: "nowrap" }}>{label.replace(/_/g, " ")}</span>);
const Pill = ({ children, active, onClick }) => (<button onClick={onClick} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: active ? 500 : 400, background: active ? "var(--line)" : "transparent", color: active ? "var(--text)" : "var(--sub)", border: active ? "1px solid var(--dim)" : "1px solid transparent", cursor: "pointer" }}>{children}</button>);
const Btn = ({ children, onClick, primary, small, style: s }) => (<button onClick={onClick} style={{ padding: small ? "4px 10px" : "6px 14px", borderRadius: 6, fontSize: small ? 11 : 12, fontWeight: 500, background: primary ? "var(--title)" : "transparent", color: primary ? "var(--surface)" : "var(--soft)", border: primary ? "none" : "1px solid var(--dim)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, ...s }}>{children}</button>);
const Input = ({ value, onChange, placeholder, mono, style: s }) => (<input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", width: "100%", fontFamily: mono ? "'SF Mono', monospace" : "inherit", boxSizing: "border-box", ...s }} />);
const Select = ({ value, onChange, options, style: s }) => (<select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", cursor: "pointer", ...s }}>{options.map((o) => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o.replace(/_/g, " ") : o.label}</option>)}</select>);
const TextArea = ({ value, onChange, placeholder, rows }) => (<textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows || 2} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />);
const EmptyState = ({ icon, title, sub, action, onAction }) => (<div style={{ textAlign: "center", padding: "48px 24px", color: "var(--sub)" }}><div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>{icon}</div><div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, color: "var(--soft)" }}>{title}</div><div style={{ fontSize: 12, marginBottom: 16, maxWidth: 280, margin: "0 auto 16px" }}>{sub}</div>{action && <Btn primary onClick={onAction}>+ {action}</Btn>}</div>);
const MetricCard = ({ label, value, sub, color }) => (<div style={{ background: "var(--surface)", borderRadius: 8, padding: "14px 16px", border: "1px solid var(--line)" }}><div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div><div style={{ fontSize: 22, fontWeight: 500, color: color || "var(--text)", fontFamily: "'SF Mono', monospace" }}>{value}</div>{sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}</div>);

function Ring({ size, stroke, timeLeft, totalTime, color }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, p = totalTime > 0 ? timeLeft / totalTime : 0;
  return (<svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}><circle cx={size/2} cy={size/2} r={r} fill="none" style={{ stroke: "var(--line)" }} strokeWidth={stroke} /><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - p)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s linear" }} /></svg>);
}

// Tabs that can't be hidden from the sidebar
const ALWAYS_TABS = ["today", "dashboard"];

// Phone-width layout switch. Below this width the sidebar becomes a bottom tab bar.
const MOBILE_QUERY = "(max-width: 640px)";
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => { const mq = window.matchMedia(MOBILE_QUERY); const on = () => setM(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  return m;
}
// Inline styles can't be overridden per breakpoint, so on phones collapse multi-column grids with a scoped rule.
const MOBILE_CSS = `.qt-mobile [style*="grid-template-columns: 1fr 1fr"], .qt-mobile [style*="grid-template-columns: repeat(3, 1fr)"], .qt-mobile [style*="grid-template-columns: repeat(5, 1fr)"] { grid-template-columns: 1fr !important; }`;

export default function App({ session }) {
  const [projects, setProjects] = useState([]); const [files, setFiles] = useState([]); const [issues, setIssues] = useState([]); const [testCases, setTestCases] = useState([]); const [links, setLinks] = useState([]); const [activeProjectId, setActiveProjectId] = useState(null);
  const [view, setView] = useState("today"); const [modal, setModal] = useState(null); const [linkModal, setLinkModal] = useState(null); const [sb, setSb] = useState(() => { try { return localStorage.getItem("qtrack_sb") !== "0"; } catch { return true; } });
  const [hiddenTabsMap, setHiddenTabsMap] = useState(() => { try { return JSON.parse(localStorage.getItem("qtrack_hidden_tabs_v2") || "{}"); } catch { return {}; } });
  const hiddenTabs = hiddenTabsMap[activeProjectId] || [];
  const toggleTab = (id) => {
    const cur = hiddenTabsMap[activeProjectId] || [];
    const nt = cur.includes(id) ? cur.filter(t => t !== id) : [...cur, id];
    const updated = { ...hiddenTabsMap, [activeProjectId]: nt };
    setHiddenTabsMap(updated);
    try { localStorage.setItem("qtrack_hidden_tabs_v2", JSON.stringify(updated)); } catch {}
    let dashConfig = {}; try { dashConfig = JSON.parse(localStorage.getItem("qtrack_dash_config_v2") || "{}"); } catch {}
    db.saveUserSettings({ hiddenTabs: updated, dashConfig }).catch(() => {});
  };
  const [filterType, setFilterType] = useState("all"); const [filterFile, setFilterFile] = useState("all"); const [filterPriority, setFilterPriority] = useState("all"); const [searchQ, setSearchQ] = useState(""); const [expandedTC, setExpandedTC] = useState(null);
  const [loading, setLoading] = useState(true); const [todaySessions, setTodaySessions] = useState([]); const [allSessions, setAllSessions] = useState([]);
  const [tmr, setTmr] = useState({ st: "idle", left: DUR.work, total: DUR.work, type: "work", done: 0, tType: null, tId: null, startedAt: null, pauseReason: null, pausedAt: null });
  const [notes, setNotes] = useState([]); const [columns, setColumns] = useState([]); const [cards, setCards] = useState([]); const [viewingNoteId, setViewingNoteId] = useState(null); const [queue, setQueue] = useState([]); const [meetings, setMeetings] = useState([]); const [meetingFocus, setMeetingFocus] = useState(null);
  const [showTutorial, setShowTutorial] = useState(false);
  const [people, setPeople] = useState([]);
  const [newsCache, setNewsCache] = useState([]);
  const [userTier, setUserTier] = useState("free");
  const mobile = useIsMobile(); const [moreOpen, setMoreOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(null);
  const [theme, setTheme] = useState(getThemePref); // re-renders everything when the theme changes
  const changeTheme = (t) => { setThemePref(t); setTheme(t); };
  const openOnMount = useRef(null); // item id the Tasks / Test cases view opens when it mounts

  // Show tutorial once per browser
  useEffect(() => {
    try { if (!localStorage.getItem("qtrack_tutorial_seen")) setShowTutorial(true); } catch {}
  }, [session?.user?.email]);

  const closeTutorial = () => {
    setShowTutorial(false);
    try { localStorage.setItem("qtrack_tutorial_seen", "1"); } catch {}
  };
  const tRef = useRef(null); const initRef = useRef(false); const syncRef = useRef(false); const loadedTimerRef = useRef(false);

  // When the timer runs a task from another project (e.g. started by an assistant), switch to that
  // project so the task name and session log line up. Functional update: called from stale closures.
  const timerPidRef = useRef(null);
  const followTimerProject = (row) => { if (row?.project_id && row.task_type && row.state !== "idle") { timerPidRef.current = row.project_id; setActiveProjectId(cur => cur && cur !== row.project_id ? row.project_id : cur); } };

  // Load timer from Supabase on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await db.getTimerState();
        if (saved) {
          let st = saved.state, left = saved.remaining_seconds, startedAt = saved.started_at;
          if (st === "running" && startedAt) {
            const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
            left = Math.max(0, saved.total_seconds - elapsed);
            if (left <= 0) { st = "idle"; left = DUR.work; startedAt = null; }
          }
          syncRef.current = true;
          setTmr({ st, left, total: saved.total_seconds, type: saved.session_type, done: saved.sessions_completed, tType: saved.task_type, tId: saved.task_id, studyTopic: saved.study_topic || "", startedAt, pid: saved.project_id || null, pauseReason: saved.pause_reason || null, pausedAt: saved.paused_at || null });
          followTimerProject(saved);
          setTimeout(() => { syncRef.current = false; }, 200);
        }
        loadedTimerRef.current = true;
      } catch (e) { console.error("Timer load:", e); loadedTimerRef.current = true; }
    })();
  }, []);

  // Save timer to Supabase on changes (skip if change came from sync)
  useEffect(() => {
    if (!loadedTimerRef.current || syncRef.current) return;
    db.saveTimerState(tmr).catch(e => console.error("Timer save:", e));
  }, [tmr.st, tmr.type, tmr.done, tmr.tType, tmr.tId, tmr.studyTopic, tmr.startedAt, tmr.pid, tmr.pauseReason]);

  // Subscribe to realtime for cross-device sync
  useEffect(() => {
    const channel = db.subscribeTimerState((row) => {
      if (syncRef.current) return;
      syncRef.current = true;
      let st = row.state, left = row.remaining_seconds, startedAt = row.started_at;
      if (st === "running" && startedAt) {
        const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
        left = Math.max(0, row.total_seconds - elapsed);
        if (left <= 0) { st = "idle"; left = DUR.work; startedAt = null; }
      }
      setTmr({ st, left, total: row.total_seconds, type: row.session_type, done: row.sessions_completed, tType: row.task_type, tId: row.task_id, studyTopic: row.study_topic || "", startedAt, pid: row.project_id || null, pauseReason: row.pause_reason || null, pausedAt: row.paused_at || null });
      followTimerProject(row);
      setTimeout(() => { syncRef.current = false; }, 200);
    });
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Countdown interval
  useEffect(() => {
    if (tmr.st === "running") { tRef.current = setInterval(() => { setTmr(p => { if (p.left <= 1) { clearInterval(tRef.current); finishSession(p); return p; } return { ...p, left: p.left - 1 }; }); }, 1000); } else { if (tRef.current) clearInterval(tRef.current); }
    return () => { if (tRef.current) clearInterval(tRef.current); };
  }, [tmr.st]);

  useEffect(() => { if (tmr.st === "running") document.title = `${FMT(tmr.left)} — ${tmr.type === "work" ? "Focus" : "Break"}`; else document.title = "QTrack"; }, [tmr.left, tmr.st, tmr.type]);

  const finishSession = async (p) => {
    try { if (Notification.permission === "granted") new Notification(p.type === "work" ? "Focus done!" : "Break over!", { body: p.type === "work" ? "Time for a break." : "Ready to focus?" }); } catch {}
    try { const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 800; g.gain.value = 0.3; o.start(); setTimeout(() => { o.frequency.value = 1000; }, 150); setTimeout(() => { o.stop(); ctx.close(); }, 400); } catch {}
    if (p.type === "work") { try { await db.saveFocusSession(p.pid || activeProjectId, p.tType === "issue" ? p.tId : null, p.tType === "test" ? p.tId : null, p.type, p.total, p.tType === "study" ? "study" : "focus", p.studyTopic || ""); loadToday(); } catch (e) { console.error(e); } }
    const nd = p.type === "work" ? p.done + 1 : p.done;
    let nt, nc;
    if (p.type === "work") { nt = nd >= 4 ? "long_break" : "short_break"; nc = nd >= 4 ? 0 : nd; } else { nt = "work"; nc = p.type === "long_break" ? 0 : nd; }
    setTmr({ st: "idle", left: DUR[nt], total: DUR[nt], type: nt, done: nc, tType: p.tType, tId: p.tId, pid: p.pid, studyTopic: p.studyTopic, startedAt: null });
  };

  const startTmr = (tt, ti) => { if (Notification.permission === "default") Notification.requestPermission(); setTmr(p => ({ ...p, st: "running", tType: tt || p.tType, tId: ti || p.tId, startedAt: new Date().toISOString(), pauseReason: null, pausedAt: null })); };
  const pauseWithReason = (reason) => setTmr(p => ({ ...p, st: "paused", startedAt: null, pauseReason: reason || null, pausedAt: new Date().toISOString() }));
  const pauseTmr = () => pauseWithReason(null);
  const resumeTmr = async () => {
    // Log the pause duration if there was a reason
    if (tmr.pauseReason && tmr.pausedAt) {
      const pauseDur = Math.round((Date.now() - new Date(tmr.pausedAt).getTime()) / 1000);
      if (pauseDur >= 10) {
        try { await db.saveFocusSession(tmr.pid || activeProjectId, tmr.tType === "issue" ? tmr.tId : null, tmr.tType === "test" ? tmr.tId : null, "work", pauseDur, tmr.pauseReason); loadToday(); } catch (e) { console.error(e); }
      }
    }
    setTmr(p => ({ ...p, st: "running", startedAt: new Date(Date.now() - (p.total - p.left) * 1000).toISOString(), pauseReason: null, pausedAt: null }));
  };

  const savePartial = async (t) => {
    if (t.type !== "work" || t.st === "idle") return;
    const elapsed = (t.total - t.left) - (t.taskOffset || 0);
    if (elapsed < 10) return;
    try { await db.saveFocusSession(t.pid || activeProjectId, t.tType === "issue" ? t.tId : null, t.tType === "test" ? t.tId : null, "work", elapsed, t.tType === "study" ? "study" : "focus", t.studyTopic || ""); loadToday(); } catch (e) { console.error(e); }
  };

  const logManual = async (taskType, taskId, startTime, endTime) => {
    try { await db.saveManualSession(activeProjectId, taskType === "issue" ? taskId : null, taskType === "test" ? taskId : null, startTime, endTime); loadToday(); } catch (e) { console.error(e); throw e; }
  };

  const resetTmr = async () => { if (tmr.st !== "idle" && !confirm("Stop the current timer?")) return; await savePartial(tmr); setTmr({ st: "idle", left: DUR.work, total: DUR.work, type: "work", done: 0, tType: null, tId: null, startedAt: null, pauseReason: null, pausedAt: null }); };
  const focusOn = async (type, id, pid = activeProjectId) => {
    // If timer is running, save partial time on current task and switch — keep timer ticking
    if (tmr.st !== "idle" && tmr.type === "work") {
      // Calculate elapsed for the current task only (since task switch or session start)
      const taskElapsed = tmr.total - tmr.left - (tmr.taskOffset || 0);
      if (taskElapsed >= 10 && tmr.tId) {
        try { await db.saveFocusSession(tmr.pid || activeProjectId, tmr.tType === "issue" ? tmr.tId : null, tmr.tType === "test" ? tmr.tId : null, "work", taskElapsed); loadToday(); } catch (e) { console.error(e); }
      }
      // Update offset so future savePartial only counts time on new task; DON'T change startedAt
      setTmr({ ...tmr, tType: type, tId: id, pid, taskOffset: tmr.total - tmr.left });
      setView("focus");
      return;
    }
    // Idle or on break — start a fresh timer
    setTmr({ st: "running", left: DUR.work, total: DUR.work, type: "work", done: 0, tType: type, tId: id, pid, startedAt: new Date().toISOString(), pauseReason: null, pausedAt: null, taskOffset: 0 });
    setView("focus");
    if (Notification.permission === "default") Notification.requestPermission();
  };

  const startStudy = async (topic, navigate = true) => {
    if (tmr.st !== "idle" && tmr.type === "work") { await savePartial(tmr); }
    setTmr({ st: "running", left: DUR.work, total: DUR.work, type: "work", done: 0, tType: "study", tId: null, pid: activeProjectId, studyTopic: topic, startedAt: new Date().toISOString(), pauseReason: null, pausedAt: null, taskOffset: 0 });
    if (navigate) setView("focus");
    if (Notification.permission === "default") Notification.requestPermission();
  };

  useEffect(() => { if (!initRef.current) { initRef.current = true; loadProjects(); db.getUserProfile().then(p => {
    setUserTier(p.tier || "free");
    if (p.settings && typeof p.settings === "object") {
      if (p.settings.hiddenTabs) setHiddenTabsMap(p.settings.hiddenTabs);
      if (p.settings.dashConfig) try { localStorage.setItem("qtrack_dash_config_v2", JSON.stringify(p.settings.dashConfig)); } catch {}
    }
  }).catch(() => {}); } }, []);
  useEffect(() => { if (activeProjectId) { loadData(activeProjectId); loadToday(); } }, [activeProjectId]);

  async function loadProjects() { setLoading(true); try { const p = await db.getProjects(); setProjects(p); if (p.length > 0) setActiveProjectId((p.find(x => x.id === timerPidRef.current) || p.find(x => !x.archived_at) || p[0]).id); else { const n = await db.createProject("My first project"); setProjects([n]); setActiveProjectId(n.id); } } catch (e) { console.error(e); } setLoading(false); }
  async function loadData(pid) { try { const [f, i, t] = await Promise.all([db.getFiles(pid), db.getIssues(pid), db.getTestCases(pid)]); setFiles(f); setIssues(i); setTestCases(t); try { setLinks(await db.getLinks(pid)); } catch { setLinks([]); } try { setNotes(await db.getNotes(pid)); } catch { setNotes([]); } try { const [co, ca] = await Promise.all([db.getColumns(pid), db.getCards(pid)]); setColumns(co); setCards(ca); } catch { setColumns([]); setCards([]); } try { setQueue(await db.getQueue(pid)); } catch { setQueue([]); } try { setMeetings(await db.getMeetings(pid)); } catch { setMeetings([]); } try { setPeople(await db.getPeople(pid)); } catch { setPeople([]); } try { setNewsCache(await db.getNewsCache(pid)); } catch { setNewsCache([]); } } catch (e) { console.error(e); } }
  async function loadToday() { if (!activeProjectId) return; try { setTodaySessions(await db.getTodaySessions(activeProjectId)); } catch { setTodaySessions([]); } try { setAllSessions(await db.getAllSessions(activeProjectId)); } catch { setAllSessions([]); } }
  async function reload() { if (activeProjectId) await loadData(activeProjectId); }

  const fm = useMemo(() => Object.fromEntries(files.map(f => [f.id, f])), [files]);
  const fi = useMemo(() => { let r = issues; if (filterType !== "all") r = r.filter(i => i.type === filterType); if (filterFile !== "all") r = r.filter(i => i.file_id === filterFile); if (filterPriority !== "all") r = r.filter(i => i.priority === filterPriority); if (searchQ) r = r.filter(i => i.title.toLowerCase().includes(searchQ.toLowerCase())); return r.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)); }, [issues, filterType, filterFile, filterPriority, searchQ]);
  const ft = useMemo(() => { let r = testCases; if (filterFile !== "all") r = r.filter(t => t.file_id === filterFile); if (searchQ) r = r.filter(t => t.title.toLowerCase().includes(searchQ.toLowerCase())); return r; }, [testCases, filterFile, searchQ]);

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg)", color: "var(--sub)" }}>Loading...</div>;

  const stats = { ob: issues.filter(i => i.type === "bug" && !isTaskDone(i.status)).length, ot: issues.filter(i => i.type === "todo" && !isTaskDone(i.status)).length, tp: testCases.filter(t => t.status === "pass").length, tt: testCases.length, fc: files.length, cr: issues.filter(i => i.priority === "critical" && !isTaskDone(i.status)).length };
  const tw = todaySessions.filter(s => s.session_type === "work");
  const focusWork = tw.filter(s => s.subtype !== "waiting" && s.subtype !== "interrupted" && s.subtype !== "meeting");
  const savedSeconds = focusWork.reduce((a, s) => a + s.duration_seconds, 0);
  const liveElapsed = (tmr.st === "running" && tmr.type === "work") ? (tmr.total - tmr.left) : 0;
  const tfm = Math.round((savedSeconds + liveElapsed) / 60);

  const activeProject = projects.find(p => p.id === activeProjectId);
  const isWorkshop = activeProject?.type === "workshop";
  const isPremium = userTier === "premium" || userTier === "founder";

  const nav = (isWorkshop ? [
    { id: "today", l: "Today", ic: "☀" },
    { id: "dashboard", l: "Dashboard", ic: "⊞" },
    { id: "calendar", l: "Sessions", ic: "▦", cnt: meetings.filter(m => !m.attended && !m.cancelled).length || 0 },
    { id: "notes", l: "Notes", ic: "≡", cnt: notes.length || 0 },
    { id: "people", l: "People", ic: "◎", cnt: people.length || 0 },
    { id: "news", l: "News", ic: "☰", cnt: 0 },
    { id: "board", l: "Board", ic: "⊟", cnt: cards.length || 0 },
  ] : [
    { id: "today", l: "Today", ic: "☀" },
    { id: "dashboard", l: "Dashboard", ic: "⊞" },
    { id: "focus", l: "Focus", ic: "◎", cnt: tmr.st !== "idle" ? "●" : 0 },
    { id: "issues", l: "Tasks", ic: "⚑", cnt: stats.ob + stats.ot },
    { id: "tests", l: "Test cases", ic: "✓", cnt: stats.tt },
    { id: "files", l: "Files", ic: "◇", cnt: stats.fc },
    { id: "calendar", l: "Calendar", ic: "▦", cnt: meetings.filter(m => !m.attended && !m.cancelled).length || 0 },
    { id: "notes", l: "Notes", ic: "≡", cnt: notes.length || 0 },
    { id: "news", l: "News", ic: "☰", cnt: 0 },
    { id: "board", l: "Board", ic: "⊟", cnt: cards.length || 0 },
  ]).filter(n => n.id !== "news" || isPremium);

  const addProject = async (n, type = "project") => { const p = await db.createProject(n, type); setProjects([...projects, p]); setActiveProjectId(p.id); setModal(null); };
  const renameProject = async (id, n) => { if (!n.trim()) return; await db.renameProject(id, n.trim()); setProjects(projects.map(p => p.id === id ? { ...p, name: n.trim() } : p)); };
  const liveProjects = projects.filter(p => !p.archived_at);
  const archiveProject = async (id, archive) => {
    if (archive && liveProjects.length <= 1) { alert("You need at least one active project. Create another before archiving this one."); return; }
    try {
      const archived_at = await db.setProjectArchived(id, archive);
      setProjects(projects.map(p => p.id === id ? { ...p, archived_at } : p));
      if (archive && activeProjectId === id) setActiveProjectId(liveProjects.find(p => p.id !== id)?.id);
      if (!archive) setActiveProjectId(id);
    } catch (e) { alert("Couldn't " + (archive ? "archive" : "restore") + " the project: " + (e.message || e)); }
  };
  const recolorProject = async (id, color) => {
    try { await db.setProjectColor(id, color); setProjects(ps => ps.map(p => p.id === id ? { ...p, color } : p)); }
    catch (e) { alert("Couldn't change the color: " + (e.message || e)); }
  };
  // Called from the delete dialog, after the user typed the project name
  const confirmDeleteProject = async (id) => {
    try {
      await db.deleteProject(id);
      const r = projects.filter(p => p.id !== id); setProjects(r);
      if (activeProjectId === id) setActiveProjectId((r.find(p => !p.archived_at) || r[0])?.id);
    } catch (e) { alert("Couldn't delete the project: " + (e.message || e)); }
    setDeletingProject(null);
  };
  const addFile = async (n, c) => { await db.createFile(activeProjectId, n, c); await reload(); setModal(null); };
  const addIssue = async (fid, t, ty, pr, d, ep, dd, rn, bn, mt) => { await db.createIssue(activeProjectId, fid, t, ty, pr, d, ep, dd, rn, bn, mt); await reload(); setModal(null); };
  const addTest = async (fid, t, pre, st, ep, dd, rn, bn, mt) => { await db.createTestCase(activeProjectId, fid, t, pre, st, ep, dd, rn, bn, mt); await reload(); setModal(null); };

  // Count completed pomodoros per task
  const pomCount = (type, id) => allSessions.filter(s => s.session_type === "work" && (type === "issue" ? s.issue_id === id : s.test_case_id === id)).length;
  const fmtDue = (d) => { if (!d) return null; const dt = new Date(d + "T00:00:00"); const today = new Date(); today.setHours(0,0,0,0); const diff = Math.ceil((dt - today) / 86400000); if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, color: "var(--pink)" }; if (diff === 0) return { text: "Due today", color: "var(--amber)" }; if (diff === 1) return { text: "Tomorrow", color: "var(--blue)" }; return { text: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }), color: "var(--muted)" }; };
  const updIS = async (id, s) => { await db.updateIssueStatus(id, s); await reload(); };
  const updTS = async (id, s) => { await db.updateTestStatus(id, s); await reload(); };
  const delI = async (id) => { await db.deleteIssue(id); await reload(); };
  const delT = async (id) => { await db.deleteTestCase(id); await reload(); };
  const delF = async (id) => { await db.deleteFile(id); await reload(); };
  const editIssue = async (id, fields) => { await db.updateIssue(id, fields); await reload(); setModal(null); };
  const editTest = async (id, fields) => { await db.updateTestCase(id, fields); await reload(); setModal(null); };
  const lnk = async (iid, tid) => { await db.linkIssueToTest(iid, tid); await reload(); };
  const ulnk = async (iid, tid) => { await db.unlinkIssueFromTest(iid, tid); await reload(); };

  const markDone = async () => { if (tmr.tType === "issue" && tmr.tId) { await updIS(tmr.tId, "done"); } else if (tmr.tType === "test" && tmr.tId) { await updTS(tmr.tId, "pass"); } };
  // Today rows can come from any project: switch to it first so the timer, task name and session log line up
  const switchTo = (pid) => { if (pid && pid !== activeProjectId) setActiveProjectId(pid); };
  // "Open in project" from Today's details panel: switch project, go to Tasks / Test cases, open the item
  const takeOpenOnMount = () => { const id = openOnMount.current; openOnMount.current = null; return id; };
  const openItemInProject = (kind, item) => {
    openOnMount.current = item.id;
    switchTo(item.project_id);
    setSearchQ(""); setFilterType("all"); setFilterFile("all"); setFilterPriority("all");
    setView(kind === "test" ? "tests" : "issues");
  };
  const startFromToday = (kind, item) => { switchTo(item.project_id); focusOn(kind, item.id, item.project_id); };
  const focusMeetingFromToday = (m) => { switchTo(m.project_id); setMeetingFocus(m); };

  const taskName = tmr.tType === "issue" ? issues.find(i => i.id === tmr.tId)?.title : tmr.tType === "test" ? testCases.find(t => t.id === tmr.tId)?.title : tmr.tType === "study" ? `📚 ${tmr.studyTopic}` : null;

  return (
    <div className={mobile ? "qt-mobile" : undefined} style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 13 }}>
      {mobile && <style>{MOBILE_CSS}</style>}
      {/* Sidebar — fixed (src/components/Sidebar.jsx) */}
      {!mobile && <Sidebar
        sb={sb} onToggle={() => { const v = !sb; setSb(v); try { localStorage.setItem("qtrack_sb", v ? "1" : "0"); } catch { /* storage blocked */ } }}
        nav={nav.filter(n => ALWAYS_TABS.includes(n.id) || !hiddenTabs.includes(n.id))} hideableNav={nav.filter(n => !ALWAYS_TABS.includes(n.id))}
        hiddenTabs={hiddenTabs} onToggleTab={toggleTab}
        view={view} onNav={(id) => { setView(id); setSearchQ(""); setFilterType("all"); setFilterFile("all"); setFilterPriority("all"); }}
        tmr={tmr} taskName={taskName}
        projects={projects} activeProjectId={activeProjectId} onSelectProject={setActiveProjectId}
        onRename={renameProject} onRecolor={recolorProject} onArchive={archiveProject} onDelete={setDeletingProject} onNewProject={() => setModal({ type: "project" })}
        onAssistant={() => setView("assistant")} onTutorial={() => setShowTutorial(true)} onSignOut={() => supabase.auth.signOut()} theme={theme} onTheme={changeTheme}
        email={session.user.email} isDemo={isDemo} />}

      {/* Main */}
      <div style={{ marginLeft: mobile ? 0 : sb ? 220 : 54, minWidth: 0, display: "flex", flexDirection: "column", minHeight: "100vh", transition: "margin-left 0.2s ease", paddingBottom: mobile ? 64 : 0 }}>
        <div style={{ padding: mobile ? "12px 16px" : "12px 28px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {!sb && !mobile && <button onClick={() => setSb(true)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 16 }}>☰</button>}
            <span style={{ fontSize: mobile ? 17 : 16, fontWeight: mobile ? 600 : 500 }}>{view === "log" ? "Focus log" : view === "assistant" ? "Assistant access" : nav.find(n => n.id === view)?.l || ""}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {(view === "issues" || view === "tests") && <Input value={searchQ} onChange={setSearchQ} placeholder="Search..." style={{ width: mobile ? 120 : 180, fontSize: 12 }} />}
            {view === "issues" && <Btn primary onClick={() => setModal({ type: "issue" })}>+ Task</Btn>}
            {view === "tests" && <Btn primary onClick={() => setModal({ type: "test" })}>+ Test case</Btn>}
            {view === "files" && <Btn primary onClick={() => setModal({ type: "file" })}>+ File</Btn>}
          </div>
        </div>
        <div style={{ flex: 1, padding: mobile ? "16px 16px 24px" : "24px 28px", overflowY: "auto", minWidth: 0 }}>
          {view === "today" && <TodayView projects={projects} activeProjectId={activeProjectId} tmr={tmr} taskName={taskName} onStart={startFromToday} onPause={pauseTmr} onResume={resumeTmr} onDone={markDone} onOpenFocus={() => setView("focus")} onFocusMeeting={focusMeetingFromToday} onAddScribble={async (text) => { await db.createNote(activeProjectId, { content: text, category: "scratch" }); await reload(); }} onOpenItem={openItemInProject} onReload={reload} mobile={mobile} refreshOn={[projects, issues, testCases, queue, notes, meetings, tmr.st, tmr.tId]} />}
          {view === "dashboard" && !isWorkshop && <Dashboard stats={stats} issues={issues} tests={testCases} files={files} fm={fm} onNav={(v, f) => { setView(v); if (f) setFilterFile(f); }} tfm={tfm} tw={tw} focusWork={focusWork} allSessions={allSessions} notes={notes} todaySessions={todaySessions} projectId={activeProjectId} />}
          {view === "dashboard" && isWorkshop && <WorkshopDashboard meetings={meetings} notes={notes} people={people} onNav={setView} />}
          {view === "focus" && <FocusView tmr={tmr} taskName={taskName} issues={issues} tests={testCases} start={startTmr} pause={pauseTmr} pauseWith={pauseWithReason} resume={resumeTmr} reset={resetTmr} focusOn={focusOn} tfm={tfm} tw={tw} queue={queue} projectId={activeProjectId} reload={reload} allSessions={allSessions} todaySessions={todaySessions} logManual={logManual} allNotes={notes} mobile={mobile} markDone={markDone} />}
          {view === "issues" && <IssuesView takeOpenId={takeOpenOnMount} issues={fi} files={files} fm={fm} filterType={filterType} setFilterType={setFilterType} filterFile={filterFile} setFilterFile={setFilterFile} filterPriority={filterPriority} setFilterPriority={setFilterPriority} updS={updIS} del={delI} onAdd={() => setModal({ type: "issue" })} onEdit={i => setModal({ type: "issue", edit: i })} links={links} tests={testCases} ulnk={ulnk} openLink={id => setLinkModal({ issueId: id })} focusOn={focusOn} pomCount={pomCount} fmtDue={fmtDue} notes={notes} onViewNote={setViewingNoteId} queue={queue} addToQ={async (t, id) => { await db.addToQueue(activeProjectId, t, id, queue.length); await reload(); }} />}
          {view === "tests" && <TestsView takeOpenId={takeOpenOnMount} tests={ft} files={files} fm={fm} filterFile={filterFile} setFilterFile={setFilterFile} exp={expandedTC} setExp={setExpandedTC} updS={updTS} del={delT} onAdd={() => setModal({ type: "test" })} onEdit={t => setModal({ type: "test", edit: t })} links={links} allIssues={issues} ulnk={ulnk} openLink={id => setLinkModal({ testId: id })} focusOn={focusOn} pomCount={pomCount} fmtDue={fmtDue} notes={notes} onViewNote={setViewingNoteId} queue={queue} addToQ={async (t, id) => { await db.addToQueue(activeProjectId, t, id, queue.length); await reload(); }} />}
          {view === "files" && <FilesView files={files} issues={issues} tests={testCases} del={delF} onAdd={() => setModal({ type: "file" })} onNav={(v, f) => { setView(v); setFilterFile(f); }} />}
          {view === "notes" && <NotesView notes={notes} issues={issues} files={files} testCases={testCases} projectId={activeProjectId} reload={reload} meetingTags={[...new Set(meetings.map(m => m.title))]} usedRepos={[...new Set([...issues, ...testCases].map(x => x.repo_name).filter(Boolean))]} allSessions={allSessions} onStudyStart={startStudy} tmr={tmr} />}
          {view === "calendar" && <CalendarView meetings={meetings} issues={issues} testCases={testCases} projectId={activeProjectId} reload={reload} onFocusMeeting={mt => setMeetingFocus(mt)} allNotes={notes} />}
          {view === "board" && <BoardView columns={columns} cards={cards} projectId={activeProjectId} reload={reload} issues={issues} files={files} addIssue={addIssue} />}
          {view === "people" && <PeopleView people={people} meetings={meetings} projectId={activeProjectId} reload={reload} />}
          {view === "news" && <NewsView project={activeProject} newsCache={newsCache} projectId={activeProjectId} reload={reload} />}
          {view === "log" && <FocusLogView allSessions={allSessions} issues={issues} tests={testCases} logManual={logManual} />}
          {view === "assistant" && <AssistantView onChanged={reload} />}
        </div>
        {/* Music dock */}
        {!meetingFocus && !mobile && <div style={{ background: "var(--side)", borderTop: "1px solid var(--surface)", padding: "4px 20px", flexShrink: 0 }}>
          <MediaPlayer />
        </div>}
      </div>

      {/* Mobile: running-timer chip + bottom tabs + "More" sheet */}
      {mobile && !meetingFocus && (() => {
        const tabs = isWorkshop
          ? [{ id: "today", l: "Today", ic: "☀" }, { id: "dashboard", l: "Home", ic: "⊞" }, { id: "calendar", l: "Sessions", ic: "▦" }, { id: "notes", l: "Notes", ic: "≡" }]
          : [{ id: "today", l: "Today", ic: "☀" }, { id: "focus", l: "Focus", ic: "◎" }, { id: "log", l: "Log", ic: "◷" }, { id: "issues", l: "Tasks", ic: "⚑" }];
        const go = (id) => { setView(id); setSearchQ(""); setFilterType("all"); setFilterFile("all"); setFilterPriority("all"); setMoreOpen(false); };
        const inTabs = tabs.some(t => t.id === view);
        const rest = nav.filter(n => !tabs.some(t => t.id === n.id) && (ALWAYS_TABS.includes(n.id) || !hiddenTabs.includes(n.id)));
        const rowBtn = { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "11px 4px", border: "none", background: "transparent", fontSize: 14, textAlign: "left", cursor: "pointer" };
        return (<>
          {tmr.st !== "idle" && view !== "focus" && view !== "today" && (
            <div onClick={() => go("focus")} style={{ position: "fixed", left: 16, right: 16, bottom: 72, zIndex: 55, display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, cursor: "pointer" }}>
              <Ring size={26} stroke={3} timeLeft={tmr.left} totalTime={tmr.total} color={SC[tmr.type]} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{taskName || (tmr.type === "work" ? "Focusing" : "Break")}{tmr.st === "paused" ? " · paused" : ""}</span>
              <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 15, color: SC[tmr.type] }}>{FMT(tmr.left)}</span>
            </div>
          )}
          <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 56, display: "flex", background: "var(--side)", borderTop: "1px solid var(--line)", paddingBottom: "env(safe-area-inset-bottom)" }}>
            {[...tabs, { id: "__more", l: "More", ic: "⋯" }].map(t => {
              const on = t.id === "__more" ? (moreOpen || !inTabs) : view === t.id && !moreOpen;
              return (<button key={t.id} onClick={() => t.id === "__more" ? setMoreOpen(!moreOpen) : go(t.id)} style={{ flex: 1, padding: "8px 0 10px", border: "none", background: "transparent", color: on ? "var(--text)" : "var(--muted)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, fontSize: 10 }}>
                <span style={{ fontSize: 16, lineHeight: 1.2 }}>{t.ic}</span>{t.l}
              </button>);
            })}
          </div>
          {moreOpen && (
            <div onClick={() => setMoreOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 54, background: "rgba(0,0,0,0.55)" }}>
              <div onClick={e => e.stopPropagation()} style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "80vh", overflowY: "auto", background: "var(--side)", borderTop: "1px solid var(--line)", borderRadius: "18px 18px 0 0", padding: "10px 20px 84px" }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 12px" }} />
                {rest.map(n => (<button key={n.id} onClick={() => go(n.id)} style={{ ...rowBtn, color: view === n.id ? "var(--text)" : "var(--soft)" }}><span style={{ width: 20, textAlign: "center", opacity: 0.7 }}>{n.ic}</span><span style={{ flex: 1 }}>{n.l}</span>{n.cnt ? <span style={{ fontSize: 10, color: "var(--sub)" }}>{n.cnt}</span> : null}</button>))}
                <button onClick={() => go("assistant")} style={{ ...rowBtn, color: view === "assistant" ? "var(--text)" : "var(--soft)" }}><span style={{ width: 20, textAlign: "center", opacity: 0.7 }}>✦</span><span style={{ flex: 1 }}>Assistant access</span></button>
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 6px" }}>Projects</div>
                <ProjectList big autoFocus={false} projects={projects} activeProjectId={activeProjectId}
                  onSelect={(id) => { setActiveProjectId(id); setMoreOpen(false); }} onRename={renameProject} onRecolor={recolorProject}
                  onArchive={archiveProject} onDelete={(p) => { setMoreOpen(false); setDeletingProject(p); }} onNewProject={() => { setModal({ type: "project" }); setMoreOpen(false); }} />
                <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 6px" }}>Theme</div>
                <ThemePicker big value={theme} onChange={changeTheme} />
                <div style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 4 }}>
                  <button onClick={() => { setShowTutorial(true); setMoreOpen(false); }} style={{ ...rowBtn, color: "var(--muted)", fontSize: 13 }}>? Replay tutorial</button>
                  <button onClick={() => supabase.auth.signOut()} style={{ ...rowBtn, color: "var(--muted)", fontSize: 13 }}>{isDemo ? "Exit demo · sign up" : `Sign out (${session.user.email})`}</button>
                </div>
              </div>
            </div>
          )}
        </>);
      })()}

      {showTutorial && <Tutorial onClose={closeTutorial} />}
      {deletingProject && <DeleteProjectDialog project={deletingProject}
        canDelete={!!deletingProject.archived_at || liveProjects.filter(p => p.id !== deletingProject.id).length > 0}
        onCancel={() => setDeletingProject(null)}
        onArchive={async () => { const p = deletingProject; setDeletingProject(null); await archiveProject(p.id, true); }}
        onConfirm={() => confirmDeleteProject(deletingProject.id)} />}
      {modal && <Modal modal={modal} files={files} onClose={() => setModal(null)} addProject={addProject} addFile={addFile} addIssue={addIssue} addTest={addTest} editIssue={editIssue} editTest={editTest} usedRepos={[...new Set([...issues, ...testCases].map(x => x.repo_name).filter(Boolean))]} usedBranches={[...new Set([...issues, ...testCases].map(x => x.branch_name).filter(Boolean))]} meetingTags={[...new Set(meetings.map(m => m.title))]} />}
      {linkModal && <LinkModal lm={linkModal} issues={issues} tests={testCases} links={links} lnk={lnk} onClose={() => setLinkModal(null)} />}
      {viewingNoteId && (() => { const n = notes.find(x => x.id === viewingNoteId); if (!n) return null; const cc = NOTE_CAT_COLORS[n.category] || NOTE_CAT_COLORS.scratch; const li = issues.find(i => i.id === n.linked_issue_id); const lt = testCases.find(t => t.id === n.linked_test_id); const lf = files.find(f => f.id === n.linked_file_id); return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 110 }} onClick={() => setViewingNoteId(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", width: 640, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexShrink: 0 }}>
              <Badge label={n.category} colors={cc} />
              {n.title && <span style={{ fontSize: 15, fontWeight: 500, flex: 1 }}>{n.title}</span>}
              {!n.title && <span style={{ flex: 1 }} />}
              <button onClick={() => setViewingNoteId(null)} style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}><NoteContent content={n.content} /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", flexShrink: 0 }}>
              <span>{SHORT_DATE(n.updated_at)}</span>
              {li && <><span>·</span><span style={{ color: "var(--pink)" }}>◉ {li.title}</span></>}
              {lt && <><span>·</span><span style={{ color: "var(--green)" }}>▷ {lt.title}</span></>}
              {lf && <><span>·</span><span style={{ fontFamily: "'SF Mono', monospace" }}>{lf.name}</span></>}
            </div>
          </div>
        </div>); })()}
      {meetingFocus && <MeetingFocusView meeting={meetingFocus} projectId={activeProjectId} onClose={async () => { setMeetingFocus(null); await reload(); }} issues={issues} testCases={testCases} meetings={meetings} allNotes={notes} />}

    </div>
  );
}

function FocusView({ tmr, taskName, issues, tests, start, pause, pauseWith, resume, reset, focusOn, tfm, tw, queue, projectId, reload, allSessions, todaySessions, logManual, allNotes, markDone, mobile }) {
  const [picking, setPicking] = useState(false);
  const [breakTipBump, setBreakTipBump] = useState(0);
  const [breakLoc, setBreakLoc] = useState(() => { try { return localStorage.getItem("qtrack_break_loc") || "office"; } catch { return "office"; } });
  const setBreakLocPersist = (loc) => { setBreakLoc(loc); try { localStorage.setItem("qtrack_break_loc", loc); } catch {} };
  // Goal: sum of estimated_pomodoros across tasks due today, overdue, or without a due date
  const todayStr = new Date().toISOString().split("T")[0];
  const isRelevantForToday = (t) => !t.due_date || t.due_date <= todayStr;
  const openIssues = issues.filter(i => !isTaskDone(i.status) && isRelevantForToday(i));
  const openTests = tests.filter(t => t.status !== "pass" && isRelevantForToday(t));
  const goalPoms = openIssues.reduce((a, i) => a + (i.estimated_pomodoros || 0), 0) + openTests.reduce((a, t) => a + (t.estimated_pomodoros || 0), 0) || 4;
  const goalMin = goalPoms * 25;
  const goalSessions = Math.ceil(goalPoms / 4);

  // Today's completed sessions
  const todayFocusSessions = (todaySessions || []).filter(s => s.session_type === "work" && s.subtype !== "waiting" && s.subtype !== "interrupted" && s.subtype !== "meeting" && s.duration_seconds >= 60);
  const todayBreakSessions = (todaySessions || []).filter(s => s.session_type === "short_break" || s.session_type === "long_break");
  const focusDone = todayFocusSessions.length;
  const breakDone = todayBreakSessions.length;
  const sessionsDone = Math.floor(focusDone / 4);
  const pomsInCurrent = focusDone % 4;
  const [showLog, setShowLog] = useState(false);
  const [logForm, setLogForm] = useState({ taskType: "", taskId: "", date: new Date().toISOString().split("T")[0], startTime: "09:00", endTime: "10:00" });
  const [logError, setLogError] = useState(null);
  const [pauseElapsed, setPauseElapsed] = useState(0);
  const [scratch, setScratch] = useState("");
  const [checklist, setChecklist] = useState([]);
  const [newCheck, setNewCheck] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [taskInfoOpen, setTaskInfoOpen] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState(null);
  const activeNoteRef = useRef(null);
  const setNote = (id) => { activeNoteRef.current = id; setActiveNoteId(id); };
  const color = SC[tmr.type];
  const isActive = tmr.st !== "idle";
  const openTasks = [...issues.filter(i => !isTaskDone(i.status)).map(i => ({ id: i.id, t: "issue", l: i.title, p: i.priority })), ...tests.filter(t => t.status !== "pass").map(t => ({ id: t.id, t: "test", l: t.title, p: "medium" }))];
  const queuedItems = queue.map(q => { const task = openTasks.find(t => t.id === q.item_id && t.t === q.item_type); return task ? { ...task, qid: q.id } : null; }).filter(Boolean);
  const notQueued = openTasks.filter(t => !queue.some(q => q.item_id === t.id));

  useEffect(() => { let iv; if (tmr.st === "paused" && tmr.pausedAt) { iv = setInterval(() => setPauseElapsed(Math.floor((Date.now() - new Date(tmr.pausedAt).getTime()) / 1000)), 1000); } else { setPauseElapsed(0); } return () => { if (iv) clearInterval(iv); }; }, [tmr.st, tmr.pausedAt]);

  // Load: scratch text (from linked note or scratch_notes) + checklist (always from task)
  useEffect(() => {
    if (!tmr.tId) { setScratch(""); setChecklist([]); setNote(null); setSavedTick(0); return; }
    setDrawerOpen(true);

    // Always load checklist + scratch_notes from the task
    db.getTaskScratch(tmr.tType, tmr.tId).then(data => {
      try { setChecklist(Array.isArray(data?.scratch_checklist) ? data.scratch_checklist : JSON.parse(data?.scratch_checklist || "[]")); } catch { setChecklist([]); }

      // Check if a linked note exists
      const linked = (allNotes || []).filter(n => (tmr.tType === "issue" && n.linked_issue_id === tmr.tId) || (tmr.tType === "test" && n.linked_test_id === tmr.tId)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      if (linked.length > 0) {
        const noteId = linked[0].id;
        setNote(noteId);
        setScratch(linked[0].content || "");
        try { db.getNote(noteId).then(n => { if (n?.content !== undefined) setScratch(n.content); }).catch(() => {}); } catch {}
      } else {
        setNote(null);
        setScratch(data?.scratch_notes || "");
      }
    }).catch(() => { setScratch(""); setChecklist([]); setNote(null); });
  }, [tmr.tId]);

  const [savedTick, setSavedTick] = useState(0); // 0=idle, 1=saving, 2=saved, 3=error
  const [saveError, setSaveError] = useState(null);
  const saveTimer = useRef(null);

  const saveAll = (newScratch, newChecklist) => {
    if (!tmr.tId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSavedTick(1); setSaveError(null);
    saveTimer.current = setTimeout(async () => {
      try {
        const fn = tmr.tType === "issue" ? db.updateIssue : db.updateTestCase;
        if (activeNoteRef.current) {
          await db.updateNote(activeNoteRef.current, { content: newScratch });
          await fn(tmr.tId, { scratch_checklist: newChecklist });
        } else {
          await fn(tmr.tId, { scratch_notes: newScratch, scratch_checklist: newChecklist });
        }
        setSavedTick(2);
        setTimeout(() => setSavedTick(0), 1500);
      } catch (e) {
        console.error("save error", e);
        setSaveError(e.message || "Save failed");
        setSavedTick(3);
      }
    }, 800);
  };

  const updateScratch = (v) => { setScratch(v); saveAll(v, checklist); };
  const updateChecklist = (cl) => { setChecklist(cl); saveAll(scratch, cl); };

  // Flush pending save on unmount or before page unload — use refs to avoid re-firing on every keystroke
  const scratchRef = useRef("");
  const checklistRef = useRef([]);
  const tmrRef = useRef(tmr);
  useEffect(() => { scratchRef.current = scratch; }, [scratch]);
  useEffect(() => { checklistRef.current = checklist; }, [checklist]);
  useEffect(() => { tmrRef.current = tmr; }, [tmr]);
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current && tmrRef.current.tId) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const fn = tmrRef.current.tType === "issue" ? db.updateIssue : db.updateTestCase;
        if (activeNoteRef.current) {
          db.updateNote(activeNoteRef.current, { content: scratchRef.current }).catch(() => {});
          fn(tmrRef.current.tId, { scratch_checklist: checklistRef.current }).catch(() => {});
        } else {
          fn(tmrRef.current.tId, { scratch_notes: scratchRef.current, scratch_checklist: checklistRef.current }).catch(() => {});
        }
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => { window.removeEventListener("beforeunload", flush); flush(); };
  }, []);

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7); weekAgo.setHours(0,0,0,0);
  const daysWithToday = new Set([...(allSessions || []).filter(s => s.session_type === "work" && s.subtype !== "waiting" && s.subtype !== "interrupted" && s.subtype !== "meeting" && new Date(s.completed_at) >= weekAgo).map(s => new Date(s.completed_at).toDateString()), ...(tw.length > 0 || (tmr.st === "running" && tmr.type === "work") ? [new Date().toDateString()] : [])]).size;
  const goalPct = Math.min(100, Math.round((tfm / goalMin) * 100));
  const ts = todaySessions || [];
  const focusSec = ts.filter(s => s.session_type === "work" && s.subtype !== "waiting" && s.subtype !== "interrupted" && s.subtype !== "meeting").reduce((a, s) => a + s.duration_seconds, 0);
  const waitSec = ts.filter(s => s.subtype === "waiting").reduce((a, s) => a + s.duration_seconds, 0);
  const intSec = ts.filter(s => s.subtype === "interrupted").reduce((a, s) => a + s.duration_seconds, 0);

  const addQ = async (t) => { try { await db.addToQueue(projectId, t.t, t.id, queue.length); await reload(); } catch (e) { console.error(e); } };
  const removeQ = async (qid) => { try { await db.removeFromQueue(qid); await reload(); } catch (e) { console.error(e); } };
  const dragIdx = useRef(null);
  const reorderQ = async (fromIdx, toIdx) => { if (fromIdx === toIdx) return; const items = [...queuedItems]; const [moved] = items.splice(fromIdx, 1); items.splice(toIdx, 0, moved); try { await db.reorderQueue(items.map(t => t.qid)); await reload(); } catch (e) { console.error(e); } };
  const submitLog = async () => { setLogError(null); try { const s = new Date(`${logForm.date}T${logForm.startTime}`); const e = new Date(`${logForm.date}T${logForm.endTime}`); if (e <= s) { setLogError("End must be after start"); return; } await logManual(logForm.taskType, logForm.taskId, s.toISOString(), e.toISOString()); setShowLog(false); } catch (e) { setLogError(e.message); } };

  const task = tmr.tId ? (tmr.tType === "issue" ? issues.find(i => i.id === tmr.tId) : tests.find(t => t.id === tmr.tId)) : null;
  const isDone = task ? (tmr.tType === "issue" ? isTaskDone(task.status) : task.status === "pass") : false;
  const linkedNotes = task ? (allNotes || []).filter(n => (tmr.tType === "issue" && n.linked_issue_id === tmr.tId) || (tmr.tType === "test" && n.linked_test_id === tmr.tId)) : [];
  const hasTask = !!task;
  const checkedCount = checklist.filter(c => c.done).length;

  // Save scratchpad as a real note
  const promoteToNote = async () => {
    if (!scratch.trim()) return;
    try {
      await db.createNote(projectId, { title: taskName || "Focus notes", content: scratch, category: "investigation", linked_issue_id: tmr.tType === "issue" ? tmr.tId : null, linked_test_id: tmr.tType === "test" ? tmr.tId : null, linked_file_id: null, code_lang: "", meeting_tag: null });
      await reload();
    } catch (e) { console.error(e); }
  };

  // --- Slide-out context drawer ---
  const drawer = hasTask && (
    <div style={{ position: "relative" }}>
      {/* Toggle tab */}
      {!drawerOpen && !mobile && (
        <button onClick={() => setDrawerOpen(true)} style={{ position: "absolute", right: 0, top: 80, background: "var(--side)", border: "1px solid var(--surface)", borderRight: "none", borderRadius: "6px 0 0 6px", padding: "8px 6px", cursor: "pointer", color: "var(--muted)", fontSize: 11, writingMode: "vertical-rl" }}>
          {checkedCount > 0 ? `${checkedCount}/${checklist.length}` : "Notes"} ◂
        </button>
      )}
      {/* Panel */}
      <div style={{ width: mobile ? "100%" : drawerOpen ? 300 : 0, overflow: "hidden", transition: "width 0.25s ease", flexShrink: 0, height: "100%" }}>
        <div style={{ width: mobile ? "100%" : 300, height: "100%", display: "flex", flexDirection: "column", background: "var(--side)", borderRadius: 10, border: "1px solid var(--surface)" }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {task.repo_name && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--tint-blue-bg)", color: "var(--blue)", border: "1px solid var(--tint-blue-bd)", fontFamily: "'SF Mono', monospace" }}>{task.repo_name}</span>}
              <Badge label={task.status} colors={TC[task.status] || { bg: "var(--line)", text: "var(--sub)", border: "var(--dim)" }} small />
            </div>
            {!mobile && <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 12 }}>▸</button>}
          </div>

          {/* Checklist */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--surface)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Steps</span>
              {checklist.length > 0 && <span style={{ fontSize: 9, color: checkedCount === checklist.length && checklist.length > 0 ? "var(--green)" : "var(--muted)" }}>{checkedCount}/{checklist.length}</span>}
            </div>
            {checklist.map((c, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "3px 0" }}>
                <input type="checkbox" checked={c.done} onChange={() => { const cl = [...checklist]; cl[idx].done = !cl[idx].done; updateChecklist(cl); }} style={{ cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
                <input value={c.text} onChange={e => { const cl = [...checklist]; cl[idx].text = e.target.value; updateChecklist(cl); }} style={{ flex: 1, padding: "1px 4px", borderRadius: 3, fontSize: 12, color: c.done ? "var(--muted)" : "var(--title)", textDecoration: c.done ? "line-through" : "none", background: "transparent", border: "1px solid transparent", outline: "none", lineHeight: 1.4 }} onFocus={e => e.target.style.border = "1px solid var(--line)"} onBlur={e => e.target.style.border = "1px solid transparent"} />
                <button onClick={() => updateChecklist(checklist.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", color: "var(--line)", cursor: "pointer", fontSize: 9, flexShrink: 0 }}>✕</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              <input value={newCheck} onChange={e => setNewCheck(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && newCheck.trim()) { updateChecklist([...checklist, { text: newCheck.trim(), done: false }]); setNewCheck(""); } }} placeholder="+ add step..." style={{ flex: 1, padding: "4px 8px", borderRadius: 4, fontSize: 11, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--surface)", outline: "none" }} />
            </div>
          </div>

          {/* Scratchpad */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ padding: "8px 14px 0", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ fontSize: 10, color: activeNoteId ? "var(--purple)" : "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>{activeNoteId ? "Linked note" : "Scratch"}</span>
              <span style={{ fontSize: 9, color: savedTick === 3 ? "var(--pink)" : savedTick === 2 ? "var(--green)" : savedTick === 1 ? "var(--amber)" : "var(--line)" }}>{savedTick === 3 ? `✕ ${saveError?.substring(0, 40)}` : savedTick === 2 ? "✓ saved" : savedTick === 1 ? "saving..." : "auto-save"}</span>
            </div>
            <textarea
              value={scratch}
              onChange={e => updateScratch(e.target.value)}
              placeholder={"SQL, errors, notes...\n\n-- paste code here\n-- jot thoughts"}
              style={{ flex: 1, padding: "8px 14px", fontSize: 12, background: "transparent", color: "var(--title)", border: "none", outline: "none", resize: "none", fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: 1.6, minHeight: 120 }}
              onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); const s = e.target.selectionStart; const end = e.target.selectionEnd; updateScratch(scratch.substring(0, s) + "  " + scratch.substring(end)); setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; }, 0); } }}
            />
          </div>

          {/* Source + promote */}
          <div style={{ padding: "8px 14px 10px", borderTop: "1px solid var(--surface)", flexShrink: 0 }}>
            { activeNoteId ? (
              <div style={{ fontSize: 9, color: "var(--purple)", display: "flex", alignItems: "center", gap: 4 }}>
                <span>☰</span>
                <span>Editing linked note</span>
                <span style={{ color: "var(--dim)" }}>· auto-saves</span>
              </div>
            ) : (
              <button onClick={promoteToNote} style={{ background: "none", border: "1px dashed var(--surface)", color: "var(--muted)", cursor: "pointer", fontSize: 10, padding: "4px 8px", borderRadius: 4, width: "100%" }}>↗ Save as note</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // --- Timer + controls (reused) ---
  const timerSection = (size) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <Ring size={size} stroke={size > 200 ? 6 : 5} timeLeft={tmr.left} totalTime={tmr.total} color={isActive ? color : "var(--line)"} />
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: size > 200 ? 56 : 40, fontWeight: 400, fontFamily: "'SF Mono', 'Fira Code', monospace", color: isActive ? color : "var(--muted)", letterSpacing: -2, lineHeight: 1 }}>{FMT(tmr.left)}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, letterSpacing: 1, textTransform: "uppercase" }}>{tmr.type === "work" ? "focus" : tmr.type === "short_break" ? "short break" : "long break"}</div>
          <div style={{ display: "flex", gap: 5, marginTop: 8 }}>{[0,1,2,3].map(i => (<div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i < tmr.done ? color : "var(--line)" }} />))}</div>
        </div>
      </div>
      {tmr.type !== "work" && tmr.st !== "idle" && (() => {
        const tips = BREAK_TIPS[breakLoc][tmr.type === "long_break" ? "long" : "short"];
        const tip = tips[(breakDone + breakTipBump) % tips.length];
        return (
          <div style={{ marginTop: 18, maxWidth: 300, padding: "12px 16px", background: "#0E1A14", border: `1px solid ${color}44`, borderRadius: 10, textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 10 }}>
              {["office", "home"].map(loc => (
                <button key={loc} onClick={() => setBreakLocPersist(loc)} style={{ background: breakLoc === loc ? `${color}22` : "none", border: `1px solid ${breakLoc === loc ? color + "66" : "#2C2C2A"}`, color: breakLoc === loc ? color : "#5F5E5A", cursor: "pointer", fontSize: 10, padding: "3px 10px", borderRadius: 5 }}>{loc === "office" ? "🏢 Office" : "🏠 Home"}</button>
              ))}
            </div>
            <div style={{ fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color, marginBottom: 6 }}>Break idea</div>
            <div style={{ fontSize: 13, color: "var(--soft)", lineHeight: 1.5 }}>{tip}</div>
            <button onClick={() => setBreakTipBump(b => b + 1)} style={{ marginTop: 8, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 10 }}>↻ another</button>
          </div>
        );
      })()}
    </div>
  );

  const controls = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 16 }}>
      {tmr.st === "idle" && <>
        <Btn primary onClick={() => start()} style={{ padding: "10px 28px", fontSize: 14, borderRadius: 8 }}>Start</Btn>
        {!taskName && <Btn onClick={() => setPicking(true)} small style={{ color: "var(--muted)" }}>Pick task</Btn>}
        {queuedItems.length > 0 && !taskName && <Btn onClick={() => focusOn(queuedItems[0].t, queuedItems[0].id)} small style={{ color: "var(--red)" }}>▶ {queuedItems[0].l.substring(0, 16)}</Btn>}
      </>}
      {tmr.st === "running" && <>
        <Btn onClick={() => pauseWith("waiting")} small style={{ color: "#378ADD", borderColor: "#378ADD33" }}>Waiting</Btn>
        <Btn onClick={() => pauseWith("interrupted")} small style={{ color: "#D85A30", borderColor: "#D85A3033" }}>Interrupted</Btn>
        <Btn onClick={pause} small style={{ color: "var(--sub)" }}>Pause</Btn>
        <Btn onClick={reset} small style={{ color: "var(--dim)" }}>Stop</Btn>
      </>}
      {tmr.st === "paused" && !tmr.pauseReason && <>
        <Btn primary onClick={resume} style={{ padding: "10px 28px", fontSize: 14, borderRadius: 8 }}>Resume</Btn>
        <Btn onClick={reset} small style={{ color: "var(--dim)" }}>Stop</Btn>
      </>}
    </div>
  );

  // ===============================
  // TASK ACTIVE: 70/30 split
  // ===============================
  if (hasTask) {
    return (
      // Capped and centered so the notes drawer stays next to the timer on wide windows
      <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: mobile ? 20 : 0, minHeight: mobile ? 0 : "calc(100vh - 160px)", width: "100%", maxWidth: mobile ? "none" : 1120, margin: "0 auto" }}>
        {/* 70%: Timer area */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingRight: mobile ? 0 : 16 }}>
          {/* Goal bar */}
          <div style={{ width: "100%", maxWidth: 500, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>Session {sessionsDone + 1}/{goalSessions} · {pomsInCurrent}/4 pomodoros</span>
              <span style={{ fontSize: 10, color: focusDone >= goalPoms ? "var(--green)" : "var(--dim)" }}>{focusDone >= goalPoms ? "Goal reached ✓" : `${FMTHR(tfm)} / ${FMTHR(goalMin)}`}</span>
            </div>
            <div style={{ display: "flex", gap: 2, height: 6 }}>
              {Array.from({ length: goalPoms }).map((_, i) => (<Fragment key={i}>
                <div style={{ flex: 1, borderRadius: 2, background: i < focusDone ? "var(--green)" : (i === focusDone && tmr.st !== "idle" && tmr.type === "work") ? color : "var(--surface)", transition: "background 0.3s" }} />
                {i < goalPoms - 1 && <div style={{ width: ((i + 1) % 4 === 0) ? 8 : 4, borderRadius: 2, background: i < breakDone ? "#378ADD" : (i === breakDone && tmr.type !== "work" && tmr.st !== "idle") ? "#378ADD" : "var(--surface)" }} />}
              </Fragment>))}
            </div>
          </div>

          {/* Task info bar — compact by default, expandable */}
          <div style={{ marginBottom: 16, width: "100%", maxWidth: 500 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
              <Badge label={tmr.tType === "issue" ? task.type : "test"} colors={tmr.tType === "issue" ? (task.type === "bug" ? { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" } : { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }) : { bg: "var(--tint-green-bg)", text: "var(--lime)", border: "var(--tint-green-bd)" }} small />
              {tmr.tType === "issue" && <Badge label={task.priority} colors={PC[task.priority]} small />}
              <span style={{ fontSize: 13, color: "var(--title)", fontWeight: 500 }}>{taskName}</span>
              {isDone ? <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "var(--tint-green-bg)", color: "var(--green)", border: "1px solid var(--tint-green-bd)" }}>✓ done</span>
              : <button onClick={markDone} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 4, background: "none", color: "var(--green)", border: "1px solid var(--tint-green-bd)", cursor: "pointer", fontWeight: 500 }}>✓ Finish</button>}
              <button onClick={() => setTaskInfoOpen(!taskInfoOpen)} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 10 }}>{taskInfoOpen ? "▴" : "▾"}</button>
            </div>
            {taskInfoOpen && (
              <div style={{ marginTop: 10, background: "var(--side)", border: "1px solid var(--surface)", borderRadius: 8, padding: "12px 16px" }}>
                {task.description && <div style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.6, marginBottom: 10 }}>{task.description}</div>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge label={task.status} colors={TC[task.status] || { bg: "var(--line)", text: "var(--sub)", border: "var(--dim)" }} small />
                  {task.repo_name && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "var(--tint-blue-bg)", color: "var(--blue)", border: "1px solid var(--tint-blue-bd)", fontFamily: "'SF Mono', monospace" }}>{task.repo_name}</span>}
                  {task.branch_name && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "var(--bg)", color: "var(--sub)", border: "1px solid var(--line)", fontFamily: "'SF Mono', monospace" }}>{task.branch_name}</span>}
                  {task.due_date && <span style={{ fontSize: 10, color: "var(--muted)" }}>Due {task.due_date}</span>}
                  {task.estimated_pomodoros > 0 && <span style={{ fontSize: 10, color: "var(--muted)" }}>{task.estimated_pomodoros} pom</span>}
                  {parseMtags(task.meeting_tag).length > 0 && parseMtags(task.meeting_tag).map(t => <span key={t} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)" }}>{t}</span>)}
                </div>
                {linkedNotes.length > 0 && <div style={{ marginTop: 8, borderTop: "1px solid var(--surface)", paddingTop: 8 }}>{linkedNotes.map(n => <div key={n.id} style={{ fontSize: 10, color: "var(--purple)", padding: "2px 0" }}>☰ {n.title || n.content.substring(0, 40)}</div>)}</div>}
              </div>
            )}
          </div>

          {timerSection(mobile ? 190 : 200)}
          {controls}

          {/* Pause reason */}
          {tmr.st === "paused" && tmr.pauseReason && (
            <div style={{ marginTop: 16, padding: "16px 24px", background: "var(--side)", border: `1px solid ${tmr.pauseReason === "waiting" ? "#378ADD22" : "#D85A3022"}`, borderRadius: 10, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>{tmr.pauseReason === "waiting" ? "waiting for code" : "interrupted"}</div>
              <div style={{ fontSize: 28, fontFamily: "'SF Mono', monospace", color: tmr.pauseReason === "waiting" ? "#378ADD" : "#D85A30" }}>{FMT(pauseElapsed)}</div>
              <Btn primary onClick={resume} small style={{ marginTop: 10 }}>Resume focus</Btn>
            </div>
          )}

          {/* Compact stats + queue row */}
          <div style={{ display: "flex", flexDirection: mobile ? "column" : "row", gap: 12, marginTop: 24, width: "100%", maxWidth: 500 }}>
            <div style={{ flex: 1, background: "var(--side)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--surface)", fontSize: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span style={{ color: "var(--muted)" }}>Focus</span><span style={{ fontFamily: "'SF Mono', monospace", color: "var(--green)" }}>{FMTHR(Math.round(focusSec / 60))}</span></div>
              {waitSec > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span style={{ color: "var(--muted)" }}>Waiting</span><span style={{ fontFamily: "'SF Mono', monospace", color: "#378ADD" }}>{FMTHR(Math.round(waitSec / 60))}</span></div>}
              {intSec > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span style={{ color: "var(--muted)" }}>Interrupted</span><span style={{ fontFamily: "'SF Mono', monospace", color: "#D85A30" }}>{FMTHR(Math.round(intSec / 60))}</span></div>}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}><span style={{ color: "var(--muted)" }}>Sessions</span><span style={{ fontFamily: "'SF Mono', monospace", color: "var(--red)" }}>{ts.filter(s => s.session_type === "work" && s.subtype !== "waiting" && s.subtype !== "interrupted" && s.subtype !== "meeting").length}</span></div>
            </div>
            <div style={{ flex: 1, background: "var(--side)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--surface)", fontSize: 10 }}>
              <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Up next</div>
              {queuedItems.slice(0, 3).map((tk, idx) => (
                <div key={tk.qid} draggable onDragStart={() => { dragIdx.current = idx; }} onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderTop = "2px solid #7F77DD"; }} onDragLeave={e => { e.currentTarget.style.borderTop = "none"; }} onDrop={e => { e.preventDefault(); e.currentTarget.style.borderTop = "none"; if (dragIdx.current !== null) { reorderQ(dragIdx.current, idx); dragIdx.current = null; } }} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 0", cursor: "grab" }}>
                  <span style={{ color: "var(--line)", fontSize: 9 }}>⠿</span>
                  <span style={{ color: tk.t === "issue" ? "var(--pink)" : "var(--blue)", fontSize: 10 }}>{tk.t === "issue" ? "◉" : "▷"}</span>
                  <span style={{ flex: 1, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.l}</span>
                </div>
              ))}
              {queuedItems.length === 0 && <div style={{ color: "var(--line)" }}>Empty</div>}
            </div>
          </div>
        </div>

        {/* 30%: Context drawer */}
        {drawer}
      </div>
    );
  }

  // ===============================
  // NO TASK: centered hero
  // ===============================
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: "var(--muted)" }}>Session {sessionsDone + 1}/{goalSessions} · {pomsInCurrent}/4 pomodoros</span>
          <span style={{ fontSize: 10, color: focusDone >= goalPoms ? "var(--green)" : "var(--dim)" }}>{focusDone >= goalPoms ? "Goal reached ✓" : `${FMTHR(tfm)} / ${FMTHR(goalMin)}`}</span>
        </div>
        <div style={{ display: "flex", gap: 2, height: 6 }}>
          {Array.from({ length: goalPoms }).map((_, i) => (<Fragment key={i}>
            <div style={{ flex: 1, borderRadius: 2, background: i < focusDone ? "var(--green)" : (i === focusDone && tmr.st !== "idle" && tmr.type === "work") ? color : "var(--surface)", transition: "background 0.3s" }} />
            {i < goalPoms - 1 && <div style={{ width: ((i + 1) % 4 === 0) ? 8 : 4, borderRadius: 2, background: i < breakDone ? "#378ADD" : (i === breakDone && tmr.type !== "work" && tmr.st !== "idle") ? "#378ADD" : "var(--surface)" }} />}
          </Fragment>))}
        </div>
      </div>

      {tmr.tType === "study" && tmr.studyTopic && (
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>Studying</span>
          <div style={{ fontSize: 20, fontWeight: 500, color: "var(--purple)", marginTop: 2 }}>📚 {tmr.studyTopic}</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 32 }}>
        {timerSection(mobile ? 220 : 260)}
        {controls}
      </div>

      {picking && (<div style={{ maxWidth: 400, margin: "0 auto 24px", background: "var(--side)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, maxHeight: 220, overflowY: "auto" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontSize: 11, color: "var(--muted)" }}>Pick a task</span><button onClick={() => setPicking(false)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 10 }}>✕</button></div>{openTasks.map(tk => (<div key={tk.id} role="button" onMouseDown={() => { focusOn(tk.t, tk.id); setPicking(false); }} style={{ padding: "7px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, color: "var(--title)", marginBottom: 2 }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{tk.t === "issue" ? "◉" : "▷"} {tk.l}</div>))}</div>)}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "var(--side)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--surface)" }}>
          <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Today</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ fontSize: 11, color: "var(--muted)" }}>Focus</span><span style={{ fontSize: 14, fontFamily: "'SF Mono', monospace", color: "var(--green)" }}>{FMTHR(Math.round(focusSec / 60))}</span></div>
          {waitSec > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ fontSize: 11, color: "var(--muted)" }}>Waiting</span><span style={{ fontSize: 14, fontFamily: "'SF Mono', monospace", color: "#378ADD" }}>{FMTHR(Math.round(waitSec / 60))}</span></div>}
          {intSec > 0 && <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ fontSize: 11, color: "var(--muted)" }}>Interrupted</span><span style={{ fontSize: 14, fontFamily: "'SF Mono', monospace", color: "#D85A30" }}>{FMTHR(Math.round(intSec / 60))}</span></div>}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ fontSize: 11, color: "var(--muted)" }}>Sessions</span><span style={{ fontSize: 14, fontFamily: "'SF Mono', monospace", color: "var(--red)" }}>{ts.filter(s => s.session_type === "work" && s.subtype !== "waiting" && s.subtype !== "interrupted" && s.subtype !== "meeting").length}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}><span style={{ fontSize: 11, color: "var(--muted)" }}>This week</span><span style={{ fontSize: 14, fontFamily: "'SF Mono', monospace", color: "var(--blue)" }}>{daysWithToday}/7</span></div>
          <div style={{ borderTop: "1px solid var(--surface)", marginTop: 6, paddingTop: 6 }}>
            <button onClick={() => setShowLog(!showLog)} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 10, padding: 0 }}>{showLog ? "Cancel" : "+ Log past work"}</button>
          </div>
          {showLog && (<div style={{ marginTop: 8 }}>
            {logError && <div style={{ fontSize: 10, color: "var(--pink)", marginBottom: 4 }}>{logError}</div>}
            <select value={logForm.taskId ? `${logForm.taskType}:${logForm.taskId}` : ""} onChange={e => { if (e.target.value) { const [t, id] = e.target.value.split(":"); setLogForm({ ...logForm, taskType: t, taskId: id }); } }} style={{ width: "100%", padding: "3px 6px", borderRadius: 4, fontSize: 10, background: "var(--bg)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none", marginBottom: 4 }}><option value="">Task</option>{openTasks.map(t => <option key={t.id} value={`${t.t}:${t.id}`}>{t.l}</option>)}</select>
            <input type="date" value={logForm.date} onChange={e => setLogForm({ ...logForm, date: e.target.value })} style={{ width: "100%", padding: "3px 6px", borderRadius: 4, fontSize: 10, background: "var(--bg)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none", marginBottom: 4, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              <input type="time" value={logForm.startTime} onChange={e => setLogForm({ ...logForm, startTime: e.target.value })} style={{ flex: 1, padding: "3px 6px", borderRadius: 4, fontSize: 10, background: "var(--bg)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none" }} />
              <input type="time" value={logForm.endTime} onChange={e => setLogForm({ ...logForm, endTime: e.target.value })} style={{ flex: 1, padding: "3px 6px", borderRadius: 4, fontSize: 10, background: "var(--bg)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none" }} />
            </div>
            <Btn small primary onClick={submitLog} style={{ width: "100%", justifyContent: "center", fontSize: 10 }}>Save</Btn>
          </div>)}
        </div>

        <div style={{ background: "var(--side)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--surface)" }}>
          <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Up next</div>
          {queuedItems.length === 0 && <div style={{ fontSize: 11, color: "var(--line)", padding: "8px 0" }}>Queue empty</div>}
          {queuedItems.map((tk, idx) => (
            <div key={tk.qid} draggable onDragStart={() => { dragIdx.current = idx; }} onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderTop = "2px solid #7F77DD"; }} onDragLeave={e => { e.currentTarget.style.borderTop = "none"; }} onDrop={e => { e.preventDefault(); e.currentTarget.style.borderTop = "none"; if (dragIdx.current !== null) { reorderQ(dragIdx.current, idx); dragIdx.current = null; } }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 0", borderBottom: idx < queuedItems.length - 1 ? "1px solid var(--surface)" : "none", cursor: "grab" }}>
              <span style={{ fontSize: 10, color: "var(--line)", cursor: "grab" }}>⠿</span>
              <span style={{ color: tk.t === "issue" ? "var(--pink)" : "var(--blue)", fontSize: 11 }}>{tk.t === "issue" ? "◉" : "▷"}</span>
              <span style={{ flex: 1, fontSize: 11, color: idx === 0 ? "var(--title)" : "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk.l}</span>
              <button onClick={() => removeQ(tk.qid)} style={{ background: "none", border: "none", color: "var(--line)", cursor: "pointer", fontSize: 9 }}>✕</button>
            </div>
          ))}
          {queuedItems.length < 5 && notQueued.length > 0 && (
            <select onChange={e => { if (e.target.value) { const t = openTasks.find(x => x.id === e.target.value); if (t) addQ(t); e.target.value = ""; } }} defaultValue="" style={{ marginTop: 6, width: "100%", padding: "3px 6px", borderRadius: 4, fontSize: 10, background: "transparent", color: "var(--dim)", border: "1px dashed var(--surface)", outline: "none", cursor: "pointer" }}>
              <option value="">+ Add...</option>
              {notQueued.map(t => <option key={t.id} value={t.id}>{t.l}</option>)}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}

// Mobile "Log" tab: logged focus by day/week/month, plus a sheet to log past work
function FocusLogView({ allSessions, issues, tests, logManual }) {
  const [range, setRange] = useState("today");
  const [sheet, setSheet] = useState(false);
  const todayStr = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ task: "", date: todayStr, startTime: "09:00", endTime: "09:25" });
  const [err, setErr] = useState(null);
  const isPause = (s) => s.subtype === "waiting" || s.subtype === "interrupted";
  const isFocus = (s) => s.session_type === "work" && !isPause(s) && s.subtype !== "meeting";

  const dayStart = (offset) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - offset); return d; };
  const from = range === "today" ? dayStart(0) : range === "week" ? dayStart(6) : dayStart(29);
  const work = (allSessions || []).filter(s => s.session_type === "work" && new Date(s.completed_at) >= from);
  const focusSec = work.filter(isFocus).reduce((a, s) => a + s.duration_seconds, 0);
  const pauseSec = work.filter(isPause).reduce((a, s) => a + s.duration_seconds, 0);
  const taskKeys = new Set(work.filter(isFocus).map(s => s.issue_id || s.test_case_id || s.study_topic).filter(Boolean));

  // Last 7 days of focus minutes, oldest first
  const week = Array.from({ length: 7 }, (_, i) => {
    const start = dayStart(6 - i), end = new Date(start); end.setDate(end.getDate() + 1);
    const min = (allSessions || []).filter(s => isFocus(s) && new Date(s.completed_at) >= start && new Date(s.completed_at) < end).reduce((a, s) => a + s.duration_seconds, 0) / 60;
    return { label: start.toLocaleDateString("en-US", { weekday: "narrow" }), min, today: i === 6 };
  });
  const maxMin = Math.max(30, ...week.map(d => d.min));

  const label = (s) => {
    if (s.subtype === "meeting") return { name: s.study_topic || "Meeting", kind: "meeting", color: "#7F77DD" };
    if (s.issue_id) { const i = issues.find(x => x.id === s.issue_id); return { name: i?.title || "Task", kind: i?.type || "issue", color: i?.type === "todo" ? "var(--blue)" : "var(--red)" }; }
    if (s.test_case_id) return { name: tests.find(x => x.id === s.test_case_id)?.title || "Test case", kind: "test", color: "var(--green)" };
    if (s.study_topic) return { name: s.study_topic, kind: "study", color: "var(--purple)" };
    return { name: "Focus", kind: "focus", color: "var(--sub)" };
  };
  const hm = (d) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

  const openTasks = [...issues.filter(i => !isTaskDone(i.status)).map(i => ({ v: `issue:${i.id}`, l: i.title })), ...tests.filter(t => t.status !== "pass").map(t => ({ v: `test:${t.id}`, l: t.title }))];
  const start = new Date(`${form.date}T${form.startTime}`), end = new Date(`${form.date}T${form.endTime}`);
  const previewMin = Math.round((end - start) / 60000);
  const save = async () => {
    setErr(null);
    if (!(previewMin > 0)) { setErr("End must be after start"); return; }
    const [t, id] = form.task ? form.task.split(":") : ["", ""];
    try { await logManual(t, id, start.toISOString(), end.toISOString()); setSheet(false); } catch (e) { setErr(e.message); }
  };
  const field = { width: "100%", padding: "10px 12px", borderRadius: 9, fontSize: 13, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", background: "var(--side)", border: "1px solid var(--surface)", borderRadius: 10, padding: 3 }}>
          {["today", "week", "month"].map(r => (<button key={r} onClick={() => setRange(r)} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "none", fontSize: 12, cursor: "pointer", background: range === r ? "var(--line)" : "transparent", color: range === r ? "var(--text)" : "var(--muted)", textTransform: "capitalize" }}>{r}</button>))}
        </div>
        <Btn onClick={() => setSheet(true)} style={{ color: "var(--text)" }}>+ Log</Btn>
      </div>

      <div style={{ marginTop: 22, fontSize: 34, fontFamily: "'SF Mono', monospace", color: "var(--green)", letterSpacing: -1 }}>{FMTHR(Math.round(focusSec / 60))}</div>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--sub)", marginTop: 4 }}>
        <span><b style={{ color: "var(--text)", fontWeight: 500 }}>{work.filter(isFocus).length}</b> sessions</span>
        <span><b style={{ color: "var(--text)", fontWeight: 500 }}>{FMTHR(Math.round(pauseSec / 60))}</b> paused</span>
        <span><b style={{ color: "var(--text)", fontWeight: 500 }}>{taskKeys.size}</b> tasks</span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 80, margin: "22px 0 6px" }}>
        {week.map((d, i) => (<div key={i} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 5 }}>
          <div title={`${Math.round(d.min)}m`} style={{ width: "100%", height: `${Math.max(4, (d.min / maxMin) * 100)}%`, borderRadius: 4, background: d.today ? "var(--green)" : "var(--line)" }} />
          <span style={{ fontSize: 9, color: "var(--muted)" }}>{d.label}</span>
        </div>))}
      </div>

      <div style={{ marginTop: 14 }}>
        {work.length === 0 && <EmptyState icon="◷" title="Nothing logged yet" sub="Finish a focus session or log past work to see it here." />}
        {work.map(s => {
          const fin = new Date(s.completed_at), beg = s.started_at ? new Date(s.started_at) : new Date(fin - s.duration_seconds * 1000);
          const l = isPause(s) ? { name: `Paused · ${s.subtype}`, kind: null, color: "var(--amber)" } : label(s);
          return (<div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--surface)" }}>
            <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: l.color }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{range !== "today" && `${fin.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · `}{hm(beg)} – {hm(fin)}{l.kind ? ` · ${l.kind}` : ""}{s.subtype === "manual" ? " · logged" : ""}</div>
            </div>
            <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 12, color: isPause(s) ? "var(--amber)" : "var(--sub)" }}>{FMTHR(Math.round(s.duration_seconds / 60))}</span>
          </div>);
        })}
      </div>

      {sheet && (
        <div onClick={() => setSheet(false)} style={{ position: "fixed", inset: 0, zIndex: 120, background: "rgba(0,0,0,0.55)" }}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxWidth: 560, margin: "0 auto", background: "var(--side)", borderTop: "1px solid var(--line)", borderRadius: "22px 22px 0 0", padding: "10px 20px calc(26px + env(safe-area-inset-bottom))" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--line)", margin: "0 auto 16px" }} />
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Log past work</div>
            <div style={{ marginBottom: 12 }}><div style={lbl}>Task</div>
              <select value={form.task} onChange={e => setForm({ ...form, task: e.target.value })} style={field}><option value="">No task</option>{openTasks.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></div>
            <div style={{ marginBottom: 12 }}><div style={lbl}>Date</div>
              <input type="date" value={form.date} max={todayStr} onChange={e => setForm({ ...form, date: e.target.value })} style={field} /></div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}><div style={lbl}>Start</div><input type="time" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} style={field} /></div>
              <div style={{ flex: 1 }}><div style={lbl}>End</div><input type="time" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} style={field} /></div>
            </div>
            <div style={{ fontSize: 11, color: err ? "var(--pink)" : "var(--muted)", margin: "2px 0 14px" }}>{err || (previewMin > 0 ? <>Adds <b style={{ color: "var(--green)", fontWeight: 500 }}>{FMTHR(previewMin)}</b> of focus · about {Math.max(1, Math.round(previewMin / 25))} pomodoro{Math.round(previewMin / 25) > 1 ? "s" : ""}</> : "End must be after start")}</div>
            <button onClick={save} style={{ width: "100%", padding: 12, borderRadius: 11, border: "none", background: "var(--text)", color: "var(--bg)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Save session</button>
          </div>
        </div>
      )}
    </div>
  );
}

function MediaPlayer() {
  const [embedUrl, setEmbedUrl] = useState(() => { try { return localStorage.getItem("qtrack_media_embed") || ""; } catch { return ""; } });
  const [inputVal, setInputVal] = useState("");
  const [type, setType] = useState(() => { try { return localStorage.getItem("qtrack_media_type") || ""; } catch { return ""; } });
  const [subtype, setSubtype] = useState(() => { try { return localStorage.getItem("qtrack_media_sub") || ""; } catch { return ""; } });
  const [mode, setMode] = useState("mini");
  const [history, setHistory] = useState([]);
  const [naming, setNaming] = useState(null);
  const [nameVal, setNameVal] = useState("");
  // YouTube player state
  const [ytPlaying, setYtPlaying] = useState(false);
  const [ytTime, setYtTime] = useState(0);
  const [ytDuration, setYtDuration] = useState(0);
  const [ytTitle, setYtTitle] = useState("");
  const [ytVol, setYtVol] = useState(80);
  const [showVid, setShowVid] = useState(false);
  const ytRef = useRef(null);
  const ytDivRef = useRef(null);
  const ytInterval = useRef(null);

  useEffect(() => { db.getMediaHistory().then(h => setHistory(h || [])).catch(() => {}); }, []);

  // Load YouTube IFrame API
  useEffect(() => {
    if (type !== "youtube" || !embedUrl) return;
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    const initPlayer = () => {
      const videoId = embedUrl.split("/embed/")[1]?.split("?")[0];
      if (!videoId || !ytDivRef.current) return;
      if (ytRef.current) { try { ytRef.current.destroy(); } catch {} }
      ytRef.current = new window.YT.Player(ytDivRef.current, {
        videoId,
        height: "180",
        width: "100%",
        playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0 },
        events: {
          onReady: (e) => {
            e.target.setVolume(ytVol);
            setYtDuration(e.target.getDuration() || 0);
            try { setYtTitle(e.target.getVideoData()?.title || ""); } catch {}
            ytInterval.current = setInterval(() => {
              if (ytRef.current) {
                setYtTime(ytRef.current.getCurrentTime() || 0);
                setYtDuration(ytRef.current.getDuration() || 0);
              }
            }, 500);
          },
          onStateChange: (e) => {
            setYtPlaying(e.data === 1);
            if (e.data === 1) try { setYtTitle(ytRef.current.getVideoData()?.title || ""); } catch {}
          }
        }
      });
    };
    if (window.YT && window.YT.Player) initPlayer();
    else window.onYouTubeIframeAPIReady = initPlayer;
    return () => { if (ytInterval.current) clearInterval(ytInterval.current); };
  }, [embedUrl, type]);

  const parseUrl = (raw) => { if (!raw) return null; let m = raw.match(/open\.spotify\.com\/(track|playlist|album|episode)\/([a-zA-Z0-9]+)/); if (m) return { type: "spotify", sub: m[1], embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` }; m = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/); if (m) return { type: "youtube", sub: "video", embed: `https://www.youtube.com/embed/${m[1]}` }; m = raw.match(/music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/); if (m) return { type: "youtube", sub: "video", embed: `https://www.youtube.com/embed/${m[1]}` }; return null; };
  const defaultName = (t, s) => t === "spotify" ? `Spotify ${s}` : "YouTube";
  const saveHistory = (nh) => { setHistory(nh); db.saveMediaHistory(nh).catch(() => {}); };
  const currentName = () => { const h = history.find(x => x.embed === embedUrl); return h?.name || ytTitle || defaultName(type, subtype); };
  const playUrl = (raw) => { const p = parseUrl(raw); if (!p) return; setEmbedUrl(p.embed); setType(p.type); setSubtype(p.sub); setInputVal(""); setMode("mini"); setShowVid(false); try { localStorage.setItem("qtrack_media_embed", p.embed); localStorage.setItem("qtrack_media_type", p.type); localStorage.setItem("qtrack_media_sub", p.sub); } catch {} const existing = history.find(h => h.embed === p.embed); if (existing) { saveHistory([existing, ...history.filter(h => h.embed !== p.embed)]); } else { setNaming(p.embed); setNameVal(defaultName(p.type, p.sub)); } };
  const saveName = () => { const name = nameVal.trim() || defaultName(type, subtype); saveHistory([{ embed: embedUrl, type, sub: subtype, name }, ...history.filter(h => h.embed !== embedUrl)].slice(0, 8)); setNaming(null); };
  const playFromHistory = (h) => { setEmbedUrl(h.embed); setType(h.type); setSubtype(h.sub); setMode("mini"); setShowVid(false); try { localStorage.setItem("qtrack_media_embed", h.embed); localStorage.setItem("qtrack_media_type", h.type); localStorage.setItem("qtrack_media_sub", h.sub); } catch {} };
  const clearMedia = () => {
    if (ytRef.current) { try { ytRef.current.destroy(); } catch {} ytRef.current = null; }
    if (ytInterval.current) clearInterval(ytInterval.current);
    setEmbedUrl(""); setType(""); setSubtype(""); setMode("mini"); setNaming(null); setYtPlaying(false); setYtTime(0); setYtDuration(0); setYtTitle(""); setShowVid(false);
    try { localStorage.removeItem("qtrack_media_embed"); localStorage.removeItem("qtrack_media_type"); localStorage.removeItem("qtrack_media_sub"); } catch {}
  };
  const removeHistory = (embed) => { saveHistory(history.filter(h => h.embed !== embed)); };
  const isPlaylist = subtype === "playlist" || subtype === "album";
  const fmtTime = (s) => { const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };

  // --- YOUTUBE PLAYING ---
  if (embedUrl && type === "youtube") {
    return (
      <div>
        {naming && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 0" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Name:</span>
            <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveName(); }} placeholder="e.g. Lo-fi beats..." style={{ flex: 1, padding: "4px 8px", borderRadius: 4, fontSize: 11, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
            <Btn small onClick={saveName}>Save</Btn>
          </div>
        )}
        {/* Hidden/shown video */}
        <div style={{ height: showVid ? 180 : 0, overflow: "hidden", borderRadius: 6, transition: "height 0.2s ease", marginBottom: showVid ? 6 : 0 }}>
          <div ref={ytDivRef} />
        </div>
        {/* Custom dock bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
          {/* Title */}
          <div style={{ flex: "0 0 180px", minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ytTitle || currentName()}</div>
            <div style={{ fontSize: 9, color: "var(--muted)" }}>YouTube</div>
          </div>
          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => { if (ytRef.current) ytRef.current.seekTo(Math.max(0, ytRef.current.getCurrentTime() - 10)); }} title="Back 10s" style={{ background: "none", border: "none", color: "var(--soft)", cursor: "pointer", fontSize: 14 }}>⏮</button>
            <button onClick={() => { if (ytRef.current) { ytPlaying ? ytRef.current.pauseVideo() : ytRef.current.playVideo(); } }} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "var(--text)", color: "var(--bg)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{ytPlaying ? "⏸" : "▶"}</button>
            <button onClick={() => { if (ytRef.current) ytRef.current.seekTo(Math.min(ytDuration, ytRef.current.getCurrentTime() + 10)); }} title="Forward 10s" style={{ background: "none", border: "none", color: "var(--soft)", cursor: "pointer", fontSize: 14 }}>⏭</button>
          </div>
          {/* Progress */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "'SF Mono', monospace", minWidth: 32 }}>{fmtTime(ytTime)}</span>
            <div style={{ flex: 1, height: 4, background: "var(--line)", borderRadius: 2, cursor: "pointer", position: "relative" }} onClick={e => { if (ytRef.current && ytDuration) { const rect = e.currentTarget.getBoundingClientRect(); const pct = (e.clientX - rect.left) / rect.width; ytRef.current.seekTo(pct * ytDuration); } }}>
              <div style={{ height: "100%", width: `${ytDuration ? (ytTime / ytDuration) * 100 : 0}%`, background: "var(--red)", borderRadius: 2, transition: "width 0.3s linear" }} />
            </div>
            <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "'SF Mono', monospace", minWidth: 32 }}>{fmtTime(ytDuration)}</span>
          </div>
          {/* Volume */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "0 0 100px" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{ytVol === 0 ? "🔇" : "🔊"}</span>
            <input type="range" min="0" max="100" value={ytVol} onChange={e => { const v = Number(e.target.value); setYtVol(v); if (ytRef.current) ytRef.current.setVolume(v); }} style={{ flex: 1, height: 3, accentColor: "var(--red)" }} />
          </div>
          {/* Mode buttons */}
          <button onClick={() => setShowVid(!showVid)} title={showVid ? "Hide video" : "Show video"} style={{ width: 26, height: 26, borderRadius: 4, border: "none", background: showVid ? "var(--line)" : "transparent", color: showVid ? "var(--text)" : "var(--muted)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>◻</button>
          <button onClick={clearMedia} title="Stop" style={{ width: 26, height: 26, borderRadius: 4, border: "none", background: "transparent", color: "var(--dim)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
      </div>
    );
  }

  // --- SPOTIFY PLAYING ---
  if (embedUrl && type === "spotify") {
    const iframeH = mode === "tracks" ? 380 : mode === "full" ? 152 : 80;
    return (
      <div>
        {naming && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "6px 0" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Name:</span>
            <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") saveName(); }} placeholder="e.g. Lo-fi beats..." style={{ flex: 1, padding: "4px 8px", borderRadius: 4, fontSize: 11, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
            <Btn small onClick={saveName}>Save</Btn>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, opacity: 0.85 }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden", borderRadius: 6, transition: "height 0.2s ease", height: iframeH }}>
            <iframe src={embedUrl} width="100%" height={Math.max(iframeH, 80)} frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" allowFullScreen style={{ borderRadius: 6, display: "block" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, paddingBottom: 28 }}>
            <button onClick={() => setMode("mini")} title="Mini" style={{ width: 26, height: 26, borderRadius: 4, border: "none", background: mode === "mini" ? "var(--line)" : "transparent", color: mode === "mini" ? "var(--text)" : "var(--muted)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>▬</button>
            <button onClick={() => setMode("full")} title="Expand" style={{ width: 26, height: 26, borderRadius: 4, border: "none", background: mode === "full" ? "var(--line)" : "transparent", color: mode === "full" ? "var(--text)" : "var(--muted)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>◻</button>
            {isPlaylist && <button onClick={() => setMode("tracks")} title="Tracks" style={{ width: 26, height: 26, borderRadius: 4, border: "none", background: mode === "tracks" ? "var(--line)" : "transparent", color: mode === "tracks" ? "var(--text)" : "var(--muted)", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>≡</button>}
            <button onClick={clearMedia} title="Stop" style={{ width: 26, height: 26, borderRadius: 4, border: "none", background: "transparent", color: "var(--dim)", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
          </div>
        </div>
      </div>
    );
  }

  // --- EMPTY STATE ---
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
        <span style={{ fontSize: 12, color: "var(--line)" }}>♪</span>
        <input value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") playUrl(inputVal); }} placeholder="Paste Spotify or YouTube URL..." style={{ flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 11, background: "transparent", color: "var(--muted)", border: "1px solid var(--surface)", outline: "none", fontFamily: "'SF Mono', monospace" }} />
      </div>
      {history.length > 0 && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
          {history.slice(0, 4).map((hi, idx) => (
            <div key={idx} style={{ display: "inline-flex", alignItems: "center", background: "var(--side)", border: "1px solid var(--surface)", borderRadius: 4, overflow: "hidden" }}>
              <button onClick={() => playFromHistory(hi)} style={{ padding: "3px 8px", fontSize: 9, cursor: "pointer", border: "none", background: "transparent", color: "var(--soft)" }}>{hi.type === "spotify" ? "♫" : "▶"} {hi.name || defaultName(hi.type, hi.sub)}</button>
              <button onClick={() => removeHistory(hi.embed)} title="Remove" style={{ padding: "3px 4px", border: "none", borderLeft: "1px solid var(--surface)", background: "transparent", color: "var(--line)", cursor: "pointer", fontSize: 8 }} onMouseEnter={e => e.currentTarget.style.color = "var(--pink)"} onMouseLeave={e => e.currentTarget.style.color = "var(--line)"}>✕</button>
            </div>
          ))}
          {history.length > 4 && <span style={{ fontSize: 9, color: "var(--line)" }}>+{history.length - 4}</span>}
        </div>
      )}
    </div>
  );
}

function Dashboard({ stats, issues, tests, files, fm, onNav, tfm, tw, focusWork, allSessions, notes, todaySessions, projectId }) {
  const pr = stats.tt > 0 ? Math.round((stats.tp / stats.tt) * 100) : 0;
  const branchColors = ["var(--red)", "#378ADD", "var(--green)", "#D85A30", "#7F77DD", "#D4537E", "#BA7517", "#639922"];

  // Meeting + total time
  const meetMin = Math.round((todaySessions || []).filter(s => s.subtype === "meeting").reduce((a, s) => a + s.duration_seconds, 0) / 60);
  const totalMin = tfm + meetMin;

  // Dashboard customization
  const [dashConfigMap, setDashConfigMap] = useState(() => { try { return JSON.parse(localStorage.getItem("qtrack_dash_config_v2") || "{}"); } catch { return {}; } });
  const [showDashSettings, setShowDashSettings] = useState(false);
  const [chartWeekOff, setChartWeekOff] = useState(0);
  const [chartStart, setChartStart] = useState("");
  const [chartEnd, setChartEnd] = useState("");
  const useCustomRange = chartStart && chartEnd;
  const dashConfig = dashConfigMap[projectId] || {};
  const isVisible = (key) => dashConfig[key] !== false;
  const toggleSection = (key) => {
    const nc = { ...dashConfig, [key]: !isVisible(key) };
    const updated = { ...dashConfigMap, [projectId]: nc };
    setDashConfigMap(updated);
    try { localStorage.setItem("qtrack_dash_config_v2", JSON.stringify(updated)); } catch {}
    let hiddenTabs = {}; try { hiddenTabs = JSON.parse(localStorage.getItem("qtrack_hidden_tabs_v2") || "{}"); } catch {}
    db.saveUserSettings({ hiddenTabs, dashConfig: updated }).catch(() => {});
  };

  const SECTIONS = [
    { key: "metrics", label: "Metrics" },
    { key: "repos", label: "Tasks by repo" },
    { key: "hotfiles", label: "Hot files" },
    { key: "resolved", label: "Recently shipped" },
    { key: "chart", label: "Weekly chart" },
  ];

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
      {/* Settings toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <div style={{ position: "relative" }}>
          <button onClick={() => setShowDashSettings(!showDashSettings)} style={{ background: showDashSettings ? "var(--line)" : "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, padding: "4px 8px", borderRadius: 4 }}>⚙ Customize</button>
          {showDashSettings && (
            <div style={{ position: "absolute", top: 30, right: 0, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", width: 180, zIndex: 60, boxShadow: "0 4px 12px rgba(0,0,0,0.4)" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Show sections</div>
              {SECTIONS.map(s => (
                <label key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12, color: isVisible(s.key) ? "var(--title)" : "var(--dim)", cursor: "pointer" }}>
                  <input type="checkbox" checked={isVisible(s.key)} onChange={() => toggleSection(s.key)} style={{ cursor: "pointer" }} />
                  {s.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Top metrics */}
      {isVisible("metrics") && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 24 }}>
        <MetricCard label="Today's focus" value={FMTHR(tfm)} color="var(--red)" sub={`${focusWork.length} sessions`} />
        <MetricCard label="Meetings" value={FMTHR(meetMin)} color="#7F77DD" sub="today" />
        <MetricCard label="Total time" value={FMTHR(totalMin)} color="var(--green)" sub="focus + meetings" />
        <MetricCard label="Open bugs" value={stats.ob} color={stats.ob > 0 ? "var(--pink)" : "var(--lime)"} sub={stats.cr > 0 ? `${stats.cr} critical` : ""} />
        <MetricCard label="Open to-dos" value={stats.ot} color="var(--blue)" />
        <MetricCard label="Test pass" value={stats.tt > 0 ? `${pr}%` : "—"} color={pr >= 80 ? "var(--lime)" : pr >= 50 ? "var(--amber)" : "var(--pink)"} sub={`${stats.tp}/${stats.tt}`} />
      </div>
      )}

      {/* Repo+branch sections */}
      {isVisible("repos") && (sortedKeys.length > 1 || (sortedKeys.length === 1 && sortedKeys[0] !== "")) ? (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: "var(--soft)" }}>Tasks by repo & branch</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {sortedKeys.map(key => {
              const gi = groups[key];
              const open = gi.filter(i => !isTaskDone(i.status));
              const bugs = open.filter(i => i.type === "bug").length;
              const todos = open.filter(i => i.type === "todo").length;
              const fixed = gi.filter(i => normalizeTaskStatus(i.status) === "done").length;
              const color = branchColorMap[key] || "#888780";

              // Hot files for this group
              const fic = {};
              open.forEach(i => { fic[i.file_id] = (fic[i.file_id] || 0) + 1; });
              const hot = Object.entries(fic).sort((a, b) => b[1] - a[1]).slice(0, 3);

              // Recent for this group
              const recent = [...gi].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 3);

              return (
                <div key={key || "__none"} style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px", borderLeft: key ? `3px solid ${color}` : "3px solid var(--dim)", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 12, fontWeight: 500, color: key ? color : "var(--muted)" }}>{key || "No repo/branch"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {bugs > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "var(--tint-red-bg)", color: "var(--pink)" }}>{bugs} bug{bugs !== 1 ? "s" : ""}</span>}
                      {todos > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "var(--tint-blue-bg)", color: "var(--blue)" }}>{todos} todo{todos !== 1 ? "s" : ""}</span>}
                      {fixed > 0 && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: "var(--tint-green-bg)", color: "var(--green)" }}>{fixed} done</span>}
                    </div>
                  </div>

                  {/* Hot files */}
                  {hot.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Hot files</div>
                      {hot.map(([fid, c]) => (
                        <div key={fid} onClick={() => onNav("issues", fid)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", cursor: "pointer", fontSize: 11 }}>
                          <span style={{ fontFamily: "'SF Mono', monospace", flex: 1, color: "var(--title)" }}>{fm[fid]?.name || "?"}</span>
                          <div style={{ display: "flex", gap: 1 }}>{Array.from({ length: Math.min(c, 5) }).map((_, j) => (<div key={j} style={{ width: 4, height: 12, borderRadius: 1, background: color, opacity: 0.4 + (j / c) * 0.6 }} />))}</div>
                          <span style={{ color: "var(--sub)", minWidth: 12, textAlign: "right" }}>{c}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recent issues */}
                  <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 4 }}>Recent</div>
                  {recent.map(i => (
                    <div key={i.id} onClick={() => onNav("issues", i.file_id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", cursor: "pointer", fontSize: 11 }}>
                      <span style={{ color: i.type === "bug" ? "var(--pink)" : "var(--blue)" }}>{i.type === "bug" ? "◉" : "○"}</span>
                      <span style={{ flex: 1, color: "var(--title)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
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
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "var(--soft)" }}>Recent tasks</div>
            {issues.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)", padding: 16 }}>No tasks yet</div>}
            {[...issues].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5).map(i => (
              <div key={i.id} onClick={() => onNav("issues", i.file_id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: "var(--side)", border: "1px solid var(--surface)" }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"} onMouseLeave={e => e.currentTarget.style.background = "var(--side)"}>
                <Badge label={i.type} colors={i.type === "bug" ? PC.critical : { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }} small />
                <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
                <Badge label={i.priority} colors={PC[i.priority]} small />
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "var(--soft)" }}>Hot files</div>
            {(() => { const fic = {}; issues.filter(i => !isTaskDone(i.status)).forEach(i => { fic[i.file_id] = (fic[i.file_id] || 0) + 1; }); return Object.entries(fic).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([fid, c]) => (
              <div key={fid} onClick={() => onNav("issues", fid)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: "var(--side)", border: "1px solid var(--surface)" }}>
                <span style={{ fontSize: 12, fontFamily: "'SF Mono', monospace", flex: 1, color: "var(--title)" }}>{fm[fid]?.name || "?"}</span>
                <span style={{ fontSize: 11, color: "var(--sub)" }}>{c}</span>
              </div>
            )); })()}
          </div>
        </div>
      )}

      {/* Recently resolved */}
      {(() => {
        const resolved = issues.filter(i => isTaskDone(i.status)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
        if (resolved.length === 0) return null;
        return (<div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--green)" }}>Recently closed</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>({resolved.length})</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {resolved.map(i => (
              <div key={i.id} onClick={() => onNav("issues", i.file_id)} style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", cursor: "pointer", borderLeft: "3px solid var(--green)", borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"} onMouseLeave={e => e.currentTarget.style.background = "var(--side)"}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--sub)", textDecoration: "line-through" }}>{i.title}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--muted)" }}>
                  <span style={{ color: "var(--green)" }}>{taskStatusLabel(i.status)}</span>
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
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "var(--soft)" }}>Test summary</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 24 }}>
        {tests.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>No test cases yet</div>}
        {tests.map(t => (<div key={t.id} title={t.title} style={{ width: 28, height: 28, borderRadius: 4, background: TC[t.status].bg, border: `1px solid ${TC[t.status].border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: TC[t.status].text }}>{t.status === "pass" ? "✓" : t.status === "fail" ? "✗" : "·"}</div>))}
      </div>

      {/* Weekly focus chart + End of day summary */}
      <div style={{ display: "grid", gridTemplateColumns: isVisible("chart") && isVisible("resolved") ? "1fr 1fr" : "1fr", gap: 16 }}>
        {/* Weekly chart */}
        {isVisible("chart") && <div>
          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => { setChartWeekOff((chartWeekOff || 0) - 1); setChartStart(""); setChartEnd(""); }} style={{ background: "none", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>◂</button>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--soft)", minWidth: 80, textAlign: "center" }}>{useCustomRange ? "Custom range" : (() => { const now = new Date(); const dow = now.getDay(); const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + (chartWeekOff || 0) * 7); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return (chartWeekOff || 0) === 0 ? "This week" : `${mon.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sun.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`; })()}</span>
              <button onClick={() => { setChartWeekOff((chartWeekOff || 0) + 1); setChartStart(""); setChartEnd(""); }} disabled={!useCustomRange && (chartWeekOff || 0) >= 0} style={{ background: "none", border: "1px solid var(--line)", color: (!useCustomRange && (chartWeekOff || 0) >= 0) ? "var(--surface)" : "var(--muted)", cursor: (!useCustomRange && (chartWeekOff || 0) >= 0) ? "default" : "pointer", fontSize: 11, padding: "2px 8px", borderRadius: 4 }}>▸</button>
              {((chartWeekOff || 0) !== 0 || useCustomRange) && <button onClick={() => { setChartWeekOff(0); setChartStart(""); setChartEnd(""); }} style={{ background: "none", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 9, padding: "2px 6px", borderRadius: 4 }}>Today</button>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input type="date" value={chartStart} onChange={e => setChartStart(e.target.value)} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: "var(--bg)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none" }} />
              <span style={{ fontSize: 10, color: "var(--dim)" }}>→</span>
              <input type="date" value={chartEnd} onChange={e => setChartEnd(e.target.value)} style={{ padding: "2px 6px", borderRadius: 4, fontSize: 10, background: "var(--bg)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none" }} />
            </div>
          </div>

          {/* Chart + Summary */}
          {(() => {
            const days = [];
            if (useCustomRange) {
              const s = new Date(chartStart + "T00:00:00"); const e = new Date(chartEnd + "T00:00:00");
              for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) { const c = new Date(d); c.setHours(0,0,0,0); days.push(c); }
            } else {
              // Monday-based week
              const now = new Date(); now.setHours(0,0,0,0);
              const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
              const monday = new Date(now); monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + (chartWeekOff || 0) * 7);
              for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); d.setHours(0,0,0,0); days.push(d); }
            }
            if (days.length === 0) return null;
            const rangeStart = days[0];
            const rangeEnd = new Date(days[days.length - 1].getTime() + 86400000);
            const rangeSessions = (allSessions || []).filter(s => { const dt = new Date(s.completed_at); return s.session_type === "work" && dt >= rangeStart && dt < rangeEnd; });
            const dayData = days.map(d => {
              const next = new Date(d); next.setDate(next.getDate() + 1);
              const ds = rangeSessions.filter(s => new Date(s.completed_at) >= d && new Date(s.completed_at) < next);
              const focus = Math.round(ds.filter(s => s.subtype !== "waiting" && s.subtype !== "interrupted" && s.subtype !== "meeting").reduce((a, s) => a + s.duration_seconds, 0) / 60);
              const meet = Math.round(ds.filter(s => s.subtype === "meeting").reduce((a, s) => a + s.duration_seconds, 0) / 60);
              return { focus, meet, total: focus + meet };
            });
            const td = new Date(); td.setHours(0,0,0,0);
            const isToday = (d) => d.getTime() === td.getTime();
            const maxMin = Math.max(...dayData.map(d => d.total), 30);
            const labels = ["S","M","T","W","T","F","S"];
            const compact = days.length > 14;
            const dayLabel = (d) => compact ? `${d.getDate()}` : labels[d.getDay()];
            const totalFocus = dayData.reduce((a, d) => a + d.focus, 0);
            const totalMeet = dayData.reduce((a, d) => a + d.meet, 0);
            const totalAll = totalFocus + totalMeet;
            const sessionCount = rangeSessions.filter(s => s.subtype !== "waiting" && s.subtype !== "interrupted" && s.subtype !== "meeting").length;
            const activeDays = new Set(rangeSessions.filter(s => s.subtype !== "waiting" && s.subtype !== "interrupted" && s.subtype !== "meeting").map(s => new Date(s.completed_at).toDateString())).size;

            return (
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: compact ? 2 : 4, height: 100, overflowX: days.length > 31 ? "auto" : "visible" }}>
                    {days.map((d, idx) => {
                      const dd = dayData[idx];
                      const focusH = Math.max(0, (dd.focus / maxMin) * 70);
                      const meetH = Math.max(0, (dd.meet / maxMin) * 70);
                      return (
                        <div key={idx} style={{ flex: days.length > 31 ? "0 0 12px" : 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }} title={`${d.toLocaleDateString()}: Focus ${FMTHR(dd.focus)}, Meetings ${FMTHR(dd.meet)}`}>
                          {!compact && <span style={{ fontSize: 9, fontFamily: "'SF Mono', monospace", color: dd.total > 0 ? "var(--title)" : "var(--muted)" }}>{dd.total > 0 ? (dd.total < 60 ? `${dd.total}` : `${Math.floor(dd.total/60)}h`) : ""}</span>}
                          <div style={{ width: "100%", display: "flex", flexDirection: "column-reverse", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: "100%", height: focusH || (dd.total === 0 ? 0 : 2), background: dd.focus > 0 ? "#378ADD" : "var(--line)", transition: "height 0.3s" }} />
                            {dd.meet > 0 && <div style={{ width: "100%", height: meetH, background: "#7F77DD", transition: "height 0.3s" }} />}
                          </div>
                          <span style={{ fontSize: compact ? 7 : 9, color: isToday(d) ? "var(--green)" : "var(--muted)", fontWeight: isToday(d) ? 600 : 400 }}>{dayLabel(d)}{isToday(d) ? " •" : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 8, fontSize: 9, color: "var(--muted)" }}>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#378ADD", marginRight: 4, verticalAlign: "middle" }} />Focus</span>
                    <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#7F77DD", marginRight: 4, verticalAlign: "middle" }} />Meetings</span>
                  </div>
                </div>
                {/* Summary */}
                <div style={{ width: 130, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "#378ADD", textTransform: "uppercase", letterSpacing: 0.3 }}>Focus</div>
                    <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "'SF Mono', monospace", color: "#378ADD" }}>{FMTHR(totalFocus)}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)" }}>{sessionCount} sessions</div>
                  </div>
                  <div style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "#7F77DD", textTransform: "uppercase", letterSpacing: 0.3 }}>Meetings</div>
                    <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "'SF Mono', monospace", color: "#7F77DD" }}>{FMTHR(totalMeet)}</div>
                  </div>
                  <div style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "var(--green)", textTransform: "uppercase", letterSpacing: 0.3 }}>Total</div>
                    <div style={{ fontSize: 18, fontWeight: 500, fontFamily: "'SF Mono', monospace", color: "var(--green)" }}>{FMTHR(totalAll)}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)" }}>{activeDays} active day{activeDays !== 1 ? "s" : ""}</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>}

        {/* End of day summary */}
        {isVisible("resolved") && <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "var(--soft)" }}>Recently shipped</div>
          <div style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
            {(() => {
              const today = new Date(); today.setHours(0,0,0,0);
              const resolvedRecent = issues.filter(i => normalizeTaskStatus(i.status) === "done").slice(-5);
              const passedToday = tests.filter(t => t.status === "pass" && t.last_run && new Date(t.last_run) >= today);
              const notesToday = (notes || []).filter(n => new Date(n.created_at) >= today);
              const hasAnything = resolvedRecent.length || passedToday.length || notesToday.length || focusWork.length;
              if (!hasAnything) return <div style={{ fontSize: 12, color: "var(--muted)", textAlign: "center", padding: "16px 0" }}>Day's just getting started.</div>;
              return (<div style={{ fontSize: 12, lineHeight: 1.8 }}>
                {focusWork.length > 0 && <div style={{ color: "var(--red)" }}>{focusWork.length} focus session{focusWork.length !== 1 ? "s" : ""} ({FMTHR(tfm)})</div>}
                {resolvedRecent.map(i => <div key={i.id} style={{ color: "var(--green)" }}>Done: {i.title}</div>)}
                {passedToday.map(t => <div key={t.id} style={{ color: "var(--lime)" }}>Passed: {t.title}</div>)}
                {notesToday.length > 0 && <div style={{ color: "var(--purple)" }}>{notesToday.length} note{notesToday.length !== 1 ? "s" : ""} written</div>}
              </div>);
            })()}
          </div>
        </div>}
      </div>
    </div>
  );
}

// ============================================
// Workshop Dashboard
// ============================================

function WorkshopDashboard({ meetings, notes, people, onNav }) {
  const activeMeetings = meetings.filter(m => !m.cancelled);
  const attended = activeMeetings.filter(m => m.attended);
  const rated = activeMeetings.filter(m => m.rating > 0);
  const avgRating = rated.length > 0 ? (rated.reduce((a, m) => a + m.rating, 0) / rated.length).toFixed(1) : "—";

  // Parse note prefixes
  const allLines = notes.flatMap(n => (n.content || "").split("\n").map(line => ({ line: line.trim(), noteId: n.id, noteTitle: n.title })));
  const actionItems = allLines.filter(l => l.line.startsWith("!")).map(l => ({ ...l, text: l.line.substring(1).trim() }));
  const questions = allLines.filter(l => l.line.startsWith("?")).map(l => ({ ...l, text: l.line.substring(1).trim() }));
  const insights = allLines.filter(l => l.line.startsWith("★")).map(l => ({ ...l, text: l.line.substring(1).trim() }));

  const pendingFollowUps = people.filter(p => p.follow_up && !p.follow_up_done);

  const MetricCard = ({ label, value, color, sub, onClick }) => (
    <div onClick={onClick} style={{ background: "var(--side)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--surface)", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 500, fontFamily: "'SF Mono', monospace", color: color || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

  return (
    <div>
      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        <MetricCard label="Sessions" value={`${attended.length}/${activeMeetings.length}`} color="var(--blue)" sub="attended" onClick={() => onNav("calendar")} />
        <MetricCard label="Notes" value={notes.length} color="var(--purple)" onClick={() => onNav("notes")} />
        <MetricCard label="People met" value={people.length} color="var(--green)" sub={pendingFollowUps.length > 0 ? `${pendingFollowUps.length} need follow-up` : ""} onClick={() => onNav("people")} />
        <MetricCard label="Action items" value={actionItems.length} color="#D85A30" sub="from ! prefixed notes" />
        <MetricCard label="Key insights" value={insights.length} color="var(--amber)" sub="from ★ prefixed notes" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left column */}
        <div>
          {/* Sessions with ratings */}
          <div style={{ background: "var(--side)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--surface)", marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Sessions {avgRating !== "—" && <span style={{ color: "var(--amber)" }}>· avg {avgRating}★</span>}</div>
            {activeMeetings.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>No sessions yet. Add them in the calendar.</div>}
            {activeMeetings.sort((a, b) => `${a.meeting_date}${a.start_time}`.localeCompare(`${b.meeting_date}${b.start_time}`)).map(m => (
              <div key={m.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--surface)", display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", marginTop: 5, flexShrink: 0, background: m.attended ? "var(--green)" : "var(--line)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: m.attended ? "var(--title)" : "var(--muted)" }}>{m.title}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>
                    {m.meeting_date} · {m.start_time}
                    {m.speaker && <span> · {m.speaker}</span>}
                    {m.track && <span style={{ padding: "0 4px", marginLeft: 4, borderRadius: 2, background: "var(--tint-purple-bg)", color: "var(--purple)", fontSize: 9 }}>{m.track}</span>}
                  </div>
                  {m.rating > 0 && <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2 }}>{stars(m.rating)}</div>}
                  {m.takeaway && <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 2, fontStyle: "italic" }}>"{m.takeaway}"</div>}
                </div>
              </div>
            ))}
          </div>

          {/* People with follow-ups */}
          {pendingFollowUps.length > 0 && (
            <div style={{ background: "var(--side)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--tint-orange-bg)", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#D85A30", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Pending follow-ups</div>
              {pendingFollowUps.map(p => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--surface)" }}>
                  <div style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--tint-purple-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 500, color: "var(--purple)" }}>{p.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "var(--title)" }}>{p.name} <span style={{ color: "var(--muted)" }}>· {p.company}</span></div>
                    <div style={{ fontSize: 10, color: "var(--orange)" }}>{p.follow_up}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div>
          {/* Key insights */}
          {insights.length > 0 && (
            <div style={{ background: "var(--side)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--tint-amber-bd)", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Key insights ({insights.length})</div>
              {insights.map((item, idx) => (
                <div key={idx} style={{ padding: "6px 0", borderBottom: idx < insights.length - 1 ? "1px solid var(--surface)" : "none", display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--amber)", flexShrink: 0 }}>★</span>
                  <span style={{ fontSize: 12, color: "var(--title)" }}>{item.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Action items */}
          {actionItems.length > 0 && (
            <div style={{ background: "var(--side)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--tint-orange-bd)", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "#D85A30", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Action items ({actionItems.length})</div>
              {actionItems.map((item, idx) => (
                <div key={idx} style={{ padding: "6px 0", borderBottom: idx < actionItems.length - 1 ? "1px solid var(--surface)" : "none", display: "flex", gap: 6 }}>
                  <span style={{ color: "#D85A30", flexShrink: 0 }}>!</span>
                  <span style={{ fontSize: 12, color: "var(--title)" }}>{item.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Questions */}
          {questions.length > 0 && (
            <div style={{ background: "var(--side)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--tint-blue-bd)", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: "var(--blue)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Questions ({questions.length})</div>
              {questions.map((item, idx) => (
                <div key={idx} style={{ padding: "6px 0", borderBottom: idx < questions.length - 1 ? "1px solid var(--surface)" : "none", display: "flex", gap: 6 }}>
                  <span style={{ color: "var(--blue)", flexShrink: 0 }}>?</span>
                  <span style={{ fontSize: 12, color: "var(--title)" }}>{item.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recent notes */}
          <div style={{ background: "var(--side)", borderRadius: 10, padding: "14px 16px", border: "1px solid var(--surface)" }}>
            <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Recent notes</div>
            {notes.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>No notes yet.</div>}
            {notes.slice(0, 5).map(n => (
              <div key={n.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--surface)" }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--title)" }}>{n.title || n.category || "Untitled"}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.content?.substring(0, 80)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IssuesView({ takeOpenId, issues, files, fm, filterType, setFilterType, filterFile, setFilterFile, filterPriority, setFilterPriority, updS, del, onAdd, onEdit, links, tests, ulnk, openLink, focusOn, pomCount, fmtDue, notes, onViewNote, queue, addToQ }) {
  const [viewId, setViewId] = useState(() => takeOpenId?.() || null);
  const [sortBy, setSortBy] = useState("created");
  const [viewMode, setViewMode] = useState("card");
  const ltIds = (iid) => links.filter(l => l.issue_id === iid).map(l => l.test_case_id);
  const tm = Object.fromEntries(tests.map(t => [t.id, t]));
  const notesByIssue = (iid) => (notes || []).filter(n => n.linked_issue_id === iid);
  const inQueue = (id) => (queue || []).some(q => q.item_id === id);

  const priOrd = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortFn = (a, b) => {
    if (sortBy === "due") return (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1;
    if (sortBy === "priority") return (priOrd[a.priority] || 9) - (priOrd[b.priority] || 9);
    if (sortBy === "status") return a.status.localeCompare(b.status);
    return new Date(b.created_at) - new Date(a.created_at);
  };
  const open = issues.filter(i => !isTaskDone(i.status)).sort(sortFn);
  const resolved = issues.filter(i => isTaskDone(i.status)).sort(sortFn);

  // Detail modal
  const vi = viewId ? issues.find(x => x.id === viewId) : null;
  if (vi) {
    const lt = ltIds(vi.id); const done = pomCount("issue", vi.id); const est = vi.estimated_pomodoros || 0; const due = fmtDue(vi.due_date); const inotes = notesByIssue(vi.id);
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setViewId(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", width: 560, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", maxHeight: "80vh", overflowY: "auto" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Badge label={vi.type} colors={vi.type === "bug" ? { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" } : { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }} />
            <Badge label={vi.priority} colors={PC[vi.priority]} />
            <span style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>{vi.title}</span>
            <button onClick={() => setViewId(null)} style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          {/* Status + actions */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
            <Select value={normalizeTaskStatus(vi.status)} onChange={s => { updS(vi.id, s); }} options={ISSUE_STATUSES} style={{ fontSize: 12 }} />
            <Btn small onClick={() => { setViewId(null); focusOn("issue", vi.id); }}>▶ Focus</Btn>
            <Btn small onClick={() => { setViewId(null); onEdit(vi); }}>✎ Edit</Btn>
            <Btn small onClick={() => { if (confirm("Delete this task?")) { del(vi.id); setViewId(null); } }} style={{ color: "var(--pink)" }}>Delete</Btn>
          </div>
          {/* Description */}
          {vi.description && <div style={{ fontSize: 13, color: "var(--title)", lineHeight: 1.6, marginBottom: 16, padding: "10px 12px", background: "var(--bg)", borderRadius: 6 }}>{vi.description}</div>}
          {/* Meta grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16, fontSize: 12 }}>
            <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>File: </span><span style={{ fontFamily: "'SF Mono', monospace", color: "var(--title)" }}>{fm[vi.file_id]?.name || "—"}</span></div>
            <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>Created: </span><span style={{ color: "var(--title)" }}>{SHORT_DATE(vi.created_at)}</span></div>
            {vi.repo_name && <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>Repo: </span><span style={{ fontFamily: "'SF Mono', monospace", color: "var(--title)" }}>{vi.repo_name}</span></div>}
            {vi.branch_name && <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>Branch: </span><span style={{ fontFamily: "'SF Mono', monospace", color: "var(--title)" }}>{vi.branch_name}</span></div>}
            {est > 0 && <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>Pomodoros: </span><span style={{ color: done >= est ? "var(--lime)" : "var(--red)", fontFamily: "'SF Mono', monospace" }}>{done}/{est}</span></div>}
            {due && <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>Due: </span><span style={{ color: due.color }}>{due.text}</span></div>}
          </div>
          {/* Linked tests */}
          {lt.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>LINKED TESTS</div>{lt.map(tid => { const tc = tm[tid]; if (!tc) return null; return (<div key={tid} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--bg)", borderRadius: 6, marginBottom: 4, fontSize: 12 }}><span style={{ color: TC[tc.status].text }}>{tc.status === "pass" ? "✓" : tc.status === "fail" ? "✗" : "▷"}</span><span style={{ flex: 1, color: "var(--title)" }}>{tc.title}</span><Badge label={tc.status} colors={TC[tc.status]} small /></div>); })}</div>}
          {/* Linked notes */}
          {inotes.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>LINKED NOTES</div>{inotes.map(n => (<div key={n.id} onClick={() => { setViewId(null); onViewNote(n.id); }} style={{ padding: "6px 10px", background: "var(--bg)", borderRadius: 6, marginBottom: 4, fontSize: 12, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"} onMouseLeave={e => e.currentTarget.style.background = "var(--bg)"}><span style={{ color: "var(--purple)" }}>☰ </span><span style={{ color: "var(--title)" }}>{n.title || n.category}</span>{n.content && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, maxHeight: 40, overflow: "hidden" }}>{n.content.substring(0, 100)}{n.content.length > 100 ? "..." : ""}</div>}</div>))}</div>}
        </div>
      </div>
    );
  }

  const IssueCard = ({ i, dimmed }) => { const lt = ltIds(i.id); const done = pomCount("issue", i.id); const est = i.estimated_pomodoros || 0; const due = fmtDue(i.due_date); return (
    <div onClick={() => !dimmed && setViewId(i.id)} style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", marginBottom: 8, opacity: dimmed ? 0.6 : 1, cursor: dimmed ? "default" : "pointer" }} onMouseEnter={e => { if (!dimmed) e.currentTarget.style.borderColor = "var(--dim)"; }} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--line)"}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}><Badge label={i.type} colors={i.type === "bug" ? { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" } : { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }} /><span style={{ fontSize: 13, fontWeight: 500, textDecoration: dimmed ? "line-through" : "none", color: dimmed ? "var(--sub)" : "var(--text)" }}>{i.title}</span>{dimmed && <Badge label={i.status} colors={{ bg: "var(--tint-green-bg)", text: "var(--green)", border: "var(--tint-green-bd)" }} small />}</div>
          {!dimmed && i.description && <div style={{ fontSize: 12, color: "var(--sub)", marginBottom: 6, lineHeight: 1.5 }}>{i.description}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'SF Mono', monospace" }}>{fm[i.file_id]?.name || "—"}</span><span>·</span><span>{SHORT_DATE(i.created_at)}</span>
            {i.repo_name && <><span>·</span><span style={{ fontFamily: "'SF Mono', monospace", color: "var(--sub)" }}>{i.repo_name}{i.branch_name ? ` : ${i.branch_name}` : ""}</span></>}
            {est > 0 && <><span>·</span><span style={{ color: done >= est ? "var(--lime)" : "var(--red)" }}>{done}/{est} pomodoros</span></>}
            {due && <><span>·</span><span style={{ color: due.color }}>{due.text}</span></>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {!dimmed && <button onClick={() => focusOn("issue", i.id)} title="Focus" style={{ background: "none", border: "1px solid var(--line)", color: "var(--red)", cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4 }}>▶</button>}
          {!dimmed && !inQueue(i.id) && <button onClick={() => addToQ("issue", i.id)} title="Add to queue" style={{ background: "none", border: "1px solid var(--line)", color: "#7F77DD", cursor: "pointer", fontSize: 9, padding: "3px 6px", borderRadius: 4 }}>+ Queue</button>}
          {!dimmed && inQueue(i.id) && <span style={{ fontSize: 9, padding: "3px 6px", borderRadius: 4, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)" }}>queued</span>}
          {!dimmed && <Badge label={i.priority} colors={PC[i.priority]} />}
          <Select value={normalizeTaskStatus(i.status)} onChange={s => updS(i.id, s)} options={ISSUE_STATUSES} style={{ fontSize: 11, padding: "3px 6px" }} />
          <button onClick={() => onEdit(i)} title="Edit" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>✎</button>
          <button onClick={() => del(i.id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>✕</button>
        </div>
      </div>
      {!dimmed && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }} onClick={e => e.stopPropagation()}>
        {lt.map(tid => { const tc = tm[tid]; if (!tc) return null; return (<span key={tid} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: TC[tc.status].bg, color: TC[tc.status].text, border: `1px solid ${TC[tc.status].border}` }}>{tc.status === "pass" ? "✓" : tc.status === "fail" ? "✗" : "▷"} {tc.title}<button onClick={() => ulnk(i.id, tid)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 10, padding: 0, marginLeft: 2, opacity: 0.6 }}>✕</button></span>); })}
        {notesByIssue(i.id).map(n => (<span key={n.id} onClick={() => onViewNote(n.id)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)", cursor: "pointer" }}>☰ {n.title || n.category}</span>))}
        <button onClick={() => openLink(i.id)} style={{ background: "none", border: "1px dashed var(--dim)", color: "var(--muted)", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>+ Link test</button>
      </div>}
    </div>); };

  return (<div>
    <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}><Pill active={filterType === "all"} onClick={() => setFilterType("all")}>All</Pill><Pill active={filterType === "bug"} onClick={() => setFilterType("bug")}>Bugs</Pill><Pill active={filterType === "todo"} onClick={() => setFilterType("todo")}>To-dos</Pill><span style={{ width: 1, height: 16, background: "var(--line)", margin: "0 4px" }} /><Select value={filterFile} onChange={setFilterFile} options={[{ value: "all", label: "All files" }, ...files.map(f => ({ value: f.id, label: f.name }))]} /><Select value={filterPriority} onChange={setFilterPriority} options={[{ value: "all", label: "All priorities" }, ...PRIORITIES.map(p => ({ value: p, label: p }))]} /><span style={{ width: 1, height: 16, background: "var(--line)", margin: "0 4px" }} /><select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, fontSize: 10, background: "var(--surface)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none", cursor: "pointer" }}><option value="created">Newest</option><option value="due">Due date</option><option value="priority">Priority</option><option value="status">Status</option></select><span style={{ flex: 1 }} /><button onClick={() => setViewMode("card")} title="Cards" style={{ background: viewMode === "card" ? "var(--line)" : "none", border: "none", color: viewMode === "card" ? "var(--text)" : "var(--dim)", cursor: "pointer", fontSize: 12, padding: "4px 6px", borderRadius: 4 }}>◫</button><button onClick={() => setViewMode("list")} title="List" style={{ background: viewMode === "list" ? "var(--line)" : "none", border: "none", color: viewMode === "list" ? "var(--text)" : "var(--dim)", cursor: "pointer", fontSize: 12, padding: "4px 6px", borderRadius: 4 }}>≡</button></div>
    {issues.length === 0 && <EmptyState icon="◉" title="No tasks found" sub="Create tasks to track bugs and to-dos" action="New task" onAction={onAdd} />}
    {viewMode === "card" && <>
      {open.length > 0 && open.map(i => <IssueCard key={i.id} i={i} />)}
      {resolved.length > 0 && (<>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 0 10px" }}>
          <div style={{ height: 1, flex: 1, background: "var(--line)" }} />
          <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 500 }}>Closed ({resolved.length})</span>
          <div style={{ height: 1, flex: 1, background: "var(--line)" }} />
        </div>
        {resolved.map(i => <IssueCard key={i.id} i={i} dimmed />)}
      </>)}
    </>}
    {viewMode === "list" && (<div>
      <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "flex", padding: "6px 12px", background: "var(--side)", borderBottom: "1px solid var(--line)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          <span style={{ width: 50 }}>Type</span><span style={{ flex: 1 }}>Title</span><span style={{ width: 70 }}>Priority</span><span style={{ width: 90 }}>Status</span><span style={{ width: 80 }}>Due</span><span style={{ width: 40 }}></span>
        </div>
        {open.map(i => { const due = fmtDue(i.due_date); return (
          <div key={i.id} onClick={() => setViewId(i.id)} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--surface)", cursor: "pointer", fontSize: 12 }} onMouseEnter={e => e.currentTarget.style.background = "var(--side)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ width: 50 }}><Badge label={i.type} colors={i.type === "bug" ? { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" } : { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }} small /></span>
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--title)" }}>{i.title}</span>
            <span style={{ width: 70 }}><Badge label={i.priority} colors={PC[i.priority]} small /></span>
            <span style={{ width: 90 }}><Badge label={taskStatusLabel(i.status)} colors={TC[i.status] || { bg: "var(--line)", text: "var(--sub)", border: "var(--dim)" }} small /></span>
            <span style={{ width: 80, fontSize: 10, color: due?.color || "var(--muted)" }}>{due?.text || "—"}</span>
            <span style={{ width: 40, display: "flex", gap: 2 }}><button onClick={e => { e.stopPropagation(); onEdit(i); }} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 11 }}>✎</button></span>
          </div>
        ); })}
      </div>
      {resolved.length > 0 && (<>
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "20px 0 10px" }}>
          <div style={{ height: 1, flex: 1, background: "var(--line)" }} />
          <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 500 }}>Closed ({resolved.length})</span>
          <div style={{ height: 1, flex: 1, background: "var(--line)" }} />
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", opacity: 0.5 }}>
          {resolved.map(i => { const due = fmtDue(i.due_date); return (
            <div key={i.id} onClick={() => setViewId(i.id)} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--surface)", cursor: "pointer", fontSize: 12 }} onMouseEnter={e => e.currentTarget.style.background = "var(--side)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ width: 50 }}><Badge label={i.type} colors={i.type === "bug" ? { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" } : { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }} small /></span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--sub)", textDecoration: "line-through" }}>{i.title}</span>
              <span style={{ width: 70 }}><Badge label={i.priority} colors={PC[i.priority]} small /></span>
              <span style={{ width: 90 }}><Badge label={taskStatusLabel(i.status)} colors={{ bg: "var(--tint-green-bg)", text: "var(--green)", border: "var(--tint-green-bd)" }} small /></span>
              <span style={{ width: 80, fontSize: 10, color: "var(--muted)" }}>{due?.text || "—"}</span>
              <span style={{ width: 40, display: "flex", gap: 2 }}><button onClick={e => { e.stopPropagation(); onEdit(i); }} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 11 }}>✎</button></span>
            </div>
          ); })}
        </div>
      </>)}
    </div>)}
  </div>);
}

function TestsView({ takeOpenId, tests, files, fm, filterFile, setFilterFile, exp, setExp, updS, del, onAdd, onEdit, links, allIssues, ulnk, openLink, focusOn, pomCount, fmtDue, notes, onViewNote, queue, addToQ }) {
  const [viewTid, setViewTid] = useState(() => takeOpenId?.() || null);
  const [sortBy, setSortBy] = useState("created");
  const [viewMode, setViewMode] = useState("card");
  const liIds = (tid) => links.filter(l => l.test_case_id === tid).map(l => l.issue_id);
  const im = Object.fromEntries(allIssues.map(i => [i.id, i]));
  const notesByTest = (tid) => (notes || []).filter(n => n.linked_test_id === tid);
  const inQueue = (id) => (queue || []).some(q => q.item_id === id);
  const sortFn = (a, b) => {
    if (sortBy === "due") return (a.due_date || "9999") < (b.due_date || "9999") ? -1 : 1;
    if (sortBy === "status") return a.status.localeCompare(b.status);
    if (sortBy === "last_run") return new Date(b.last_run || 0) - new Date(a.last_run || 0);
    return new Date(b.created_at) - new Date(a.created_at);
  };
  const sorted = [...tests].sort(sortFn);

  // Detail modal
  const vt = viewTid ? tests.find(x => x.id === viewTid) : null;
  if (vt) {
    const li = liIds(vt.id); const done = pomCount("test", vt.id); const est = vt.estimated_pomodoros || 0; const due = fmtDue(vt.due_date); const tnotes = notesByTest(vt.id);
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setViewTid(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", width: 560, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", maxHeight: "80vh", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Badge label={vt.status} colors={TC[vt.status]} />
            <span style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>{vt.title}</span>
            <button onClick={() => setViewTid(null)} style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
            <Btn small onClick={() => updS(vt.id, "pass")} style={{ color: "var(--lime)", borderColor: "#3B6D11" }}>✓ Pass</Btn>
            <Btn small onClick={() => updS(vt.id, "fail")} style={{ color: "var(--pink)", borderColor: "#A32D2D" }}>✗ Fail</Btn>
            <Btn small onClick={() => { setViewTid(null); focusOn("test", vt.id); }}>▶ Focus</Btn>
            <Btn small onClick={() => { setViewTid(null); onEdit(vt); }}>✎ Edit</Btn>
            <Btn small onClick={() => { if (confirm("Delete this test?")) { del(vt.id); setViewTid(null); } }} style={{ color: "var(--pink)" }}>Delete</Btn>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16, fontSize: 12 }}>
            <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>File: </span><span style={{ fontFamily: "'SF Mono', monospace", color: "var(--title)" }}>{fm[vt.file_id]?.name || "—"}</span></div>
            <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>Steps: </span><span style={{ color: "var(--title)" }}>{(vt.steps||[]).length}</span></div>
            {vt.repo_name && <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>Repo: </span><span style={{ fontFamily: "'SF Mono', monospace", color: "var(--title)" }}>{vt.repo_name}{vt.branch_name ? ` : ${vt.branch_name}` : ""}</span></div>}
            {est > 0 && <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>Pomodoros: </span><span style={{ color: done >= est ? "var(--lime)" : "var(--red)", fontFamily: "'SF Mono', monospace" }}>{done}/{est}</span></div>}
            {due && <div style={{ padding: "8px 10px", background: "var(--bg)", borderRadius: 6 }}><span style={{ color: "var(--muted)" }}>Due: </span><span style={{ color: due.color }}>{due.text}</span></div>}
          </div>
          {vt.precondition && <div style={{ fontSize: 12, color: "var(--sub)", padding: "8px 10px", background: "var(--bg)", borderRadius: 6, marginBottom: 12 }}><span style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase" }}>Precondition: </span>{vt.precondition}</div>}
          {(vt.steps||[]).length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>STEPS</div>{(vt.steps||[]).map((s, idx) => (<div key={idx} style={{ display: "flex", gap: 10, padding: "8px 10px", background: "var(--bg)", borderRadius: 6, marginBottom: 4 }}><span style={{ color: "var(--muted)", fontSize: 11, fontFamily: "'SF Mono', monospace", minWidth: 20 }}>{idx + 1}.</span><div style={{ flex: 1 }}><div style={{ fontSize: 12, color: "var(--title)", marginBottom: 2 }}>{s.step}</div><div style={{ fontSize: 11, color: "var(--green)", fontStyle: "italic" }}>→ {s.expected}</div></div></div>))}</div>}
          {li.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>LINKED TASKS</div>{li.map(iid => { const issue = im[iid]; if (!issue) return null; return (<div key={iid} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--bg)", borderRadius: 6, marginBottom: 4, fontSize: 12 }}><span style={{ color: issue.type === "bug" ? "var(--pink)" : "var(--blue)" }}>{issue.type === "bug" ? "◉" : "○"}</span><span style={{ flex: 1, color: "var(--title)" }}>{issue.title}</span><Badge label={issue.priority} colors={PC[issue.priority]} small /></div>); })}</div>}
          {tnotes.length > 0 && <div><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>LINKED NOTES</div>{tnotes.map(n => (<div key={n.id} onClick={() => { setViewTid(null); onViewNote(n.id); }} style={{ padding: "6px 10px", background: "var(--bg)", borderRadius: 6, marginBottom: 4, fontSize: 12, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface)"} onMouseLeave={e => e.currentTarget.style.background = "var(--bg)"}><span style={{ color: "var(--purple)" }}>☰ </span><span style={{ color: "var(--title)" }}>{n.title || n.category}</span>{n.content && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2, maxHeight: 40, overflow: "hidden" }}>{n.content.substring(0, 100)}{n.content.length > 100 ? "..." : ""}</div>}</div>))}</div>}
        </div>
      </div>
    );
  }

  return (<div>
    <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}><Select value={filterFile} onChange={setFilterFile} options={[{ value: "all", label: "All files" }, ...files.map(f => ({ value: f.id, label: f.name }))]} /><span style={{ width: 1, height: 16, background: "var(--line)", margin: "0 4px" }} /><select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, fontSize: 10, background: "var(--surface)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none", cursor: "pointer" }}><option value="created">Newest</option><option value="due">Due date</option><option value="status">Status</option><option value="last_run">Last run</option></select><span style={{ flex: 1 }} /><button onClick={() => setViewMode("card")} title="Cards" style={{ background: viewMode === "card" ? "var(--line)" : "none", border: "none", color: viewMode === "card" ? "var(--text)" : "var(--dim)", cursor: "pointer", fontSize: 12, padding: "4px 6px", borderRadius: 4 }}>◫</button><button onClick={() => setViewMode("list")} title="List" style={{ background: viewMode === "list" ? "var(--line)" : "none", border: "none", color: viewMode === "list" ? "var(--text)" : "var(--dim)", cursor: "pointer", fontSize: 12, padding: "4px 6px", borderRadius: 4 }}>≡</button></div>
    {sorted.length === 0 && <EmptyState icon="▷" title="No test cases yet" sub="Write test cases to verify your code." action="New test case" onAction={onAdd} />}
    {viewMode === "card" && sorted.map(t => { const ex = exp === t.id; const li = liIds(t.id); const done = pomCount("test", t.id); const est = t.estimated_pomodoros || 0; const due = fmtDue(t.due_date); return (
      <div key={t.id} style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 8 }}>
        <div style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }} onClick={() => setExp(ex ? null : t.id)}>
          <span style={{ color: "var(--muted)", fontSize: 12, marginTop: 2, transform: ex ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▸</span>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><span style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</span><Badge label={t.status} colors={TC[t.status]} small /></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'SF Mono', monospace" }}>{fm[t.file_id]?.name || "—"}</span>
              {t.last_run && <><span>·</span><span>{SHORT_DATE(t.last_run)}</span></>}
              <span>·</span><span>{(t.steps||[]).length} step{(t.steps||[]).length !== 1 ? "s" : ""}</span>
              {t.repo_name && <><span>·</span><span style={{ fontFamily: "'SF Mono', monospace", color: "var(--sub)" }}>{t.repo_name}{t.branch_name ? ` : ${t.branch_name}` : ""}</span></>}
              {est > 0 && <><span>·</span><span style={{ color: done >= est ? "var(--lime)" : "var(--red)" }}>{done}/{est} pomodoros</span></>}
              {due && <><span>·</span><span style={{ color: due.color }}>{due.text}</span></>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => focusOn("test", t.id)} title="Focus" style={{ background: "none", border: "1px solid var(--line)", color: "var(--red)", cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4 }}>▶</button>
            {!inQueue(t.id) && <button onClick={() => addToQ("test", t.id)} title="Add to queue" style={{ background: "none", border: "1px solid var(--line)", color: "#7F77DD", cursor: "pointer", fontSize: 9, padding: "3px 6px", borderRadius: 4 }}>+ Queue</button>}
            {inQueue(t.id) && <span style={{ fontSize: 9, padding: "3px 6px", borderRadius: 4, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)" }}>queued</span>}
            <button onClick={() => setViewTid(t.id)} title="View details" style={{ background: "none", border: "1px solid var(--line)", color: "var(--blue)", cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4 }}>◫</button>
            <Btn small onClick={() => updS(t.id, "pass")} style={{ color: t.status === "pass" ? "var(--lime)" : "var(--muted)", borderColor: t.status === "pass" ? "#3B6D11" : undefined }}>✓</Btn>
            <Btn small onClick={() => updS(t.id, "fail")} style={{ color: t.status === "fail" ? "var(--pink)" : "var(--muted)", borderColor: t.status === "fail" ? "#A32D2D" : undefined }}>✗</Btn>
            <button onClick={() => onEdit(t)} title="Edit" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>✎</button>
            <button onClick={() => del(t.id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>✕</button>
          </div>
        </div>
        <div style={{ padding: "0 14px 10px 32px", display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {li.map(iid => { const issue = im[iid]; if (!issue) return null; const ic = issue.type === "bug" ? { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" } : { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }; return (<span key={iid} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: ic.bg, color: ic.text, border: `1px solid ${ic.border}` }}>{issue.type === "bug" ? "◉" : "○"} {issue.title}<button onClick={() => ulnk(iid, t.id)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 10, padding: 0, marginLeft: 2, opacity: 0.6 }}>✕</button></span>); })}
          {notesByTest(t.id).map(n => (<span key={n.id} onClick={() => onViewNote(n.id)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)", cursor: "pointer" }}>☰ {n.title || n.category}</span>))}
          <button onClick={() => openLink(t.id)} style={{ background: "none", border: "1px dashed var(--dim)", color: "var(--muted)", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>+ Link task</button>
        </div>
        {ex && (<div style={{ padding: "0 14px 14px 32px", borderTop: "1px solid var(--line)" }}>
          {t.precondition && <div style={{ fontSize: 12, color: "var(--sub)", margin: "10px 0 8px", padding: "6px 10px", background: "var(--surface)", borderRadius: 6 }}><span style={{ color: "var(--muted)", fontSize: 10, textTransform: "uppercase" }}>Precondition: </span>{t.precondition}</div>}
          {(t.steps||[]).map((s, idx) => (<div key={idx} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: idx < (t.steps||[]).length - 1 ? "1px solid var(--surface)" : "none" }}><span style={{ color: "var(--muted)", fontSize: 11, fontFamily: "'SF Mono', monospace", minWidth: 20 }}>{idx + 1}.</span><div style={{ flex: 1 }}><div style={{ fontSize: 12, color: "var(--title)", marginBottom: 2 }}>{s.step}</div><div style={{ fontSize: 11, color: "var(--green)", fontStyle: "italic" }}>→ {s.expected}</div></div></div>))}
        </div>)}
      </div>); })}
    {viewMode === "list" && (<div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", padding: "6px 12px", background: "var(--side)", borderBottom: "1px solid var(--line)", fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        <span style={{ flex: 1 }}>Title</span><span style={{ width: 70 }}>Status</span><span style={{ width: 60 }}>Steps</span><span style={{ width: 80 }}>Due</span><span style={{ width: 80 }}>Last run</span><span style={{ width: 40 }}></span>
      </div>
      {sorted.map(t => { const due = fmtDue(t.due_date); return (
        <div key={t.id} onClick={() => setViewTid(t.id)} style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--surface)", cursor: "pointer", fontSize: 12 }} onMouseEnter={e => e.currentTarget.style.background = "var(--side)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--title)" }}>{t.title}</span>
          <span style={{ width: 70 }}><Badge label={t.status} colors={TC[t.status]} small /></span>
          <span style={{ width: 60, fontSize: 10, color: "var(--muted)" }}>{(t.steps||[]).length}</span>
          <span style={{ width: 80, fontSize: 10, color: due?.color || "var(--muted)" }}>{due?.text || "—"}</span>
          <span style={{ width: 80, fontSize: 10, color: "var(--muted)" }}>{t.last_run ? SHORT_DATE(t.last_run) : "—"}</span>
          <span style={{ width: 40, display: "flex", gap: 2 }}><button onClick={e => { e.stopPropagation(); onEdit(t); }} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 11 }}>✎</button></span>
        </div>
      ); })}
    </div>)}
  </div>);
}

function FilesView({ files, issues, tests, del, onAdd, onNav }) {
  const g = {}; files.forEach(f => { if (!g[f.category]) g[f.category] = []; g[f.category].push(f); });
  const ic = (fid) => issues.filter(i => i.file_id === fid && !isTaskDone(i.status)).length;
  const tc = (fid) => tests.filter(t => t.file_id === fid).length;
  const tp = (fid) => tests.filter(t => t.file_id === fid && t.status === "pass").length;
  if (files.length === 0) return <EmptyState icon="⊞" title="No files yet" sub="Add files to attach tasks and tests" action="Add file" onAction={onAdd} />;
  return (<div>{CATEGORIES.filter(c => g[c]).map(cat => (<div key={cat} style={{ marginBottom: 20 }}><div style={{ fontSize: 11, fontWeight: 500, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{cat}</div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>{g[cat].map(f => { const a = ic(f.id), b = tc(f.id), c = tp(f.id); return (<div key={f.id} style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px" }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span style={{ fontFamily: "'SF Mono', monospace", fontSize: 12, fontWeight: 500, color: "var(--title)" }}>{f.name}</span><button onClick={() => del(f.id)} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 12 }}>✕</button></div><div style={{ display: "flex", gap: 12, fontSize: 11 }}><span onClick={() => onNav("issues", f.id)} style={{ cursor: "pointer", color: a > 0 ? "var(--pink)" : "var(--muted)" }}>{a} task{a !== 1 ? "s" : ""}</span><span onClick={() => onNav("tests", f.id)} style={{ cursor: "pointer", color: b > 0 ? "var(--blue)" : "var(--muted)" }}>{c}/{b} tests</span></div></div>); })}</div></div>))}</div>);
}

// ============================================
// Notes View
// ============================================

const NOTE_CATS = ["scratch", "decision", "investigation", "meeting"];
const NOTE_CAT_COLORS = { scratch: { bg: "var(--surface)", text: "var(--soft)", border: "var(--line)" }, decision: { bg: "var(--tint-purple-bg)", text: "var(--purple)", border: "var(--tint-purple-bd)" }, investigation: { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }, meeting: { bg: "var(--tint-green-bg)", text: "var(--green)", border: "var(--tint-green-bd)" } };

function detectLang(text) {
  if (!text) return "";
  const t = text.toLowerCase();
  const sqlScore = (t.match(/\b(select|from|where|join|insert|update|delete|create|alter|drop|table|values|group by|order by|having|union|coalesce)\b/g) || []).length;
  const pyScore = (t.match(/\b(def |class |import |from .+ import|if __name__|elif |print\(|self\.|lambda |async def|await )\b/g) || []).length;
  if (sqlScore >= 2 && sqlScore > pyScore) return "sql";
  if (pyScore >= 2 && pyScore > sqlScore) return "python";
  return "";
}

function highlight(code, lang) {
  if (!lang || !code) return [{ text: code, color: null }];
  const SQL_KW = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AND|OR|NOT|IN|IS|NULL|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TABLE|INTO|VALUES|SET|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|CASE|WHEN|THEN|ELSE|END|EXISTS|BETWEEN|LIKE|ILIKE|COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST|WITH|RECURSIVE|PRIMARY|KEY|REFERENCES|DEFAULT|INDEX|IF|BEGIN|COMMIT|ROLLBACK|VIEW|SCHEMA|CONSTRAINT|FOREIGN|UNIQUE|CHECK|ASC|DESC|OVER|PARTITION|ROW_NUMBER|RANK|EXTRACT|DATE|TIMESTAMP|INTEGER|TEXT|BOOLEAN|VARCHAR|SERIAL|UUID|JSONB|FLOAT|NUMERIC|BIGINT)\b/gi;
  const PY_KW = /\b(def|class|import|from|as|if|elif|else|for|while|return|yield|try|except|finally|with|lambda|and|or|not|in|is|None|True|False|pass|break|continue|raise|assert|global|del|async|await|self|print|len|range|enumerate|zip|map|filter|sorted|isinstance|type|dict|list|set|tuple|int|str|float|bool|open|super)\b/g;
  const STR_RE = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  const NUM_RE = /\b(\d+\.?\d*)\b/g;
  const kw = lang === "sql" ? SQL_KW : PY_KW;
  const lines = code.split("\n");
  const result = [];
  lines.forEach((line, li) => {
    if (li > 0) result.push({ text: "\n", color: null });
    const commentMatch = lang === "sql" ? line.match(/^(.*?)(--.*$)/) : line.match(/^(.*?)(#.*$)/);
    const before = commentMatch ? commentMatch[1] : line;
    const comment = commentMatch ? commentMatch[2] : null;
    const allM = [];
    let m;
    const sr = new RegExp(STR_RE.source, "g");
    while ((m = sr.exec(before)) !== null) allM.push({ start: m.index, end: m.index + m[0].length, text: m[0], type: "string" });
    const kr = new RegExp(kw.source, kw.flags);
    while ((m = kr.exec(before)) !== null) { if (!allM.some(a => a.type === "string" && m.index >= a.start && m.index < a.end)) allM.push({ start: m.index, end: m.index + m[0].length, text: m[0], type: "keyword" }); }
    const nr = new RegExp(NUM_RE.source, "g");
    while ((m = nr.exec(before)) !== null) { if (!allM.some(a => m.index >= a.start && m.index < a.end)) allM.push({ start: m.index, end: m.index + m[0].length, text: m[0], type: "number" }); }
    allM.sort((a, b) => a.start - b.start);
    let cur = 0;
    allM.forEach(match => { if (match.start > cur) result.push({ text: before.slice(cur, match.start), color: null }); result.push({ text: match.text, color: match.type === "keyword" ? "var(--blue)" : match.type === "string" ? "var(--lime)" : "var(--amber)" }); cur = match.end; });
    if (cur < before.length) result.push({ text: before.slice(cur), color: null });
    if (comment) result.push({ text: comment, color: "var(--muted)" });
  });
  return result;
}

function CodeBlock({ content, lang }) {
  const tokens = highlight(content, lang);
  return (<pre style={{ fontSize: 12, fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{tokens.map((t, i) => t.color ? <span key={i} style={{ color: t.color }}>{t.text}</span> : <span key={i}>{t.text}</span>)}</pre>);
}

function parseBlocks(content) {
  if (!content) return [{ type: "text", content: "" }];
  const blocks = [];
  const parts = content.split(/(```[\s\S]*?```)/g);
  parts.forEach(part => {
    const fenceMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || detectLang(fenceMatch[2]);
      blocks.push({ type: "code", lang, content: fenceMatch[2].replace(/\n$/, "") });
    } else if (part.trim()) {
      blocks.push({ type: "text", content: part });
    }
  });
  if (blocks.length === 0) {
    const lang = detectLang(content);
    if (lang) return [{ type: "code", lang, content }];
    return [{ type: "text", content }];
  }
  return blocks;
}

function NoteContent({ content, maxHeight }) {
  const blocks = parseBlocks(content);
  return (
    <div style={{ maxHeight: maxHeight || "none", overflow: maxHeight ? "hidden" : "visible" }}>
      {blocks.map((b, i) => b.type === "code" ? (
        <div key={i} style={{ background: "var(--bg)", borderRadius: 6, padding: "8px 10px", margin: "6px 0", position: "relative" }}>
          {b.lang && <span style={{ position: "absolute", top: 4, right: 8, fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>{b.lang}</span>}
          <CodeBlock content={b.content} lang={b.lang} />
        </div>
      ) : (
        <div key={i} style={{ fontSize: 12, color: "var(--title)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{b.content}</div>
      ))}
    </div>
  );
}

// ============================================
// Markdown renderer with mermaid support
// ============================================

let mermaidPromise = null;
const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import("https://esm.sh/mermaid@10").then(m => {
      m.default.initialize({ startOnLoad: false, theme: "dark", themeVariables: { darkMode: true, background: "var(--side)", primaryColor: "var(--surface)", primaryTextColor: "var(--title)", lineColor: "var(--muted)", primaryBorderColor: "var(--line)" } });
      return m.default;
    });
  }
  return mermaidPromise;
};

function MermaidDiagram({ code }) {
  const ref = useRef(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadMermaid().then(async (mermaid) => {
      if (cancelled || !ref.current) return;
      try {
        const id = "mer_" + Math.random().toString(36).slice(2);
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) { if (!cancelled) setErr(e.message); }
    }).catch(e => setErr(e.message));
    return () => { cancelled = true; };
  }, [code]);
  if (err) return <div style={{ fontSize: 10, color: "var(--pink)", padding: 8, background: "var(--surface)", borderRadius: 4 }}>Mermaid error: {err}</div>;
  return <div ref={ref} style={{ padding: 12, background: "var(--side)", border: "1px solid var(--line)", borderRadius: 6, overflowX: "auto", margin: "8px 0", textAlign: "center" }} />;
}

const parseInline = (text) => {
  // Returns array of React elements/strings, parsing bold, italic, code, links inline
  const parts = [];
  let buf = ""; let i = 0;
  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      if (buf) parts.push(buf); buf = "";
      const end = text.indexOf("**", i + 2);
      if (end === -1) { buf += text[i]; i++; continue; }
      parts.push(<strong key={i} style={{ fontWeight: 500, color: "var(--text)" }}>{text.slice(i + 2, end)}</strong>);
      i = end + 2;
    } else if (text[i] === "*") {
      if (buf) parts.push(buf); buf = "";
      const end = text.indexOf("*", i + 1);
      if (end === -1) { buf += text[i]; i++; continue; }
      parts.push(<em key={i} style={{ fontStyle: "italic" }}>{text.slice(i + 1, end)}</em>);
      i = end + 1;
    } else if (text[i] === "`") {
      if (buf) parts.push(buf); buf = "";
      const end = text.indexOf("`", i + 1);
      if (end === -1) { buf += text[i]; i++; continue; }
      parts.push(<code key={i} style={{ background: "var(--surface)", color: "var(--orange)", padding: "1px 5px", borderRadius: 3, fontSize: "0.9em", fontFamily: "'SF Mono', monospace" }}>{text.slice(i + 1, end)}</code>);
      i = end + 1;
    } else if (text[i] === "[") {
      const close = text.indexOf("]", i + 1);
      const paren = text.indexOf("(", close);
      const pclose = text.indexOf(")", paren);
      if (close !== -1 && paren === close + 1 && pclose !== -1) {
        if (buf) parts.push(buf); buf = "";
        parts.push(<a key={i} href={text.slice(paren + 1, pclose)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--blue)", textDecoration: "none" }}>{text.slice(i + 1, close)}</a>);
        i = pclose + 1;
      } else { buf += text[i]; i++; }
    } else { buf += text[i]; i++; }
  }
  if (buf) parts.push(buf);
  return parts;
};

function MarkdownView({ content }) {
  if (!content) return null;
  const lines = content.split("\n");
  const blocks = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      const code = codeLines.join("\n");
      if (lang === "mermaid") {
        blocks.push(<MermaidDiagram key={key++} code={code} />);
      } else {
        blocks.push(<pre key={key++} style={{ background: "var(--bg)", padding: "10px 14px", borderRadius: 6, overflowX: "auto", margin: "8px 0", fontSize: 12, fontFamily: "'SF Mono', monospace", color: "var(--title)", border: "1px solid var(--surface)", lineHeight: 1.5 }}>{lang && <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{lang}</div>}<code>{code}</code></pre>);
      }
      i++; continue;
    }
    // Headings
    if (line.startsWith("### ")) { blocks.push(<h3 key={key++} style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", margin: "12px 0 6px" }}>{parseInline(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith("## ")) { blocks.push(<h2 key={key++} style={{ fontSize: 16, fontWeight: 500, color: "var(--text)", margin: "16px 0 6px" }}>{parseInline(line.slice(3))}</h2>); i++; continue; }
    if (line.startsWith("# ")) { blocks.push(<h1 key={key++} style={{ fontSize: 18, fontWeight: 500, color: "var(--text)", margin: "20px 0 8px" }}>{parseInline(line.slice(2))}</h1>); i++; continue; }
    // Horizontal rule
    if (line.trim() === "---") { blocks.push(<hr key={key++} style={{ border: "none", borderTop: "1px solid var(--line)", margin: "12px 0" }} />); i++; continue; }
    // Blockquote
    if (line.startsWith("> ")) { blocks.push(<blockquote key={key++} style={{ borderLeft: "3px solid var(--line)", paddingLeft: 12, margin: "8px 0", color: "var(--sub)", fontStyle: "italic" }}>{parseInline(line.slice(2))}</blockquote>); i++; continue; }
    // Unordered list
    if (line.match(/^\s*[-*]\s/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\s*[-*]\s/)) { items.push(lines[i].replace(/^\s*[-*]\s/, "")); i++; }
      blocks.push(<ul key={key++} style={{ margin: "6px 0", paddingLeft: 20 }}>{items.map((it, j) => <li key={j} style={{ fontSize: 13, color: "var(--title)", margin: "2px 0", lineHeight: 1.6 }}>{parseInline(it)}</li>)}</ul>);
      continue;
    }
    // Ordered list
    if (line.match(/^\s*\d+\.\s/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s/)) { items.push(lines[i].replace(/^\s*\d+\.\s/, "")); i++; }
      blocks.push(<ol key={key++} style={{ margin: "6px 0", paddingLeft: 20 }}>{items.map((it, j) => <li key={j} style={{ fontSize: 13, color: "var(--title)", margin: "2px 0", lineHeight: 1.6 }}>{parseInline(it)}</li>)}</ol>);
      continue;
    }
    // Empty line
    if (line.trim() === "") { blocks.push(<div key={key++} style={{ height: 6 }} />); i++; continue; }
    // Paragraph
    blocks.push(<p key={key++} style={{ fontSize: 13, color: "var(--title)", margin: "4px 0", lineHeight: 1.7 }}>{parseInline(line)}</p>);
    i++;
  }
  return <div>{blocks}</div>;
}

// ============================================
// PDF Reader with text-selection highlighting (PDF.js)
// ============================================
let pdfjsPromise = null;
const loadPdfJs = () => {
  if (!pdfjsPromise) {
    pdfjsPromise = import("https://esm.sh/pdfjs-dist@4.4.168/build/pdf.min.mjs").then(lib => {
      lib.GlobalWorkerOptions.workerSrc = "https://esm.sh/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";
      return lib;
    });
  }
  return pdfjsPromise;
};

const HL_COLORS = { amber: "rgba(239,159,39,0.35)", teal: "rgba(93,202,165,0.35)", pink: "rgba(212,83,126,0.35)", blue: "rgba(55,138,221,0.35)" };

function PdfReader({ docUrl, docId, topic, highlights, onSelectionHighlight, onHighlightClick, onHighlightDelete, jumpTo }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [sel, setSel] = useState(null); // { page, text, rects, x, y }
  const [scale, setScale] = useState(1.4);
  const pageDimsRef = useRef({}); // pageNum -> {width, height} of rendered page

  // Inject text-layer CSS once (aligns invisible selectable text over the canvas)
  useEffect(() => {
    if (document.getElementById("pdf-text-layer-css")) return;
    const style = document.createElement("style");
    style.id = "pdf-text-layer-css";
    style.textContent = `
.pdf-text-layer { position:absolute; text-align:initial; inset:0; overflow:clip; line-height:1; text-size-adjust:none; forced-color-adjust:none; transform-origin:0 0; z-index:2; }
.pdf-text-layer span, .pdf-text-layer br { color:transparent; position:absolute; white-space:pre; cursor:text; transform-origin:0% 0%; }
.pdf-text-layer ::selection { background:rgba(127,119,221,0.45); }
.pdf-text-layer span { pointer-events:auto; }`;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null); setSel(null);
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        const pdf = await pdfjs.getDocument(docUrl).promise;
        if (cancelled) return;
        setNumPages(pdf.numPages);
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = "";
        const RENDER_SCALE = 2;
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          // Wrapper sits in normal flow and is sized to the VISUAL (zoomed) size
          const wrap = document.createElement("div");
          wrap.className = "pdf-page-wrap";
          wrap.dataset.page = n;
          wrap.dataset.natw = viewport.width;
          wrap.dataset.nath = viewport.height;
          wrap.style.cssText = `position:relative;margin:0 auto 12px;`;
          // pageDiv holds the actual content at natural size, scaled via transform
          const pageDiv = document.createElement("div");
          pageDiv.className = "pdf-page";
          pageDiv.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;background:#fff;transform-origin:top left;`;
          const canvas = document.createElement("canvas");
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.cssText = `display:block;width:${viewport.width}px;height:${viewport.height}px;`;
          pageDiv.appendChild(canvas);
          const ctx = canvas.getContext("2d");
          const renderViewport = page.getViewport({ scale: RENDER_SCALE * dpr });
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
          if (cancelled) return;
          pageDimsRef.current[n] = { width: viewport.width, height: viewport.height };
          // Text layer for selection
          const textLayerDiv = document.createElement("div");
          textLayerDiv.className = "pdf-text-layer";
          textLayerDiv.style.cssText = `position:absolute;inset:0;overflow:clip;line-height:1;text-align:initial;transform-origin:0 0;`;
          textLayerDiv.style.setProperty("--scale-factor", String(RENDER_SCALE));
          pageDiv.appendChild(textLayerDiv);
          try {
            const textContent = await page.getTextContent();
            const tl = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport });
            await tl.render();
          } catch (e) { /* text layer optional */ }
          // Highlight overlay layer
          const hlLayer = document.createElement("div");
          hlLayer.className = "pdf-hl-layer";
          hlLayer.dataset.page = n;
          hlLayer.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:3;";
          pageDiv.appendChild(hlLayer);
          wrap.appendChild(pageDiv);
          container.appendChild(wrap);
        }
        if (!cancelled) { setLoading(false); applyZoom(); }
      } catch (e) { if (!cancelled) { setErr(e.message); setLoading(false); } }
    })();
    return () => { cancelled = true; };
  }, [docUrl]);

  const RENDER_SCALE = 2;
  // Apply zoom instantly via CSS transform (no re-render). Wrapper layout matches visual size.
  const applyZoom = () => {
    const container = containerRef.current;
    if (!container) return;
    const z = scale / RENDER_SCALE;
    container.querySelectorAll(".pdf-page-wrap").forEach(wrap => {
      const natW = Number(wrap.dataset.natw) || 0, natH = Number(wrap.dataset.nath) || 0;
      wrap.style.width = `${natW * z}px`;
      wrap.style.height = `${natH * z}px`;
      const pageDiv = wrap.querySelector(".pdf-page");
      if (pageDiv) pageDiv.style.transform = `scale(${z})`;
    });
  };
  useEffect(() => { applyZoom(); }, [scale]);

  // Render highlights whenever they change
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll(".pdf-hl-layer").forEach(layer => {
      const page = Number(layer.dataset.page);
      layer.innerHTML = "";
      (highlights || []).filter(h => h.page === page).forEach(h => {
        (h.rects || []).forEach(r => {
          const d = document.createElement("div");
          d.style.cssText = `position:absolute;left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%;background:${HL_COLORS[h.color] || HL_COLORS.amber};cursor:pointer;pointer-events:auto;border-radius:2px;`;
          d.title = h.note_id ? "Open linked note" : "Highlight";
          d.onclick = () => onHighlightClick && onHighlightClick(h);
          layer.appendChild(d);
        });
      });
    });
  }, [highlights, loading]);

  // Scroll to a highlight when jumpTo changes
  useEffect(() => {
    if (!jumpTo || loading) return;
    const container = containerRef.current;
    if (!container) return;
    const wrap = container.querySelector(`.pdf-page-wrap[data-page="${jumpTo.page}"]`);
    if (!wrap) return;
    const z = scale / RENDER_SCALE;
    const natH = Number(wrap.dataset.nath) || 0;
    const firstRect = (jumpTo.rects || [])[0];
    let offset = wrap.offsetTop;
    if (firstRect) offset += firstRect.y * natH * z;
    offset -= container.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
    const hlLayer = wrap.querySelector(".pdf-hl-layer");
    if (hlLayer) hlLayer.animate([{ opacity: 0.3 }, { opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 800 });
  }, [jumpTo, loading]);

  // Pinch / ctrl+wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale(s => Math.max(0.6, Math.min(3, +(s - e.deltaY * 0.01).toFixed(2))));
      }
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, []);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) { setSel(null); return; }
    const range = selection.getRangeAt(0);
    // Find the page div containing the selection
    let node = range.startContainer;
    while (node && node.nodeType !== 1) node = node.parentNode;
    let pageDiv = node?.closest?.("[data-page]");
    if (!pageDiv) { setSel(null); return; }
    const page = Number(pageDiv.dataset.page);
    const dims = pageDimsRef.current[page];
    if (!dims) { setSel(null); return; }
    const pageRect = pageDiv.getBoundingClientRect();
    const scaleX = dims.width / pageRect.width, scaleY = dims.height / pageRect.height;
    const clientRects = Array.from(range.getClientRects());
    const rects = clientRects.map(cr => ({
      x: ((cr.left - pageRect.left) * scaleX) / dims.width,
      y: ((cr.top - pageRect.top) * scaleY) / dims.height,
      w: (cr.width * scaleX) / dims.width,
      h: (cr.height * scaleY) / dims.height,
    })).filter(r => r.w > 0 && r.h > 0);
    if (rects.length === 0) { setSel(null); return; }
    const last = clientRects[clientRects.length - 1];
    const contRect = containerRef.current.getBoundingClientRect();
    setSel({ page, text: selection.toString().trim(), rects, x: last.right - contRect.left, y: last.bottom - contRect.top + containerRef.current.scrollTop });
  };

  return (
    <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderBottom: "1px solid var(--line)", flexShrink: 0, background: "var(--surface)" }}>
        <button onClick={() => setScale(s => Math.max(0.6, +(s - 0.2).toFixed(1)))} style={{ background: "none", border: "1px solid var(--line)", color: "var(--sub)", cursor: "pointer", fontSize: 13, padding: "2px 8px", borderRadius: 4 }}>−</button>
        <span style={{ fontSize: 10, color: "var(--sub)", minWidth: 38, textAlign: "center", fontFamily: "'SF Mono', monospace" }}>{Math.round(scale / 1.4 * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(3, +(s + 0.2).toFixed(1)))} style={{ background: "none", border: "1px solid var(--line)", color: "var(--sub)", cursor: "pointer", fontSize: 13, padding: "2px 8px", borderRadius: 4 }}>+</button>
        <button onClick={() => setScale(1.4)} style={{ background: "none", border: "1px solid var(--line)", color: "var(--sub)", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>Reset</button>
        {numPages > 0 && <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: "auto" }}>{numPages} page{numPages !== 1 ? "s" : ""}</span>}
      </div>
      {loading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 12, zIndex: 5 }}>Loading PDF…</div>}
      {err && <div style={{ padding: 16, color: "var(--pink)", fontSize: 12 }}>Couldn't load PDF: {err}</div>}
      <div ref={containerRef} onMouseUp={handleMouseUp} style={{ flex: 1, overflowY: "auto", background: "var(--line)", padding: "12px 0", position: "relative" }} />
      {sel && (
        <div style={{ position: "absolute", left: Math.min(sel.x, 280), top: Math.min(sel.y + 60, 400), zIndex: 10, background: "var(--surface)", border: "1px solid var(--tint-purple-bd)", borderRadius: 6, padding: 4, display: "flex", gap: 4, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" }}>
          <button onClick={() => { onSelectionHighlight(sel, false); setSel(null); window.getSelection().removeAllRanges(); }} style={{ background: "var(--tint-purple-bd)", border: "none", color: "var(--purple)", cursor: "pointer", fontSize: 11, padding: "4px 10px", borderRadius: 4 }}>✎ Highlight</button>
          <button onClick={() => { onSelectionHighlight(sel, true); setSel(null); window.getSelection().removeAllRanges(); }} style={{ background: "#534AB7", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 11, padding: "4px 10px", borderRadius: 4 }}>+ Note</button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Topic Study View — split pane: PDF + notes
// ============================================
function TopicStudyView({ topic, projectId, notes, onClose, onStudyStart, reload, tmr, FMT }) {
  const [docs, setDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [docUrl, setDocUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [activeNote, setActiveNote] = useState(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [savedTick, setSavedTick] = useState(0);
  const [preview, setPreview] = useState(false);
  const [highlights, setHighlights] = useState([]);
  const [jumpTo, setJumpTo] = useState(null);
  const saveTimer = useRef(null);
  const fileRef = useRef(null);

  const topicNotes = notes.filter(n => n.is_study && n.topic === topic);

  useEffect(() => { db.getStudyDocs(projectId, topic).then(setDocs).catch(() => {}); }, [topic, projectId]);
  useEffect(() => { if (selectedDoc) db.getHighlights(selectedDoc.id).then(setHighlights).catch(() => setHighlights([])); else setHighlights([]); }, [selectedDoc]);

  const onSelectionHighlight = async (s, withNote) => {
    try {
      let noteId = null;
      if (withNote) {
        const created = await db.createNote(projectId, { title: s.text.slice(0, 50), content: `> ${s.text}\n\n`, is_study: true, topic, tags: [] });
        noteId = created.id;
        await reload();
      }
      const h = await db.createHighlight(selectedDoc.id, topic, s.page, s.text, s.rects, "amber", noteId);
      setHighlights([...highlights, h]);
      if (withNote) openNote({ id: noteId, title: s.text.slice(0, 50), content: `> ${s.text}\n\n` });
    } catch (e) { console.error(e); }
  };

  const onHighlightClick = (h) => {
    if (h.note_id) {
      const n = topicNotes.find(x => x.id === h.note_id);
      if (n) openNote(n);
    }
  };

  const onHighlightDelete = async (h) => {
    try { await db.deleteHighlight(h.id); setHighlights(highlights.filter(x => x.id !== h.id)); } catch (e) { console.error(e); }
  };

  const openDoc = async (doc) => {
    setSelectedDoc(doc); setDocUrl(null);
    try { const url = await db.getStudyDocUrl(doc.storage_path); setDocUrl(url); } catch (e) { console.error(e); }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") { alert("Only PDF files supported for inline viewing."); return; }
    setUploading(true);
    try { const doc = await db.uploadStudyDoc(projectId, topic, file); setDocs([doc, ...docs]); openDoc(doc); } catch (e) { alert("Upload failed: " + e.message); }
    setUploading(false);
  };

  const delDoc = async (doc) => {
    if (!confirm(`Delete ${doc.name}?`)) return;
    try { await db.deleteStudyDoc(doc.id, doc.storage_path); setDocs(docs.filter(d => d.id !== doc.id)); if (selectedDoc?.id === doc.id) { setSelectedDoc(null); setDocUrl(null); } } catch (e) { console.error(e); }
  };

  const openNote = async (n) => {
    setActiveNote(n.id); setNoteTitle(n.title || ""); setNoteContent(n.content || ""); setPreview(false);
    // If this note is linked to a highlight, switch to its doc and scroll there
    try {
      const h = await db.getHighlightByNote(n.id);
      if (h) {
        if (!selectedDoc || selectedDoc.id !== h.doc_id) {
          const doc = docs.find(d => d.id === h.doc_id);
          if (doc) { await openDoc(doc); }
        }
        setTimeout(() => setJumpTo({ ...h, _t: Date.now() }), 300);
      }
    } catch {}
  };
  const newNote = () => { setActiveNote("new"); setNoteTitle(""); setNoteContent(""); setPreview(false); };
  const delNote = async (n) => {
    const linked = highlights.filter(h => h.note_id === n.id);
    const msg = linked.length ? `Delete note "${n.title || "Untitled"}" and its linked highlight${linked.length > 1 ? "s" : ""}?` : `Delete note "${n.title || "Untitled"}"? (any linked highlight will be removed too)`;
    if (!confirm(msg)) return;
    try {
      // remove all highlights linked to this note (across any doc)
      await db.deleteHighlightsByNote(n.id).catch(() => {});
      setHighlights(hs => hs.filter(h => h.note_id !== n.id));
      await db.deleteNote(n.id);
      if (activeNote === n.id) { setActiveNote(null); setNoteTitle(""); setNoteContent(""); }
      await reload();
    } catch (e) { console.error(e); }
  };
  const saveNote = (title, content) => {
    setSavedTick(1);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        if (activeNote === "new") {
          const created = await db.createNote(projectId, { title, content, category: "investigation", is_study: true, topic, tags: [] });
          setActiveNote(created.id);
        } else {
          await db.updateNote(activeNote, { title, content });
        }
        setSavedTick(2); setTimeout(() => setSavedTick(0), 1500); await reload();
      } catch (e) { console.error(e); setSavedTick(0); }
    }, 900);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 200, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "1px solid var(--line)", color: "var(--sub)", cursor: "pointer", fontSize: 12, padding: "4px 10px", borderRadius: 4 }}>← Back</button>
        <span style={{ fontSize: 16, fontWeight: 500, color: "var(--purple)" }}>📚 {topic}</span>
        {tmr.st !== "idle" && tmr.tType === "study" && tmr.studyTopic === topic && (
          <span style={{ fontSize: 13, fontFamily: "'SF Mono', monospace", color: "var(--red)", padding: "2px 8px", background: "var(--tint-red-bg)", borderRadius: 4 }}>● {FMT(tmr.left)}</span>
        )}
        <span style={{ flex: 1 }} />
        {!(tmr.st !== "idle" && tmr.tType === "study" && tmr.studyTopic === topic) && <button onClick={() => onStudyStart(topic, false)} style={{ background: "var(--tint-purple-bd)", border: "none", color: "var(--purple)", cursor: "pointer", fontSize: 12, padding: "5px 12px", borderRadius: 4 }}>▶ Start study timer</button>}
      </div>

      {/* Split */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Left: PDF */}
        <div style={{ flex: 1.3, display: "flex", flexDirection: "column", borderRight: "1px solid var(--line)", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--surface)", flexShrink: 0, overflowX: "auto" }}>
            <input ref={fileRef} type="file" accept="application/pdf" onChange={handleUpload} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ background: "none", border: "1px dashed var(--line)", color: "var(--sub)", cursor: "pointer", fontSize: 11, padding: "3px 10px", borderRadius: 4, whiteSpace: "nowrap" }}>{uploading ? "Uploading..." : "+ Upload PDF"}</button>
            {docs.map(d => (
              <button key={d.id} onClick={() => openDoc(d)} style={{ background: selectedDoc?.id === d.id ? "var(--tint-purple-bg)" : "var(--surface)", border: selectedDoc?.id === d.id ? "1px solid var(--tint-purple-bd)" : "1px solid var(--line)", color: selectedDoc?.id === d.id ? "var(--purple)" : "var(--sub)", cursor: "pointer", fontSize: 11, padding: "3px 10px", borderRadius: 4, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                📄 {d.name.length > 20 ? d.name.slice(0, 18) + "…" : d.name}
                <span onClick={e => { e.stopPropagation(); delDoc(d); }} style={{ color: "var(--muted)", fontSize: 10 }}>✕</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1, background: "var(--line2)", minHeight: 0 }}>
            {selectedDoc && docUrl ? (
              <PdfReader docUrl={docUrl} docId={selectedDoc.id} topic={topic} highlights={highlights} onSelectionHighlight={onSelectionHighlight} onHighlightClick={onHighlightClick} onHighlightDelete={onHighlightDelete} jumpTo={jumpTo} />
            ) : selectedDoc && !docUrl ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", fontSize: 12 }}>Loading PDF…</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)", fontSize: 12, gap: 8 }}>
                <span style={{ fontSize: 32 }}>📄</span>
                <span>{docs.length === 0 ? "Upload a PDF to read here" : "Select a PDF above"}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Notes */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {activeNote ? (<>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--surface)", flexShrink: 0 }}>
              <button onClick={() => setActiveNote(null)} style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", fontSize: 12 }}>←</button>
              <input value={noteTitle} onChange={e => { setNoteTitle(e.target.value); saveNote(e.target.value, noteContent); }} placeholder="Note title" style={{ flex: 1, padding: "4px 8px", borderRadius: 4, fontSize: 13, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
              <button onClick={() => setPreview(!preview)} style={{ background: preview ? "var(--tint-purple-bg)" : "none", border: "1px solid var(--line)", color: preview ? "var(--purple)" : "var(--sub)", cursor: "pointer", fontSize: 10, padding: "3px 8px", borderRadius: 4 }}>{preview ? "Edit" : "Preview"}</button>
              {activeNote !== "new" && <button onClick={() => { const n = topicNotes.find(x => x.id === activeNote); if (n) delNote(n); }} title="Delete note" style={{ background: "none", border: "1px solid var(--line)", color: "var(--sub)", cursor: "pointer", fontSize: 11, padding: "3px 8px", borderRadius: 4 }} onMouseEnter={e => { e.currentTarget.style.color = "var(--pink)"; e.currentTarget.style.borderColor = "#A32D2D"; }} onMouseLeave={e => { e.currentTarget.style.color = "var(--sub)"; e.currentTarget.style.borderColor = "var(--line)"; }}>🗑</button>}
              <span style={{ fontSize: 9, color: savedTick === 2 ? "var(--green)" : savedTick === 1 ? "var(--amber)" : "var(--line)" }}>{savedTick === 2 ? "✓" : savedTick === 1 ? "…" : ""}</span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {preview ? (
                <div style={{ padding: "12px 16px" }}><MarkdownView content={noteContent} /></div>
              ) : (
                <textarea value={noteContent} onChange={e => { setNoteContent(e.target.value); saveNote(noteTitle, e.target.value); }} placeholder={"Write notes... supports markdown + ```mermaid"} style={{ width: "100%", height: "100%", padding: "12px 16px", background: "var(--bg)", color: "var(--text)", border: "none", outline: "none", resize: "none", fontFamily: "'SF Mono', monospace", fontSize: 13, lineHeight: 1.6, boxSizing: "border-box" }} />
              )}
            </div>
          </>) : (<>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--surface)", flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>NOTES ({topicNotes.length})</span>
              <button onClick={newNote} style={{ background: "var(--tint-purple-bd)", border: "none", color: "var(--purple)", cursor: "pointer", fontSize: 11, padding: "3px 10px", borderRadius: 4 }}>+ New note</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
              {topicNotes.length === 0 && <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, padding: 24 }}>No notes yet. Click "+ New note" to start.</div>}
              {topicNotes.map(n => (
                <div key={n.id} onClick={() => openNote(n)} style={{ padding: "10px 12px", background: "var(--side)", border: "1px solid var(--line)", borderRadius: 6, marginBottom: 6, cursor: "pointer", position: "relative" }} onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--dim)"; const b = e.currentTarget.querySelector(".note-del"); if (b) b.style.opacity = "1"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; const b = e.currentTarget.querySelector(".note-del"); if (b) b.style.opacity = "0"; }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", marginBottom: 2, paddingRight: 20 }}>{n.title || "Untitled"}</div>
                  <div style={{ fontSize: 11, color: "var(--sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(n.content || "").slice(0, 80)}</div>
                  <button className="note-del" onClick={e => { e.stopPropagation(); delNote(n); }} title="Delete note" style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13, opacity: 0, transition: "opacity 0.15s", padding: 2, lineHeight: 1 }} onMouseEnter={e => e.currentTarget.style.color = "var(--pink)"} onMouseLeave={e => e.currentTarget.style.color = "var(--muted)"}>🗑</button>
                </div>
              ))}
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}

function NotesView({ notes, issues, files, testCases, projectId, reload, meetingTags, usedRepos, allSessions, onStudyStart, tmr }) {
  const [openTopic, setOpenTopic] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [filterCat, setFilterCat] = useState("all");
  const [filterRepo, setFilterRepo] = useState("all");
  const [filterMode, setFilterMode] = useState("all"); // all | regular | study
  const [filterTag, setFilterTag] = useState("all");
  const [filterTopic, setFilterTopic] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [form, setForm] = useState({ title: "", content: "", category: "scratch", linked_issue_id: "", linked_file_id: "", linked_test_id: "", code_lang: "", meeting_tag: [], repo_name: "", is_study: false, tags: [], topic: "" });
  const [newTag, setNewTag] = useState("");

  const allNoteRepos = [...new Set([...(usedRepos || []), ...notes.map(n => n.repo_name).filter(Boolean)])];
  const allTags = [...new Set(notes.flatMap(n => Array.isArray(n.tags) ? n.tags : []))];
  const allTopics = [...new Set(notes.filter(n => n.is_study && n.topic).map(n => n.topic))].sort();

  // Per-topic stats (note count + study time)
  const topicStats = {};
  allTopics.forEach(t => { topicStats[t] = { notes: 0, seconds: 0, lastStudied: null }; });
  notes.forEach(n => { if (n.is_study && n.topic && topicStats[n.topic]) topicStats[n.topic].notes++; });
  (allSessions || []).forEach(s => {
    if (s.study_topic && topicStats[s.study_topic]) {
      topicStats[s.study_topic].seconds += s.duration_seconds || 0;
      const d = new Date(s.completed_at);
      if (!topicStats[s.study_topic].lastStudied || d > topicStats[s.study_topic].lastStudied) topicStats[s.study_topic].lastStudied = d;
    }
  });

  const filtered = notes.filter(n => {
    if (filterMode === "study" && !n.is_study) return false;
    if (filterMode === "regular" && n.is_study) return false;
    if (filterCat !== "all" && n.category !== filterCat) return false;
    if (filterRepo !== "all" && n.repo_name !== filterRepo) return false;
    if (filterTag !== "all" && !(Array.isArray(n.tags) && n.tags.includes(filterTag))) return false;
    if (filterTopic !== "all" && n.topic !== filterTopic) return false;
    if (searchQ && !n.title.toLowerCase().includes(searchQ.toLowerCase()) && !n.content.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const startNew = (cat) => { setForm({ title: "", content: "", category: cat || "scratch", linked_issue_id: "", linked_file_id: "", linked_test_id: "", code_lang: "", meeting_tag: [], repo_name: "", is_study: filterMode === "study", tags: [], topic: "" }); setEditing("new"); };
  const startEdit = (n) => { setForm({ title: n.title, content: n.content, category: n.category, linked_issue_id: n.linked_issue_id || "", linked_file_id: n.linked_file_id || "", linked_test_id: n.linked_test_id || "", code_lang: n.code_lang || "", meeting_tag: parseMtags(n.meeting_tag), repo_name: n.repo_name || "", is_study: !!n.is_study, tags: Array.isArray(n.tags) ? n.tags : [], topic: n.topic || "" }); setEditing(n.id); setViewing(null); };
  const save = async () => {
    if (!form.content.trim() && !form.title.trim()) return;
    try {
      const payload = { ...form, linked_issue_id: form.linked_issue_id || null, linked_file_id: form.linked_file_id || null, linked_test_id: form.linked_test_id || null, meeting_tag: form.meeting_tag.length ? JSON.stringify(form.meeting_tag) : null };
      if (editing === "new") await db.createNote(projectId, payload);
      else await db.updateNote(editing, payload);
      setEditing(null); await reload();
    } catch (e) { console.error(e); }
  };
  const addTag = () => { const t = newTag.trim(); if (t && !form.tags.includes(t)) { setForm({ ...form, tags: [...form.tags, t] }); setNewTag(""); } };
  const removeTag = (t) => setForm({ ...form, tags: form.tags.filter(x => x !== t) });
  const del = async (id) => { try { await db.deleteNote(id); setViewing(null); await reload(); } catch (e) { console.error(e); } };
  const pin = async (id, pinned) => { try { await db.updateNote(id, { pinned: !pinned }); await reload(); } catch (e) { console.error(e); } };

  // View modal
  if (viewing) {
    const n = notes.find(x => x.id === viewing);
    if (!n) { setViewing(null); return null; }
    const cc = NOTE_CAT_COLORS[n.category] || NOTE_CAT_COLORS.scratch;
    const linkedIssue = issues.find(i => i.id === n.linked_issue_id);
    const linkedFile = files.find(f => f.id === n.linked_file_id);
    const linkedTest = (testCases || []).find(t => t.id === n.linked_test_id);
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={() => setViewing(null)}>
        <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", width: 640, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexShrink: 0, flexWrap: "wrap" }}>
            {n.is_study && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)" }}>★ Study</span>}
            {n.is_study && n.topic && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "var(--tint-purple-bg)", color: "var(--purple)" }}>📁 {n.topic}</span>}
            <Badge label={n.category} colors={cc} />
            {n.repo_name && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "var(--tint-blue-bg)", color: "var(--blue)", border: "1px solid var(--tint-blue-bd)", fontFamily: "'SF Mono', monospace" }}>{n.repo_name}</span>}
            {Array.isArray(n.tags) && n.tags.map(t => <span key={t} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--tint-purple-bd)", color: "var(--purple)" }}>#{t}</span>)}
            {n.title && <span style={{ fontSize: 15, fontWeight: 500, flex: 1 }}>{n.title}</span>}
            {!n.title && <span style={{ flex: 1 }} />}
            <button onClick={() => startEdit(n)} style={{ background: "none", border: "1px solid var(--line)", color: "var(--soft)", cursor: "pointer", fontSize: 11, padding: "4px 10px", borderRadius: 4 }}>Edit</button>
            <button onClick={() => setViewing(null)} style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {n.is_study ? <MarkdownView content={n.content} /> : <NoteContent content={n.content} />}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", flexShrink: 0 }}>
            <span>{SHORT_DATE(n.updated_at)}</span>
            {linkedIssue && <><span>·</span><span style={{ color: "var(--pink)" }}>◉ {linkedIssue.title}</span></>}
            {linkedTest && <><span>·</span><span style={{ color: "var(--green)" }}>▷ {linkedTest.title}</span></>}
            {linkedFile && <><span>·</span><span style={{ fontFamily: "'SF Mono', monospace" }}>{linkedFile.name}</span></>}
            {parseMtags(n.meeting_tag).map(t => <span key={t} style={{ padding: "0 4px", borderRadius: 2, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)", fontSize: 9 }}>{t}</span>)}
          </div>
        </div>
      </div>
    );
  }

  // Editor (split screen)
  if (editing) {
    const hasCode = form.content.includes("```") || detectLang(form.content);
    return (
      <div style={{ maxWidth: 900 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{editing === "new" ? "New note" : "Edit note"}</span>
          <div style={{ display: "flex", gap: 6 }}><Btn onClick={() => setEditing(null)}>Cancel</Btn><Btn primary onClick={save}>Save</Btn></div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          {!form.is_study && <Select value={form.category} onChange={v => setForm({ ...form, category: v })} options={NOTE_CATS} />}
          {form.is_study && <Input value={form.title} onChange={v => setForm({ ...form, title: v })} placeholder="Note title" style={{ flex: 1 }} />}
          {!form.is_study && form.category !== "scratch" && <Input value={form.title} onChange={v => setForm({ ...form, title: v })} placeholder="Title" style={{ flex: 1 }} />}
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: form.is_study ? "var(--purple)" : "var(--sub)", cursor: "pointer", padding: "0 8px", border: "1px solid", borderColor: form.is_study ? "#534AB7" : "var(--line)", borderRadius: 4, background: form.is_study ? "var(--tint-purple-bg)" : "transparent" }}>
            <input type="checkbox" checked={form.is_study} onChange={e => setForm({ ...form, is_study: e.target.checked })} style={{ cursor: "pointer" }} />
            ★ Study note
          </label>
        </div>
        {form.is_study && <div style={{ marginBottom: 10, padding: "8px 12px", background: "var(--tint-purple-bg)", border: "1px solid var(--tint-purple-bd)", borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: "var(--purple)", marginBottom: 6 }}>TAGS · supports markdown + ```mermaid blocks</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            {form.tags.map(t => (
              <span key={t} style={{ fontSize: 10, padding: "2px 6px", background: "var(--tint-purple-bd)", color: "var(--purple)", borderRadius: 3, display: "inline-flex", alignItems: "center", gap: 4 }}>
                #{t} <button onClick={() => removeTag(t)} style={{ background: "none", border: "none", color: "#7F77DD", cursor: "pointer", padding: 0, fontSize: 10 }}>✕</button>
              </span>
            ))}
            <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="+ add tag" style={{ padding: "2px 6px", borderRadius: 3, fontSize: 10, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", width: 100 }} />
          </div>
        </div>}
        <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4 }}>Editor — use ```sql or ```python for code blocks</div>
            <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder={"Write notes and paste code...\n\nUse ```sql or ```python fences:\n\n```sql\nSELECT * FROM users\n```"} rows={16} style={{ padding: "10px 12px", borderRadius: 6, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", width: "100%", resize: "vertical", fontFamily: "'SF Mono', 'Fira Code', monospace", lineHeight: 1.6, boxSizing: "border-box", tabSize: 2 }} onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); const s = e.target.selectionStart; const end = e.target.selectionEnd; const v = form.content; setForm({ ...form, content: v.substring(0, s) + "  " + v.substring(end) }); setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; }, 0); } }} />
          </div>
          {(hasCode || form.content.length > 20) && (
            <div style={{ flex: 1, minWidth: 0, background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 14px", maxHeight: 420, overflowY: "auto" }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>Preview</div>
              <NoteContent content={form.content} />
            </div>
          )}
        </div>
        {form.is_study ? (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1, maxWidth: 280 }}>
              <div style={{ fontSize: 11, color: "var(--purple)", marginBottom: 4 }}>📚 Topic</div>
              <input list="study-topic-list" value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} placeholder="e.g. Kafka, SQL, System Design" style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--tint-purple-bd)", outline: "none", width: "100%", boxSizing: "border-box" }} />
              <datalist id="study-topic-list">{allTopics.map(f => <option key={f} value={f} />)}</datalist>
            </div>
          </div>
        ) : (<>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Link to task</div><Select value={form.linked_issue_id} onChange={v => setForm({ ...form, linked_issue_id: v })} options={[{ value: "", label: "None" }, ...issues.map(i => ({ value: i.id, label: i.title }))]} style={{ width: "100%" }} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Link to test</div><Select value={form.linked_test_id} onChange={v => setForm({ ...form, linked_test_id: v })} options={[{ value: "", label: "None" }, ...(testCases || []).map(t => ({ value: t.id, label: t.title }))]} style={{ width: "100%" }} /></div>
          <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Link to file</div><Select value={form.linked_file_id} onChange={v => setForm({ ...form, linked_file_id: v })} options={[{ value: "", label: "None" }, ...files.map(f => ({ value: f.id, label: f.name }))]} style={{ width: "100%" }} /></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Repo</div>
            <input list="note-repo-list" value={form.repo_name} onChange={e => setForm({ ...form, repo_name: e.target.value })} placeholder="Select or type repo" style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "'SF Mono', monospace" }} />
            <datalist id="note-repo-list">{allNoteRepos.map(r => <option key={r} value={r} />)}</datalist>
          </div>
          {(meetingTags || []).length > 0 && <div style={{ flex: 2 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Meeting tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(meetingTags || []).map(t => { const on = form.meeting_tag.includes(t); return (
                <button key={t} onClick={() => setForm({ ...form, meeting_tag: on ? form.meeting_tag.filter(x => x !== t) : [...form.meeting_tag, t] })} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 10, cursor: "pointer", border: on ? "1px solid #7F77DD" : "1px solid var(--line)", background: on ? "var(--tint-purple-bg)" : "var(--surface)", color: on ? "var(--purple)" : "var(--muted)" }}>{on ? "✓ " : ""}{t}</button>
              ); })}
            </div>
          </div>}
        </div>
        </>)}
      </div>
    );
  }

  // List view
  if (openTopic) {
    return <TopicStudyView topic={openTopic} projectId={projectId} notes={notes} onClose={() => setOpenTopic(null)} onStudyStart={onStudyStart} reload={reload} tmr={tmr} FMT={FMT} />;
  }
  return (<div>
    <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
      <Pill active={filterMode === "all"} onClick={() => setFilterMode("all")}>All</Pill>
      <Pill active={filterMode === "regular"} onClick={() => setFilterMode("regular")}>☰ Regular</Pill>
      <Pill active={filterMode === "study"} onClick={() => setFilterMode("study")}>★ Study</Pill>
      <span style={{ width: 1, height: 16, background: "var(--line)", margin: "0 4px" }} />
      <Pill active={filterCat === "all"} onClick={() => setFilterCat("all")}>All cats</Pill>
      {NOTE_CATS.map(c => <Pill key={c} active={filterCat === c} onClick={() => setFilterCat(c)}>{c}</Pill>)}
      {filterMode === "study" && allTopics.length > 0 && <select value={filterTopic} onChange={e => setFilterTopic(e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, fontSize: 11, background: filterTopic !== "all" ? "var(--tint-purple-bg)" : "var(--surface)", color: filterTopic !== "all" ? "var(--purple)" : "var(--sub)", border: filterTopic !== "all" ? "1px solid var(--tint-purple-bd)" : "1px solid var(--line)", outline: "none", cursor: "pointer" }}>
        <option value="all">All topics</option>
        {allTopics.map(f => <option key={f} value={f}>📁 {f}</option>)}
      </select>}
      {allTags.length > 0 && <>
        <span style={{ width: 1, height: 16, background: "var(--line)", margin: "0 4px" }} />
        <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, fontSize: 11, background: filterTag !== "all" ? "var(--tint-purple-bd)" : "var(--surface)", color: filterTag !== "all" ? "var(--purple)" : "var(--sub)", border: filterTag !== "all" ? "1px solid var(--tint-purple-bd)" : "1px solid var(--line)", outline: "none", cursor: "pointer" }}>
          <option value="all">All tags</option>
          {allTags.map(t => <option key={t} value={t}>#{t}</option>)}
        </select>
      </>}
      {allNoteRepos.length > 0 && <select value={filterRepo} onChange={e => setFilterRepo(e.target.value)} style={{ padding: "4px 8px", borderRadius: 4, fontSize: 11, background: filterRepo !== "all" ? "var(--tint-blue-bg)" : "var(--surface)", color: filterRepo !== "all" ? "var(--blue)" : "var(--sub)", border: filterRepo !== "all" ? "1px solid var(--tint-blue-bd)" : "1px solid var(--line)", outline: "none", cursor: "pointer", fontFamily: "'SF Mono', monospace" }}>
        <option value="all">All repos</option>
        {allNoteRepos.map(r => <option key={r} value={r}>{r}</option>)}
      </select>}
      <Input value={searchQ} onChange={setSearchQ} placeholder="Search..." style={{ width: 140, fontSize: 12 }} />
      <span style={{ flex: 1 }} />
      <Btn onClick={() => { setForm({ title: "", content: "", category: "scratch", linked_issue_id: "", linked_file_id: "", linked_test_id: "", code_lang: "", meeting_tag: [], repo_name: "", is_study: true, tags: [], topic: "" }); setEditing("new"); }} small>+ ★ Study</Btn>
      <Btn primary onClick={() => startNew()}>+ Note</Btn>
    </div>
    {filterMode === "study" && allTopics.length > 0 && (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>📚 Topics</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          {allTopics.map(t => {
            const st = topicStats[t];
            const active = filterTopic === t;
            return (
              <div key={t} onClick={() => setFilterTopic(active ? "all" : t)} style={{ background: active ? "var(--tint-purple-bg)" : "var(--side)", border: active ? "1px solid var(--tint-purple-bd)" : "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", cursor: "pointer", transition: "all 0.15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span onClick={e => { e.stopPropagation(); setOpenTopic(t); }} style={{ fontSize: 13, fontWeight: 500, color: "var(--purple)", cursor: "pointer", textDecoration: "underline", textDecorationColor: "#534AB7" }}>{t}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={e => { e.stopPropagation(); setOpenTopic(t); }} title="Open study view" style={{ background: "var(--tint-purple-bg)", border: "1px solid var(--tint-purple-bd)", color: "var(--purple)", cursor: "pointer", fontSize: 10, padding: "3px 8px", borderRadius: 4 }}>Open</button>
                    <button onClick={e => { e.stopPropagation(); onStudyStart && onStudyStart(t); }} title="Start study session" style={{ background: "var(--tint-purple-bd)", border: "none", color: "var(--purple)", cursor: "pointer", fontSize: 10, padding: "3px 8px", borderRadius: 4 }}>▶</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--sub)" }}>
                  <span>{st.notes} note{st.notes !== 1 ? "s" : ""}</span>
                  <span style={{ color: "var(--green)" }}>{st.seconds >= 60 ? FMTHR(Math.round(st.seconds / 60)) : "—"}</span>
                  {st.lastStudied && <span>· {SHORT_DATE(st.lastStudied)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
    {filtered.length === 0 && <EmptyState icon="☰" title="No notes yet" sub="Capture decisions, investigations, and scratch thoughts" action="New note" onAction={() => startNew()} />}
    {filtered.map(n => {
      const cc = NOTE_CAT_COLORS[n.category] || NOTE_CAT_COLORS.scratch;
      const blocks = parseBlocks(n.content);
      const hasCode = blocks.some(b => b.type === "code");
      const linkedIssue = issues.find(i => i.id === n.linked_issue_id);
      const linkedFile = files.find(f => f.id === n.linked_file_id);
      const linkedTest = (testCases || []).find(t => t.id === n.linked_test_id);
      return (
        <div key={n.id} onClick={() => setViewing(n.id)} style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "12px 14px", marginBottom: 8, cursor: "pointer", borderLeft: n.pinned ? "3px solid var(--amber)" : "3px solid transparent", borderTopLeftRadius: n.pinned ? 0 : 8, borderBottomLeftRadius: n.pinned ? 0 : 8 }} onMouseEnter={e => e.currentTarget.style.borderColor = "var(--dim)"} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--line)"}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                {n.is_study && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)" }}>★ Study</span>}
                {n.is_study && n.topic && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--tint-purple-bg)", color: "var(--purple)" }}>📁 {n.topic}</span>}
                <Badge label={n.category} colors={cc} small />
                {n.repo_name && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--tint-blue-bg)", color: "var(--blue)", border: "1px solid var(--tint-blue-bd)", fontFamily: "'SF Mono', monospace" }}>{n.repo_name}</span>}
                {hasCode && <Badge label={blocks.find(b => b.type === "code")?.lang?.toUpperCase() || "CODE"} colors={{ bg: "var(--bg)", text: "var(--sub)", border: "var(--line)" }} small />}
                {Array.isArray(n.tags) && n.tags.slice(0, 3).map(t => <span key={t} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--tint-purple-bd)", color: "var(--purple)" }}>#{t}</span>)}
                {n.title && <span style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</span>}
                {n.pinned && <span style={{ fontSize: 10, color: "var(--amber)" }}>pinned</span>}
              </div>
              {n.is_study ? <div style={{ fontSize: 12, color: "var(--sub)", lineHeight: 1.5, maxHeight: 80, overflow: "hidden", position: "relative" }}>{n.content.split("\n").slice(0, 4).join(" ").substring(0, 200)}{n.content.length > 200 ? "..." : ""}</div> : <NoteContent content={n.content} maxHeight={100} />}
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                <span>{SHORT_DATE(n.updated_at)}</span>
                {linkedIssue && <><span>·</span><span style={{ color: "var(--pink)" }}>◉ {linkedIssue.title}</span></>}
                {linkedTest && <><span>·</span><span style={{ color: "var(--green)" }}>▷ {linkedTest.title}</span></>}
                {linkedFile && <><span>·</span><span style={{ fontFamily: "'SF Mono', monospace" }}>{linkedFile.name}</span></>}
                {parseMtags(n.meeting_tag).map(t => <span key={t} style={{ padding: "0 4px", borderRadius: 2, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)", fontSize: 9 }}>{t}</span>)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => pin(n.id, n.pinned)} title={n.pinned ? "Unpin" : "Pin"} style={{ background: "none", border: "none", color: n.pinned ? "var(--amber)" : "var(--dim)", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>⊙</button>
              <button onClick={() => startEdit(n)} title="Edit" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12, padding: "2px 4px" }}>✎</button>
              <button onClick={() => del(n.id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>✕</button>
            </div>
          </div>
        </div>
      );
    })}
  </div>);
}

// ============================================
// Calendar View
// ============================================

function CalendarView({ meetings, issues, testCases, projectId, reload, onFocusMeeting, allNotes }) {
  const [month, setMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [showAdd, setShowAdd] = useState(false);
  const [mForm, setMForm] = useState({ title: "", meeting_date: "", start_time: "09:00", end_time: "10:00", recurrence: "none" });
  const [editingNotes, setEditingNotes] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [preppingId, setPreppingId] = useState(null);
  const [prepQ, setPrepQ] = useState("");

  const y = month.getFullYear(), m = month.getMonth();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date(); today.setHours(0,0,0,0);
  const dayLabels = ["S","M","T","W","T","F","S"];

  const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const allMeetingsByDate = {}; meetings.forEach(mt => { const k = mt.meeting_date; if (!allMeetingsByDate[k]) allMeetingsByDate[k] = []; allMeetingsByDate[k].push(mt); });
  const activeMeetingsByDate = {}; meetings.filter(mt => !mt.cancelled).forEach(mt => { const k = mt.meeting_date; if (!activeMeetingsByDate[k]) activeMeetingsByDate[k] = []; activeMeetingsByDate[k].push(mt); });
  const issueDues = {}; issues.forEach(i => { if (i.due_date) { if (!issueDues[i.due_date]) issueDues[i.due_date] = []; issueDues[i.due_date].push(i); } });
  const testDues = {}; (testCases || []).forEach(t => { if (t.due_date) { if (!testDues[t.due_date]) testDues[t.due_date] = []; testDues[t.due_date].push(t); } });

  const prevMonth = () => { const d = new Date(y, m - 1, 1); setMonth(d); setSelectedDay(d); };
  const nextMonth = () => { const d = new Date(y, m + 1, 1); setMonth(d); setSelectedDay(d); };
  const goToday = () => { const d = new Date(); d.setHours(0,0,0,0); setMonth(d); setSelectedDay(d); };

  const addMeeting = async () => {
    if (!mForm.title.trim() || !mForm.meeting_date) return;
    try {
      const dates = [mForm.meeting_date];
      if (mForm.recurrence !== "none") {
        const start = new Date(mForm.meeting_date + "T00:00:00");
        const days = { daily: 1, weekly: 7, biweekly: 14, monthly: 0 };
        for (let i = 1; i <= (mForm.recurrence === "daily" ? 56 : mForm.recurrence === "monthly" ? 8 : 8); i++) {
          const d = new Date(start);
          if (mForm.recurrence === "monthly") d.setMonth(d.getMonth() + i);
          else d.setDate(d.getDate() + days[mForm.recurrence] * i);
          dates.push(d.toISOString().split("T")[0]);
        }
      }
      for (const dt of dates) await db.createMeeting(projectId, { title: mForm.title, meeting_date: dt, start_time: mForm.start_time, end_time: mForm.end_time });
      setShowAdd(false); setMForm({ title: "", meeting_date: "", start_time: "09:00", end_time: "10:00", recurrence: "none" }); await reload();
    } catch (e) { console.error(e); }
  };
  const toggleAttended = async (mt) => {
    try {
      await db.updateMeeting(mt.id, { attended: !mt.attended });
      if (!mt.attended) {
        const dur = Math.max(0, Math.round((new Date(`${mt.meeting_date}T${mt.end_time}`) - new Date(`${mt.meeting_date}T${mt.start_time}`)) / 1000));
        if (dur > 0) await db.saveFocusSession(projectId, null, null, "work", dur, "meeting");
      }
      await reload();
    } catch (e) { console.error(e); }
  };
  const delMeeting = async (id) => { try { await db.deleteMeeting(id); await reload(); } catch {} };
  const cancelMeeting = async (id) => { try { await db.updateMeeting(id, { cancelled: true, attended: false }); await reload(); } catch {} };
  const uncancelMeeting = async (id) => { try { await db.updateMeeting(id, { cancelled: false }); await reload(); } catch {} };
  const cancelFuture = async (mt) => {
    if (!confirm(`Cancel all future "${mt.title}" meetings?`)) return;
    const future = meetings.filter(m => m.title === mt.title && m.start_time === mt.start_time && m.meeting_date >= mt.meeting_date && !m.attended);
    try { for (const f of future) await db.updateMeeting(f.id, { cancelled: true, attended: false }); await reload(); } catch {}
  };
  const saveNotes = async (id) => { try { await db.updateMeeting(id, { meeting_notes: noteText }); setEditingNotes(null); await reload(); } catch {} };

  const selKey = selectedDay ? dateKey(selectedDay) : null;
  const selMeetings = selKey ? (allMeetingsByDate[selKey] || []) : [];
  const selIssues = selKey ? (issueDues[selKey] || []) : [];
  const selTests = selKey ? (testDues[selKey] || []) : [];
  const selTotal = selMeetings.length + selIssues.length + selTests.length;

  return (
    <div>
      {/* Month nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
        <button onClick={prevMonth} style={{ background: "none", border: "1px solid var(--line)", color: "var(--sub)", cursor: "pointer", padding: "6px 10px", borderRadius: 6, fontSize: 13 }}>◂</button>
        <button onClick={nextMonth} style={{ background: "none", border: "1px solid var(--line)", color: "var(--sub)", cursor: "pointer", padding: "6px 10px", borderRadius: 6, fontSize: 13 }}>▸</button>
        <span style={{ fontSize: 16, fontWeight: 500, marginLeft: 4 }}>{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button onClick={goToday} style={{ background: "none", border: "1px solid var(--line)", color: "var(--green)", cursor: "pointer", padding: "4px 10px", borderRadius: 4, fontSize: 11 }}>Today</button>
        <span style={{ flex: 1 }} />
        <Btn primary onClick={() => { setShowAdd(true); setMForm({ title: "", meeting_date: selKey || dateKey(new Date()), start_time: "09:00", end_time: "10:00", recurrence: "none" }); }} small>+ Meeting</Btn>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Calendar grid */}
        <div style={{ flex: "0 0 340px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {dayLabels.map((d, i) => (<div key={i} style={{ textAlign: "center", fontSize: 10, color: "var(--muted)", padding: "6px 0", fontWeight: 500 }}>{d}</div>))}
            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} style={{ minHeight: 44 }} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = new Date(y, m, i + 1);
              const key = dateKey(day);
              const isToday = day.getTime() === today.getTime();
              const isSel = selectedDay && day.getTime() === selectedDay.getTime();
              const dayMeetings = activeMeetingsByDate[key] || [];
              const hasIssueDue = issueDues[key]?.length > 0;
              const hasTestDue = testDues[key]?.length > 0;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const activeMeetings = dayMeetings.filter(m => !m.cancelled);
              return (
                <div key={i} onClick={() => setSelectedDay(day)} style={{ minHeight: 44, padding: "3px 4px", borderRadius: 4, cursor: "pointer", background: isSel ? "var(--surface)" : "transparent", border: isToday ? "1px solid #5DCAA544" : isSel ? "1px solid var(--line)" : "1px solid transparent" }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "var(--side)"; }} onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, fontWeight: isToday ? 500 : 400, color: isToday ? "var(--green)" : isWeekend ? "var(--dim)" : "var(--soft)" }}>{i + 1}</span>
                    <div style={{ display: "flex", gap: 2 }}>
                      {hasIssueDue && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--pink)" }} />}
                      {hasTestDue && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--blue)" }} />}
                    </div>
                  </div>
                  {activeMeetings.length > 0 && <div style={{ fontSize: 8, padding: "1px 3px", borderRadius: 2, marginTop: 2, background: "var(--tint-purple-bg)", color: "var(--purple)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeMeetings.length > 1 ? `${activeMeetings.length} meetings` : activeMeetings[0].title.length > 10 ? activeMeetings[0].title.substring(0, 10) + "…" : activeMeetings[0].title}</div>}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 10, color: "var(--dim)" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 4, borderRadius: 1, background: "var(--tint-purple-bg)", marginRight: 3, verticalAlign: "middle" }} />Meeting</span>
            <span><span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: "var(--pink)", marginRight: 3, verticalAlign: "middle" }} />Task due</span>
            <span><span style={{ display: "inline-block", width: 4, height: 4, borderRadius: "50%", background: "var(--blue)", marginRight: 3, verticalAlign: "middle" }} />Test due</span>
          </div>
        </div>

        {/* Day detail panel */}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {selectedDay && (
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 15, fontWeight: 500 }}>{selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
                {selTotal === 0 && <span style={{ fontSize: 11, color: "var(--dim)" }}>Nothing scheduled</span>}
              </div>

              {/* Meetings section */}
              {selMeetings.length > 0 && <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: "#7F77DD", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Meetings ({selMeetings.length})</div>
                {selMeetings.map(mt => {
                  const isCancelled = mt.cancelled;
                  const borderColor = isCancelled ? "var(--line)" : mt.attended ? "var(--green)" : "#7F77DD";
                  const qs = (() => { try { return Array.isArray(mt.questions) ? mt.questions : JSON.parse(mt.questions || "[]"); } catch { return []; } })();
                  return (
                  <div key={mt.id} style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${borderColor}`, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, opacity: isCancelled ? 0.45 : 1 }}>
                    {/* Row 1: checkbox + title + time */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px 4px" }}>
                      {!isCancelled && <input type="checkbox" checked={mt.attended} onChange={() => toggleAttended(mt)} style={{ cursor: "pointer", flexShrink: 0 }} />}
                      {isCancelled && <span style={{ fontSize: 9, color: "var(--pink)", fontWeight: 500, flexShrink: 0 }}>CANCELLED</span>}
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500, textDecoration: (mt.attended || isCancelled) ? "line-through" : "none", color: (mt.attended || isCancelled) ? "var(--muted)" : "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{mt.title}</span>
                      {qs.length > 0 && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--tint-purple-bg)", color: "var(--purple)", border: "1px solid var(--tint-purple-bd)", flexShrink: 0 }}>{qs.filter(q => q.status === "answered").length}/{qs.length} Q</span>}
                      <span style={{ fontSize: 10, fontFamily: "'SF Mono', monospace", color: "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}>{mt.start_time}–{mt.end_time}</span>
                    </div>
                    {/* Row 2: actions */}
                    <div style={{ display: "flex", gap: 4, padding: "4px 12px 10px", paddingLeft: isCancelled ? 12 : 32, flexWrap: "wrap" }}>
                      {!isCancelled && !mt.attended && <button onClick={() => onFocusMeeting(mt)} style={{ background: "#7F77DD", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 10, padding: "3px 10px", borderRadius: 4, fontWeight: 500 }}>Join</button>}
                      {!isCancelled && !mt.attended && <button onClick={() => setPreppingId(preppingId === mt.id ? null : mt.id)} style={{ background: "none", border: "1px solid var(--tint-purple-bd)", color: "var(--purple)", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>Prep</button>}
                      {!isCancelled && !mt.attended && <button onClick={() => cancelMeeting(mt.id)} style={{ background: "none", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>Cancel</button>}
                      {!isCancelled && !mt.attended && <button onClick={() => cancelFuture(mt)} style={{ background: "none", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>All future</button>}
                      {isCancelled && <button onClick={() => uncancelMeeting(mt.id)} style={{ background: "none", border: "1px solid var(--line)", color: "var(--green)", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>Restore</button>}
                      <span style={{ flex: 1 }} />
                      <button onClick={() => delMeeting(mt.id)} style={{ background: "none", border: "none", color: "var(--line)", cursor: "pointer", fontSize: 12 }}>✕</button>
                    </div>
                    {/* Prep section */}
                    {preppingId === mt.id && !isCancelled && !mt.attended && (() => {
                      const ti = (issues || []).filter(i => parseMtags(i.meeting_tag).includes(mt.title));
                      const tt = (testCases || []).filter(t => parseMtags(t.meeting_tag).includes(mt.title));
                      const lastAtt = meetings.filter(m => m.title === mt.title && m.attended && m.meeting_date < mt.meeting_date).sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))[0];
                      const since = lastAtt ? new Date(lastAtt.meeting_date + "T23:59:59") : new Date(0);
                      const done = ti.filter(i => isTaskDone(i.status) && i.resolved_at && new Date(i.resolved_at) > since);
                      const prog = ti.filter(i => normalizeTaskStatus(i.status) === "in_progress");
                      const opn = ti.filter(i => normalizeTaskStatus(i.status) === "todo");
                      const tpass = tt.filter(t => t.status === "pass" && t.last_run && new Date(t.last_run) > since);
                      const tother = tt.filter(t => t.status !== "pass");
                      const tn = (allNotes || []).filter(n => parseMtags(n.meeting_tag).includes(mt.title));
                      const hasAuto = done.length + prog.length + opn.length + tpass.length + tother.length + tn.length > 0;
                      return (
                        <div style={{ padding: "0 12px 12px", borderTop: "1px solid var(--surface)", marginTop: 2, paddingTop: 10 }}>
                          <div style={{ fontSize: 10, color: "#7F77DD", fontWeight: 500, marginBottom: 8 }}>Agenda preview</div>
                          {(done.length > 0 || tpass.length > 0) && <div style={{ marginBottom: 6 }}><div style={{ fontSize: 9, color: "var(--green)", marginBottom: 3, fontWeight: 500 }}>SHIPPED</div>{done.map(i => <div key={i.id} style={{ fontSize: 11, color: "var(--green)", padding: "2px 0" }}>✓ {i.title}</div>)}{tpass.map(t => <div key={t.id} style={{ fontSize: 11, color: "var(--green)", padding: "2px 0" }}>✓ {t.title}</div>)}</div>}
                          {prog.length > 0 && <div style={{ marginBottom: 6 }}><div style={{ fontSize: 9, color: "var(--blue)", marginBottom: 3, fontWeight: 500 }}>IN PROGRESS</div>{prog.map(i => <div key={i.id} style={{ fontSize: 11, color: "var(--blue)", padding: "2px 0" }}>→ {i.title}</div>)}</div>}
                          {(opn.length > 0 || tother.length > 0) && <div style={{ marginBottom: 6 }}><div style={{ fontSize: 9, color: "var(--sub)", marginBottom: 3, fontWeight: 500 }}>OPEN</div>{opn.map(i => <div key={i.id} style={{ fontSize: 11, color: "var(--sub)", padding: "2px 0" }}>○ {i.title}</div>)}{tother.map(t => <div key={t.id} style={{ fontSize: 11, color: "var(--sub)", padding: "2px 0" }}>○ {t.title}</div>)}</div>}
                          {tn.length > 0 && <div style={{ marginBottom: 6 }}><div style={{ fontSize: 9, color: "var(--purple)", marginBottom: 3, fontWeight: 500 }}>NOTES</div>{tn.map(n => <div key={n.id} style={{ fontSize: 11, color: "var(--purple)", padding: "2px 0" }}>☰ {n.title || n.content.substring(0, 40)}</div>)}</div>}
                          {!hasAuto && <div style={{ fontSize: 10, color: "var(--line)", marginBottom: 6 }}>No items tagged. Use "Meeting tags" in editors.</div>}
                          <div style={{ borderTop: hasAuto ? "1px solid var(--surface)" : "none", paddingTop: hasAuto ? 8 : 0 }}>
                            <div style={{ fontSize: 9, color: "#D85A30", marginBottom: 3, fontWeight: 500 }}>TALKING POINTS</div>
                            {qs.map((q, idx) => (
                              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0", fontSize: 11 }}>
                                <span style={{ color: "#D85A30" }}>•</span>
                                <span style={{ flex: 1, color: "var(--title)" }}>{q.q}</span>
                                <button onClick={async () => { const nq = qs.filter((_, j) => j !== idx); try { await db.updateMeeting(mt.id, { questions: JSON.stringify(nq) }); await reload(); } catch {} }} style={{ background: "none", border: "none", color: "var(--line)", cursor: "pointer", fontSize: 9 }}>✕</button>
                              </div>
                            ))}
                            <input value={prepQ} onChange={e => setPrepQ(e.target.value)} onKeyDown={async e => { if (e.key === "Enter" && prepQ.trim()) { const nq = [...qs, { q: prepQ.trim(), a: "", status: "pending" }]; try { await db.updateMeeting(mt.id, { questions: JSON.stringify(nq) }); setPrepQ(""); await reload(); } catch {} } }} placeholder="Add a talking point..." style={{ marginTop: 4, width: "100%", padding: "5px 8px", borderRadius: 4, fontSize: 11, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--surface)", outline: "none", boxSizing: "border-box" }} />
                          </div>
                        </div>
                      );
                    })()}
                    {/* Notes on attended */}
                    {mt.attended && !isCancelled && (
                      <div style={{ padding: "0 12px 10px", borderTop: "1px solid var(--surface)", marginTop: 2, paddingTop: 8 }}>
                        {editingNotes === mt.id ? (
                          <div><TextArea value={noteText} onChange={setNoteText} placeholder="Meeting notes..." rows={3} /><div style={{ display: "flex", gap: 4, marginTop: 4 }}><Btn small primary onClick={() => saveNotes(mt.id)}>Save</Btn><Btn small onClick={() => setEditingNotes(null)}>Cancel</Btn></div></div>
                        ) : (
                          <div>
                            {mt.meeting_notes && <div style={{ fontSize: 11, color: "var(--sub)", whiteSpace: "pre-wrap", lineHeight: 1.5, padding: "2px 0 4px" }}>{mt.meeting_notes}</div>}
                            <button onClick={() => { setEditingNotes(mt.id); setNoteText(mt.meeting_notes || ""); }} style={{ background: "none", border: "1px dashed var(--surface)", color: "var(--dim)", cursor: "pointer", fontSize: 10, padding: "3px 8px", borderRadius: 4 }}>{mt.meeting_notes ? "Edit notes" : "+ Notes"}</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>);
                })}
              </div>}

              {/* Task dues */}
              {selIssues.length > 0 && <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: "var(--pink)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Tasks due ({selIssues.length})</div>
                {selIssues.map(i => (
                  <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--side)", borderRadius: 6, marginBottom: 4, border: "1px solid var(--line)" }}>
                    <Badge label={i.type} colors={i.type === "bug" ? { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" } : { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }} small />
                    <span style={{ flex: 1, fontSize: 12, color: "var(--title)" }}>{i.title}</span>
                    <Badge label={taskStatusLabel(i.status)} colors={normalizeTaskStatus(i.status) === "done" ? { bg: "var(--tint-green-bg)", text: "var(--green)", border: "var(--tint-green-bd)" } : PC[i.priority]} small />
                  </div>
                ))}
              </div>}

              {/* Test dues */}
              {selTests.length > 0 && <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, color: "var(--blue)", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Tests due ({selTests.length})</div>
                {selTests.map(t => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--side)", borderRadius: 6, marginBottom: 4, border: "1px solid var(--line)" }}>
                    <span style={{ color: "var(--blue)", fontSize: 12 }}>▷</span>
                    <span style={{ flex: 1, fontSize: 12, color: "var(--title)" }}>{t.title}</span>
                    <Badge label={t.status} colors={TC[t.status]} small />
                  </div>
                ))}
              </div>}

              {/* Add meeting form */}
              {showAdd && (
                <div style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--soft)", marginBottom: 10 }}>New meeting</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Input value={mForm.title} onChange={v => setMForm({ ...mForm, title: v })} placeholder="Meeting title" />
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="date" value={mForm.meeting_date} onChange={e => setMForm({ ...mForm, meeting_date: e.target.value })} style={{ flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
                      <input type="time" value={mForm.start_time} onChange={e => setMForm({ ...mForm, start_time: e.target.value })} style={{ flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
                      <input type="time" value={mForm.end_time} onChange={e => setMForm({ ...mForm, end_time: e.target.value })} style={{ flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--muted)" }}>Repeat:</span>
                      <Select value={mForm.recurrence} onChange={v => setMForm({ ...mForm, recurrence: v })} options={[{ value: "none", label: "One-time" }, { value: "daily", label: "Daily (8 weeks)" }, { value: "weekly", label: "Weekly (8 weeks)" }, { value: "biweekly", label: "Biweekly (8 weeks)" }, { value: "monthly", label: "Monthly (8 months)" }]} style={{ flex: 1 }} />
                    </div>
                    {mForm.recurrence !== "none" && <div style={{ fontSize: 10, color: "var(--green)" }}>Creates {mForm.recurrence === "daily" ? "57" : "9"} meetings starting {mForm.meeting_date || "..."}</div>}
                    <div style={{ display: "flex", gap: 6 }}><Btn small primary onClick={addMeeting}>Add</Btn><Btn small onClick={() => setShowAdd(false)}>Cancel</Btn></div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MeetingFocusView({ meeting, projectId, onClose, issues, testCases, meetings, allNotes }) {
  const [notes, setNotes] = useState(meeting.meeting_notes || "");
  const [manualItems, setManualItems] = useState(() => { try { const q = Array.isArray(meeting.questions) ? meeting.questions : JSON.parse(meeting.questions || "[]"); return q.filter(x => x.q); } catch { return []; } });
  const [newItem, setNewItem] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [started] = useState(Date.now());
  const [saving, setSaving] = useState(false);

  useEffect(() => { const iv = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000); return () => clearInterval(iv); }, [started]);

  // Auto-save
  useEffect(() => {
    const iv = setInterval(() => {
      db.updateMeeting(meeting.id, { meeting_notes: notes, questions: JSON.stringify(manualItems) }).catch(() => {});
    }, 10000);
    return () => clearInterval(iv);
  }, [notes, manualItems, meeting.id]);

  // Auto-populated items: issues & tests tagged with this meeting title
  const taggedIssues = (issues || []).filter(i => parseMtags(i.meeting_tag).includes(meeting.title));
  const taggedTests = (testCases || []).filter(t => parseMtags(t.meeting_tag).includes(meeting.title));
  const taggedNotes = (allNotes || []).filter(n => parseMtags(n.meeting_tag).includes(meeting.title));

  // Find last attended meeting with same title (before this one)
  const lastAttended = (meetings || []).filter(m => m.title === meeting.title && m.attended && m.meeting_date < meeting.meeting_date).sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))[0];
  const sinceDate = lastAttended ? new Date(lastAttended.meeting_date + "T23:59:59") : new Date(0);

  // Group by status — completed only since last attended meeting
  const completedIssues = taggedIssues.filter(i => isTaskDone(i.status) && i.resolved_at && new Date(i.resolved_at) > sinceDate);
  const activeIssues = taggedIssues.filter(i => normalizeTaskStatus(i.status) === "in_progress");
  const openIssues = taggedIssues.filter(i => normalizeTaskStatus(i.status) === "todo");
  const passedTests = taggedTests.filter(t => t.status === "pass" && t.last_run && new Date(t.last_run) > sinceDate);
  const otherTests = taggedTests.filter(t => t.status !== "pass");

  const addManual = () => { if (!newItem.trim()) return; setManualItems([...manualItems, { q: newItem.trim(), a: "", status: "pending" }]); setNewItem(""); };
  const removeManual = (idx) => setManualItems(manualItems.filter((_, i) => i !== idx));

  const endMeeting = async () => {
    setSaving(true);
    try {
      await db.updateMeeting(meeting.id, { attended: true, meeting_notes: notes, questions: JSON.stringify(manualItems) });
      const startDt = new Date(`${meeting.meeting_date}T${meeting.start_time}`);
      const endDt = new Date(`${meeting.meeting_date}T${meeting.end_time}`);
      const dur = Math.max(0, Math.round((endDt - startDt) / 1000));
      if (dur > 0) await db.saveFocusSession(projectId, null, null, "work", dur, "meeting");
      // Auto-create note
      if (notes.trim() || taggedIssues.length || taggedTests.length) {
        let noteContent = notes;
        if (completedIssues.length || passedTests.length) {
          noteContent += (noteContent ? "\n\n" : "") + "--- Completed ---\n" + completedIssues.map(i => `✓ ${i.title} (${i.type})`).join("\n") + (passedTests.length ? "\n" + passedTests.map(t => `✓ ${t.title} (test)`).join("\n") : "");
        }
        if (activeIssues.length || otherTests.length) {
          noteContent += (noteContent ? "\n\n" : "") + "--- In progress ---\n" + activeIssues.map(i => `→ ${i.title} (${i.status})`).join("\n") + (otherTests.length ? "\n" + otherTests.map(t => `→ ${t.title} (${t.status})`).join("\n") : "");
        }
        if (manualItems.length) {
          noteContent += (noteContent ? "\n\n" : "") + "--- Talking points ---\n" + manualItems.map(m => `• ${m.q}`).join("\n");
        }
        await db.createNote(projectId, { title: meeting.title, content: noteContent, category: "meeting", linked_issue_id: null, linked_file_id: null, linked_test_id: null, code_lang: "" });
      }
    } catch (e) { console.error(e); }
    setSaving(false);
    onClose();
  };

  const STS = { todo: { color: "var(--sub)", icon: "○" }, done: { color: "var(--green)", icon: "✓" }, skipped: { color: "var(--muted)", icon: "—" }, fixed: { color: "var(--green)", icon: "✓" }, verified: { color: "var(--green)", icon: "✓✓" }, wont_fix: { color: "var(--muted)", icon: "—" }, in_progress: { color: "var(--blue)", icon: "→" }, review: { color: "var(--purple)", icon: "◎" }, open: { color: "var(--sub)", icon: "○" }, reopened: { color: "var(--pink)", icon: "↺" }, pass: { color: "var(--green)", icon: "✓" }, fail: { color: "var(--pink)", icon: "✗" }, not_run: { color: "var(--sub)", icon: "○" } };
  const stsOf = (s) => STS[s] || STS[normalizeTaskStatus(s)] || { color: "var(--sub)", icon: "·" };

  const taggedTotal = taggedIssues.length + taggedTests.length + taggedNotes.length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 120, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--surface)", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7F77DD" }} />
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)", flex: 1 }}>{meeting.title}</span>
        <span style={{ fontSize: 13, fontFamily: "'SF Mono', monospace", color: "#7F77DD" }}>{FMT(elapsed)}</span>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{meeting.start_time} – {meeting.end_time}</span>
        <button onClick={endMeeting} disabled={saving} style={{ background: "#7F77DD", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 12, padding: "6px 16px", borderRadius: 6, fontWeight: 500, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "End meeting"}</button>
        <button onClick={onClose} style={{ background: "none", border: "1px solid var(--line)", color: "var(--muted)", cursor: "pointer", fontSize: 11, padding: "6px 12px", borderRadius: 6 }}>Leave</button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: Agenda */}
        <div style={{ width: 360, flexShrink: 0, borderRight: "1px solid var(--surface)", display: "flex", flexDirection: "column", padding: "16px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "#7F77DD", fontWeight: 500, textTransform: "uppercase", letterSpacing: 1 }}>Agenda</span>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>{taggedTotal} item{taggedTotal !== 1 ? "s" : ""} tagged</span>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Auto: Completed */}
            {(completedIssues.length > 0 || passedTests.length > 0) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Shipped</div>
                {completedIssues.map(i => (<div key={i.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2 }}><span style={{ color: stsOf(i.status).color }}>{stsOf(i.status).icon}</span><span style={{ color: "var(--title)", flex: 1 }}>{i.title}</span><span style={{ fontSize: 9, color: "var(--muted)" }}>{i.type}</span></div>))}
                {passedTests.map(t => (<div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2 }}><span style={{ color: "var(--green)" }}>✓</span><span style={{ color: "var(--title)", flex: 1 }}>{t.title}</span><span style={{ fontSize: 9, color: "var(--muted)" }}>test</span></div>))}
              </div>
            )}

            {/* Auto: In progress */}
            {(activeIssues.length > 0 || otherTests.filter(t => t.status === "fail").length > 0) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "var(--blue)", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>In progress</div>
                {activeIssues.map(i => (<div key={i.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2 }}><span style={{ color: stsOf(i.status).color }}>{stsOf(i.status).icon}</span><span style={{ color: "var(--title)", flex: 1 }}>{i.title}</span><span style={{ fontSize: 9, color: "var(--muted)" }}>{i.status.replace("_", " ")}</span></div>))}
                {otherTests.filter(t => t.status === "fail").map(t => (<div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2 }}><span style={{ color: "var(--pink)" }}>✗</span><span style={{ color: "var(--title)", flex: 1 }}>{t.title}</span><span style={{ fontSize: 9, color: "var(--muted)" }}>failing</span></div>))}
              </div>
            )}

            {/* Auto: Open */}
            {(openIssues.length > 0 || otherTests.filter(t => t.status === "not_run").length > 0) && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "var(--sub)", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Open</div>
                {openIssues.map(i => (<div key={i.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2 }}><span style={{ color: "var(--sub)" }}>○</span><span style={{ color: "var(--sub)", flex: 1 }}>{i.title}</span><span style={{ fontSize: 9, color: "var(--muted)" }}>{i.type}</span></div>))}
                {otherTests.filter(t => t.status === "not_run").map(t => (<div key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2 }}><span style={{ color: "var(--sub)" }}>○</span><span style={{ color: "var(--sub)", flex: 1 }}>{t.title}</span><span style={{ fontSize: 9, color: "var(--muted)" }}>test</span></div>))}
              </div>
            )}

            {/* Tagged notes */}
            {taggedNotes.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: "var(--purple)", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Notes</div>
                {taggedNotes.map(n => (<div key={n.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, fontSize: 11, marginBottom: 2 }}><span style={{ color: "var(--purple)" }}>☰</span><span style={{ color: "var(--title)", flex: 1 }}>{n.title || n.content.substring(0, 40)}</span><span style={{ fontSize: 9, color: "var(--muted)" }}>{n.category}</span></div>))}
              </div>
            )}

            {taggedTotal === 0 && <div style={{ padding: "12px 8px", fontSize: 11, color: "var(--line)" }}>No items tagged with this meeting. Tag tasks, tests, or notes in the editor.</div>}

            {/* Manual talking points */}
            <div style={{ borderTop: taggedTotal > 0 ? "1px solid var(--surface)" : "none", paddingTop: taggedTotal > 0 ? 12 : 0 }}>
              <div style={{ fontSize: 10, color: "#D85A30", fontWeight: 500, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Talking points</div>
              {manualItems.map((m, idx) => (
                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: "#D85A30" }}>•</span>
                  <span style={{ flex: 1, color: "var(--title)" }}>{m.q}</span>
                  <button onClick={() => removeManual(idx)} style={{ background: "none", border: "none", color: "var(--line)", cursor: "pointer", fontSize: 9 }}>✕</button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addManual(); }} placeholder="Add a talking point..." style={{ flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 11, background: "var(--side)", color: "var(--text)", border: "1px solid var(--surface)", outline: "none" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Notes */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 24px" }}>
          <div style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, flexShrink: 0 }}>Meeting notes</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={"Start typing notes...\n\nKey points:\n•\n•\n\nAction items:\n•\n•\n\nDecisions:\n•"}
            autoFocus
            style={{ flex: 1, padding: "20px 24px", borderRadius: 10, fontSize: 14, background: "var(--side)", color: "var(--title)", border: "1px solid var(--surface)", outline: "none", width: "100%", resize: "none", fontFamily: "'DM Sans', -apple-system, sans-serif", lineHeight: 1.8, boxSizing: "border-box" }}
            onKeyDown={e => { if (e.key === "Tab") { e.preventDefault(); const s = e.target.selectionStart; const end = e.target.selectionEnd; setNotes(notes.substring(0, s) + "  " + notes.substring(end)); setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; }, 0); } }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: "var(--line)" }}>Auto-saves every 10s</span>
            <span style={{ fontSize: 10, color: "var(--line)" }}>{notes.length} chars</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// News Feed View
// ============================================

function NewsView({ project, newsCache, projectId, reload }) {
  const [topics, setTopics] = useState(project?.news_topics || []);
  const [newTopic, setNewTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem("qtrack_anthropic_key") || ""; } catch { return ""; } });
  const [keyInput, setKeyInput] = useState("");
  const [mode, setMode] = useState("auto"); // auto tries edge function first

  useEffect(() => { try { setTopics(Array.isArray(project?.news_topics) ? project.news_topics : JSON.parse(project?.news_topics || "[]")); } catch { setTopics([]); } }, [project?.id]);

  const saveKey = () => { const k = keyInput.trim(); if (k) { setApiKey(k); localStorage.setItem("qtrack_anthropic_key", k); setKeyInput(""); } };

  const addTopic = async () => {
    if (!newTopic.trim() || topics.includes(newTopic.trim())) return;
    const nt = [...topics, newTopic.trim()];
    setTopics(nt); setNewTopic("");
    await db.updateProjectTopics(projectId, nt);
  };
  const removeTopic = async (t) => {
    const nt = topics.filter(x => x !== t);
    setTopics(nt);
    await db.updateProjectTopics(projectId, nt);
  };

  const buildPrompt = () => `You are a tech news curator. Find the latest news, tools, and articles related to: ${topics.join(", ")}.
Return 8-10 results as a JSON array. Each object: title, url, source, summary (1 sentence), topic_match, published_at.
Return ONLY valid JSON array, no markdown, no backticks, no preamble.`;

  const parseArticles = (data) => {
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    const cleaned = text.replace(/```json|```/g, "").trim();
    try { return JSON.parse(cleaned); } catch {
      const match = cleaned.match(/\[[\s\S]*\]/);
      return match ? JSON.parse(match[0]) : [];
    }
  };

  const fetchNews = async () => {
    if (topics.length === 0) return;
    setLoading(true); setError(null);
    try {
      let articles = [];

      // Try Edge Function first
      try {
        const sbUrl = import.meta.env.VITE_SUPABASE_URL;
        const { data: { session } } = await db.getSession();
        const token = session?.access_token;
        if (!token) throw new Error("Not authenticated");
        const res = await fetch(`${sbUrl}/functions/v1/news-feed`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
          body: JSON.stringify({ topics })
        });
        if (!res.ok) throw new Error("Edge Function not available");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        articles = data.articles || [];
      } catch (edgeErr) {
        // Fallback: direct API call with localStorage key
        if (!apiKey) throw new Error(edgeErr.message || "Edge Function failed. Add your API key below as a fallback.");
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, tools: [{ type: "web_search_20250305", name: "web_search" }], messages: [{ role: "user", content: buildPrompt() }] })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        articles = parseArticles(data);
      }

      if (articles.length > 0) {
        await db.saveNewsCache(projectId, articles.map(a => ({ ...a, topic_type: "custom" })));
        await reload();
      } else {
        setError("No articles found. Try broader topics like 'data engineering' or 'AI tools'.");
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const cacheAge = newsCache.length > 0 ? (() => {
    const mins = Math.round((Date.now() - new Date(newsCache[0].fetched_at).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  })() : null;

  // Auto-refresh if cache is older than 24h
  const autoRefreshed = useRef(false);
  useEffect(() => {
    if (autoRefreshed.current || loading || topics.length === 0) return;
    const stale = newsCache.length === 0 || (Date.now() - new Date(newsCache[0].fetched_at).getTime()) > 24 * 60 * 60 * 1000;
    if (stale) { autoRefreshed.current = true; fetchNews(); }
  }, [newsCache, topics]);

  return (
    <div>
      {/* Topics */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Your topics</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {topics.map(t => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 16, fontSize: 11, background: "var(--tint-orange-bg)", color: "var(--orange)", border: "1px solid var(--tint-orange-bd)" }}>
              {t}
              <button onClick={() => removeTopic(t)} style={{ background: "none", border: "none", color: "var(--orange)", cursor: "pointer", fontSize: 10, padding: 0, opacity: 0.6 }}>✕</button>
            </span>
          ))}
          <input value={newTopic} onChange={e => setNewTopic(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addTopic(); }} placeholder="+ add topic..." style={{ padding: "4px 10px", borderRadius: 16, fontSize: 11, background: "transparent", color: "var(--sub)", border: "1px dashed var(--line)", outline: "none", width: 140 }} />
        </div>
      </div>

      {/* Refresh */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Btn primary small onClick={fetchNews} disabled={loading || topics.length === 0}>
          {loading ? "Searching..." : "Refresh feed"}
        </Btn>
        {cacheAge && <span style={{ fontSize: 10, color: "var(--muted)" }}>Updated {cacheAge}</span>}
        {topics.length === 0 && <span style={{ fontSize: 10, color: "var(--muted)" }}>Add topics to get started</span>}
      </div>

      {/* Error + API key fallback */}
      {error && (
        <div style={{ background: "var(--side)", border: "1px solid var(--tint-red-bd)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--pink)", marginBottom: 6 }}>{error}</div>
          {!apiKey && error.includes("API key") && (
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="sk-ant-..." type="password" style={{ flex: 1, padding: "6px 8px", borderRadius: 4, fontSize: 11, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", fontFamily: "'SF Mono', monospace" }} />
              <Btn small onClick={saveKey}>Use key</Btn>
            </div>
          )}
          {apiKey && <div style={{ fontSize: 9, color: "var(--muted)" }}>Using local API key as fallback</div>}
        </div>
      )}

      {/* Feed */}
      {newsCache.length > 0 && (() => {
        const saved = newsCache.filter(a => a.bookmarked);
        const recent = newsCache.filter(a => !a.bookmarked);
        const ArticleCard = ({ article, isSaved }) => (
          <div style={{ background: "var(--side)", border: `1px solid ${isSaved ? "var(--tint-amber-bd)" : "var(--surface)"}`, borderRadius: 8, padding: "12px 16px", marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <button onClick={async () => { await db.toggleBookmark(article.id, !isSaved); await reload(); }} title={isSaved ? "Remove bookmark" : "Bookmark"} style={{ background: "none", border: "none", color: isSaved ? "var(--amber)" : "var(--line)", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0, marginTop: 1 }} onMouseEnter={e => { if (!isSaved) e.currentTarget.style.color = "var(--amber)"; }} onMouseLeave={e => { if (!isSaved) e.currentTarget.style.color = "var(--line)"; }}>{isSaved ? "★" : "☆"}</button>
              <div style={{ flex: 1 }}>
                <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 500, color: "var(--text)", textDecoration: "none", lineHeight: 1.4, display: "block" }}>{article.title}</a>
                {article.summary && <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 4, lineHeight: 1.5 }}>{article.summary}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>{article.source}</span>
                  {article.published_at && <><span style={{ color: "var(--line)" }}>·</span><span style={{ fontSize: 10, color: "var(--muted)" }}>{article.published_at}</span></>}
                  {article.topic_match && <span style={{ fontSize: 9, padding: "1px 8px", borderRadius: 12, background: "var(--tint-orange-bg)", color: "var(--orange)", border: "1px solid var(--tint-orange-bd)" }}>{article.topic_match}</span>}
                </div>
              </div>
              <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--muted)", fontSize: 11, textDecoration: "none", flexShrink: 0, padding: "2px" }}>↗</a>
              <a href={`https://www.google.com/search?q=${encodeURIComponent(article.title)}`} target="_blank" rel="noopener noreferrer" title="Search Google" style={{ color: "var(--line)", fontSize: 10, textDecoration: "none", flexShrink: 0 }}>🔍</a>
              {!isSaved && <button onClick={async () => { await db.deleteNewsItem(article.id); await reload(); }} title="Remove" style={{ background: "none", border: "none", color: "var(--line)", cursor: "pointer", fontSize: 10, flexShrink: 0 }}>✕</button>}
            </div>
          </div>
        );
        return (<div>
          {saved.length > 0 && <div style={{ fontSize: 10, color: "var(--amber)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Saved ({saved.length})</div>}
          {saved.map(a => <ArticleCard key={a.id} article={a} isSaved />)}
          {saved.length > 0 && recent.length > 0 && <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 0.5, margin: "12px 0 6px" }}>Recent</div>}
          {recent.map(a => <ArticleCard key={a.id} article={a} />)}
        </div>);
      })()}

      {newsCache.length === 0 && topics.length > 0 && !loading && (
        <EmptyState icon="☰" title="No news yet" sub="Click 'Refresh feed' to get AI-curated articles" />
      )}
      {newsCache.length === 0 && topics.length === 0 && (
        <EmptyState icon="☰" title="Set up your feed" sub="Add topics you're interested in, then refresh" />
      )}
    </div>
  );
}

// People View (Workshop contacts)
// ============================================

function PeopleView({ people, meetings, projectId, reload }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", company: "", role: "", context: "", follow_up: "", email: "", session_id: "" });
  const [editId, setEditId] = useState(null);

  const save = async () => {
    if (!form.name.trim()) return;
    try {
      if (editId) await db.updatePerson(editId, form);
      else await db.createPerson(projectId, form);
      setForm({ name: "", company: "", role: "", context: "", follow_up: "", email: "", session_id: "" });
      setShowAdd(false); setEditId(null); await reload();
    } catch (e) { console.error(e); }
  };
  const del = async (id) => { if (confirm("Remove this person?")) { await db.deletePerson(id); await reload(); } };
  const edit = (p) => { setForm({ name: p.name, company: p.company || "", role: p.role || "", context: p.context || "", follow_up: p.follow_up || "", email: p.email || "", session_id: p.session_id || "" }); setEditId(p.id); setShowAdd(true); };
  const toggleFollowUp = async (p) => { await db.updatePerson(p.id, { follow_up_done: !p.follow_up_done }); await reload(); };
  const sessionName = (sid) => { const m = meetings.find(x => x.id === sid); return m?.title || ""; };

  const needFollowUp = people.filter(p => p.follow_up && !p.follow_up_done);
  const others = people.filter(p => !p.follow_up || p.follow_up_done);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{people.length} contact{people.length !== 1 ? "s" : ""}</span>
        <Btn primary small onClick={() => { setShowAdd(!showAdd); setEditId(null); setForm({ name: "", company: "", role: "", context: "", follow_up: "", email: "", session_id: "" }); }}>+ Person</Btn>
      </div>

      {showAdd && (
        <div style={{ background: "var(--side)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name" style={{ flex: 1, padding: "6px 10px", borderRadius: 4, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
            <input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company" style={{ flex: 1, padding: "6px 10px", borderRadius: 4, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="Role" style={{ flex: 1, padding: "6px 10px", borderRadius: 4, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" style={{ flex: 1, padding: "6px 10px", borderRadius: 4, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none" }} />
          </div>
          <textarea value={form.context} onChange={e => setForm({ ...form, context: e.target.value })} placeholder="What did you discuss?" rows={2} style={{ width: "100%", padding: "6px 10px", borderRadius: 4, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", resize: "none", marginBottom: 8, boxSizing: "border-box", fontFamily: "inherit" }} />
          <input value={form.follow_up} onChange={e => setForm({ ...form, follow_up: e.target.value })} placeholder="Follow-up action (e.g. Email benchmark results)" style={{ width: "100%", padding: "6px 10px", borderRadius: 4, fontSize: 12, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={form.session_id} onChange={e => setForm({ ...form, session_id: e.target.value })} style={{ flex: 1, padding: "6px 10px", borderRadius: 4, fontSize: 11, background: "var(--bg)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none" }}>
              <option value="">Met at... (optional)</option>
              {meetings.map(m => <option key={m.id} value={m.id}>{m.title} ({m.meeting_date})</option>)}
            </select>
            <Btn primary small onClick={save}>{editId ? "Update" : "Add"}</Btn>
            <Btn small onClick={() => { setShowAdd(false); setEditId(null); }}>Cancel</Btn>
          </div>
        </div>
      )}

      {needFollowUp.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "#D85A30", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Needs follow-up ({needFollowUp.length})</div>
          {needFollowUp.map(p => (
            <div key={p.id} style={{ background: "var(--side)", border: "1px solid var(--tint-orange-bg)", borderRadius: 8, padding: "12px 14px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--tint-purple-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500, color: "var(--purple)" }}>{p.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{p.name}</span>
                  {p.company && <span style={{ fontSize: 11, color: "var(--muted)" }}> · {p.company}</span>}
                </div>
                <button onClick={() => edit(p)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>✎</button>
                <button onClick={() => del(p.id)} style={{ background: "none", border: "none", color: "var(--line)", cursor: "pointer", fontSize: 11 }}>✕</button>
              </div>
              {p.context && <div style={{ fontSize: 11, color: "var(--sub)", marginBottom: 4 }}>{p.context}</div>}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={p.follow_up_done} onChange={() => toggleFollowUp(p)} style={{ cursor: "pointer" }} />
                <span style={{ fontSize: 11, color: "var(--orange)" }}>{p.follow_up}</span>
              </div>
              {p.session_id && <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>Met at: {sessionName(p.session_id)}</div>}
            </div>
          ))}
        </div>
      )}

      {others.map(p => (
        <div key={p.id} style={{ background: "var(--side)", border: "1px solid var(--surface)", borderRadius: 8, padding: "12px 14px", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--tint-blue-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 500, color: "var(--blue)" }}>{p.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{p.name}</span>
              {p.company && <span style={{ fontSize: 11, color: "var(--muted)" }}> · {p.company}</span>}
              {p.role && <span style={{ fontSize: 11, color: "var(--muted)" }}> · {p.role}</span>}
            </div>
            {p.email && <a href={`mailto:${p.email}`} style={{ fontSize: 10, color: "var(--blue)", textDecoration: "none" }}>✉</a>}
            <button onClick={() => edit(p)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>✎</button>
            <button onClick={() => del(p.id)} style={{ background: "none", border: "none", color: "var(--line)", cursor: "pointer", fontSize: 11 }}>✕</button>
          </div>
          {p.context && <div style={{ fontSize: 11, color: "var(--sub)", marginTop: 4 }}>{p.context}</div>}
          {p.follow_up_done && p.follow_up && <div style={{ fontSize: 10, color: "var(--green)", marginTop: 4, textDecoration: "line-through" }}>✓ {p.follow_up}</div>}
          {p.session_id && <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>Met at: {sessionName(p.session_id)}</div>}
        </div>
      ))}

      {people.length === 0 && !showAdd && <EmptyState icon="◎" title="No contacts yet" sub="Add people you meet at the workshop" action="Add person" onAction={() => setShowAdd(true)} />}
    </div>
  );
}

// ============================================
// Welcome Tutorial
// ============================================

const TUTORIAL_STEPS = [
  { icon: "⊞", title: "Welcome to QTrack", sub: "Your focus & learning command center", desc: "Track tasks, run Pomodoro sessions, take notes, and study — all in one place. This tour shows you how to do each thing. Takes a minute." },
  { icon: "⚑", title: "Create a task", sub: "Bugs, features, or simple to-dos", how: ["Go to the Tasks tab", "Click + Task (top right)", "Pick a file, or choose 'No file (general task)' for a plain to-do", "Add a title, priority, and estimated pomodoros", "Save — it appears in your list"] },
  { icon: "◎", title: "Start a focus timer", sub: "25-minute Pomodoro sessions", how: ["On any task, click ▶ Focus (or + Queue to line up several)", "The 25-min timer starts — the ring counts down", "Pause with a reason: 'Waiting' (code running) or 'Interrupted' (a call)", "Switch tasks anytime — the clock keeps ticking", "Each session is tracked toward your daily goal bar"] },
  { icon: "≡", title: "Take a note", sub: "Capture decisions and code", how: ["Open the Notes tab", "Click + Note", "Write freely — use ```sql or ```python fences for code blocks", "Optionally link it to a task, test, or file", "It auto-saves and shows in your notes list"] },
  { icon: "★", title: "Make a study note", sub: "Learn & revise topics", how: ["In Notes, switch to the ★ Study filter", "Click + ★ Study", "Give it a Topic (e.g. 'Kafka', 'SQL') and optional #tags", "Write with markdown — even ```mermaid diagrams render", "Click Open on a topic to read PDFs + write notes side by side"] },
  { icon: "📚", title: "Study with the timer", sub: "Read, write, track time", how: ["In ★ Study, click Open on a topic", "Upload a PDF — it shows on the left", "Click ▶ Start study timer", "Read on the left, write notes on the right", "Your study time accumulates per topic"] },
  { icon: "📊", title: "Track your progress", sub: "Dashboard & weekly chart", desc: "The Dashboard shows today's focus time, meetings, open tasks, and a weekly chart of focus vs meetings. Use ⚙ Customize to show/hide sections per project. You're all set — start with your first task!" },
];

function HowList({ steps }) {
  return (
    <div style={{ textAlign: "left", maxWidth: 360, margin: "0 auto" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
          <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: "var(--tint-purple-bd)", color: "var(--purple)", fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{i + 1}</span>
          <span style={{ fontSize: 13, color: "var(--soft)", lineHeight: 1.5 }}>{s}</span>
        </div>
      ))}
    </div>
  );
}

function Tutorial({ onClose }) {
  const [step, setStep] = useState(0);
  const s = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16, padding: "32px 36px", width: 480, maxWidth: "90vw" }}>
        <div style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 24 }}>
          {TUTORIAL_STEPS.map((_, i) => (<div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i === step ? "#7F77DD" : i < step ? "var(--green)" : "var(--line)", transition: "all 0.2s", cursor: "pointer" }} onClick={() => setStep(i)} />))}
        </div>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--bg)", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{s.icon}</div>
        </div>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: "var(--text)", marginBottom: 4 }}>{s.title}</div>
          <div style={{ fontSize: 13, color: "#7F77DD", marginBottom: 16 }}>{s.sub}</div>
          {s.how ? <HowList steps={s.how} /> : <div style={{ fontSize: 13, color: "var(--sub)", lineHeight: 1.7, maxWidth: 380, margin: "0 auto" }}>{s.desc}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 12 }}>Skip tour</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && <Btn onClick={() => setStep(step - 1)} small>Back</Btn>}
            {!isLast && <Btn primary onClick={() => setStep(step + 1)}>Next</Btn>}
            {isLast && <Btn primary onClick={onClose} style={{ background: "#7F77DD", color: "var(--text)" }}>Get started</Btn>}
          </div>
        </div>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 10, color: "var(--dim)" }}>{step + 1} of {TUTORIAL_STEPS.length}</div>
      </div>
    </div>
  );
}

// Board View (Kanban Sticky Notes)
// ============================================

const CARD_COLORS = { yellow: { bg: "#2A2309", text: "var(--amber)", border: "var(--tint-amber-bd)" }, blue: { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" }, green: { bg: "var(--tint-green-bg)", text: "var(--lime)", border: "var(--tint-green-bd)" }, pink: { bg: "#2A0A1A", text: "#ED93B1", border: "#4B1528" }, purple: { bg: "var(--tint-purple-bg)", text: "var(--purple)", border: "var(--tint-purple-bd)" }, coral: { bg: "var(--tint-orange-bg)", text: "var(--orange)", border: "var(--tint-orange-bd)" } };
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
    if (!files.length) { alert("Add a file first to create tasks."); return; }
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
          <div key={col.id} style={{ minWidth: 240, maxWidth: 280, flex: "0 0 260px", background: "var(--side)", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px" }}>
            {/* Column header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              {editColId === col.id ? (
                <input autoFocus value={editColName} onChange={e => setEditColName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") renameCol(col.id); if (e.key === "Escape") setEditColId(null); }} onBlur={() => renameCol(col.id)} style={{ flex: 1, padding: "2px 6px", borderRadius: 4, fontSize: 12, fontWeight: 500, background: "var(--bg)", color: "var(--text)", border: "1px solid var(--dim)", outline: "none" }} />
              ) : (
                <span onDoubleClick={() => { setEditColId(col.id); setEditColName(col.name); }} style={{ fontSize: 12, fontWeight: 500, color: "var(--soft)", cursor: "default" }}>{col.name}</span>
              )}
              <div style={{ display: "flex", gap: 2 }}>
                <span style={{ fontSize: 10, color: "var(--muted)" }}>{colCards.length}</span>
                <button onClick={() => delCol(col.id)} style={{ background: "none", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 11, padding: "0 2px" }}>✕</button>
              </div>
            </div>
            {/* Cards */}
            {colCards.map(card => {
              const cc = CARD_COLORS[card.color] || CARD_COLORS.yellow;
              if (editingCard === card.id) return (
                <div key={card.id} style={{ marginBottom: 6, padding: "8px", background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: 6 }}>
                  <TextArea value={cardForm.text} onChange={v => setCardForm({ ...cardForm, text: v })} placeholder="Card text..." rows={2} />
                  <div style={{ display: "flex", gap: 3, margin: "6px 0" }}>{CARD_COLOR_KEYS.map(k => (<div key={k} onClick={() => setCardForm({ ...cardForm, color: k })} style={{ width: 16, height: 16, borderRadius: 3, background: CARD_COLORS[k].text, cursor: "pointer", border: cardForm.color === k ? "2px solid var(--text)" : "2px solid transparent" }} />))}</div>
                  <div style={{ display: "flex", gap: 4 }}><Btn small primary onClick={() => saveCard(col.id)}>Save</Btn><Btn small onClick={() => setEditingCard(null)}>Cancel</Btn></div>
                </div>
              );
              return (
                <div key={card.id} style={{ marginBottom: 6, padding: "8px 10px", background: cc.bg, border: `1px solid ${cc.border}`, borderRadius: 6 }}>
                  <div style={{ fontSize: 12, color: cc.text, lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: 6 }}>{card.text}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={card.column_id} onChange={e => moveCard(card.id, e.target.value)} style={{ padding: "2px 4px", borderRadius: 4, fontSize: 10, background: "var(--bg)", color: "var(--sub)", border: "1px solid var(--line)", outline: "none", cursor: "pointer" }}>
                      {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => convertToIssue(card)} title="Convert to task" style={{ background: "none", border: "1px solid var(--line)", color: "var(--blue)", cursor: "pointer", fontSize: 9, padding: "2px 6px", borderRadius: 3 }}>→ task</button>
                    <button onClick={() => startEditCard(card)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, padding: "0 2px" }}>✎</button>
                    <button onClick={() => delCard(card.id)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, padding: "0 2px" }}>✕</button>
                  </div>
                </div>
              );
            })}
            {/* Add card form or button */}
            {addingTo === col.id ? (
              <div style={{ padding: "6px", background: "var(--surface)", border: "1px dashed var(--line)", borderRadius: 6 }}>
                <TextArea value={cardForm.text} onChange={v => setCardForm({ ...cardForm, text: v })} placeholder="What's on your mind?" rows={2} />
                <div style={{ display: "flex", gap: 3, margin: "6px 0" }}>{CARD_COLOR_KEYS.map(k => (<div key={k} onClick={() => setCardForm({ ...cardForm, color: k })} style={{ width: 16, height: 16, borderRadius: 3, background: CARD_COLORS[k].text, cursor: "pointer", border: cardForm.color === k ? "2px solid var(--text)" : "2px solid transparent" }} />))}</div>
                <div style={{ display: "flex", gap: 4 }}><Btn small primary onClick={() => saveCard(col.id)}>Add</Btn><Btn small onClick={() => setAddingTo(null)}>Cancel</Btn></div>
              </div>
            ) : (
              <button onClick={() => startAddCard(col.id)} style={{ width: "100%", padding: "6px", borderRadius: 6, border: "1px dashed var(--line)", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 11 }}>+ Add card</button>
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

function Modal({ modal, files, onClose, addProject, addFile, addIssue, addTest, editIssue, editTest, usedRepos, usedBranches, meetingTags }) {
  const e = modal.edit;
  const isEdit = !!e;
  const [n, setN] = useState(e?.title || ""); const [cat, setCat] = useState("other"); const [fid, setFid] = useState(e?.file_id || files[0]?.id || ""); const [ty, setTy] = useState(e?.type || "bug"); const [pr, setPr] = useState(e?.priority || "high"); const [desc, setDesc] = useState(e?.description || ""); const [pre, setPre] = useState(e?.precondition || ""); const [steps, setSteps] = useState(e?.steps?.length ? e.steps : [{ step: "", expected: "" }]); const [saving, setSaving] = useState(false);
  const [ep, setEp] = useState(e?.estimated_pomodoros || 0); const [dd, setDd] = useState(e?.due_date || "");
  const [rn, setRn] = useState(e?.repo_name || ""); const [bn, setBn] = useState(e?.branch_name || "");
  const [mtag, setMtag] = useState(() => { if (e?.meeting_tag) return parseMtags(e.meeting_tag); return []; });
  const addStep = () => setSteps([...steps, { step: "", expected: "" }]);
  const updStep = (i, f, v) => { const s = [...steps]; s[i][f] = v; setSteps(s); };
  const submit = async () => {
    setSaving(true);
    try {
      if (modal.type === "project" && n.trim()) await addProject(n.trim(), cat || "project");
      if (modal.type === "file" && n.trim()) await addFile(n.trim(), cat);
      if (modal.type === "issue" && n.trim()) {
        if (isEdit) await editIssue(e.id, { title: n.trim(), type: ty, priority: pr, description: desc, file_id: fid, estimated_pomodoros: ep, due_date: dd || null, repo_name: rn, branch_name: bn, meeting_tag: mtag.length ? JSON.stringify(mtag) : null });
        else await addIssue(fid, n.trim(), ty, pr, desc, ep, dd || null, rn, bn, mtag.length ? JSON.stringify(mtag) : null);
      }
      if (modal.type === "test" && n.trim()) {
        const cleanSteps = steps.filter(s => s.step.trim());
        if (isEdit) await editTest(e.id, { title: n.trim(), precondition: pre, steps: cleanSteps, file_id: fid, estimated_pomodoros: ep, due_date: dd || null, repo_name: rn, branch_name: bn, meeting_tag: mtag.length ? JSON.stringify(mtag) : null });
        else if (cleanSteps.length) await addTest(fid, n.trim(), pre, cleanSteps, ep, dd || null, rn, bn, mtag.length ? JSON.stringify(mtag) : null);
      }
    } catch (err) { console.error(err); }
    setSaving(false);
  };
  const titles = isEdit ? { issue: "Edit task", test: "Edit test case" } : { project: "New project", file: "Add file", issue: "New task", test: "New test case" };
  const planFields = (modal.type === "issue" || modal.type === "test") ? (<>
    {fid && <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Repo</div>
        <input list="repo-list" value={rn} onChange={e => setRn(e.target.value)} placeholder="Select or type repo" style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "'SF Mono', monospace" }} />
        <datalist id="repo-list">{(usedRepos || []).map(r => <option key={r} value={r} />)}</datalist>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Branch</div>
        <input list="branch-list" value={bn} onChange={e => setBn(e.target.value)} placeholder="Select or type branch" style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "'SF Mono', monospace" }} />
        <datalist id="branch-list">{(usedBranches || []).map(b => <option key={b} value={b} />)}</datalist>
      </div>
    </div>}
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Estimated pomodoros</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="range" min="0" max="12" step="1" value={ep} onChange={e => setEp(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "'SF Mono', monospace", color: ep > 0 ? "var(--red)" : "var(--muted)", minWidth: 20, textAlign: "right" }}>{ep}</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Due date</div>
        <input type="date" value={dd} onChange={e => setDd(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--line)", outline: "none", width: "100%", boxSizing: "border-box" }} />
      </div>
    </div>
    <div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Meeting tags</div>
      {(meetingTags || []).length === 0 ? <div style={{ fontSize: 11, color: "var(--dim)" }}>No meetings created yet</div> : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {(meetingTags || []).map(t => { const on = mtag.includes(t); return (
            <button key={t} onClick={() => setMtag(on ? mtag.filter(x => x !== t) : [...mtag, t])} style={{ padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer", border: on ? "1px solid #7F77DD" : "1px solid var(--line)", background: on ? "var(--tint-purple-bg)" : "var(--surface)", color: on ? "var(--purple)" : "var(--muted)" }}>{on ? "✓ " : ""}{t}</button>
          ); })}
        </div>
      )}
    </div>
  </>) : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", width: 440, maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ fontSize: 15, fontWeight: 500 }}>{titles[modal.type]}</span><button onClick={onClose} style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", fontSize: 16 }}>✕</button></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {modal.type === "project" && <>
            <Input value={n} onChange={setN} placeholder="Name (e.g. ETL Pipeline or AI Summit 2026)" />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setCat("project")} style={{ flex: 1, padding: "10px", borderRadius: 8, border: cat === "project" ? "2px solid #7F77DD" : "1px solid var(--line)", background: cat === "project" ? "var(--tint-purple-bg)" : "var(--side)", color: cat === "project" ? "var(--purple)" : "var(--muted)", cursor: "pointer", fontSize: 12 }}>⚑ Project<br /><span style={{ fontSize: 10, opacity: 0.7 }}>Tasks, tests, focus timer</span></button>
              <button onClick={() => setCat("workshop")} style={{ flex: 1, padding: "10px", borderRadius: 8, border: cat === "workshop" ? "2px solid #D85A30" : "1px solid var(--line)", background: cat === "workshop" ? "var(--tint-orange-bg)" : "var(--side)", color: cat === "workshop" ? "var(--orange)" : "var(--muted)", cursor: "pointer", fontSize: 12 }}>◎ Workshop<br /><span style={{ fontSize: 10, opacity: 0.7 }}>Sessions, notes, people</span></button>
            </div>
          </>}
          {modal.type === "file" && <><Input value={n} onChange={setN} placeholder="filename.py" mono /><Select value={cat} onChange={setCat} options={CATEGORIES} style={{ width: "100%" }} /></>}
          {modal.type === "issue" && <><Select value={fid} onChange={setFid} options={[{ value: "", label: "No file (general task)" }, ...files.map(f => ({ value: f.id, label: f.name }))]} style={{ width: "100%" }} /><Input value={n} onChange={setN} placeholder="Task title" /><div style={{ display: "flex", gap: 8 }}><Select value={ty} onChange={setTy} options={ISSUE_TYPES} style={{ flex: 1 }} /><Select value={pr} onChange={setPr} options={PRIORITIES} style={{ flex: 1 }} /></div><TextArea value={desc} onChange={setDesc} placeholder="Description (optional)" />{planFields}</>}
          {modal.type === "test" && <><Select value={fid} onChange={setFid} options={[{ value: "", label: "No file (general task)" }, ...files.map(f => ({ value: f.id, label: f.name }))]} style={{ width: "100%" }} /><Input value={n} onChange={setN} placeholder="Test case title" /><TextArea value={pre} onChange={setPre} placeholder="Precondition (optional)" rows={1} />{planFields}<div style={{ fontSize: 11, fontWeight: 500, color: "var(--sub)", marginTop: 4 }}>STEPS</div>{steps.map((s, i) => (<div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}><span style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, fontFamily: "'SF Mono', monospace", minWidth: 16 }}>{i + 1}.</span><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}><Input value={s.step} onChange={v => updStep(i, "step", v)} placeholder="What to do" /><Input value={s.expected} onChange={v => updStep(i, "expected", v)} placeholder="Expected result" /></div>{steps.length > 1 && <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", marginTop: 6 }}>✕</button>}</div>))}<button onClick={addStep} style={{ background: "none", border: "1px dashed var(--line)", color: "var(--muted)", cursor: "pointer", padding: 6, borderRadius: 6, fontSize: 12, width: "100%" }}>+ Add step</button></>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}><Btn onClick={onClose}>Cancel</Btn><Btn primary onClick={submit} style={{ opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : isEdit ? "Save" : "Create"}</Btn></div>
      </div>
    </div>
  );
}

function LinkModal({ lm, issues, tests, links, lnk, onClose }) {
  const [err, setErr] = useState(null); const [saving, setSaving] = useState(false);
  const isI = !!lm.issueId; const title = isI ? "Link a test case" : "Link a task";
  let items = [];
  if (isI) { const a = links.filter(l => l.issue_id === lm.issueId).map(l => l.test_case_id); items = tests.filter(t => !a.includes(t.id)).map(t => ({ id: t.id, l: t.title, s: t.status, ic: "▷", c: TC[t.status] })); }
  else { const a = links.filter(l => l.test_case_id === lm.testId).map(l => l.issue_id); items = issues.filter(i => !a.includes(i.id)).map(i => ({ id: i.id, l: i.title, s: i.type, ic: i.type === "bug" ? "◉" : "○", c: i.type === "bug" ? { bg: "var(--tint-red-bg)", text: "var(--pink)", border: "var(--tint-red-bd)" } : { bg: "var(--tint-blue-bg)", text: "var(--blue)", border: "var(--tint-blue-bd)" } })); }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "20px 24px", width: 380, maxWidth: "calc(100vw - 32px)", maxHeight: "60vh", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ fontSize: 15, fontWeight: 500 }}>{title}</span><button onClick={onClose} style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", fontSize: 16 }}>✕</button></div>
        {err && <div style={{ padding: "8px 12px", borderRadius: 6, marginBottom: 10, fontSize: 12, background: "var(--tint-red-bg)", color: "var(--pink)" }}>{err}</div>}
        <div style={{ flex: 1 }}>
          {items.length === 0 && <div style={{ textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13 }}>Nothing to link</div>}
          {items.map(item => (<div key={item.id} role="button" tabIndex={0} onMouseDown={async e => { e.preventDefault(); e.stopPropagation(); if (saving) return; setSaving(true); setErr(null); try { if (isI) await lnk(lm.issueId, item.id); else await lnk(item.id, lm.testId); onClose(); } catch (e) { setErr(e.message || "Failed"); setSaving(false); } }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", borderRadius: 6, background: "transparent", color: "var(--text)", cursor: saving ? "wait" : "pointer", fontSize: 13, marginBottom: 2, opacity: saving ? 0.5 : 1 }} onMouseEnter={e => { if (!saving) e.currentTarget.style.background = "var(--line)"; }} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><span style={{ fontSize: 14 }}>{item.ic}</span><span style={{ flex: 1 }}>{item.l}</span><Badge label={item.s} colors={item.c} small /></div>))}
        </div>
      </div>
    </div>
  );
}