import { FaTimes } from "react-icons/fa";
import { useTranslation } from "@/components/useTranslations";

export default function JoinPartyOverlay({ shown, multiplayerState, setMultiplayerState, handleAction, onClose }) {
  const { t: text } = useTranslation("common");
  if (!shown) return null;

  const code = multiplayerState?.joinOptions?.gameCode || "";
  const inProgress = !!multiplayerState?.joinOptions?.progress;
  const error = multiplayerState?.joinOptions?.error;

  const submit = () => {
    if (code.length !== 6 || inProgress) return;
    handleAction("joinPrivateGame", code);
  };

  return (
    <div
      className="join-party-container"
      onClick={(e) => {

        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="join-party-card">
        <button
          type="button"
          className="join-party-card__close"
          aria-label="Close"
          onClick={onClose}
        >
          <FaTimes />
        </button>

        <h2 className="join-party-title">{text("joinGame")}</h2>

        <div className="join-party-form">
          <div className="join-party-input-group">
            <input
              type="text"
              className="join-party-input"
              placeholder={text("gameCode")}
              value={code}
              maxLength={6}
              autoFocus
              onChange={(e) =>
                setMultiplayerState((prev) => ({
                  ...prev,
                  joinOptions: {
                    ...prev.joinOptions,
                    gameCode: e.target.value.replace(/\D/g, ""),
                  },
                }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") onClose?.();
              }}
              disabled={inProgress}
            />
            <button
              type="button"
              className="join-party-button"
              disabled={code.length !== 6 || inProgress}
              onClick={submit}
            >
              {inProgress ? "..." : text("go")}
            </button>
          </div>

          {error && (
            <div className="join-party-error">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
