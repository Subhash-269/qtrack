import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import * as db from "./storage";

const SHORT_DATE = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  const diff = Date.now() - dt.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const CATEGORIES = ["extract", "transform", "load", "validate", "utils", "config", "api", "model", "other"];
const PRIORITIES = ["critical", "high", "medium", "low"];
const ISSUE_STATUSES = ["open", "in_progress", "fixed", "verified", "wont_fix"];
const TEST_STATUSES = ["not_run", "pass", "fail", "blocked"];
const ISSUE_TYPES = ["bug", "todo"];

const PRIORITY_COLORS = {
  critical: { bg: "#2D0A0A", text: "#F09595", border: "#501313" },
  high: { bg: "#2A1209", text: "#F0997B", border: "#4A1B0C" },
  medium: { bg: "#261A04", text: "#FAC775", border: "#412402" },
  low: { bg: "#0E1A08", text: "#C0DD97", border: "#173404" },
};
const STATUS_COLORS = {
  open: { bg: "#1A1A18", text: "#B4B2A9", border: "#2C2C2A" },
  in_progress: { bg: "#0A1929", text: "#85B7EB", border: "#042C53" },
  fixed: { bg: "#081F12", text: "#5DCAA5", border: "#04342C" },
  verified: { bg: "#0E1A08", text: "#C0DD97", border: "#173404" },
  wont_fix: { bg: "#1A1A18", text: "#888780", border: "#2C2C2A" },
};
const TEST_STATUS_COLORS = {
  not_run: { bg: "#1A1A18", text: "#B4B2A9", border: "#2C2C2A" },
  pass: { bg: "#0E1A08", text: "#97C459", border: "#173404" },
  fail: { bg: "#2D0A0A", text: "#F09595", border: "#501313" },
  blocked: { bg: "#261A04", text: "#FAC775", border: "#412402" },
};

const Badge = ({ label, colors, small }) => (
  <span style={{ display: "inline-block", fontSize: small ? 10 : 11, padding: small ? "1px 6px" : "2px 8px", borderRadius: 4, fontWeight: 500, background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`, letterSpacing: 0.2, whiteSpace: "nowrap" }}>
    {label.replace(/_/g, " ")}
  </span>
);

const Pill = ({ children, active, onClick }) => (
  <button onClick={onClick} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: active ? 500 : 400, background: active ? "#2C2C2A" : "transparent", color: active ? "#F1EFE8" : "#888780", border: active ? "1px solid #444441" : "1px solid transparent", cursor: "pointer", transition: "all 0.15s" }}>
    {children}
  </button>
);

const Btn = ({ children, onClick, primary, small, style: s }) => (
  <button onClick={onClick} style={{ padding: small ? "4px 10px" : "6px 14px", borderRadius: 6, fontSize: small ? 11 : 12, fontWeight: 500, background: primary ? "#D3D1C7" : "transparent", color: primary ? "#1A1A18" : "#B4B2A9", border: primary ? "none" : "1px solid #444441", cursor: "pointer", transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: 4, ...s }}>
    {children}
  </button>
);

const Input = ({ value, onChange, placeholder, mono, style: s }) => (
  <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13, background: "#1A1A18", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", width: "100%", fontFamily: mono ? "'SF Mono', 'Fira Code', monospace" : "inherit", boxSizing: "border-box", ...s }} />
);

const Select = ({ value, onChange, options, style: s }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 12, background: "#1A1A18", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", cursor: "pointer", ...s }}>
    {options.map((o) => <option key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o.replace(/_/g, " ") : o.label}</option>)}
  </select>
);

const TextArea = ({ value, onChange, placeholder, rows }) => (
  <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows || 2} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13, background: "#1A1A18", color: "#F1EFE8", border: "1px solid #2C2C2A", outline: "none", width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
);

const EmptyState = ({ icon, title, sub, action, onAction }) => (
  <div style={{ textAlign: "center", padding: "48px 24px", color: "#888780" }}>
    <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, color: "#B4B2A9" }}>{title}</div>
    <div style={{ fontSize: 12, marginBottom: 16, maxWidth: 280, margin: "0 auto 16px" }}>{sub}</div>
    {action && <Btn primary onClick={onAction}>+ {action}</Btn>}
  </div>
);

const MetricCard = ({ label, value, sub, color }) => (
  <div style={{ background: "#1A1A18", borderRadius: 8, padding: "14px 16px", border: "1px solid #2C2C2A" }}>
    <div style={{ fontSize: 11, color: "#888780", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 500, color: color || "#F1EFE8", fontFamily: "'SF Mono', 'Fira Code', monospace" }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: "#5F5E5A", marginTop: 2 }}>{sub}</div>}
  </div>
);

export default function App({ session }) {
  const [projects, setProjects] = useState([]);
  const [files, setFiles] = useState([]);
  const [issues, setIssues] = useState([]);
  const [testCases, setTestCases] = useState([]);
  const [links, setLinks] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);

  const [view, setView] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterFile, setFilterFile] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [expandedTC, setExpandedTC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const initRef = useRef(false);

  // Load projects on mount (ref prevents StrictMode double-creation)
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    loadProjects();
  }, []);

  // Load project data when active project changes
  useEffect(() => {
    if (activeProjectId) loadProjectData(activeProjectId);
  }, [activeProjectId]);

  async function loadProjects() {
    setLoading(true);
    try {
      const p = await db.getProjects();
      setProjects(p);
      if (p.length > 0) {
        setActiveProjectId(p[0].id);
      } else {
        // First time user — create a default project
        const newP = await db.createProject("My first project");
        setProjects([newP]);
        setActiveProjectId(newP.id);
      }
    } catch (err) {
      console.error("Failed to load projects:", err);
    }
    setLoading(false);
  }

  async function loadProjectData(projectId) {
    try {
      const [f, i, t, l] = await Promise.all([
        db.getFiles(projectId),
        db.getIssues(projectId),
        db.getTestCases(projectId),
        db.getLinks(projectId),
      ]);
      setFiles(f);
      setIssues(i);
      setTestCases(t);
      setLinks(l);
    } catch (err) {
      console.error("Failed to load project data:", err);
    }
  }

  async function reload() {
    if (activeProjectId) await loadProjectData(activeProjectId);
  }

  const fileMap = useMemo(() => Object.fromEntries(files.map((f) => [f.id, f])), [files]);

  const filteredIssues = useMemo(() => {
    let r = issues;
    if (filterType !== "all") r = r.filter((i) => i.type === filterType);
    if (filterFile !== "all") r = r.filter((i) => i.file_id === filterFile);
    if (filterPriority !== "all") r = r.filter((i) => i.priority === filterPriority);
    if (searchQ) r = r.filter((i) => i.title.toLowerCase().includes(searchQ.toLowerCase()));
    return r.sort((a, b) => PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority));
  }, [issues, filterType, filterFile, filterPriority, searchQ]);

  const filteredTests = useMemo(() => {
    let r = testCases;
    if (filterFile !== "all") r = r.filter((t) => t.file_id === filterFile);
    if (searchQ) r = r.filter((t) => t.title.toLowerCase().includes(searchQ.toLowerCase()));
    return r;
  }, [testCases, filterFile, searchQ]);

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#111110", color: "#888780" }}>Loading...</div>;

  const stats = {
    openBugs: issues.filter((i) => i.type === "bug" && !["fixed", "verified", "wont_fix"].includes(i.status)).length,
    openTodos: issues.filter((i) => i.type === "todo" && !["fixed", "verified", "wont_fix"].includes(i.status)).length,
    testPass: testCases.filter((t) => t.status === "pass").length,
    testTotal: testCases.length,
    filesTracked: files.length,
    criticals: issues.filter((i) => i.priority === "critical" && !["fixed", "verified", "wont_fix"].includes(i.status)).length,
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "◫" },
    { id: "issues", label: "Issues", icon: "◉", count: stats.openBugs + stats.openTodos },
    { id: "tests", label: "Test cases", icon: "▷", count: stats.testTotal },
    { id: "files", label: "Files", icon: "⊞", count: stats.filesTracked },
  ];

  // ---- Supabase-backed actions ----

  const addProject = async (name) => {
    const p = await db.createProject(name);
    setProjects([...projects, p]);
    setActiveProjectId(p.id);
    setModal(null);
  };

  const renameProject = async (id, name) => {
    if (!name.trim()) return;
    await db.renameProject(id, name.trim());
    setProjects(projects.map((p) => p.id === id ? { ...p, name: name.trim() } : p));
    setEditingProjectId(null);
  };

  const deleteProjectById = async (id) => {
    if (projects.length <= 1) return;
    if (!confirm("Delete this project and all its files, issues, and test cases?")) return;
    await db.deleteProject(id);
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    if (activeProjectId === id) setActiveProjectId(remaining[0]?.id || null);
  };

  const addFile = async (name, category) => {
    await db.createFile(activeProjectId, name, category);
    await reload();
    setModal(null);
  };

  const addIssue = async (fileId, title, type, priority, description) => {
    await db.createIssue(activeProjectId, fileId, title, type, priority, description);
    await reload();
    setModal(null);
  };

  const addTestCase = async (fileId, title, precondition, steps) => {
    await db.createTestCase(activeProjectId, fileId, title, precondition, steps);
    await reload();
    setModal(null);
  };

  const updateIssueStatus = async (id, status) => {
    await db.updateIssueStatus(id, status);
    await reload();
  };

  const updateTestStatus = async (id, status) => {
    await db.updateTestStatus(id, status);
    await reload();
  };

  const deleteIssue = async (id) => {
    await db.deleteIssue(id);
    await reload();
  };

  const deleteTest = async (id) => {
    await db.deleteTestCase(id);
    await reload();
  };

  const deleteFile = async (id) => {
    await db.deleteFile(id);
    await reload();
  };

  const linkIssueTest = async (issueId, testCaseId) => {
    await db.linkIssueToTest(issueId, testCaseId);
    await reload();
  };

  const unlinkIssueTest = async (issueId, testCaseId) => {
    await db.unlinkIssueFromTest(issueId, testCaseId);
    await reload();
  };

  const sidebarW = 220;
  const S = {
    root: { display: "flex", minHeight: "100vh", background: "#111110", color: "#F1EFE8", fontFamily: "'DM Sans', -apple-system, sans-serif", fontSize: 13 },
    sidebar: { width: sidebarW, borderRight: "1px solid #2C2C2A", display: "flex", flexDirection: "column", flexShrink: 0, background: "#161615" },
    main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
    content: { flex: 1, padding: "24px 28px", overflowY: "auto" },
    topBar: { padding: "12px 28px", borderBottom: "1px solid #2C2C2A", display: "flex", alignItems: "center", justifyContent: "space-between" },
  };

  return (
    <div style={S.root}>
      <div style={S.sidebar}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #2C2C2A" }}>
          <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: -0.5, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ background: "#D3D1C7", color: "#111110", width: 22, height: 22, borderRadius: 5, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>Q</span>
            QTrack
          </div>
          <div style={{ fontSize: 10, color: "#5F5E5A", marginTop: 2, letterSpacing: 0.3, textTransform: "uppercase" }}>Issue & test tracker</div>
        </div>

        <div style={{ padding: "12px 10px", flex: 1 }}>
          {navItems.map((n) => (
            <button key={n.id} onClick={() => { setView(n.id); setSearchQ(""); setFilterType("all"); setFilterFile("all"); setFilterPriority("all"); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", borderRadius: 6, border: "none", background: view === n.id ? "#2C2C2A" : "transparent", color: view === n.id ? "#F1EFE8" : "#888780", cursor: "pointer", fontSize: 13, textAlign: "left", marginBottom: 2, transition: "all 0.1s" }}>
              <span style={{ fontSize: 14, width: 20, textAlign: "center", opacity: 0.7 }}>{n.icon}</span>
              <span style={{ flex: 1 }}>{n.label}</span>
              {n.count > 0 && <span style={{ fontSize: 10, background: "#2C2C2A", padding: "1px 6px", borderRadius: 4, color: "#888780" }}>{n.count}</span>}
            </button>
          ))}
        </div>

        <div style={{ padding: "12px 10px", borderTop: "1px solid #2C2C2A" }}>
          <div style={{ fontSize: 10, color: "#5F5E5A", padding: "0 10px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>Projects</div>
          {projects.map((p) => (
            editingProjectId === p.id ? (
              <div key={p.id} style={{ padding: "3px 6px", marginBottom: 1 }}>
                <input
                  autoFocus
                  value={editingProjectName}
                  onChange={(e) => setEditingProjectName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameProject(p.id, editingProjectName);
                    if (e.key === "Escape") setEditingProjectId(null);
                  }}
                  onBlur={() => renameProject(p.id, editingProjectName)}
                  style={{ width: "100%", padding: "3px 6px", borderRadius: 4, fontSize: 12, background: "#111110", color: "#F1EFE8", border: "1px solid #444441", outline: "none", boxSizing: "border-box" }}
                />
              </div>
            ) : (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 1 }}>
                <button
                  onClick={() => setActiveProjectId(p.id)}
                  onDoubleClick={() => { setEditingProjectId(p.id); setEditingProjectName(p.name); }}
                  style={{ flex: 1, display: "block", padding: "6px 10px", borderRadius: 5, border: "none", background: activeProjectId === p.id ? "#2C2C2A" : "transparent", color: activeProjectId === p.id ? "#F1EFE8" : "#888780", cursor: "pointer", fontSize: 12, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </button>
                {projects.length > 1 && (
                  <button onClick={() => deleteProjectById(p.id)} title="Delete project" style={{ background: "none", border: "none", color: "#444441", cursor: "pointer", fontSize: 11, padding: "4px", borderRadius: 4, opacity: 0.5, flexShrink: 0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = "#F09595"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.color = "#444441"; }}>
                    ✕
                  </button>
                )}
              </div>
            )
          ))}
          <button onClick={() => setModal({ type: "project" })} style={{ display: "flex", alignItems: "center", gap: 4, width: "100%", padding: "6px 10px", borderRadius: 5, border: "none", background: "transparent", color: "#5F5E5A", cursor: "pointer", fontSize: 11 }}>
            + New project
          </button>
        </div>

        <div style={{ padding: "8px 10px", borderTop: "1px solid #2C2C2A" }}>
          <button onClick={() => supabase.auth.signOut()} style={{ display: "block", width: "100%", padding: "6px 10px", borderRadius: 5, border: "none", background: "transparent", color: "#5F5E5A", cursor: "pointer", fontSize: 11, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Sign out ({session.user.email})
          </button>
        </div>
      </div>

      <div style={S.main}>
        <div style={S.topBar}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            {view === "dashboard" && "Dashboard"}
            {view === "issues" && "Issues"}
            {view === "tests" && "Test cases"}
            {view === "files" && "Files"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {(view === "issues" || view === "tests") && (
              <Input value={searchQ} onChange={setSearchQ} placeholder="Search..." style={{ width: 180, fontSize: 12 }} />
            )}
            {view === "issues" && <Btn primary onClick={() => setModal({ type: "issue" })}>+ Issue</Btn>}
            {view === "tests" && <Btn primary onClick={() => setModal({ type: "test" })}>+ Test case</Btn>}
            {view === "files" && <Btn primary onClick={() => setModal({ type: "file" })}>+ File</Btn>}
          </div>
        </div>

        <div style={S.content}>
          {view === "dashboard" && (
            <DashboardView stats={stats} projIssues={issues} projTests={testCases} projFiles={files} fileMap={fileMap} onNav={(v, f) => { setView(v); if (f) setFilterFile(f); }} />
          )}
          {view === "issues" && (
            <IssuesView issues={filteredIssues} files={files} fileMap={fileMap} filterType={filterType} setFilterType={setFilterType} filterFile={filterFile} setFilterFile={setFilterFile} filterPriority={filterPriority} setFilterPriority={setFilterPriority} onStatusChange={updateIssueStatus} onDelete={deleteIssue} onAdd={() => setModal({ type: "issue" })} links={links} testCases={testCases} onLink={linkIssueTest} onUnlink={unlinkIssueTest} />
          )}
          {view === "tests" && (
            <TestsView tests={filteredTests} files={files} fileMap={fileMap} filterFile={filterFile} setFilterFile={setFilterFile} expandedTC={expandedTC} setExpandedTC={setExpandedTC} onStatusChange={updateTestStatus} onDelete={deleteTest} onAdd={() => setModal({ type: "test" })} links={links} allIssues={issues} onLink={linkIssueTest} onUnlink={unlinkIssueTest} />
          )}
          {view === "files" && (
            <FilesView files={files} issues={issues} tests={testCases} onDelete={deleteFile} onAdd={() => setModal({ type: "file" })} onNav={(v, f) => { setView(v); setFilterFile(f); }} />
          )}
        </div>
      </div>

      {modal && <Modal modal={modal} files={files} onClose={() => setModal(null)} addProject={addProject} addFile={addFile} addIssue={addIssue} addTestCase={addTestCase} />}
    </div>
  );
}

function DashboardView({ stats, projIssues, projTests, projFiles, fileMap, onNav }) {
  const passRate = stats.testTotal > 0 ? Math.round((stats.testPass / stats.testTotal) * 100) : 0;
  const recentIssues = [...projIssues].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const fileIssueCount = {};
  projIssues.forEach((i) => { if (!["fixed","verified","wont_fix"].includes(i.status)) fileIssueCount[i.file_id] = (fileIssueCount[i.file_id] || 0) + 1; });
  const hotFiles = Object.entries(fileIssueCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <MetricCard label="Open bugs" value={stats.openBugs} color={stats.openBugs > 0 ? "#F09595" : "#97C459"} sub={stats.criticals > 0 ? `${stats.criticals} critical` : "none critical"} />
        <MetricCard label="Open to-dos" value={stats.openTodos} color="#85B7EB" />
        <MetricCard label="Test pass rate" value={stats.testTotal > 0 ? `${passRate}%` : "—"} color={passRate >= 80 ? "#97C459" : passRate >= 50 ? "#FAC775" : "#F09595"} sub={`${stats.testPass}/${stats.testTotal} passing`} />
        <MetricCard label="Files tracked" value={stats.filesTracked} color="#B4B2A9" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "#B4B2A9" }}>Recent issues</div>
          {recentIssues.length === 0 && <div style={{ fontSize: 12, color: "#5F5E5A", padding: 16 }}>No issues yet</div>}
          {recentIssues.map((i) => (
            <div key={i.id} onClick={() => onNav("issues", i.file_id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: "#161615", border: "1px solid #1A1A18", transition: "background 0.1s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#1A1A18"} onMouseLeave={(e) => e.currentTarget.style.background = "#161615"}>
              <Badge label={i.type} colors={i.type === "bug" ? { bg: "#2D0A0A", text: "#F09595", border: "#501313" } : { bg: "#0A1929", text: "#85B7EB", border: "#042C53" }} small />
              <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</span>
              <span style={{ fontSize: 10, color: "#5F5E5A", fontFamily: "'SF Mono', monospace" }}>{fileMap[i.file_id]?.name?.split(".")[0]}</span>
              <Badge label={i.priority} colors={PRIORITY_COLORS[i.priority]} small />
            </div>
          ))}
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, color: "#B4B2A9" }}>Files with most open issues</div>
          {hotFiles.length === 0 && <div style={{ fontSize: 12, color: "#5F5E5A", padding: 16 }}>All clear</div>}
          {hotFiles.map(([fid, count]) => (
            <div key={fid} onClick={() => onNav("issues", fid)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, marginBottom: 2, cursor: "pointer", background: "#161615", border: "1px solid #1A1A18" }}>
              <span style={{ fontSize: 12, fontFamily: "'SF Mono', monospace", flex: 1, color: "#D3D1C7" }}>{fileMap[fid]?.name || "?"}</span>
              <div style={{ display: "flex", gap: 2 }}>
                {Array.from({ length: Math.min(count, 8) }).map((_, j) => (
                  <div key={j} style={{ width: 6, height: 16, borderRadius: 2, background: count >= 3 ? "#F09595" : count >= 2 ? "#FAC775" : "#97C459", opacity: 0.6 + (j / count) * 0.4 }} />
                ))}
              </div>
              <span style={{ fontSize: 11, color: "#888780", minWidth: 12, textAlign: "right" }}>{count}</span>
            </div>
          ))}

          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10, marginTop: 20, color: "#B4B2A9" }}>Test run summary</div>
          {projTests.length === 0 && <div style={{ fontSize: 12, color: "#5F5E5A", padding: 16 }}>No test cases yet</div>}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {projTests.map((t) => (
              <div key={t.id} title={t.title} style={{ width: 28, height: 28, borderRadius: 4, background: TEST_STATUS_COLORS[t.status].bg, border: `1px solid ${TEST_STATUS_COLORS[t.status].border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: TEST_STATUS_COLORS[t.status].text, cursor: "default" }}>
                {t.status === "pass" ? "✓" : t.status === "fail" ? "✗" : t.status === "blocked" ? "!" : "·"}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function IssuesView({ issues, files, fileMap, filterType, setFilterType, filterFile, setFilterFile, filterPriority, setFilterPriority, onStatusChange, onDelete, onAdd, links, testCases, onLink, onUnlink }) {
  const [linkingIssueId, setLinkingIssueId] = useState(null);

  const linkedTestIds = (issueId) => links.filter((l) => l.issue_id === issueId).map((l) => l.test_case_id);
  const testMap = Object.fromEntries(testCases.map((t) => [t.id, t]));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <Pill active={filterType === "all"} onClick={() => setFilterType("all")}>All</Pill>
        <Pill active={filterType === "bug"} onClick={() => setFilterType("bug")}>Bugs</Pill>
        <Pill active={filterType === "todo"} onClick={() => setFilterType("todo")}>To-dos</Pill>
        <span style={{ width: 1, height: 16, background: "#2C2C2A", margin: "0 4px" }} />
        <Select value={filterFile} onChange={setFilterFile} options={[{ value: "all", label: "All files" }, ...files.map((f) => ({ value: f.id, label: f.name }))]} />
        <Select value={filterPriority} onChange={setFilterPriority} options={[{ value: "all", label: "All priorities" }, ...PRIORITIES.map((p) => ({ value: p, label: p }))]} />
      </div>
      {issues.length === 0 && <EmptyState icon="◉" title="No issues found" sub="Create issues to track bugs and to-dos across your files" action="New issue" onAction={onAdd} />}
      {issues.map((i) => {
        const ltIds = linkedTestIds(i.id);
        const unlinkedTests = testCases.filter((t) => !ltIds.includes(t.id));
        return (
          <div key={i.id} style={{ background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, padding: "12px 14px", marginBottom: 8, transition: "border-color 0.1s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "#444441"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2C2C2A"}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <Badge label={i.type} colors={i.type === "bug" ? { bg: "#2D0A0A", text: "#F09595", border: "#501313" } : { bg: "#0A1929", text: "#85B7EB", border: "#042C53" }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{i.title}</span>
                </div>
                {i.description && <div style={{ fontSize: 12, color: "#888780", marginBottom: 6, lineHeight: 1.5 }}>{i.description}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#5F5E5A" }}>
                  <span style={{ fontFamily: "'SF Mono', monospace" }}>{fileMap[i.file_id]?.name || "—"}</span>
                  <span>·</span>
                  <span>{SHORT_DATE(i.created_at)}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <Badge label={i.priority} colors={PRIORITY_COLORS[i.priority]} />
                <Select value={i.status} onChange={(s) => onStatusChange(i.id, s)} options={ISSUE_STATUSES} style={{ fontSize: 11, padding: "3px 6px" }} />
                <button onClick={() => onDelete(i.id)} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 14, padding: "2px 4px", borderRadius: 4 }} title="Delete">✕</button>
              </div>
            </div>
            {/* Linked test cases */}
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
              {ltIds.map((tid) => {
                const tc = testMap[tid];
                if (!tc) return null;
                return (
                  <span key={tid} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: TEST_STATUS_COLORS[tc.status].bg, color: TEST_STATUS_COLORS[tc.status].text, border: `1px solid ${TEST_STATUS_COLORS[tc.status].border}` }}>
                    {tc.status === "pass" ? "✓" : tc.status === "fail" ? "✗" : "▷"} {tc.title}
                    <button onClick={() => onUnlink(i.id, tid)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 10, padding: 0, marginLeft: 2, opacity: 0.6 }}>✕</button>
                  </span>
                );
              })}
              {linkingIssueId === i.id ? (
                <Select
                  value=""
                  onChange={(tid) => { if (tid) { onLink(i.id, tid); setLinkingIssueId(null); } }}
                  options={[{ value: "", label: "Select test case..." }, ...unlinkedTests.map((t) => ({ value: t.id, label: t.title }))]}
                  style={{ fontSize: 11, padding: "2px 6px" }}
                />
              ) : (
                <button onClick={() => setLinkingIssueId(i.id)} style={{ background: "none", border: "1px dashed #444441", color: "#5F5E5A", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>
                  + Link test
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TestsView({ tests, files, fileMap, filterFile, setFilterFile, expandedTC, setExpandedTC, onStatusChange, onDelete, onAdd, links, allIssues, onLink, onUnlink }) {
  const [linkingTestId, setLinkingTestId] = useState(null);

  const linkedIssueIds = (testId) => links.filter((l) => l.test_case_id === testId).map((l) => l.issue_id);
  const issueMap = Object.fromEntries(allIssues.map((i) => [i.id, i]));

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, alignItems: "center" }}>
        <Select value={filterFile} onChange={setFilterFile} options={[{ value: "all", label: "All files" }, ...files.map((f) => ({ value: f.id, label: f.name }))]} />
      </div>
      {tests.length === 0 && <EmptyState icon="▷" title="No test cases yet" sub="Write test cases to verify your code works correctly. Each test has steps and expected results." action="New test case" onAction={onAdd} />}
      {tests.map((t) => {
        const expanded = expandedTC === t.id;
        const liIds = linkedIssueIds(t.id);
        const unlinkedIssues = allIssues.filter((i) => !liIds.includes(i.id));
        return (
          <div key={t.id} style={{ background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, marginBottom: 8, transition: "border-color 0.1s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "#444441"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2C2C2A"}>
            <div style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 8 }} onClick={() => setExpandedTC(expanded ? null : t.id)}>
              <span style={{ color: "#5F5E5A", fontSize: 12, marginTop: 2, transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</span>
                  <Badge label={t.status} colors={TEST_STATUS_COLORS[t.status]} small />
                </div>
                <div style={{ fontSize: 11, color: "#5F5E5A" }}>
                  <span style={{ fontFamily: "'SF Mono', monospace" }}>{fileMap[t.file_id]?.name || "—"}</span>
                  {t.last_run && <span> · Last run {SHORT_DATE(t.last_run)}</span>}
                  <span> · {(t.steps || []).length} step{(t.steps || []).length !== 1 ? "s" : ""}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                <Btn small onClick={() => onStatusChange(t.id, "pass")} style={{ color: t.status === "pass" ? "#97C459" : "#5F5E5A", borderColor: t.status === "pass" ? "#3B6D11" : undefined }}>✓ Pass</Btn>
                <Btn small onClick={() => onStatusChange(t.id, "fail")} style={{ color: t.status === "fail" ? "#F09595" : "#5F5E5A", borderColor: t.status === "fail" ? "#A32D2D" : undefined }}>✗ Fail</Btn>
                <button onClick={() => onDelete(t.id)} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", fontSize: 14, padding: "2px 4px" }} title="Delete">✕</button>
              </div>
            </div>
            {expanded && (
              <div style={{ padding: "0 14px 14px 32px", borderTop: "1px solid #2C2C2A" }}>
                {t.precondition && <div style={{ fontSize: 12, color: "#888780", margin: "10px 0 8px", padding: "6px 10px", background: "#1A1A18", borderRadius: 6 }}><span style={{ color: "#5F5E5A", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 }}>Precondition: </span>{t.precondition}</div>}
                {(t.steps || []).map((s, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: idx < (t.steps || []).length - 1 ? "1px solid #1A1A18" : "none" }}>
                    <span style={{ color: "#5F5E5A", fontSize: 11, fontFamily: "'SF Mono', monospace", minWidth: 20 }}>{idx + 1}.</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: "#D3D1C7", marginBottom: 2 }}>{s.step}</div>
                      <div style={{ fontSize: 11, color: "#5DCAA5", fontStyle: "italic" }}>→ {s.expected}</div>
                    </div>
                  </div>
                ))}
                {/* Linked issues */}
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #1A1A18" }}>
                  <div style={{ fontSize: 10, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: 0.3, marginBottom: 6 }}>Linked issues</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                    {liIds.map((iid) => {
                      const issue = issueMap[iid];
                      if (!issue) return null;
                      const ic = issue.type === "bug" ? { bg: "#2D0A0A", text: "#F09595", border: "#501313" } : { bg: "#0A1929", text: "#85B7EB", border: "#042C53" };
                      return (
                        <span key={iid} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px", borderRadius: 4, background: ic.bg, color: ic.text, border: `1px solid ${ic.border}` }}>
                          {issue.type === "bug" ? "◉" : "○"} {issue.title}
                          <button onClick={() => onUnlink(iid, t.id)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 10, padding: 0, marginLeft: 2, opacity: 0.6 }}>✕</button>
                        </span>
                      );
                    })}
                    {linkingTestId === t.id ? (
                      <Select
                        value=""
                        onChange={(iid) => { if (iid) { onLink(iid, t.id); setLinkingTestId(null); } }}
                        options={[{ value: "", label: "Select issue..." }, ...unlinkedIssues.map((i) => ({ value: i.id, label: `[${i.type}] ${i.title}` }))]}
                        style={{ fontSize: 11, padding: "2px 6px" }}
                      />
                    ) : (
                      <button onClick={() => setLinkingTestId(t.id)} style={{ background: "none", border: "1px dashed #444441", color: "#5F5E5A", cursor: "pointer", fontSize: 10, padding: "2px 8px", borderRadius: 4 }}>
                        + Link issue
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FilesView({ files, issues, tests, onDelete, onAdd, onNav }) {
  const grouped = {};
  files.forEach((f) => { if (!grouped[f.category]) grouped[f.category] = []; grouped[f.category].push(f); });
  const issueCount = (fid) => issues.filter((i) => i.file_id === fid && !["fixed","verified","wont_fix"].includes(i.status)).length;
  const testCount = (fid) => tests.filter((t) => t.file_id === fid).length;
  const testPassCount = (fid) => tests.filter((t) => t.file_id === fid && t.status === "pass").length;

  if (files.length === 0) return <EmptyState icon="⊞" title="No files tracked yet" sub="Add the files from your project so you can attach issues and test cases to them" action="Add file" onAction={onAdd} />;

  return (
    <div>
      {CATEGORIES.filter((c) => grouped[c]).map((cat) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, paddingLeft: 2 }}>{cat}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
            {grouped[cat].map((f) => {
              const ic = issueCount(f.id);
              const tc = testCount(f.id);
              const tp = testPassCount(f.id);
              return (
                <div key={f.id} style={{ background: "#161615", border: "1px solid #2C2C2A", borderRadius: 8, padding: "12px 14px", transition: "border-color 0.1s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "#444441"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "#2C2C2A"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <span style={{ fontFamily: "'SF Mono', monospace", fontSize: 12, fontWeight: 500, color: "#D3D1C7" }}>{f.name}</span>
                    <button onClick={() => onDelete(f.id)} style={{ background: "none", border: "none", color: "#444441", cursor: "pointer", fontSize: 12 }}>✕</button>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#888780" }}>
                    <span onClick={() => onNav("issues", f.id)} style={{ cursor: "pointer", color: ic > 0 ? "#F09595" : "#5F5E5A" }}>{ic} open issue{ic !== 1 ? "s" : ""}</span>
                    <span onClick={() => onNav("tests", f.id)} style={{ cursor: "pointer", color: tc > 0 ? "#85B7EB" : "#5F5E5A" }}>{tp}/{tc} tests pass</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Modal({ modal, files, onClose, addProject, addFile, addIssue, addTestCase }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState("other");
  const [fileId, setFileId] = useState(files[0]?.id || "");
  const [type, setType] = useState("bug");
  const [priority, setPriority] = useState("high");
  const [desc, setDesc] = useState("");
  const [precondition, setPrecondition] = useState("");
  const [steps, setSteps] = useState([{ step: "", expected: "" }]);
  const [saving, setSaving] = useState(false);

  const addStep = () => setSteps([...steps, { step: "", expected: "" }]);
  const updateStep = (idx, field, val) => { const n = [...steps]; n[idx][field] = val; setSteps(n); };
  const removeStep = (idx) => steps.length > 1 && setSteps(steps.filter((_, i) => i !== idx));

  const submit = async () => {
    setSaving(true);
    try {
      if (modal.type === "project" && name.trim()) await addProject(name.trim());
      if (modal.type === "file" && name.trim()) await addFile(name.trim(), cat);
      if (modal.type === "issue" && name.trim() && fileId) await addIssue(fileId, name.trim(), type, priority, desc);
      if (modal.type === "test" && name.trim() && fileId && steps[0].step) await addTestCase(fileId, name.trim(), precondition, steps.filter((s) => s.step.trim()));
    } catch (err) {
      console.error("Save error:", err);
    }
    setSaving(false);
  };

  const titles = { project: "New project", file: "Add file", issue: "New issue", test: "New test case" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1A1A18", border: "1px solid #2C2C2A", borderRadius: 12, padding: "20px 24px", width: 440, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{titles[modal.type]}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#888780", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {modal.type === "project" && <Input value={name} onChange={setName} placeholder="Project name" />}

          {modal.type === "file" && (<>
            <Input value={name} onChange={setName} placeholder="filename.py" mono />
            <Select value={cat} onChange={setCat} options={CATEGORIES} style={{ width: "100%" }} />
          </>)}

          {modal.type === "issue" && (<>
            <Select value={fileId} onChange={setFileId} options={files.map((f) => ({ value: f.id, label: f.name }))} style={{ width: "100%" }} />
            <Input value={name} onChange={setName} placeholder="Issue title" />
            <div style={{ display: "flex", gap: 8 }}>
              <Select value={type} onChange={setType} options={ISSUE_TYPES} style={{ flex: 1 }} />
              <Select value={priority} onChange={setPriority} options={PRIORITIES} style={{ flex: 1 }} />
            </div>
            <TextArea value={desc} onChange={setDesc} placeholder="Description (optional)" />
          </>)}

          {modal.type === "test" && (<>
            <Select value={fileId} onChange={setFileId} options={files.map((f) => ({ value: f.id, label: f.name }))} style={{ width: "100%" }} />
            <Input value={name} onChange={setName} placeholder="Test case title" />
            <TextArea value={precondition} onChange={setPrecondition} placeholder="Precondition (optional)" rows={1} />
            <div style={{ fontSize: 11, fontWeight: 500, color: "#888780", marginTop: 4 }}>STEPS</div>
            {steps.map((s, idx) => (
              <div key={idx} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <span style={{ fontSize: 11, color: "#5F5E5A", marginTop: 8, fontFamily: "'SF Mono', monospace", minWidth: 16 }}>{idx + 1}.</span>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <Input value={s.step} onChange={(v) => updateStep(idx, "step", v)} placeholder="What to do" />
                  <Input value={s.expected} onChange={(v) => updateStep(idx, "expected", v)} placeholder="Expected result" style={{ fontSize: 12, color: "#5DCAA5" }} />
                </div>
                {steps.length > 1 && <button onClick={() => removeStep(idx)} style={{ background: "none", border: "none", color: "#5F5E5A", cursor: "pointer", marginTop: 6 }}>✕</button>}
              </div>
            ))}
            <button onClick={addStep} style={{ background: "none", border: "1px dashed #2C2C2A", color: "#5F5E5A", cursor: "pointer", padding: "6px", borderRadius: 6, fontSize: 12, width: "100%" }}>+ Add step</button>
          </>)}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn primary onClick={submit} style={{ opacity: saving ? 0.6 : 1 }}>{saving ? "Saving..." : "Create"}</Btn>
        </div>
      </div>
    </div>
  );
}