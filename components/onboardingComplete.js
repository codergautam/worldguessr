import { useEffect, useRef, useState } from 'react';
import { FaTrophy, FaMapMarkedAlt, FaBolt, FaGlobeAmericas, FaFlag } from 'react-icons/fa';
import { useTranslation } from '@/components/useTranslations';
import sendEvent from '@/components/utils/sendEvent';
import triggerConfetti from '@/components/utils/triggerConfetti';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

function ActionCard({ icon, title, desc, onClick, accent }) {
  return (
    <button className={`ob-complete__card ob-complete__card--${accent}`} onClick={onClick}>
      <span className="ob-complete__card-icon">{icon}</span>
      <span className="ob-complete__card-body">
        <strong className="ob-complete__card-title">{title}</strong>
        <span className="ob-complete__card-desc">{desc}</span>
      </span>
    </button>
  );
}

export default function OnboardingComplete({
  mode,
  points,
  maxPoints,
  onClassic,
  onDuel,
  onCommunityMaps,
  onCountryGuesser,
  onHome,
}) {
  const { t: text } = useTranslation("common");
  const isClassic = mode === "classic";

  const [animatedPoints, setAnimatedPoints] = useState(0);
  const confettiFiredRef = useRef(false);

  // Pick one of 5 fun celebratory messages on mount (stable for the life of the modal)
  const [niceKey] = useState(() => `obNiceMsg${Math.floor(Math.random() * 5) + 1}`);

  // Fire confetti once on mount
  useEffect(() => {
    if (confettiFiredRef.current) return;
    confettiFiredRef.current = true;
    if (prefersReducedMotion()) return;
    try { triggerConfetti(); } catch (e) {}
  }, []);

  // Animated score count-up
  useEffect(() => {
    const target = Number(points) || 0;
    if (prefersReducedMotion()) {
      setAnimatedPoints(target);
      return;
    }
    const duration = 900;
    const startTime = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setAnimatedPoints(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [points]);

  // Esc to go home
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        try { sendEvent('tutorial_home_clicked'); } catch (err) {}
        onHome?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHome]);

  const fire = (name) => { try { sendEvent(name); } catch (e) {} };

  const handleClassic        = () => { fire('tutorial_continue_classic');        onClassic?.(); };
  const handleDuel           = () => { fire('tutorial_continue_duel');           onDuel?.(); };
  const handleCommunityMaps  = () => { fire('tutorial_continue_communitymaps');  onCommunityMaps?.(); };
  const handleCountryGuesser = () => { fire('tutorial_continue_countryguesser'); onCountryGuesser?.(); };
  const handleHome           = () => { fire('tutorial_home_clicked');            onHome?.(); };

  const safeMax = Number(maxPoints) || 0;
  const safePoints = Number(points) || 0;
  // Hide score on country-guesser onboarding when the player scored low,
  // so a weak first run doesn't sour the moment. Classic ceiling is 15000
  // so the same rule isn't applied there.
  const hideScore = !isClassic && safePoints <= 1000;
  // For classic, hide the "/ 15000" ceiling on low scores so it doesn't
  // feel like a failing grade.
  const hideMax = isClassic && safePoints < 5000;

  return (
    <div className="ob-complete">
      <div className="ob-complete__modal">

        <div className="ob-complete__celebration">
          <FaTrophy className="ob-complete__trophy" />
          <h1 className="ob-complete__title">{text(niceKey)}</h1>
          {!hideScore && (
            <>
              <div className="ob-complete__score-row">
                <span className="ob-complete__score-value">{animatedPoints.toLocaleString()}</span>
                {!hideMax && (
                  <span className="ob-complete__score-max">/ {safeMax.toLocaleString()}</span>
                )}
              </div>
              <div className="ob-complete__score-label">{text("points")}</div>
            </>
          )}
        </div>

        <p className="ob-complete__prompt">{text("obCompletePrompt")}</p>

        <div className="ob-complete__grid">
          {isClassic ? (
            <>
              <ActionCard
                icon={<FaMapMarkedAlt />}
                title={text("obClassicKeepPlaying")}
                desc={text("obDescClassicKeepPlaying")}
                onClick={handleClassic}
                accent="continue"
              />
              <ActionCard
                icon={<FaBolt />}
                title={text("findDuel")}
                desc={text("obDescCompete")}
                onClick={handleDuel}
                accent="duel"
              />
              <ActionCard
                icon={<FaGlobeAmericas />}
                title={text("communityMaps")}
                desc={text("obDescDiscover")}
                onClick={handleCommunityMaps}
                accent="community"
              />
            </>
          ) : (
            <>
              <ActionCard
                icon={<FaFlag />}
                title={text("obKeepPlaying")}
                desc={text("obDescKeepCountries")}
                onClick={handleCountryGuesser}
                accent="country"
              />
              <ActionCard
                icon={<FaMapMarkedAlt />}
                title={text("classic")}
                desc={text("obDescClassicFull")}
                onClick={handleClassic}
                accent="classic"
              />
              <ActionCard
                icon={<FaGlobeAmericas />}
                title={text("communityMaps")}
                desc={text("obDescDiscover")}
                onClick={handleCommunityMaps}
                accent="community"
              />
            </>
          )}
        </div>

        <button className="ob-complete__home" onClick={handleHome}>
          {text("obMainMenu")}
        </button>
      </div>
    </div>
  );
}
