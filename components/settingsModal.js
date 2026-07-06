import { useState, useEffect } from "react";
import { Modal } from "react-responsive-modal";
import { useTranslation } from '@/components/useTranslations';
import { asset, navigate } from '@/lib/basePath';
import { FaGithub } from "react-icons/fa";
import { useMultiplayer } from '@/components/multiplayer/MultiplayerProvider';
import ConfirmModal from './ui/Modal';
import { signOut } from '@/components/auth/auth';
import { toast } from 'react-toastify';

export default function SettingsModal({ shown, onClose, options, setOptions, inCrazyGames, inGameDistribution, multiplayerEmotesEnabled, setMultiplayerEmotesEnabled, session, setSession, ws }) {
    const { t: text } = useTranslation("common");

    // ── Account settings ─────────────────────────────────────────────────
    // Server-backed per-account preferences — NEVER localStorage. Shown only
    // when logged in. Both values ride the ws 'friends' message; checkboxes
    // stay disabled until the first one arrives. Toggles flip optimistically,
    // but the server echoes authoritative state after EVERY write attempt
    // (accepted, cooldown-rejected, or failed), so a refused write snaps the
    // checkbox back instead of lying.
    const loggedIn = !!session?.token?.secret;
    const [accountSettings, setAccountSettings] = useState(null);

    // Ride the provider's single parsed-message stream instead of a raw ws
    // listener (which re-parsed every message a second time).
    const { subscribeMessages } = useMultiplayer();
    useEffect(() => {
        if (!shown || !loggedIn || !ws) return;

        const unsubscribe = subscribeMessages((data) => {
            if (data.type === 'friends') {
                setAccountSettings({
                    allowFriendReq: !!data.allowFriendReq,
                    hideLastSeen: !!data.hideLastSeen,
                });
            }
        });
        ws.send(JSON.stringify({ type: 'getFriends' }));

        return unsubscribe;
    }, [shown, loggedIn, ws, subscribeMessages]);

    // Optimistic flip — the server's 'friends' echo confirms or reverts it.
    const toggleAllowFriendReq = (checked) => {
        setAccountSettings((prev) => ({ ...prev, allowFriendReq: checked }));
        ws?.send(JSON.stringify({ type: 'setAllowFriendReq', allow: checked }));
    };
    const toggleHideLastSeen = (checked) => {
        setAccountSettings((prev) => ({ ...prev, hideLastSeen: checked }));
        ws?.send(JSON.stringify({ type: 'setHideLastSeen', hide: checked }));
    };

    // ── Danger Zone — account deletion (moved here from the moderation view) ──
    // Multi-step confirm. 0 = closed, 1 = warning, 2 = type-to-confirm.
    const [deleteStep, setDeleteStep] = useState(0);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [restoring, setRestoring] = useState(false);

    // Final step: schedules deletion (fast — flag + 30-day grace), then signs out.
    // signOut() reloads + wipes the secret, so the fetch MUST resolve first.
    const username = session?.token?.username || '';
    const confirmMatches = deleteConfirmText.trim().toLowerCase() === username.toLowerCase() && username.length > 0;
    const handleDeleteAccount = async () => {
        if (deleting || !confirmMatches) return;
        setDeleting(true);
        try {
            const res = await fetch(window.cConfig.apiUrl + '/api/deleteAccount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: session?.token?.secret }),
            });
            if (res.ok) {
                setDeleteStep(0);
                signOut();
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || data.message || text("deleteAccountFailed"));
                setDeleting(false);
            }
        } catch (e) {
            toast.error(text("deleteAccountFailed"));
            setDeleting(false);
        }
    };

    // If the account is already within its 30-day deletion grace window, the Danger
    // Zone offers Restore instead of Delete.
    const pendingDeletion = !!session?.token?.pendingDeletion;
    const scheduledDeletionAt = session?.token?.scheduledDeletionAt;
    const handleRestore = async () => {
        if (restoring) return;
        setRestoring(true);
        try {
            const res = await fetch(window.cConfig.apiUrl + '/api/cancelDeletion', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret: session?.token?.secret }),
            });
            if (res.ok) {
                setSession?.((prev) => prev ? { token: { ...prev.token, pendingDeletion: false, scheduledDeletionAt: null } } : prev);
                toast.success(text("accountRestoredBody"));
            } else {
                const data = await res.json().catch(() => ({}));
                toast.error(data.error || text("deleteAccountFailed"));
            }
        } catch (e) {
            toast.error(text("deleteAccountFailed"));
        } finally {
            setRestoring(false);
        }
    };

    const handleUnitsChange = (event) => {
        setOptions((prevOptions) => ({ ...prevOptions, units: event.target.value }));
    };

    const handleMapTypeChange = (event) => {
        setOptions((prevOptions) => ({ ...prevOptions, mapType: event.target.value }));
    };

    const handleLanguageChange = (event) => {
        setOptions((prevOptions) => ({ ...prevOptions, language: event.target.value }));
    };

    if (!options) return null;

    return (
        <Modal id="" styles={{
            modal: {
                zIndex: 100,
                color: 'white',
                padding: '0px',
                borderRadius: '10px',
                top: "0px",
                margin: "0",
                left: "0px",
                maxWidth: '500px',
                textAlign: 'center',
                position: "absolute",
                background: `linear-gradient(0deg, rgba(0, 0, 0, 0.8) 0%, rgba(0, 30, 15, 0.5) 100%), url("${asset('/street2.webp')}")`,
                objectFit: "cover",
                backgroundSize: "cover",
                backgroundPosition: "center",
            },
            closeButton: {
                backgroundColor: 'white'
            }
        }} classNames={
            {
                modal: 'g2_modal'
            }
        }
            open={shown} center onClose={onClose} showCloseIcon={false} animationDuration={0}>

            <div className="g2_nav_ui">
                <h1 className="g2_nav_title">{text("settings")}</h1>
                <div className="g2_nav_hr"></div>

                <button className="g2_nav_text singleplayer red" onClick={onClose}>{text("back")}</button>
            </div>
            <div className="g2_content settingsModal">
                <div style={{ height: "50px" }}></div>


                <div className="settingsModalInner">
                    <label htmlFor="units">{text("units")}: </label>
                    <select className="g2_input" id="units" value={options.units} onChange={handleUnitsChange}>
                        <option value="metric">{text("metric")}</option>
                        <option value="imperial">{text("imperial")}</option>
                    </select>
                </div>

                <div className="settingsModalInner">
                    <label htmlFor="mapType">{text("mapType")}: </label>
                    <select className="g2_input" id="mapType" value={options.mapType} onChange={handleMapTypeChange}>
                        <option value="m">{text("normal")}</option>
                        <option value="s">{text("satellite")}</option>
                        <option value="p">{text("terrain")}</option>
                        <option value="y">{text("hybrid")}</option>
                    </select>
                </div>

                {!inCrazyGames && !inGameDistribution && (<>
                    <div className="settingsModalInner">
                        <label htmlFor="mapType">{text("language")}: </label>
                        <select className="g2_input" id="mapType" value={options.language} onChange={handleLanguageChange}>
                            <option value="en">English</option>
                            <option value="es">Español</option>
                            <option value="fr">Français</option>
                            <option value="de">Deutsch</option>
                            <option value="ru">Русский</option>
                        </select>
                    </div>
                    {typeof setMultiplayerEmotesEnabled === 'function' && (
                        <div className="settingsModalInner">
                            <label htmlFor="mpEmotes">Multiplayer emote reactions</label>
                            <input className="g2_input" type="checkbox" id="mpEmotes" checked={!!multiplayerEmotesEnabled} onChange={() => setMultiplayerEmotesEnabled(!multiplayerEmotesEnabled)} />
                        </div>
                    )}
                </>
                )}

                {/* Account settings — server-backed, logged-in only */}
                {loggedIn && (
                    <>
                        {/* Section header built ONLY from the modal's existing vocabulary:
                            .settingsModalInner gives the same indent as the option rows,
                            the <label> inherits the exact row-label typography, and the
                            g2_nav_hr underline mirrors the modal title's own treatment. */}
                        <div className="settingsModalInner" style={{ marginTop: '25px', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                            <label>{text("accountSettings")}</label>
                            <div className="g2_nav_hr" style={{ width: '100%', margin: 0 }}></div>
                        </div>
                        <div className="settingsModalInner">
                            <label htmlFor="allowFriendReq">{text("allowFriendRequests")}</label>
                            <input
                                className="g2_input"
                                type="checkbox"
                                id="allowFriendReq"
                                checked={!!accountSettings?.allowFriendReq}
                                disabled={accountSettings === null}
                                onChange={(e) => toggleAllowFriendReq(e.target.checked)}
                            />
                        </div>
                        <div className="settingsModalInner">
                            <label htmlFor="hideLastSeen">{text("hideMyLastSeen")}</label>
                            <input
                                className="g2_input"
                                type="checkbox"
                                id="hideLastSeen"
                                checked={!!accountSettings?.hideLastSeen}
                                disabled={accountSettings === null}
                                onChange={(e) => toggleHideLastSeen(e.target.checked)}
                            />
                        </div>

                        {/* Danger Zone — account deletion (hidden in CrazyGames iframe).
                            If a deletion is already scheduled, this becomes a Restore prompt instead. */}
                        {!inCrazyGames && (
                            <>
                                <div className="settingsModalInner" style={{ marginTop: '25px', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                                    <label style={{ color: pendingDeletion ? '#ff9800' : '#ff6b6b' }}>{text("dangerZone")}</label>
                                    <div className="g2_nav_hr" style={{ width: '100%', margin: 0 }}></div>
                                </div>
                                {/* width:auto + stretch — the class's desktop width:max-content would
                                    let the single-line deletion-date sentence overflow the modal */}
                                <div className="settingsModalInner" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '12px', width: 'auto', alignSelf: 'stretch' }}>
                                    {pendingDeletion ? (
                                        <>
                                            <p style={{ color: '#e0e0e0', margin: 0, fontSize: '14px', textAlign: 'left' }}>
                                                {scheduledDeletionAt
                                                    ? text("accountScheduledForDeletion", { date: new Date(scheduledDeletionAt).toLocaleDateString() })
                                                    : text("accountScheduledForDeletionShort")}
                                            </p>
                                            <button
                                                onClick={handleRestore}
                                                disabled={restoring}
                                                style={{
                                                    background: '#2e7d32',
                                                    color: '#fff',
                                                    border: '2px solid #2e7d32',
                                                    borderRadius: '8px',
                                                    padding: '10px 20px',
                                                    cursor: 'pointer',
                                                    fontFamily: '"Lexend", "Lexend Fallback", sans-serif',
                                                    fontSize: '14px',
                                                    opacity: restoring ? 0.6 : 1
                                                }}
                                            >
                                                {text("restoreAccount")}
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <p style={{ color: '#b0b0b0', margin: 0, fontSize: '13px', textAlign: 'left' }}>
                                                {text("dangerZoneSubtitle")}
                                            </p>
                                            <button
                                                onClick={() => { setDeleteConfirmText(''); setDeleteStep(1); }}
                                                style={{
                                                    background: 'transparent',
                                                    color: '#ff6b6b',
                                                    border: '1px solid rgba(220, 53, 69, 0.6)',
                                                    borderRadius: '8px',
                                                    padding: '10px 20px',
                                                    cursor: 'pointer',
                                                    fontFamily: '"Lexend", "Lexend Fallback", sans-serif',
                                                    fontSize: '14px'
                                                }}
                                            >
                                                {text("deleteAccount")}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </>
                )}

                {inCrazyGames && (
                    <a href={navigate("/privacy-crazygames")} target="_blank" rel="noreferrer" style={{ marginTop: '20px', display: 'block', color: "white" }}>Privacy Policy</a>
                )}

                <div style={{height: "40vh"} }></div>

            </div>
            {!inCrazyGames && !inGameDistribution && !process.env.NEXT_PUBLIC_COOLMATH && (
                <div className="g2_slide_in" style={{ position: 'absolute', bottom: '25px', left: '25px', display: 'flex', gap: '8px', zIndex: 10 }}>
                    <a href="https://github.com/codergautam/worldguessr" target="_blank" rel="noreferrer">
                        <button className="g2_hover_effect home__squarebtn gameBtn g2_container_full" aria-label="Github" style={{ width: '50px', height: '50px', padding: '0', color: 'white' }}><FaGithub size={24} /></button>
                    </a>
                    <a href="https://worldguessr.com/privacy.html" target="_blank" rel="noreferrer">
                        <button className="g2_hover_effect gameBtn g2_container_full" aria-label="Terms & Privacy" style={{ height: '50px', padding: '0 12px', color: 'white', fontSize: '13px', whiteSpace: 'nowrap' }}>Terms & Privacy</button>
                    </a>
                </div>
            )}

            {/* Step 1 — warning + consequences */}
            <ConfirmModal
                isOpen={deleteStep === 1}
                onClose={() => setDeleteStep(0)}
                title={text("deleteAccountConfirmTitle")}
                variant="error"
                disableBackdropClose={true}
                actions={
                    <>
                        <button onClick={() => setDeleteStep(0)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                            {text("cancel")}
                        </button>
                        <button onClick={() => setDeleteStep(2)} style={{ background: '#dc3545', border: '2px solid #dc3545' }}>
                            {text("continue")}
                        </button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
                    <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.9)' }}>{text("deleteAccountConfirmBody", { days: 30 })}</p>
                    <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px' }}>{text("deleteAccountLossList")}</p>
                    {session?.token?.supporter && (
                        <div style={{ padding: '12px', background: 'rgba(255, 152, 0, 0.12)', border: '1px solid rgba(255, 152, 0, 0.35)', borderRadius: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>
                            {text("deleteAccountWarningSupporter")}
                        </div>
                    )}
                </div>
            </ConfirmModal>

            {/* Step 2 — type-to-confirm */}
            <ConfirmModal
                isOpen={deleteStep === 2}
                onClose={() => { if (!deleting) setDeleteStep(0); }}
                title={text("deleteAccountFinalTitle")}
                variant="error"
                disableBackdropClose={true}
                actions={
                    <>
                        <button onClick={() => setDeleteStep(0)} disabled={deleting} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
                            {text("cancel")}
                        </button>
                        <button
                            onClick={handleDeleteAccount}
                            disabled={deleting || !confirmMatches}
                            style={{ background: '#dc3545', border: '2px solid #dc3545', opacity: (deleting || !confirmMatches) ? 0.5 : 1 }}
                        >
                            {deleting ? text("deleting") : text("deleteAccountPermanently")}
                        </button>
                    </>
                }
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
                    <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.9)' }}>
                        {text("deleteAccountTypeToConfirm", { username })}
                    </p>
                    <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder={username}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: 'white', fontSize: '14px', fontFamily: '"Lexend", "Lexend Fallback", sans-serif', boxSizing: 'border-box' }}
                    />
                </div>
            </ConfirmModal>
        </Modal>
    );
}