import dynamic from "next/dynamic";
import GameUI from "@/components/gameUI";
import MultiplayerHome from "@/components/multiplayerHome";
import sendEvent from "@/components/utils/sendEvent";
import gameStorage from "@/components/utils/localStorage";
import msToTime from "@/components/msToTime";

const RoundOverScreen = dynamic(() => import("@/components/roundOverScreen"), { ssr: false });
const OnboardingComplete = dynamic(() => import("@/components/onboardingComplete"), { ssr: false });

export default function GameScreens(props) {
  const {
    screen,
    onboarding,
    multiplayerState,
    inCoolMathGames,
    inGameDistribution,
    inCrazyGames,
    miniMapShown,
    setMiniMapShown,
    welcomeOverlayShown,
    showPanoOnResult,
    setShowPanoOnResult,
    showDiscordModal,
    setShowDiscordModal,
    singlePlayerRound,
    setSinglePlayerRound,
    countryGuesserCorrect,
    setCountryGuesserCorrect,
    showCountryButtons,
    setShowCountryButtons,
    otherOptions,
    countryGuessrMode,
    options,
    countryStreak,
    setCountryStreak,
    hintShown,
    setHintShown,
    pinPoint,
    setPinPoint,
    showAnswer,
    setShowAnswer,
    loading,
    setLoading,
    session,
    gameOptionsModalShown,
    setGameOptionsModalShown,
    mapModal,
    latLong,
    setLatLong,
    loadLocation,
    gameOptions,
    setGameOptions,
    setOnboarding,
    backBtnPressed,
    timeOffset,
    ws,
    setWs,
    multiplayerChatOpen,
    setMultiplayerChatOpen,
    setMultiplayerState,
    multiplayerError,
    partyModalShown,
    setPartyModalShown,
    selectCountryModalShown,
    setSelectCountryModalShown,
    handleMultiplayerAction,
    setOnboardingCompleted,
    setScreen,
    setMapModal,
    enterCountryGuessrMode,
    guessMultiplayer,
    text,
  } = props;

  return (
    <>
      {screen === "singleplayer" && (
        <div className="home__singleplayer">
          <GameUI
            inCoolMathGames={inCoolMathGames}
            inGameDistribution={inGameDistribution}
            miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
            singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound}
            showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal}
            inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult}
            options={options}
            countryStreak={countryStreak} setCountryStreak={setCountryStreak}
            hintShown={hintShown} setHintShown={setHintShown}
            pinPoint={pinPoint} setPinPoint={setPinPoint}
            showAnswer={showAnswer} setShowAnswer={setShowAnswer}
            loading={loading} setLoading={setLoading}
            session={session}
            gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown}
            mapModal={mapModal} latLong={latLong} loadLocation={loadLocation}
            gameOptions={gameOptions} setGameOptions={setGameOptions}
          />
        </div>
      )}

      {screen === "countryGuesser" && (
        <div className="home__singleplayer">
          <GameUI
            inCoolMathGames={inCoolMathGames}
            inGameDistribution={inGameDistribution}
            miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
            singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound}
            showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal}
            inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult}
            countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect}
            showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons}
            otherOptions={otherOptions} countryGuesser={true} countryGuessrMode={countryGuessrMode}
            options={options}
            countryStreak={countryStreak} setCountryStreak={setCountryStreak}
            hintShown={hintShown} setHintShown={setHintShown}
            pinPoint={pinPoint} setPinPoint={setPinPoint}
            showAnswer={showAnswer} setShowAnswer={setShowAnswer}
            loading={loading} setLoading={setLoading}
            session={session}
            gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown}
            mapModal={mapModal} latLong={latLong} loadLocation={loadLocation}
            gameOptions={gameOptions} setGameOptions={setGameOptions}
          />
        </div>
      )}

      {screen === "onboarding" && (onboarding?.round || onboarding?.completed) && (
        <div className="home__onboarding">
          <GameUI
            inCoolMathGames={inCoolMathGames}
            inGameDistribution={inGameDistribution}
            miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
            welcomeOverlayShown={welcomeOverlayShown}
            inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult}
            countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect}
            showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons}
            otherOptions={otherOptions} onboarding={onboarding}
            countryGuesser={onboarding?.mode && onboarding.mode !== "classic"}
            setOnboarding={setOnboarding} backBtnPressed={backBtnPressed}
            options={options}
            countryStreak={countryStreak} setCountryStreak={setCountryStreak}
            hintShown={hintShown} setHintShown={setHintShown}
            pinPoint={pinPoint} setPinPoint={setPinPoint}
            showAnswer={showAnswer} setShowAnswer={setShowAnswer}
            loading={loading} setLoading={setLoading}
            session={session}
            gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown}
            latLong={latLong} loadLocation={loadLocation}
            gameOptions={gameOptions} setGameOptions={setGameOptions}
          />
        </div>
      )}

      {screen === "onboarding" && onboarding?.completed && (
        <RoundOverScreen
          points={onboarding.points}
          time={msToTime(onboarding.timeTaken)}
          maxPoints={onboarding.mode === "classic" ? 15000 : 3000}
          history={onboarding.locations || []}
          options={options}
        />
      )}

      {screen === "onboarding" && onboarding?.completed && (
        <OnboardingComplete
          mode={onboarding.mode}
          points={onboarding.points}
          maxPoints={onboarding.mode === "classic" ? 15000 : 3000}
          onClassic={() => {
            sendEvent("tutorial_end", { mode: "classic" });
            try { gameStorage.setItem("onboarding", "done"); } catch (e) {}
            setShowAnswer(false);
            setOnboarding(null);
            setOnboardingCompleted(true);
            setMiniMapShown(false);
            setLatLong(null);
            setScreen("singleplayer");
          }}
          onDuel={() => {
            sendEvent("tutorial_end", { mode: "duel" });
            try { gameStorage.setItem("onboarding", "done"); } catch (e) {}
            setShowAnswer(false);
            setOnboarding(null);
            setOnboardingCompleted(true);
            handleMultiplayerAction("unrankedDuel");
          }}
          onCommunityMaps={() => {
            sendEvent("tutorial_end", { mode: "community" });
            try { gameStorage.setItem("onboarding", "done"); } catch (e) {}
            setShowAnswer(false);
            setOnboarding(null);
            setOnboardingCompleted(true);
            setScreen("home");
            setTimeout(() => setMapModal(true), 350);
          }}
          onCountryGuesser={() => {
            sendEvent("tutorial_end", { mode: "country" });
            try { gameStorage.setItem("onboarding", "done"); } catch (e) {}
            try { gameStorage.setItem("singleplayerDefaultMode", "countryGuesser"); } catch (e) {}
            setShowAnswer(false);
            setOnboarding(null);
            setOnboardingCompleted(true);
            enterCountryGuessrMode("country");
          }}
          onHome={() => {
            sendEvent("tutorial_end", { mode: "home" });
            try { gameStorage.setItem("onboarding", "done"); } catch (e) {}
            setLatLong(null);
            setShowAnswer(false);
            setOnboarding(null);
            setOnboardingCompleted(true);
            setScreen("home");
          }}
        />
      )}

      <RoundOverScreen
        hidden={!(multiplayerState?.inGame && multiplayerState?.gameData?.state === "end" && multiplayerState?.gameData?.duelEnd)}
        duel={true}
        data={multiplayerState?.gameData?.duelEnd}
        multiplayerState={multiplayerState}
        session={session}
        gameId={multiplayerState?.gameData?.code}
        button1Text={text("playAgain")}
        options={options}
        button1Press={() => { backBtnPressed(true, "ranked"); }}
        button2Text={text("home")}
        button2Press={() => { backBtnPressed(); }}
      />

      {screen === "multiplayer" && (
        <div className="home__multiplayer">
          <MultiplayerHome
            partyModalShown={partyModalShown}
            setPartyModalShown={setPartyModalShown}
            multiplayerError={multiplayerError}
            handleAction={handleMultiplayerAction}
            session={session}
            ws={ws}
            setWs={setWs}
            multiplayerState={multiplayerState}
            setMultiplayerState={setMultiplayerState}
            selectCountryModalShown={selectCountryModalShown}
            setSelectCountryModalShown={setSelectCountryModalShown}
            inCrazyGames={inCrazyGames}
          />
        </div>
      )}

      {multiplayerState.inGame && ["guess", "getready", "end"].includes(multiplayerState.gameData?.state) && (
        <GameUI
          inCoolMathGames={inCoolMathGames}
          inGameDistribution={inGameDistribution}
          miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
          inCrazyGames={inCrazyGames} showPanoOnResult={showPanoOnResult} setShowPanoOnResult={setShowPanoOnResult}
          options={options} timeOffset={timeOffset} ws={ws}
          backBtnPressed={backBtnPressed}
          multiplayerChatOpen={multiplayerChatOpen} setMultiplayerChatOpen={setMultiplayerChatOpen}
          multiplayerState={multiplayerState}
          pinPoint={pinPoint} setPinPoint={setPinPoint}
          loading={loading} setLoading={setLoading}
          session={session} latLong={latLong} loadLocation={() => {}}
          gameOptions={{
            location: "all", maxDist: 20000,
            extent: gameOptions?.extent ?? multiplayerState?.gameData?.extent,
            nm: multiplayerState?.gameData?.nm,
            npz: multiplayerState?.gameData?.npz,
            showRoadName: multiplayerState?.gameData?.showRoadName,
          }}
          setGameOptions={() => {}}
          showAnswer={(multiplayerState?.gameData?.curRound !== 1) && multiplayerState?.gameData?.state === "getready"}
          setShowAnswer={guessMultiplayer}
        />
      )}
    </>
  );
}
