import { useState, useEffect } from "react";
import { FaWrench } from "react-icons/fa";

// Maintenance window: 13:00-15:00 UTC on Dec 23, 2025
const MAINTENANCE_START_UTC = new Date("2025-12-23T13:00:00Z");
const MAINTENANCE_END_UTC = new Date("2025-12-23T15:00:00Z");

function formatTimeRange(start, end) {
  const startHour = start.getHours();
  const endHour = end.getHours();
  const startMin = start.getMinutes();
  const endMin = end.getMinutes();

  const startPeriod = startHour >= 12 ? "PM" : "AM";
  const endPeriod = endHour >= 12 ? "PM" : "AM";

  const formatHour = (h) => h % 12 || 12;
  const formatMin = (m) => m > 0 ? `:${String(m).padStart(2, "0")}` : "";

  const startStr = `${formatHour(startHour)}${formatMin(startMin)}`;
  const endStr = `${formatHour(endHour)}${formatMin(endMin)}`;

  // Only show AM/PM once if same period
  if (startPeriod === endPeriod) {
    return `${startStr}–${endStr} ${endPeriod}`;
  }
  return `${startStr} ${startPeriod}–${endStr} ${endPeriod}`;
}

function formatCountdown(ms) {
  if (ms <= 0) return "00:00:00";
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function MaintenanceBanner() {
  const [now, setNow] = useState(new Date());
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // const dismissedUntil = localStorage.getItem("maintenanceBannerDismissed");
    // if (dismissedUntil && new Date(dismissedUntil) > new Date()) {
    //   setDismissed(true);
    // }
  }, []);

  const isBeforeMaintenance = now < MAINTENANCE_START_UTC;
  const isDuringMaintenance = now >= MAINTENANCE_START_UTC && now < MAINTENANCE_END_UTC;
  const isAfterMaintenance = now >= MAINTENANCE_END_UTC;

  if (isAfterMaintenance || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem("maintenanceBannerDismissed", MAINTENANCE_END_UTC.toISOString());
    setDismissed(true);
  };

  const countdown = isBeforeMaintenance
    ? formatCountdown(MAINTENANCE_START_UTC - now)
    : formatCountdown(MAINTENANCE_END_UTC - now);

  return (
    <div style={styles.banner}>
      <div style={styles.content}>
        <FaWrench style={isDuringMaintenance ? styles.iconActive : styles.icon} />

        <div style={styles.text}>
          {isDuringMaintenance ? (
            <>🔧 <strong>Maintenance in progress</strong> · Back in <strong style={styles.countdown}>{countdown}</strong></>
          ) : (
            <>⚠️ <strong>Maintenance scheduled for {formatTimeRange(MAINTENANCE_START_UTC, MAINTENANCE_END_UTC)}</strong> (starts in <span style={styles.countdown}>{countdown}</span>)</>
          )}
        </div>

        {!isDuringMaintenance && (
          <button onClick={handleDismiss} style={styles.closeBtn} aria-label="Dismiss">×</button>
        )}
      </div>
    </div>
  );
}

const styles = {
  banner: {
    width: "100%",
    padding: "0 8px",
    minWidth: 300,

    marginBottom: "12px",
    boxSizing: "border-box",
  },
  content: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    background: "linear-gradient(90deg, #d35400 0%, #c0392b 100%)",
    border: "2px solid #e74c3c",
    borderRadius: "8px",
    padding: "10px 12px",
    boxShadow: "0 4px 12px rgba(211, 84, 0, 0.4)",
    flexWrap: "wrap",
    maxWidth: "100%",
    boxSizing: "border-box",
  },
  icon: {
    color: "#fff",
    fontSize: "14px",
    flexShrink: 0,
    marginTop: "2px",
  },
  iconActive: {
    color: "#fff",
    fontSize: "14px",
    flexShrink: 0,
    marginTop: "2px",
    animation: "spin 2s linear infinite",
  },
  text: {
    flex: 1,
    fontSize: "0.85rem",
    color: "#fff",
    lineHeight: 1.5,
    fontWeight: 500,
    wordBreak: "break-word",
    overflowWrap: "break-word",
  },
  countdown: {
    color: "#ffe066",
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    fontWeight: 700,
  },
  closeBtn: {
    background: "rgba(255, 255, 255, 0.2)",
    border: "none",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
    padding: "2px 6px",
    lineHeight: 1,
    borderRadius: "4px",
    flexShrink: 0,
  },
};

if (typeof document !== "undefined" && !document.getElementById("maintenance-banner-styles")) {
  const style = document.createElement("style");
  style.id = "maintenance-banner-styles";
  style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}
