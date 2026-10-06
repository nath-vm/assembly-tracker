import React, { useState } from "react";
import { apiFetch } from "../services/api";

function LoginPage({ onLogin, onBack }) {
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // FIX: Pass skipSessionCheck: true so that a 401 (wrong password) or
      // 403 (login disabled) response is returned normally to this handler
      // instead of firing the global session-expired event. Previously, any
      // failed login attempt would silently redirect rather than show an error.
      const data = await apiFetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        skipSessionCheck: true,
      });

      if (data.error) {
        if (data.error === "network-error") {
          setError("Could not connect to server. Please try again.");
        } else if (data.error?.includes?.("Too many login attempts")) {
          setError(data.error);
        } else if (data.error === "Login is currently disabled by the administrator.") {
          setError("Login is currently disabled by the administrator.");
        } else {
          setError("Incorrect password. Please try again.");
          setPassword("");
        }
      } else if (data.token) {
        sessionStorage.setItem("token", data.token);
        onLogin();
      } else {
        setError("Login failed. Please try again.");
      }
    } catch {
      setError("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight:      "100vh",
      display:        "flex",
      justifyContent: "center",
      alignItems:     "center",
      background:     "#f2f2f2"
    }}>
      <div style={{
        background:   "#fff",
        borderRadius: 12,
        boxShadow:    "0 2px 16px rgba(0,0,0,0.08)",
        padding:      "40px 32px 32px 32px",
        minWidth:     340,
        maxWidth:     360,
        width:        "100%",
        textAlign:    "center",
        fontFamily:   "Segoe UI, Arial, sans-serif"
      }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding:     "6px 14px",
            fontSize:    14,
            background:  "none",
            color:       "var(--color-primary, #2596be)",
            border:      "none",
            borderRadius: 6,
            cursor:      "pointer",
            display:     "flex",
            gap:         6,
            fontWeight:  500,
            opacity:     0.8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <h2 style={{ margin: 1, marginBottom: 5, color: "#2596be", fontWeight: 700, fontSize: 26 }}>
          AssemblyTrack
        </h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
          <div style={{ position: "relative", width: 260, marginBottom: 10 }}>
            <input
              type={showPw ? "text" : "password"}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              style={{
                padding:      "12px 16px",
                fontSize:     16,
                border:       "1px solid #ccc",
                borderRadius: 6,
                width:        "100%",
                boxSizing:    "border-box",
                outline:      "none"
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowPw((s) => !s)}
            tabIndex={-1}
            style={{
              display:      "inline-flex",
              alignItems:   "center",
              gap:          5,
              padding:      "5px 14px",
              fontSize:     13,
              fontWeight:   500,
              background:   showPw ? "#f0f9ff" : "#f9fafb",
              color:        showPw ? "#2596be" : "#6b7280",
              border:       `1.2px solid ${showPw ? "#38caef" : "#d1d5db"}`,
              borderRadius: 18,
              cursor:       "pointer",
              marginBottom: 14,
              transition:   "all 0.15s"
            }}
          >
            {showPw ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                Hide password
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Show password
              </>
            )}
          </button>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding:         "12px 16px",
              fontSize:        16,
              backgroundColor: loading ? "#b3b3b3" : "#2596be",
              color:           "#fff",
              border:          "none",
              borderRadius:    6,
              width:           260,
              boxSizing:       "border-box",
              cursor:          loading ? "not-allowed" : "pointer",
              fontWeight:      600
            }}
          >
            {loading ? "Checking..." : "Enter"}
          </button>
          {error && (
            <p style={{ color: "#d32f2f", marginTop: 14, fontWeight: 500 }}>{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
