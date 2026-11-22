import { useState, useEffect } from "react";
import * as db from "../storage";

// Settings > Assistant access: connect an MCP client, allow or block changes, see every call
// an assistant made, undo recent changes, and disconnect clients.

const UNDO_MS = 10 * 60 * 1000;
const card = { background: "#1A1A18", border: "1px solid #2C2C2A", borderRadius: 8, padding: "14px 16px", minWidth: 0 };
const label = { fontSize: 10, color: "#5F5E5A", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 };
const mono = { fontFamily: "'SF Mono', monospace" };
const btn = (primary, small) => ({ padding: small ? "3px 10px" : "6px 14px", borderRadius: 6, fontSize: small ? 11 : 12, fontWeight: 500, background: primary ? "#D3D1C7" : "transparent", color: primary ? "#1A1A18" : "#B4B2A9", border: primary ? "none" : "1px solid #444441", cursor: "pointer", whiteSpace: "nowrap" });
const chip = (c) => ({ fontSize: 10, padding: "1px 6px", borderRadius: 4, whiteSpace: "nowrap", ...(c === "read" ? { color: "#5DCAA5", background: "#0E1F18", border: "1px solid #1B4A3A" } : c === "write" ? { color: "#FAC775", background: "#1F180E", border: "1px solid #4A3A1B" } : { color: "#F09595", background: "#1F0E0E", border: "1px solid #4A1B1B" }) });

const fmtTime = (iso) => { const d = new Date(iso); const today = new Date().toDateString() === d.toDateString(); return today ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };
const fmtArgs = (a) => { const e = Object.entries(a || {}); return e.length ? e.map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v.length > 40 ? v.slice(0, 40) + "…" : v}"` : JSON.stringify(v)}`).join(" · ") : "—"; };

export default function AssistantView({ onChanged }) {
  const [settings, setSettings] = useState(null);
  const [calls, setCalls] = useState(null);
  const [grants, setGrants] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const load = () => Promise.all([db.getMcpSettings(), db.getMcpCalls(50), db.listAssistantGrants().catch(() => [])])
    .then(([s, c, g]) => { setSettings(s); setCalls(c); setGrants(g); setErr(null); setNow(Date.now()); })
    .catch(e => setErr(e.message || String(e)));
  // Refresh the clock so Undo buttons disappear once their 10 minutes are up
  useEffect(() => { load(); const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const toggle = async () => {
    setBusy("toggle");
    try { await db.setAllowWrites(!settings.allow_writes); setSettings({ allow_writes: !settings.allow_writes }); } catch (e) { setErr(e.message); }
    setBusy(null);
  };
  const undo = async (c) => {
    setBusy(c.id);
    try { await db.undoMcpCall(c.id); await load(); onChanged?.(); } catch (e) { alert(e.message || "Couldn't undo."); }
    setBusy(null);
  };
  const revoke = async (g) => {
    if (!confirm(`Disconnect ${g.client?.name || "this app"}? It will need your approval to connect again.`)) return;
    setBusy(g.client?.id);
    try { await db.revokeAssistantGrant(g.client.id); await load(); } catch (e) { alert(e.message); }
    setBusy(null);
  };
  const copy = (key, text) => { navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); }).catch(() => {}); };

  const cmd = `claude mcp add --transport http qtrack ${db.MCP_URL}`;
  const canUndo = (c) => c.scope === "write" && c.ok && c.undo?.length && !c.undone_at && now - new Date(c.created_at).getTime() < UNDO_MS;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 900 }}>
      {err && <div style={{ ...card, color: "#F09595", fontSize: 12 }}>Couldn't load assistant settings: {err}</div>}

      {/* Connect */}
      <div style={card}>
        <div style={label}>Connect an assistant</div>
        <div style={{ fontSize: 12, color: "#B4B2A9", lineHeight: 1.5, marginBottom: 10 }}>
          Any MCP client (Claude, Claude Code, Cursor…) can connect to QTrack with this address. You'll sign in and approve it once.
        </div>
        {[["url", db.MCP_URL], ["cmd", cmd]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <code style={{ ...mono, flex: 1, minWidth: 0, fontSize: 11, color: "#D3D1C7", background: "#111110", border: "1px solid #2C2C2A", borderRadius: 6, padding: "7px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</code>
            <button onClick={() => copy(k, v)} style={btn(false, true)}>{copied === k ? "Copied" : "Copy"}</button>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "#5F5E5A", marginTop: 4 }}>Claude: Settings → Connectors → Add custom connector. Claude Code: run the command above, then <span style={mono}>/mcp</span>.</div>
      </div>

      {/* Allow changes */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, color: "#F1EFE8", marginBottom: 3 }}>Let assistants make changes</div>
          <div style={{ fontSize: 12, color: "#888780", lineHeight: 1.5 }}>
            Start, pause and stop the timer, add tasks, queue them and save notes. Off means assistants can only read. Changes can be undone for 10 minutes; at most 60 per hour.
          </div>
        </div>
        <button disabled={!settings || busy === "toggle"} onClick={toggle} role="switch" aria-checked={!!settings?.allow_writes}
          style={{ width: 44, height: 24, borderRadius: 12, border: "1px solid #444441", background: settings?.allow_writes ? "#5DCAA5" : "#2C2C2A", position: "relative", cursor: "pointer", flexShrink: 0, padding: 0 }}>
          <span style={{ position: "absolute", top: 2, left: settings?.allow_writes ? 22 : 2, width: 18, height: 18, borderRadius: "50%", background: "#F1EFE8", transition: "left 0.15s" }} />
        </button>
      </div>

      {/* Connected apps */}
      {grants.length > 0 && (
        <div style={card}>
          <div style={label}>Connected apps</div>
          {grants.map(g => (
            <div key={g.client?.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #222220", fontSize: 12 }}>
              <span style={{ flex: 1, color: "#D3D1C7" }}>{g.client?.name || g.client?.id}</span>
              <span style={{ fontSize: 11, color: "#5F5E5A" }}>since {fmtTime(g.granted_at)}</span>
              <button disabled={busy === g.client?.id} onClick={() => revoke(g)} style={btn(false, true)}>Disconnect</button>
            </div>
          ))}
        </div>
      )}

      {/* Activity */}
      <div style={card}>
        <div style={{ ...label, display: "flex", justifyContent: "space-between" }}><span>Activity</span><button onClick={load} style={{ ...btn(false, true), border: "none", padding: 0, fontSize: 10, color: "#5F5E5A" }}>Refresh</button></div>
        {!calls ? <div style={{ fontSize: 12, color: "#5F5E5A" }}>Loading…</div> : calls.length === 0 ? (
          <div style={{ fontSize: 12, color: "#5F5E5A", padding: "6px 0" }}>No assistant activity yet. Every call an assistant makes will show up here.</div>
        ) : calls.map(c => (
          <div key={c.id} style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) auto", gap: 10, alignItems: "start", padding: "8px 0", borderBottom: "1px solid #222220", fontSize: 12, opacity: c.undone_at ? 0.5 : 1 }}>
            <span style={{ ...mono, fontSize: 11, color: "#5F5E5A", paddingTop: 1 }}>{fmtTime(c.created_at)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono, color: "#F1EFE8" }}>{c.tool}</span>
                <span style={chip(c.ok ? c.scope : "error")}>{c.ok ? c.scope : "failed"}</span>
                {c.undone_at && <span style={{ fontSize: 10, color: "#888780" }}>undone</span>}
              </div>
              <div style={{ color: c.ok ? "#B4B2A9" : "#F09595", marginTop: 3, lineHeight: 1.4 }}>{c.result_summary}</div>
              <div style={{ color: "#5F5E5A", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmtArgs(c.args)}</div>
            </div>
            <div>{canUndo(c) && <button disabled={busy === c.id} onClick={() => undo(c)} style={{ ...btn(false, true), color: "#85B7EB", borderColor: "#1B2F4A" }}>Undo</button>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
