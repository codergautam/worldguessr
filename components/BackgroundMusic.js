import { useEffect, useRef, useState } from "react";

const TOTAL_TRACKS = 7;

export default function BackgroundMusic({ round = 1, playing = true }) {
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(false);

  const track = ((((round - 1) % TOTAL_TRACKS) + TOTAL_TRACKS) % TOTAL_TRACKS) + 1;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.src = `/sounds/${track}.mp3`;
    audio.load();

    if (playing && !muted) {
      audio.play().catch(() => {
        const resume = () => {
          if (!audioRef.current?.muted && !muted) {
            audioRef.current?.play().catch(() => {});
          }
          document.removeEventListener("click", resume);
          document.removeEventListener("keydown", resume);
        };
        document.addEventListener("click", resume, { once: true });
        document.addEventListener("keydown", resume, { once: true });
      });
    }

    return () => {
      audio.pause();
    };
  }, [track]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing && !muted) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [playing, muted]);

  return (
    <>
      <audio
        ref={audioRef}
        loop
        style={{ display: "none" }}
      />
      <button
        onClick={() => setMuted((prev) => !prev)}
        style={{
          position: "fixed",
          bottom: "80px",
          left: "20px",
          zIndex: 9999,
          background: muted ? "#ff4444" : "#44cc44",
          color: "white",
          border: "none",
          borderRadius: "50%",
          width: "50px",
          height: "50px",
          fontSize: "24px",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        title={muted ? "Desmutear música" : "Mutear música"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
    </>
  );
}
