export default function App() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0f13",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "Georgia, serif",
      color: "#c9b99a",
    }}>
      <div style={{ textAlign: "center", maxWidth: 480, padding: "2rem" }}>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🌑</div>
        <h1 style={{ fontSize: "1.8rem", color: "#e8d5b0", marginBottom: "0.5rem" }}>
          Oracolul Cenușii
        </h1>
        <p style={{ fontSize: "1rem", color: "#888", marginBottom: "2rem" }}>
          Bot Discord • Regatul Cenușii
        </p>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          background: "#1a2a1a",
          border: "1px solid #2a4a2a",
          borderRadius: "999px",
          padding: "0.5rem 1.25rem",
          fontSize: "0.9rem",
          color: "#4caf50",
        }}>
          <span style={{
            width: 8, height: 8,
            borderRadius: "50%",
            background: "#4caf50",
            display: "inline-block",
          }} />
          Online
        </div>
      </div>
    </div>
  );
}
