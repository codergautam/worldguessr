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
          <h1 className="ob-complete__title">{text("tutorialComplete")}</h1>
          <p className="ob-complete__score">
            {points} / {maxPoints} {text("points")}
          </p>
        </div>

        <p className="ob-complete__prompt">{text("obCompletePrompt")}</p>

        <div className="ob-complete__grid">
          {isClassic ? (
            <>
              <ActionCard
                emoji="🗺️"
                title={text("classic")}
                desc={text("obDescExplore")}
                onClick={onClassic}
              />
              <ActionCard
                emoji="⚔️"
                title={text("findDuel")}
                desc={text("obDescCompete")}
                onClick={onDuel}
              />
              <ActionCard
                emoji="🌍"
                title={text("communityMaps")}
                desc={text("obDescDiscover")}
                onClick={onCommunityMaps}
              />
              {!loggedIn && (
                <ActionCard
                  emoji="🔗"
                  title={text("signIn")}
                  desc={text("obDescSaveRanked")}
                  onClick={onSignIn}
                />
              )}
            </>
          ) : (
            <>
              <ActionCard
                emoji="🏳️"
                title={text("countryGuesser")}
                desc={text("obDescKeepCountries")}
                onClick={onCountryGuesser}
              />
              <ActionCard
                emoji="🗺️"
                title={text("classic")}
                desc={text("obDescClassicFull")}
                onClick={onClassic}
              />
              {!loggedIn && (
                <ActionCard
                  emoji="🔗"
                  title={text("signIn")}
                  desc={text("obDescSaveCompete")}
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
