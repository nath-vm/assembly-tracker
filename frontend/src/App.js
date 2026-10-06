import React, { useState, useEffect } from "react";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import HomePage      from "./pages/HomePage";
import LoginPage     from "./pages/LoginPage";
import SettingsPage  from "./pages/SettingsPage";
import ConfirmDialog from "./components/ConfirmDialog";
import ScrollToTop   from "./components/ScrollToTop";
import ErrorBoundary from "./components/ErrorBoundary";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!sessionStorage.getItem("token")
  );
  const [view,            setView]            = useState("home");
  const [confirmDialog,   setConfirmDialog]   = useState({
    open: false, type: null, payload: null, onConfirm: null
  });
  const [sessionExpired,  setSessionExpired]  = useState(false);
  const [sessionWarning,  setSessionWarning]  = useState(false); // warn before expiry

  // ─── Session expiry warning — fires 10 min before token expires ───────────
  useEffect(() => {
    if (!isAuthenticated) { setSessionWarning(false); return; }

    function scheduleWarning() {
      const token = sessionStorage.getItem("token");
      if (!token) return;
      try {
        // JWT payload is base64url — decode without verifying (client-side only)
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        const expiresAt = payload.exp * 1000;
        const warnAt    = expiresAt - 10 * 60 * 1000; // 10 min before
        const delay     = warnAt - Date.now();
        if (delay <= 0) return; // already in the warning window or expired
        return setTimeout(() => setSessionWarning(true), delay);
      } catch { return null; }
    }

    const timer = scheduleWarning();
    return () => { if (timer) clearTimeout(timer); };
  }, [isAuthenticated]);

  // ─── Listen for 401/403s fired by apiFetch ────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (!sessionStorage.getItem("token")) return;
      sessionStorage.removeItem("token");
      setIsAuthenticated(false);
      setView("home");
      setConfirmDialog({ open: false });
      setSessionExpired(true);
    };
    window.addEventListener("session-expired", handler);
    return () => window.removeEventListener("session-expired", handler);
  }, []);

  // ─── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = () => {
    setIsAuthenticated(true);
    setSessionExpired(false);
    setSessionWarning(false);
    setView("home");
  };

  // ─── Logout ────────────────────────────────────────────────────────────────
  const handleLogout = () => {
    setConfirmDialog({
      open:      true,
      type:      "custom",
      payload:   { message: "Are you sure you want to log out?" },
      onConfirm: () => {
        sessionStorage.removeItem("token");
        setIsAuthenticated(false);
        setView("home");
        setConfirmDialog({ open: false });
      }
    });
  };

  // ─── Session expired dialog ───────────────────────────────────────────────
  if (sessionExpired) {
    return (
      <ErrorBoundary>
        {view === "login" ? (
          <LoginPage onLogin={handleLogin} onBack={() => setView("home")} />
        ) : (
          // FIX: Don't render SettingsPage in the session-expired state — the
          // user is no longer authenticated. Redirect to home instead so they
          // see the expired-session dialog and are prompted to log in again.
          <HomePage
            isAuthenticated={false}
            onSettings={() => setView("settings")}
            onLogin={() => setView("login")}
            onLogout={handleLogout}
          />
        )}
        <ConfirmDialog
          open={true}
          type="error"
          payload={{ message: "Your session has expired. Please log in again." }}
          onConfirm={() => {
            setSessionExpired(false);
            setView("login");
          }}
          onCancel={() => setSessionExpired(false)}
        />
        <ToastContainer position="top-right" autoClose={3000} />
        <ScrollToTop />
      </ErrorBoundary>
    );
  }

  // ─── Views ─────────────────────────────────────────────────────────────────
  if (view === "login") {
    return (
      <ErrorBoundary>
        <LoginPage onLogin={handleLogin} onBack={() => setView("home")} />
        <ToastContainer position="top-right" autoClose={3000} />
        <ScrollToTop />
      </ErrorBoundary>
    );
  }

  // FIX: SettingsPage is now guarded — only authenticated users can reach it.
  // Unauthenticated users (or anyone who manually triggers view="settings")
  // are redirected to the login page instead of seeing the settings UI.
  if (view === "settings") {
    if (!isAuthenticated) {
      return (
        <ErrorBoundary>
          <LoginPage onLogin={handleLogin} onBack={() => setView("home")} />
          <ToastContainer position="top-right" autoClose={3000} />
          <ScrollToTop />
        </ErrorBoundary>
      );
    }
    return (
      <ErrorBoundary>
        <SettingsPage onBack={() => setView("home")} />
        <ToastContainer position="top-right" autoClose={3000} />
        <ScrollToTop />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {sessionWarning && (
        <div style={{
          position:     "fixed",
          top:          0,
          left:         0,
          right:        0,
          zIndex:       9999,
          background:   "var(--color-warning)",
          color:        "#fff",
          padding:      "10px 20px",
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
          fontSize:     14,
          fontWeight:   500,
          boxShadow:    "0 2px 8px rgba(0,0,0,0.15)",
        }}>
          <span>⏰ Your session expires in less than 10 minutes.</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => { setView("login"); setSessionWarning(false); }}
              style={{ background: "#fff", color: "var(--color-warning)", border: "none", borderRadius: 5, padding: "4px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
            >
              Re-login
            </button>
            <button
              onClick={() => setSessionWarning(false)}
              style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.6)", borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontSize: 13 }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <HomePage
        isAuthenticated={isAuthenticated}
        onSettings={() => setView("settings")}
        onLogin={() => setView("login")}
        onLogout={handleLogout}
      />
      <ToastContainer position="top-right" autoClose={3000} />
      <ConfirmDialog
        open={confirmDialog.open}
        type={confirmDialog.type}
        payload={confirmDialog.payload}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ open: false })}
      />
      <ScrollToTop />
    </ErrorBoundary>
  );
}

export default App;
