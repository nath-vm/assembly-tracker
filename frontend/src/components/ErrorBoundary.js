import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          padding:      "32px 24px",
          textAlign:    "center",
          background:   "var(--color-danger-bg)",
          border:       "1px solid var(--color-danger-border)",
          borderRadius: 10,
          margin:       "24px 0",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ color: "var(--color-danger-text)", marginBottom: 8 }}>
            Something went wrong
          </h3>
          <p style={{ color: "var(--color-danger-text)", fontSize: 14, marginBottom: 16 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background:   "var(--color-danger)",
              color:        "#fff",
              border:       "none",
              borderRadius: 6,
              padding:      "8px 20px",
              cursor:       "pointer",
              fontSize:     14,
              fontWeight:   600,
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
