export default function HomeNotice({ shown, text }) {
  // similar to bootstrap alert
  // used in home page to notify about maintenance
  return (
    <div
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        textAlign: "center",
        borderRadius: "10px",
      }}
    >
      <span
        style={{
          color: "white",
          fontSize: "clamp(1em, 2.8vw, 2em)",
          marginTop: "20px",
          textAlign: "center",
          whiteSpace: "pre-line", // allow \n to render as new line
        }}
      >
        {text || "Loading..."}
      </span>
    </div>
  );
}
