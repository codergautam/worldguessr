import { useEffect, useState } from 'react';
import { useTranslation } from '@/components/useTranslations';
import sendEvent from './utils/sendEvent';

export default function WelcomeOverlay({ onModeSelected, onSkip }) {
  const { t: text } = useTranslation("common");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    sendEvent("onboarding_shown");
    requestAnimationFrame(() => setVisible(true));
  }, []);

  function selectMode(mode) {
    setVisible(false);
    setTimeout(() => {
      sendEvent("onboarding_mode_selected", { mode });
      onModeSelected(mode);
    }, 300);
  }

  function skip() {
    setVisible(false);
    setTimeout(() => {
      sendEvent("onboarding_mode_selected", { mode: "skipped" });
      onSkip();
    }, 300);
  }

  const isSchoolGuessr = process.env.NEXT_PUBLIC_SCHOOLGUESSR === "true";

  return (
    <div className={`welcome-modal-backdrop ${visible ? 'visible' : ''}`}>
      <div className={`welcome-modal ${visible ? 'visible' : ''}`}>
        <div className="welcome-modal__hero">🌍</div>
        <h1 className="welcome-modal__title">
          {isSchoolGuessr ? "Welcome to SchoolGuessr!" : text("welcomeTitle")}
        </h1>
        {isSchoolGuessr ? (
          <>
            <p className="welcome-modal__desc">
              A kid-friendly version of WorldGuessr made for classrooms and schools.
            </p>
            <ul style={{
              textAlign: 'left',
              margin: '0 auto 16px',
              maxWidth: '360px',
              padding: '0 0 0 20px',
              lineHeight: '1.6',
              fontSize: '0.95rem',
              opacity: 0.92,
            }}>
              <li>Chats and user content are turned off</li>
              <li>Same maps and gameplay as WorldGuessr</li>
              <li>Maintained by the WorldGuessr team!</li>
            </ul>
          </>
        ) : (
          <p className="welcome-modal__desc">
            {text("welcomeDesc")}
          </p>
        )}

        <div className="welcome-modal__modes">
          <button className="welcome-modal__mode-btn welcome-modal__mode-btn--recommended" onClick={() => selectMode("country")}>
            <div className="welcome-modal__mode-badge">{text("recommended")}</div>
            <span className="welcome-modal__mode-icon">🏳️</span>
            <div>
              <strong>{text("countryGuesser")}</strong>
              <span className="welcome-modal__mode-sub">{text("countryGuessrDesc")}</span>
            </div>
          </button>

          <button className="welcome-modal__mode-btn" onClick={() => selectMode("classic")}>
            <span className="welcome-modal__mode-icon">🗺️</span>
            <div>
              <strong>{text("classic")}</strong>
              <span className="welcome-modal__mode-sub">{text("classicDesc")}</span>
            </div>
          </button>
        </div>

        <button className="welcome-modal__skip" onClick={skip}>
          {text("skipTutorial")}
        </button>
      </div>
    </div>
  );
}
