export default function ModerationBanners({
  session,
  screen,
  text,
  dismissedNameChangeBanner,
  setDismissedNameChangeBanner,
  setPendingNameChangeModal,
  dismissedBanBanner,
  setDismissedBanBanner,
  setAccountModalOpen,
  setAccountModalPage,
}) {
  if (screen !== "home") return null;

  return (
    <>
      {session?.token?.pendingNameChange && !dismissedNameChangeBanner && (
        <div className="modBanner modBanner--warning">
          <button
            onClick={() => setDismissedNameChangeBanner(true)}
            className="modBanner__close"
            title="Dismiss"
          >
            ×
          </button>
          <div className="modBanner__content">
            <span>⚠️</span>
            <span className="modBanner__text">{text("usernameChangeRequired")}</span>
            <button
              onClick={() => setPendingNameChangeModal(true)}
              className="modBanner__btn modBanner__btn--dark"
            >
              Change Name
            </button>
          </div>
          {session?.token?.pendingNameChangePublicNote && (
            <div className="modBanner__note">
              {session.token.pendingNameChangePublicNote}
            </div>
          )}
        </div>
      )}

      {session?.token?.banned && !session?.token?.pendingNameChange && !dismissedBanBanner && (
        <div className="modBanner modBanner--error">
          <button
            onClick={() => setDismissedBanBanner(true)}
            className="modBanner__close"
            title="Dismiss"
          >
            ×
          </button>
          <div className="modBanner__content">
            <span>⛔</span>
            <span className="modBanner__text">
              {text("accountSuspended")}
              {session?.token?.banType === "temporary" && session?.token?.banExpiresAt && (
                <span className="modBanner__expires">
                  (Expires: {new Date(session.token.banExpiresAt).toLocaleDateString()})
                </span>
              )}
            </span>
          </div>
          {session?.token?.banPublicNote && (
            <div className="modBanner__note">
              {session.token.banPublicNote}
            </div>
          )}
          <button
            className="modBanner__detailsBtn"
            onClick={() => {
              setAccountModalOpen(true);
              setAccountModalPage("moderation");
            }}
          >
            {text("viewDetails") || "View Details"}
          </button>
        </div>
      )}
    </>
  );
}
