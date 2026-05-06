import dynamic from "next/dynamic";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import SetUsernameModal from "@/components/setUsernameModal";
import gameStorage from "@/components/utils/localStorage";

const AccountModal = dynamic(() => import("@/components/accountModal"), { ssr: false });
const MapGuessrModal = dynamic(() => import("@/components/mapGuessrModal"), { ssr: false });
const SuggestAccountModal = dynamic(() => import("@/components/suggestAccountModal"), { ssr: false });
const DiscordModal = dynamic(() => import("@/components/discordModal"), { ssr: false });
const PendingNameChangeModal = dynamic(() => import("@/components/pendingNameChangeModal"), { ssr: false });
const WelcomeOverlay = dynamic(() => import("@/components/welcomeOverlay"), { ssr: false });

export default function HomeShellModals({
  accountModalOpen,
  setAccountModalOpen,
  inCrazyGames,
  session,
  setSession,
  eloData,
  accountModalPage,
  setAccountModalPage,
  ws,
  multiplayerState,
  sendInvite,
  options,
  showSuggestLoginModal,
  setShowSuggestLoginModal,
  suggestLoginShowNeverAgain,
  showDiscordModal,
  setShowDiscordModal,
  mapGuessrModal,
  setMapGuessrModal,
  pendingNameChangeModal,
  setPendingNameChangeModal,
  chatbox,
  welcomeOverlayShown,
  screen,
  setOnboardingMode,
  setOnboarding,
  setShowCountryButtons,
  setWelcomeOverlayShown,
  setLatLong,
  setShowAnswer,
  setOnboardingCompleted,
  setScreen,
}) {
  return (
    <>
      {accountModalOpen && (
        <AccountModal
          inCrazyGames={inCrazyGames}
          shown={true}
          session={session}
          setSession={setSession}
          setAccountModalOpen={setAccountModalOpen}
          eloData={eloData}
          accountModalPage={accountModalPage}
          setAccountModalPage={setAccountModalPage}
          ws={ws}
          canSendInvite={multiplayerState?.inGame && !multiplayerState?.gameData?.public}
          sendInvite={sendInvite}
          options={options}
        />
      )}
      {session?.token?.secret && !session.token.username && (
        <SetUsernameModal shown={true} session={session} />
      )}
      {showSuggestLoginModal && (
        <SuggestAccountModal
          shown={true}
          setOpen={setShowSuggestLoginModal}
          showNeverAgain={suggestLoginShowNeverAgain}
        />
      )}
      {showDiscordModal && typeof window !== "undefined" && window.innerWidth >= 768 && (
        <DiscordModal shown={true} setOpen={setShowDiscordModal} />
      )}
      {mapGuessrModal && (
        <MapGuessrModal isOpen={true} onClose={() => setMapGuessrModal(false)} />
      )}
      {pendingNameChangeModal && (
        <PendingNameChangeModal
          session={session}
          isOpen={true}
          onClose={() => setPendingNameChangeModal(false)}
        />
      )}
      {chatbox}
      <ToastContainer pauseOnFocusLoss={false} />

      {welcomeOverlayShown && screen === "onboarding" && (
        <WelcomeOverlay
          onModeSelected={(mode) => {
            setOnboardingMode(mode);
            try { gameStorage.setItem("onboarding_seen", "true"); } catch (e) {}
            setOnboarding((prev) => (prev ? { ...prev, mode } : prev));
            setShowCountryButtons(mode !== "classic");
            setWelcomeOverlayShown(false);
          }}
          onSkip={() => {
            try {
              gameStorage.setItem("onboarding_seen", "true");
              gameStorage.setItem("onboarding", "done");
            } catch (e) {}
            setLatLong(null);
            setShowAnswer(false);
            setWelcomeOverlayShown(false);
            setOnboarding(null);
            setOnboardingCompleted(true);
            setScreen("home");
          }}
        />
      )}
    </>
  );
}
