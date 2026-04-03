import { useTranslation } from '@/components/useTranslations';

function ActionCard({ emoji, title, desc, onClick }) {
  return (
    <button className="ob-complete__card" onClick={onClick}>
      <span className="ob-complete__card-emoji">{emoji}</span>
      <strong className="ob-complete__card-title">{title}</strong>
      <span className="ob-complete__card-desc">{desc}</span>
    </button>
  );
}

export default function OnboardingComplete({
  mode,
  points,
  maxPoints,
  session,
  onClassic,
  onDuel,
  onCommunityMaps,
  onCountryGuesser,
  onSignIn,
  onHome,
}) {
  const { t: text } = useTranslation("common");
  const isClassic = mode === "classic";
  const loggedIn = !!session?.token?.secret;

  return (
    <div className="ob-complete">
      <div className="ob-complete__modal">
        <div className="ob-complete__header">
          <h1 className="ob-complete__title">{text("tutorialComplete") || "Tutorial Complete!"}</h1>
          <p className="ob-complete__score">
            {points} / {maxPoints} {text("points")}
          </p>
        </div>

        <p className="ob-complete__prompt">What would you like to try next?</p>

        <div className="ob-complete__grid">
          {isClassic ? (
            <>
              <ActionCard
                emoji="🗺️"
                title={text("classic") || "Classic"}
                desc="Explore the world, guess locations"
                onClick={onClassic}
              />
              <ActionCard
                emoji="⚔️"
                title={text("findDuel") || "Find a Duel"}
                desc="Compete against other players"
                onClick={onDuel}
              />
              <ActionCard
                emoji="🌍"
                title={text("communityMaps") || "Community Maps"}
                desc="Discover player-created maps"
                onClick={onCommunityMaps}
              />
              {!loggedIn && (
                <ActionCard
                  emoji="🔗"
                  title="Sign In"
                  desc="Save progress & play ranked"
                  onClick={onSignIn}
                />
              )}
            </>
          ) : (
            <>
              <ActionCard
                emoji="🏳️"
                title={text("countryGuesser") || "Country Guesser"}
                desc="Keep guessing countries"
                onClick={onCountryGuesser}
              />
              <ActionCard
                emoji="🗺️"
                title={text("classic") || "Classic"}
                desc="Try the full map-guessing experience"
                onClick={onClassic}
              />
              {!loggedIn && (
                <ActionCard
                  emoji="🔗"
                  title="Sign In"
                  desc="Save progress & compete"
                  onClick={onSignIn}
                />
              )}
            </>
          )}
        </div>

        <button className="ob-complete__home" onClick={onHome}>
          ← {text("home")}
        </button>
      </div>
    </div>
  );
}
