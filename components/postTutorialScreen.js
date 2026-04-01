import { useTranslation } from '@/components/useTranslations';
import sendEvent from './utils/sendEvent';

function getAlternateMode(mode) {
  if (mode === "classic") return "country";
  return "classic";
}

export default function PostTutorialScreen({ mode, session, onKeepPlaying, onTryOtherMode, onExploreMaps, onSignIn, showExploreMaps }) {
  const { t: text } = useTranslation("common");
  const altMode = getAlternateMode(mode);
  const altLabel = altMode === "classic" ? text("classic") : altMode === "country" ? text("countryGuesser") : text("continentGuesser");
  const modeLabel = mode === "classic" ? text("classic") : mode === "country" ? text("countryGuesser") : text("continentGuesser");

  function track(action) {
    sendEvent("post_tutorial_action", { action });
  }

  return (
    <div className="post-tutorial">
      <h2 className="post-tutorial__title">{text("niceWork")}</h2>
      <p className="post-tutorial__subtitle">{text("tutorialComplete")}</p>

      <div className="post-tutorial__actions">
        <button className="g2_green_button post-tutorial__btn" onClick={() => { track("keep_playing"); onKeepPlaying(); }}>
          {text("keepPlaying")} {modeLabel}
        </button>

        <button className="g2_green_button post-tutorial__btn post-tutorial__btn--alt" onClick={() => { track("switch_mode"); onTryOtherMode(altMode); }}>
          {text("tryMode", { mode: altLabel })}
        </button>

        {showExploreMaps && (
          <button className="post-tutorial__link" onClick={() => { track("explore_maps"); onExploreMaps(); }}>
            {text("exploreMaps")}
          </button>
        )}

        {!session?.token?.secret && (
          <button className="post-tutorial__link" onClick={() => { track("sign_in"); onSignIn(); }}>
            {text("signInSaveProgress")}
          </button>
        )}
      </div>
    </div>
  );
}
