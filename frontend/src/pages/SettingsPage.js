import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetch } from "../services/api";
import CategoryManager from "../components/CategoryManager";
import MaterialManager from "../components/MaterialManager";

// ─── SVG Icons (matching MUI icon style used in CIS) ─────────────────────────
const Icons = {
  Categories: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>
  ),
  Materials: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M4 6h4v4H4zm0 5h4v4H4zm0 5h4v4H4zm5-10h4v4H9zm0 5h4v4H9zm0 5h4v4H9zm5-10h4v4h-4zm0 5h4v4h-4zm0 5h4v4h-4z"/>
    </svg>
  ),
  Password: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  ),
  AuditLog: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
    </svg>
  ),
  Back: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
    </svg>
  ),
  Refresh: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
    </svg>
  ),
  Filter: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/>
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
  ),
  Cancel: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/>
    </svg>
  ),
  ExpandMore: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6-1.41-1.41z"/>
    </svg>
  ),
  ExpandLess: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14l-6-6z"/>
    </svg>
  ),
  Search: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
    </svg>
  ),
};

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "categories", label: "Categories", Icon: Icons.Categories },
  { id: "materials",  label: "Materials",  Icon: Icons.Materials  },
  { id: "password",   label: "Password",   Icon: Icons.Password   },
  { id: "auditlog",   label: "Audit Log",  Icon: Icons.AuditLog   },
];

// ─── Inline Toast ─────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((message, type = "success") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, add };
}

function ToastContainer({ toasts }) {
  const palette = {
    success: { bg: "var(--color-success-bg)",      border: "var(--color-success-border)", text: "var(--color-success-text)"  },
    error:   { bg: "var(--color-danger-bg)",       border: "var(--color-danger-border)",  text: "var(--color-danger-text)"   },
    warning: { bg: "#fffbeb",                       border: "#fcd34d",                     text: "#92400e"                    },
    info:    { bg: "var(--color-primary-bg-alt)",  border: "var(--color-primary-border)", text: "var(--color-primary-text)"  },
  };
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 340 }}>
      {toasts.map(t => {
        const c = palette[t.type] || palette.info;
        return (
          <div key={t.id} style={{
            background: c.bg, border: `1px solid ${c.border}`, color: c.text,
            borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 500,
            boxShadow: "0 2px 12px rgba(0,0,0,0.10)", minWidth: 240,
          }}>
            {t.message}
          </div>
        );
      })}
    </div>
  );
}

// ─── CIS-style Tab Bar ────────────────────────────────────────────────────────
// Icon sits to the left of the label text, MUI Tabs underline indicator style
function TabBar({ activeTab, onChange }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", marginBottom: 32 }}>
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "12px 20px", fontSize: 14, fontWeight: 500, fontFamily: "inherit",
              border: "none",
              borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
              marginBottom: -1,
              background: "none",
              color: active ? "var(--color-primary)" : "var(--color-text-light)",
              cursor: "pointer", borderRadius: 0, whiteSpace: "nowrap",
              transition: "color 0.15s", minHeight: 0,
            }}
          >
            <Icon />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Shared micro-styles ──────────────────────────────────────────────────────
const inputStyle = {
  padding: "8px 12px", fontSize: 14, border: "1px solid #d1d5db",
  borderRadius: 6, fontFamily: "inherit", outline: "none",
  width: "100%", boxSizing: "border-box",
};
const labelStyle = {
  fontSize: 12, fontWeight: 600, color: "var(--color-text-light)",
  display: "block", marginBottom: 4,
};

// ─── Categories tab ───────────────────────────────────────────────────────────
function CategoriesTab({ registerTabLeaveHandler }) {
  const handleRegister = (fn) => {
    if (registerTabLeaveHandler) registerTabLeaveHandler(fn);
  };
  return (
    <CategoryManager
      onBack={() => {}}
      registerBackHandler={handleRegister}
    />
  );
}

// ─── Materials tab ────────────────────────────────────────────────────────────
function MaterialsTab() {
  const backRef = useRef(null);
  return <MaterialManager registerBackHandler={fn => { backRef.current = fn; }} />;
}

// ─── Password tab ─────────────────────────────────────────────────────────────
function PasswordTab({ config, onRefresh, toast }) {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw,     setNewPw]     = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving,    setSaving]    = useState(false);
  const [showPws,   setShowPws]   = useState(false);

  const handleSubmit = async () => {
    // ── Client-side validation ────────────────────────────────────────────────
    if (!currentPw || !newPw || !confirmPw) {
      toast("Please fill in all fields.", "error");
      return;
    }
    if (newPw.length < 12) {
      toast("New password must be at least 12 characters.", "error");
      return;
    }
    if (newPw !== confirmPw) {
      toast("New passwords do not match.", "error");
      return;
    }
    if (newPw === currentPw) {
      toast("New password must be different from the current password.", "error");
      return;
    }
    setSaving(true);
    try {
      const data = await apiFetch("/api/settings/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
        // skipSessionCheck prevents a 401 (wrong current password) from
        // triggering a global session-expired logout — it stays as a toast.
        skipSessionCheck: true,
      });
      if (data?.error === "network-error") {
        toast("Could not reach the server. Please check your connection and try again.", "error");
      } else if (data?.error) {
        // Server-side errors (wrong current password, validation failures, etc.)
        toast(data.error || "Failed to change password.", "error");
      } else {
        toast("Password changed successfully.", "success");
        setCurrentPw("");
        setNewPw("");
        setConfirmPw("");
        onRefresh();
      }
    } catch {
      toast("An unexpected error occurred. Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      {/* Section header matching CIS subtitle1 fontWeight 600 style */}
      <h1 style={{fontWeight: 700, color: "#111827", margin: "0 0 4px 0" }}>
        Admin Password
      </h1>
      <p style={{ fontSize: 13, color: "var(--color-text-light)", margin: "0 0 20px 0" }}>
        This is the shared password used to log in as admin. After changing it, your current
        session stays active but the new password will be required on next login.
      </p>

      {config?.lastPasswordChange && (
        <div style={{
          background: "var(--color-primary-bg-alt)", border: "1px solid var(--color-primary-border)",
          borderRadius: 6, padding: "8px 14px", fontSize: 13,
          color: "var(--color-primary-text)", marginBottom: 20,
        }}>
          Last changed: {new Date(config.lastPasswordChange).toLocaleString()}
        </div>
      )}

      {/* Outlined paper — matches CIS Paper variant="outlined" */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "20px 20px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Current Password</label>
            <input type={showPws ? "text" : "password"} placeholder="Enter current password"
              value={currentPw} onChange={e => setCurrentPw(e.target.value)}
              style={inputStyle} autoComplete="current-password" />
          </div>
          <div>
            <label style={labelStyle}>New Password</label>
            <input type={showPws ? "text" : "password"} placeholder="At least 12 characters"
              value={newPw} onChange={e => setNewPw(e.target.value)}
              style={inputStyle} autoComplete="new-password" />
          </div>
          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input type={showPws ? "text" : "password"} placeholder="Re-enter new password"
              value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={inputStyle} autoComplete="new-password" />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Pill show/hide toggle — directly from CIS LoginPage style */}
        <button
          type="button" onClick={() => setShowPws(s => !s)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 14px", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
            background: showPws ? "var(--color-primary-bg-alt)" : "#f9fafb",
            color:      showPws ? "var(--color-primary)" : "var(--color-secondary)",
            border: `1.2px solid ${showPws ? "var(--color-primary-light)" : "#d1d5db"}`,
            borderRadius: 18, cursor: "pointer", transition: "all 0.15s", minHeight: 0,
          }}
        >
          {showPws ? (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg> Hide</>
          ) : (
            <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg> Show</>
          )}
        </button>

        <button
          className="btn-primary" onClick={handleSubmit}
          disabled={saving || !currentPw || !newPw || !confirmPw}
          style={{ padding: "8px 22px" }}
        >
          {saving ? "Saving…" : "Update Password"}
        </button>
      </div>
    </div>
  );
}

// ─── Audit Log tab ────────────────────────────────────────────────────────────
const ACTION_META = {
  LOGIN_SUCCESS:          { label: "Login",              color: "success" },
  LOGIN_FAILED:           { label: "Login Failed",       color: "error"   },
  PASSWORD_CHANGED:       { label: "Password Changed",   color: "warning" },
  PASSWORD_CHANGE_FAILED: { label: "Pw Change Failed",   color: "error"   },
  LOGIN_TOGGLE:           { label: "Login Toggle",       color: "info"    },
  LOGOUT:                 { label: "Logout",             color: "default" },
};

const CHIP_COLORS = {
  success: { bg: "#f0fdf4",                         color: "#16a34a",                      border: "#86efac" },
  error:   { bg: "#fff0f0",                         color: "#dc2626",                      border: "#fca5a5" },
  warning: { bg: "#fffbeb",                         color: "#d97706",                      border: "#fcd34d" },
  info:    { bg: "var(--color-primary-bg-alt)",     color: "var(--color-primary)",         border: "var(--color-primary-border)" },
  default: { bg: "#f3f4f6",                         color: "#6b7280",                      border: "#d1d5db" },
};

// Matches CIS actionChip — small colored pill with bold label
function ActionChip({ action }) {
  const meta = ACTION_META[action] || { label: action, color: "default" };
  const c    = CHIP_COLORS[meta.color];
  return (
    <span style={{
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      borderRadius: 12, padding: "2px 10px",
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {meta.label}
    </span>
  );
}

function formatTS(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// Matches CIS DetailRow — click row to expand JSON detail
function DetailRow({ log }) {
  const [open, setOpen] = useState(false);
  const hasDetail = log.detail && Object.keys(log.detail).length > 0;
  const tdBase = { padding: "8px 10px", fontSize: 13, borderTop: "1px solid #f3f4f6", verticalAlign: "middle" };

  return (
    <>
      <tr
        style={{ background: !log.success ? "#fff5f5" : "transparent", cursor: hasDetail ? "pointer" : "default" }}
        onClick={() => hasDetail && setOpen(o => !o)}
      >
        <td style={{ ...tdBase, fontFamily: "monospace", fontSize: 12, color: "var(--color-text-light)", whiteSpace: "nowrap" }}>
          {formatTS(log.timestamp)}
        </td>
        <td style={tdBase}><ActionChip action={log.action} /></td>
        <td style={{ ...tdBase, fontFamily: "monospace", fontSize: 12 }}>
          {log.ip
            ? <span style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 4, padding: "1px 6px", fontSize: 11 }}>{log.ip}</span>
            : <span style={{ color: "var(--color-muted)" }}>—</span>
          }
        </td>
        <td style={tdBase}>
          {log.success
            ? <span style={{ color: "#16a34a", display: "inline-flex" }}><Icons.Check /></span>
            : <span style={{ color: "#dc2626", display: "inline-flex" }}><Icons.Cancel /></span>
          }
        </td>
        <td style={{ ...tdBase, width: 32, padding: "8px 6px" }}>
          {hasDetail && (
            <span style={{ color: "var(--color-text-lighter)", display: "inline-flex" }}>
              {open ? <Icons.ExpandLess /> : <Icons.ExpandMore />}
            </span>
          )}
        </td>
      </tr>
      {hasDetail && open && (
        <tr style={{ background: "#f9fafb" }}>
          <td colSpan={5} style={{ padding: "8px 16px" }}>
            <pre style={{ margin: 0, fontSize: 12, fontFamily: "monospace", color: "#374151", overflowX: "auto" }}>
              {JSON.stringify(log.detail, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function AuditLogTab() {
  const [logs,          setLogs]          = useState([]);
  const [total,         setTotal]         = useState(0);
  const [pages,         setPages]         = useState(1);
  const [page,          setPage]          = useState(1);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [showFilter,    setShowFilter]    = useState(false);
  const [filterAction,  setFilterAction]  = useState("");
  const [filterSuccess, setFilterSuccess] = useState("");

  const LIMIT = 50;

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true); setError(null);
    try {
      const data = await apiFetch(`/api/settings/audit-log?page=${pg}&limit=${LIMIT}`);
      if (data?.error) { setError("Failed to load audit log."); return; }
      setLogs(data.logs || []); setTotal(data.total || 0); setPages(data.pages || 1);
    } catch { setError("Failed to load audit log."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const handlePage = (dir) => {
    const next = page + dir;
    if (next < 1 || next > pages) return;
    setPage(next); fetchLogs(next);
  };

  const hasActiveFilters = filterAction || filterSuccess;

  const filtered = useMemo(() => logs.filter(log => {
    if (filterAction  && !log.action?.toLowerCase().includes(filterAction.toLowerCase())) return false;
    if (filterSuccess === "true"  && !log.success)  return false;
    if (filterSuccess === "false" &&  log.success)  return false;
    return true;
  }), [logs, filterAction, filterSuccess]);

  const thStyle = {
    padding: "8px 10px", fontWeight: 700, fontSize: 12,
    background: "#f3f4f6", color: "var(--color-text-light)",
    textAlign: "left", whiteSpace: "nowrap",
  };

  return (
    <div>
      {/* Header row — matches CIS AuditLogPanel header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontWeight: 700}}>Audit Log</h1>
          {total > 0 && (
            <span style={{ fontSize: 13, color: "var(--color-text-light)", marginLeft: 8 }}>
              ({total.toLocaleString()} {total === 1 ? "entry" : "entries"})
              {hasActiveFilters && filtered.length !== logs.length && (
                <span style={{ color: "#d97706", marginLeft: 6 }}>· {filtered.length} shown</span>
              )}
            </span>
          )}
        </div>

        {/* Refresh icon-button — matches CIS IconButton */}
        <button
          onClick={() => { setPage(1); fetchLogs(1); }} disabled={loading} title="Refresh"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 32, height: 32, border: "1px solid #e5e7eb", borderRadius: 6,
            background: "none", cursor: "pointer", color: "var(--color-text-light)",
            padding: 0, minHeight: 0,
          }}
        >
          <Icons.Refresh />
        </button>

        {/* Filter button — matches CIS outlined/contained toggle */}
        <button
          onClick={() => setShowFilter(s => !s)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "6px 14px", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            border: `1px solid ${hasActiveFilters ? "#d97706" : "var(--color-primary)"}`,
            borderRadius: 6, cursor: "pointer", minHeight: 0,
            background: showFilter
              ? (hasActiveFilters ? "#d97706" : "var(--color-primary)")
              : "none",
            color: showFilter ? "#fff" : (hasActiveFilters ? "#d97706" : "var(--color-primary)"),
            transition: "all 0.15s",
          }}
        >
          <Icons.Filter />
          Filter{hasActiveFilters ? " •" : ""}
        </button>
      </div>

      {/* Collapsible filter panel — matches CIS Collapse + Paper variant="outlined" */}
      {showFilter && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "14px 16px", marginBottom: 16, background: "#fafafa" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={labelStyle}>Action type</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", pointerEvents: "none" }}>
                  <Icons.Search />
                </span>
                <input
                  placeholder="e.g. LOGIN" value={filterAction}
                  onChange={e => setFilterAction(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 30, width: 180 }}
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={filterSuccess} onChange={e => setFilterSuccess(e.target.value)}
                style={{ ...inputStyle, width: 150 }}>
                <option value="">All</option>
                <option value="true">Success only</option>
                <option value="false">Failed only</option>
              </select>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => { setFilterAction(""); setFilterSuccess(""); }}
                style={{
                  padding: "7px 14px", fontSize: 13, fontFamily: "inherit",
                  border: "1px solid #d1d5db", borderRadius: 6, background: "none",
                  cursor: "pointer", color: "var(--color-text-light)", minHeight: 0,
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger-border)", color: "var(--color-danger-text)", borderRadius: 6, padding: "8px 14px", fontSize: 14, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* Outlined paper table — matches CIS Paper variant="outlined" */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "32px", color: "var(--color-text-light)", fontSize: 14 }}>
            Loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--color-text-lighter)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, opacity: 0.4 }}>
              <Icons.AuditLog />
            </div>
            <div style={{ fontSize: 14 }}>
              {hasActiveFilters ? "No entries match your filters." : "No audit log entries found."}
            </div>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Timestamp</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>IP Address</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => <DetailRow key={log._id} log={log} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 14 }}>
          <button className="btn-secondary" onClick={() => handlePage(-1)} disabled={page <= 1} style={{ padding: "5px 14px", fontSize: 13 }}>← Prev</button>
          <span style={{ fontSize: 13, color: "var(--color-text-light)" }}>Page {page} of {pages}</span>
          <button className="btn-secondary" onClick={() => handlePage(1)} disabled={page >= pages} style={{ padding: "5px 14px", fontSize: 13 }}>Next →</button>
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--color-text-lighter)", marginTop: 10 }}>
        Showing {LIMIT} entries per page · Filters apply to the loaded page · Click a row to expand detail
      </p>
    </div>
  );
}

// ─── SettingsPage root ────────────────────────────────────────────────────────
function SettingsPage({ onBack }) {
  const [activeTab,  setActiveTab]  = useState("categories");
  const [config,     setConfig]     = useState(null);
  const [loadingCfg, setLoadingCfg] = useState(true);
  const { toasts, add: toast } = useToast();

  // ─── Unsaved-changes guard for Categories tab ─────────────────────────────
  // CategoryManager registers a "leave handler" that pops a confirm dialog.
  // We store it here so tab switching and the back button can trigger it too.
  const categoryLeaveHandlerRef = useRef(null);


  // Called by CategoriesTab when CategoryManager registers itself
  const handleRegisterTabLeave = (fn) => {
    categoryLeaveHandlerRef.current = fn;
  };

  // Ask the CategoryManager if it's OK to leave; if it has unsaved changes it
  // will show its own confirm dialog. We wrap it so we can also switch tabs /
  // navigate back after the user confirms.
  const guardedLeave = (proceed) => {
    if (activeTab === "categories" && categoryLeaveHandlerRef.current) {
      // CategoryManager's handleBack expects a "destination" function.
      // Pass our proceed callback so it fires after save/discard.
      categoryLeaveHandlerRef.current(proceed);
    } else {
      proceed();
    }
  };

  const fetchConfig = useCallback(async () => {
    try {
      const data = await apiFetch("/api/settings/config");
      if (!data?.error) setConfig(data);
    } catch { /* non-fatal */ }
    finally { setLoadingCfg(false); }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  return (
    <div className="container">
      <ToastContainer toasts={toasts} />

      {/* Header — matches CIS: icon-button back + bold h5 title */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28 }}>
        <button
          onClick={() => guardedLeave(onBack)} title="Back to Home"
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, border: "none", borderRadius: 8,
            background: "none", cursor: "pointer", color: "var(--color-text)",
            padding: 0, minHeight: 0, flexShrink: 0,
          }}
        >
          <Icons.Back />
        </button>
        <h2 style={{ margin: 0, fontWeight: 700, fontSize: 22 }}>Admin Settings</h2>
      </div>

      <TabBar
        activeTab={activeTab}
        onChange={(newTab) => {
          if (newTab === activeTab) return;
          guardedLeave(() => {
            categoryLeaveHandlerRef.current = null; // reset after leaving categories
            setActiveTab(newTab);
          });
        }}
      />

      {activeTab === "categories" && (
        <CategoriesTab registerTabLeaveHandler={handleRegisterTabLeave} />
      )}
      {activeTab === "materials"  && <MaterialsTab />}
      {activeTab === "password"   && (
        loadingCfg
          ? <p style={{ color: "var(--color-text-light)" }}>Loading…</p>
          : <PasswordTab config={config} onRefresh={fetchConfig} toast={toast} />
      )}
      {activeTab === "auditlog"   && <AuditLogTab />}
    </div>
  );
}

export default SettingsPage;