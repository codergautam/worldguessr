import HeadContent from "@/components/headContent";
import { FaDiscord, FaBook, FaMapMarkedAlt } from "react-icons/fa";
import { FaGear, FaRankingStar, FaYoutube } from "react-icons/fa6";
import { publishSession, useSession } from "@/components/auth/auth";
import { fetchWithFallback } from "@/components/utils/retryFetch";
import 'react-responsive-modal/styles.css';
import { useEffect, useLayoutEffect, useMemo, useState, useRef, useCallback } from "react";
import Navbar from "@/components/ui/navbar";
import GameUI from "@/components/gameUI";
import BannerText from "@/components/bannerText";
import shuffle from "@/utils/shuffle";
// findLatLongRandom is dynamically imported when needed to avoid loading Google Maps API on page load
import Link from "next/link";
import React from "react";
import countryMaxDists from '../public/countryMaxDists.json';
import { useTranslation } from '@/components/useTranslations'
import useWindowDimensions from "@/components/useWindowDimensions";
import Script from "next/script";
import sendEvent from "@/components/utils/sendEvent";
import trackVisibleTime from "@/components/utils/visibleTime";
import { useMultiplayer, initialMultiplayerState } from "@/components/multiplayer/MultiplayerProvider";
import { getPlatform } from "@/components/utils/getPlatform";
import { HIDE_ACCOUNT_UI, neutralGateKey } from "@/components/utils/accountUi";
import { duckAudio, setMusicAllowed, setMusicPlaylist, playSfx, preloadSfx, refreshVolumesFromStorage } from "@/components/utils/audio";
import deriveTeamEndFallback from "@/components/utils/teamDuelEndFallback";
import getMyTeam from "@/components/utils/getMyTeam";
import { DUEL_PANO_ENTER_MS } from "@/components/utils/duelIntroTiming";
import 'react-toastify/dist/ReactToastify.css';
import dynamic from "next/dynamic";
import continentFromCode, { ALL_CONTINENTS } from "@/components/utils/continentFromCode";
import { useRouter } from 'next/router';
import { asset, navigate, stripBase } from '@/lib/basePath';
import { preloadPinImages } from '@/lib/markerIcons';
// Pre-existing dynamic chunks: results screen and daily-challenge screen are
// big and only render after a round/onboarding completes. AccountModal stays
// dynamic because it pulls in chart.js (~220 KB) for the XP graph — saving
// that on the critical path is worth the one-time async open.
const RoundOverScreen = dynamic(() => import('@/components/roundOverScreen'), { ssr: false });
const DailyChallengeScreen = dynamic(() => import('@/components/daily/DailyChallengeScreen'), { ssr: false });
const AccountModal = dynamic(() => import('@/components/accountModal'), { ssr: false });
// Conditionally-rendered modals/screens ship as async chunks so they (and the
// react-responsive-modal dep most of them share) stay out of the initial index
// bundle — every KB cut here lands directly on LCP.
// AlertModal/EmoteReactions are too small to be worth a chunk.
const MultiplayerHome = dynamic(() => import("@/components/multiplayerHome"), { ssr: false });
const SetUsernameModal = dynamic(() => import("@/components/setUsernameModal"), { ssr: false });
const SettingsModal = dynamic(() => import("@/components/settingsModal"), { ssr: false });
const OnboardingComplete = dynamic(() => import("@/components/onboardingComplete"), { ssr: false });
const LoginModal = dynamic(() => import("@/components/auth/LoginModal"), { ssr: false });
// CrazyGames only: the link-account prompt for locked modes (see the file).
const SuggestAccountModal = dynamic(() => import("@/components/suggestAccountModal"), { ssr: false });
const MapsModal = dynamic(() => import("@/components/maps/mapsModal"), { ssr: false });
const DiscordModal = dynamic(() => import("@/components/discordModal"), { ssr: false });
const WhatsNewModal = dynamic(() => import("@/components/ui/WhatsNewModal"), { ssr: false });
const PendingNameChangeModal = dynamic(() => import("./pendingNameChangeModal"), { ssr: false });
// Season 1 migration notice. ssr:false + dynamic so it costs the initial bundle
// nothing: for all but one login per account the chunk is never fetched, and on
// the login that does show it the component self-delays past first paint.
const Season1NoticeModal = dynamic(() => import("@/components/season1NoticeModal"), { ssr: false });
// The Stamps shop is its own surface (it used to be a tab in the account
// modal). ssr:false + dynamic keeps the storefront, its previews and the
// leaflet-backed marker pins entirely off the home screen's critical path.
// Cache the loader so the profile can warm this chunk before its wallet opens
// the shop; that handoff must never expose the home screen between modals.
let shopModalImport = null;
const loadShopModal = () => {
    if (!shopModalImport) {
        shopModalImport = import("@/components/shop/ShopModal").catch((error) => {
            shopModalImport = null;
            throw error;
        });
    }
    return shopModalImport;
};
const ShopModal = dynamic(loadShopModal, { ssr: false });
import HudCorner from "@/components/ui/hudCorner";
import PlayerCard from "@/components/ui/playerCard";
import AdFreeChip from "@/components/ui/adFreeChip";
import StampsTile from "@/components/shop/stampsTile";
import AccountBtn from "@/components/ui/accountBtn";
import EmoteReactions from "@/components/emoteReactions";
import GameChat from "@/components/gameChat";
import WelcomeOverlay from "@/components/welcomeOverlay";
import AlertModal from "@/components/ui/AlertModal";
import Modal from "@/components/ui/Modal";
import DailyMenuItem from '@/components/daily/DailyMenuItem';
import CommunityBanner from '@/components/communityBanner';
import msToTime from "@/components/msToTime";
import { toast, ToastContainer } from "react-toastify";
import { inIframe, isForbiddenIframe } from "@/components/utils/inIframe";

import countries from "@/public/countries.json";
import officialCountryMaps from "@/public/officialCountryMaps.json";

import gameStorage from "@/components/utils/localStorage";
import { markSeenLoc, seenLocs } from "@/components/utils/seenLocations";
import { isOfficialMapSlug, orderByFreshness } from "@/shared/locations/repeatGuard.js";
import changelog from "@/components/changelog.json";
import clientConfig from "@/clientConfig";
import { useGoogleLogin } from "@react-oauth/google";
// import haversineDistance from "./utils/haversineDistance";
import StreetView from "./streetview/streetView";
// import SvEmbedIframe from "./streetview/svHandler"; // REMOVED: Using direct StreetView instead of double-iframe setup
// In-house WebGL pano for singleplayer No Move mode — only loaded when that mode runs
const CustomStreetView = dynamic(() => import("./streetview/customStreetView"), { ssr: false });
// import getTimeString, { getMaintenanceDate } from "./maintenanceTime";
// import MaintenanceBanner from "./MaintenanceBanner";
import PlaywireAd from "./bannerAdPlaywire";
import useAdFree from "@/lib/adFree";
import GameDistributionBanner from "./bannerAdGameDistribution";

// Module constants, not inline literals in JSX — same ruling as gameUI.js's
// AD_TYPES_*: stable references hit PlaywireAd's propsEqual `a.types ===
// b.types` fast path instead of an element-wise compare on every render of
// this 5000+ line component.
const HOME_AD_TYPES_SHORT = [[300, 250]];
const HOME_AD_TYPES_TALL = [[320, 50], [300, 250]];
const MULTIPLAYER_AD_TYPES_LEADERBOARD = [[728, 90]];
// Stable identity for absent history (see gameUI.js EMPTY_ARRAY).
const EMPTY_ARRAY = [];

const DUEL_RELOAD_DEFAULT_TOP = 90;
const DUEL_RELOAD_CLEARANCE = 6;
const ROUND_OVER_FADE_MS = 500;
// How long to wait after a multiplayer reveal starts before navigating the pano
// to the next round's preload target. Must outlast BOTH things that would let
// the swap be seen: #streetview's 200ms conceal fade and #miniMapArea's 300ms
// grow to fullscreen. An iframe keeps the old document painted until the new one
// commits and then shows its own dark background, so swapping early reads as a
// black flash.
// Outlasts desktop's 300ms answer-map grow. Mobile's cover takes 600ms and
// the country-guesser fade 500ms — ON PAPER the swap fires before those fully
// land, but an iframe keeps the OLD document painted until the new one
// commits, and Google's embed takes far longer than the remaining gap to
// paint anything. USER RULING July 28: tested extensively on mobile at 450,
// no flash — a bump to 650 was tried and reverted. Don't "fix" this again
// without an observed flash.
// Keep in sync with the copy in components/daily/DailyChallengeScreen.js.
const PANO_PRELOAD_DELAY_MS = 450;
// Reveals additionally wait out the answer map's camera flight before
// navigating the pano iframe. The +450ms swap used to land mid-flight, and
// the embed's document load + WebGL boot + pano fetches collided with the
// fly's rAF frames: the between-rounds micro-stutter (USER RULING Aug 1:
// preload starts after the fly lands; supersedes the fixed-450 part of the
// July 28 ruling for between-rounds reveals only — 450 remains the
// concealment floor everywhere, and stays exact for MP round 1, which has
// the VS intro, no fly, and the most to gain from load headroom).
// Mirror of Map.js REVEAL.flyDurations — keep in sync.
const REVEAL_FLY_MS = { pin: 500, country: 1200, world: 1800 };
const PANO_PRELOAD_MARGIN_MS = 100;
// Public matchmade duel end-screen exits (ranked 1v1, unranked 1v1, 2v2):
// Home / Play Again tear down two Leaflet maps, the SV iframe and the whole
// game tree while un-hiding home in ONE commit — a frame long enough to eat
// the click feedback and stutter home's entrance wave (the July 5 audit
// measured the mount-side twin of this commit at ~1.7s). So the exit is
// covered: mount the opaque mask in its own cheap commit, run the teardown
// under it 50ms later, then reveal home already settled.
const DUEL_END_EXIT_COVER_MS = 50;
const DUEL_END_EXIT_REVEAL_MS = 160;

// After sending a publicDuel/unrankedDuel join we wait this long for the server's
// `queueJoined` ack (ranked also sends `publicDuelRange`). No ack => the join never
// registered server-side, so we bail off the searching screen with a toast instead
// of leaving the user waiting on a queue they were never actually in. The ack is a
// same-tick server reply, so 8s is well above a normal round-trip. (Mirrors the
// mobile WS_QUEUE_CONFIRM_TIMEOUT_MS.)
const WS_QUEUE_CONFIRM_TIMEOUT_MS = 8000;

// Repeat guard, official maps only (World + official country maps). Location
// responses sit in the CDN/browser cache, so back-to-back games can receive the
// identical array; the fetched pool is therefore ordered against the spots this
// player has already seen (see components/utils/seenLocations.js) and every
// pick site walks that order from the front. Same rule on mobile, same helper.
const isOfficialMap = (opts) => isOfficialMapSlug(opts?.location);


export default function Home({ initialScreen, dailyBootstrap } = {}) {

    const { width, height } = useWindowDimensions();
    const router = useRouter();
    const langInitRef = useRef(true);

    const [session, setSession] = useState(false);
    const { data: mainSession } = useSession();
    // A running ad-free pass. One hook, one source of truth (the session's
    // adFreeUntil), shared with gameUI's in-game slot. See lib/adFree.js.
    const adFree = useAdFree(session);
    const [accountModalOpen, setAccountModalOpen] = useState(false);
    // Standalone Stamps shop. Its own flag, deliberately not a page key on the
    // account modal — the two surfaces are independent and can never stack,
    // because the shop only opens from the home screen.
    const [shopModalOpen, setShopModalOpen] = useState(false);
    const [shopModalCoveredEntry, setShopModalCoveredEntry] = useState(false);

    // The account modal already represents deliberate interest in the wallet,
    // so warm the storefront while that surface is open. If the chunk is still
    // loading when the wallet is pressed, leave the profile visible until it is
    // ready instead of flashing the home screen as an accidental fallback.
    useEffect(() => {
        if (!accountModalOpen || session?.token?.stampsEnabled !== true) return;
        loadShopModal().catch((error) => {
            console.error("Failed to preload the Stamps shop:", error);
        });
    }, [accountModalOpen, session?.token?.stampsEnabled]);

    const openShopFromAccount = useCallback(() => {
        loadShopModal()
            .then(() => {
                setShopModalCoveredEntry(true);
                setShopModalOpen(true);
            })
            .catch((error) => {
                // Keep the working profile surface open. Closing it when the
                // destination chunk failed is precisely the flash/dead-end this
                // handoff is designed to prevent.
                console.error("Failed to open the Stamps shop:", error);
            });
    }, []);

    const openShopFromHome = useCallback(() => {
        setShopModalCoveredEntry(false);
        setShopModalOpen(true);
    }, []);

    // ShopModal calls this from a layout effect after its backdrop and surface
    // are in the DOM. Until then the profile stays mounted as the last complete
    // frame, independent of how many renders Next's dynamic wrapper needs.
    const completeShopHandoff = useCallback(() => {
        setAccountModalOpen(false);
    }, []);
    const [screen, setScreen] = useState(initialScreen === "daily" ? "daily" : "home");
    const [loading, setLoading] = useState(false);
    const [mapSwitchMaskShown, setMapSwitchMaskShown] = useState(false);
    const [mapSwitchSawLoading, setMapSwitchSawLoading] = useState(false);
    // game state
    // null, not the {0,0} sentinel, as the INITIAL value: the home sweeper
    // nulls this on arrival at the menu, and a non-null initial made that
    // first sweep a real state change — one extra pre-paint render of the
    // whole Home tree on every cold load. Every reader already guards null.
    const [latLong, setLatLong] = useState(null)
    const [latLongKey, setLatLongKey] = useState(0) // Increment to force refresh even with same coords
    // What the STREET VIEW shows, which during a reveal is not the same thing
    // as `latLong`. `latLong` is the round's answer: the reveal map flies to it
    // and EndBanner scores against it, so it must keep pointing at the round
    // that just ENDED for the whole reveal. The pano meanwhile wants to be
    // loading the round that is about to START. Used by multiplayer and by
    // singleplayer / onboarding / daily (same pattern). Null → fall back to
    // latLong.
    const [panoLocation, setPanoLocation] = useState(null)
    // Singleplayer / onboarding / daily: identity of the pano preload target
    // (`onboarding:2`, `daily:3`, `sp:lat,long`). Parallel to mpPanoRoundRef.
    const spPanoKeyRef = useRef(null);
    // Loaded-tracking is state (concealment must re-render on it) PLUS a ref
    // mirror: the commit fast paths that consult it run inside long-lived
    // closures (the WS message handler, loadLocation called mid-batch), where
    // state reads can be a render stale. The wrapper keeps the two in lockstep
    // so no call site has to remember there are two.
    const [spPanoLoadedKey, _setSpPanoLoadedKey] = useState(null);
    const spPanoLoadedKeyRef = useRef(null);
    const setSpPanoLoadedKey = useCallback((v) => {
        spPanoLoadedKeyRef.current = v;
        _setSpPanoLoadedKey(v);
    }, []);
    // Next SP location reserved during reveal (removed from allLocsArray so it
    // can't be re-rolled). Promoted into latLong on advance.
    const reservedNextLocRef = useRef(null);
    const beginSpPanoPreload = useCallback((loc, key) => {
        if (!loc || !key || spPanoKeyRef.current === key) return;
        spPanoKeyRef.current = key;
        setSpPanoLoadedKey(null);
        setLatLongKey((k) => k + 1);
        setPanoLocation(loc);
    }, []);
    const clearSpPanoPreload = useCallback(() => {
        spPanoKeyRef.current = null;
        setSpPanoLoadedKey(null);
        setPanoLocation(null);
        reservedNextLocRef.current = null;
    }, []);
    const [gameOptionsModalShown, setGameOptionsModalShown] = useState(false);
    // location aka map slug
    const [gameOptions, setGameOptions] = useState({ location: "all", maxDist: 20000, official: true, countryMap: false, communityMapName: "", extent: null, showRoadName: true, timePerRound: 0 }) // rate limit fix: showRoadName true
    const [showAnswer, setShowAnswer] = useState(false)

    const [pinPoint, setPinPointState] = useState(null)
    const pinPointRef = useRef(null)
    const setPinPoint = useCallback((val) => {
        pinPointRef.current = val
        setPinPointState(val)
    }, [])
    const [hintShown, setHintShown] = useState(false)
    const [countryStreak, setCountryStreak] = useState(0)
    const [countryGuessrStreak, setCgStreak] = useState(0)
    const [settingsModal, setSettingsModal] = useState(false)
    const [mapModal, setMapModal] = useState(false)
    const [friendsModal, setFriendsModal] = useState(false)
    // In-duel reload button normally sits at (10, 90) under the left HP bar.
    // A team duel stacks two name rows in the centered pill, and a long
    // teammate name can widen it far enough left to swallow the button —
    // measure the real pill rect and drop below it only on actual overlap.
    const [duelReloadBtnTop, setDuelReloadBtnTop] = useState(DUEL_RELOAD_DEFAULT_TOP)
    const duelReloadBtnRef = useRef(null)
    const [pendingNameChangeModal, setPendingNameChangeModal] = useState(false)
    const [dismissedNameChangeBanner, setDismissedNameChangeBanner] = useState(false)
    const [dismissedBanBanner, setDismissedBanBanner] = useState(false)
    const [dismissedDeletionBanner, setDismissedDeletionBanner] = useState(false)
    const [timeOffset, setTimeOffset] = useState(0)
    const timeSyncRef = useRef({ bestRtt: Infinity, lastSyncAt: 0, lastServerNow: 0 })
    const [loginQueued, setLoginQueued] = useState(false);
    // The email + code login modal (components/auth/LoginModal.js). Opened by
    // window.login, which auth.js signIn() calls from every sign-in prompt.
    const [loginModalOpen, setLoginModalOpen] = useState(false);
    const [options, setOptions] = useState({
    });
    const [multiplayerError, setMultiplayerError] = useState(null);
    const [miniMapShown, setMiniMapShown] = useState(false)
    const [multiplayerEndAnswerHoldExpired, setMultiplayerEndAnswerHoldExpired] = useState(false);
    const multiplayerEndAnswerHoldTimerRef = useRef(null);
    const [duelEndExitMaskShown, setDuelEndExitMaskShown] = useState(false);
    const [duelEndExitMaskRevealing, setDuelEndExitMaskRevealing] = useState(false);
    const duelEndExitTimersRef = useRef([]);
    // Queue-join confirmation watchdog: pending timeout id + a mirror of the latest
    // multiplayerState so the (delayed) timeout can read fresh state. See
    // WS_QUEUE_CONFIRM_TIMEOUT_MS and armQueueConfirmWatchdog().
    const queueConfirmTimerRef = useRef(null);
    const mpStateRef = useRef(null);
    const [accountModalPage, setAccountModalPage] = useState("profile");
    const [mapModalClosing, setMapModalClosing] = useState(false);
    const loadLocationRequestRef = useRef(0);
    // Singleplayer-family rounds (SP, country/continent guesser, onboarding,
    // daily) open under the loading cover for at least SP_MIN_LOADING_MS —
    // including preload commits whose pano is already showing the next round.
    // The instant swap read as a glitchy snap; a fixed dwell gives every
    // advance the same rhythm. Real loads longer than the floor are
    // untouched, and multiplayer never goes through here (server-driven
    // timing owns that feel).
    const spLoadingFloorRef = useRef(0);
    const spRoundLoadingTokenRef = useRef(0);
    const beginSpRoundLoading = useCallback((panoReady) => {
        const token = ++spRoundLoadingTokenRef.current;
        spLoadingFloorRef.current = Date.now() + SP_MIN_LOADING_MS;
        setLoading(true);
        // A ready preload fires no onLoad (nothing new navigates), so the
        // cover is cleared by this timer; anything else re-begins loading
        // first and invalidates the token. Real loads clear via the pano
        // onLoad handlers, which respect the same floor.
        //
        // rAF first, timer second: the dwell is measured from the frame the
        // cover actually PAINTS, not from this call. On slow machines the
        // advance commit itself can stall past the whole dwell, and a
        // call-relative timer would expire before the cover's first paint —
        // one-frame flash instead of a smooth beat. Background tabs park
        // rAF, which only holds the cover longer; the token guard keeps a
        // parked clear from ever touching a newer round.
        if (!panoReady) return;
        requestAnimationFrame(() => {
            if (spRoundLoadingTokenRef.current !== token) return;
            setTimeout(() => {
                if (spRoundLoadingTokenRef.current === token) setLoading(false);
            }, SP_MIN_LOADING_MS);
        });
    }, []);
    const [pendingCountryGuessrLoad, setPendingCountryGuessrLoad] = useState(0);
    const countryGuessrLoadRecoveryRef = useRef(0);
    const MAP_MODAL_CLOSE_ANIMATION_MS = 400;
    const SP_MIN_LOADING_MS = 300;

    // Background music plays only while the game surface is mounted — every
    // route that renders Home (/, lang roots, /daily) gets it, standalone
    // pages (/leaderboard, /map, /user, ...) never do. Unmount fades it out.
    useEffect(() => {
        setMusicAllowed(true);
        return () => setMusicAllowed(false);
    }, []);

    useEffect(() => {
        if (!mapSwitchMaskShown) return;

        if (loading) {
            if (!mapSwitchSawLoading) setMapSwitchSawLoading(true);
            return;
        }

        if (mapSwitchSawLoading) {
            setMapSwitchMaskShown(false);
            setMapSwitchSawLoading(false);
        }
    }, [mapSwitchMaskShown, mapSwitchSawLoading, loading]);

    useEffect(() => {
        if (!mapSwitchMaskShown) return;

        const mapSwitchMaskTimeout = setTimeout(() => {
            setMapSwitchMaskShown(false);
            setMapSwitchSawLoading(false);
        }, 8000);

        return () => clearTimeout(mapSwitchMaskTimeout);
    }, [mapSwitchMaskShown]);

    useEffect(() => {
        // Bounded: this only ever cleared itself if the CMP link showed up, so
        // on every build where it never does (most of them) it woke the main
        // thread every 2s for the whole life of the tab. The link is injected
        // by the consent script during load, so 30 tries (~60s) is well past
        // any point it could still appear.
        let tries = 0;
        let hideInt = setInterval(() => {
            const el = document.getElementById("cmpPersistentLink");
            if (el) {
                el.style.display = "none";
                clearInterval(hideInt);
                return;
            }
            if (++tries >= 30) clearInterval(hideInt);
        }, 2000);

        return () => clearInterval(hideInt);
    }, [])

    // ONE landing for every sign-in path (Google popup, email + code modal).
    // publishSession is not optional: the local setSession below only feeds
    // THIS page; publishSession is what tells every other subscriber
    // (pages/_app.js owns `--site-bg` off it, so without this an owner keeps
    // the stock background until they refresh).
    const applySignIn = (data, { method, isNew }) => {
        // GA4 recommended names. A fresh Google account has no username yet
        // (SetUsernameModal gates on the same); the email flow reports
        // isNewAccount because its new accounts already carry a name.
        sendEvent(isNew ? "sign_up" : "login", { method });
        publishSession(data);
        setSession({ token: data });
        window.localStorage.setItem("wg_secret", data.secret);
    };

    let googleLogin = null;
    if (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
        // eslint-disable-next-line react-hooks/rules-of-hooks
        googleLogin = useGoogleLogin({
            onSuccess: tokenResponse => {
                let signedIn = false;
                fetchWithFallback(
                    clientConfig().authUrl + "/api/googleAuth",
                    clientConfig().apiUrl + "/api/googleAuth",
                    {
                        body: JSON.stringify({ code: tokenResponse.code }),
                        method: "POST",
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    },
                    'googleAuthLogin',
                    {}
                ).then((res) => res.json()).then((data) => {
                    if (data.secret) {
                        signedIn = true;
                        applySignIn(data, { method: "google", isNew: !data.username });
                    } else if (data.error) {
                        // Explicit server refusal — e.g. a blocklisted perm-banned
                        // identity trying to re-register (403 from googleAuth's
                        // blockIfBannedIdentity). Show the real reason instead of
                        // the generic contact-support line; longer autoClose so a
                        // ban message isn't gone before it's read.
                        console.error("[Auth] Sign-in refused:", data.error);
                        toast.error(data.error, { autoClose: 12000 });
                    } else {
                        console.error("[Auth] No secret received from server");
                        toast.error("Login error, contact support if this persists (2)")
                    }

                }).catch((e) => {
                    console.error("[Auth] Google OAuth failed after all retries:", e.message);
                    toast.error(`Login failed: ${e.message}. Please try again or contact support.`);
                }).finally(() => {
                    // On success the Google button stays in its busy state while
                    // the login modal plays its close: clearing here would land
                    // in the same render as the session and flash the idle
                    // button for a frame. The flag is unreachable once signed
                    // in, and signOut() reloads the page.
                    if (!signedIn) setLoginQueued(false);
                })
            },
            onError: error => {
                setLoginQueued(false);
                toast.error("Login error, contact support if this persists")
                console.error("login error", error);
            },
            onNonOAuthError: error => {
                setLoginQueued(false);
                console.error("login non oauth error", error);
                toast.error("Login error, contact support if this persists (1)")

            },
            flow: "auth-code",
            // GD used to get `ux_mode: "redirect"` here, which navigated the
            // whole page to accounts.google.com. GD forbids the game leaving
            // its page, so that was an outright policy violation and it got us
            // rejected. GD is now in HIDE_ACCOUNT_UI, so nothing can reach
            // this; the config is gone as well so a future surface can't
            // resurrect the redirect by accident.
        });

    }

    // Sign in with Apple on the web: Apple's JS SDK in popup mode hands back an
    // identity token, which goes to the SAME /api/googleAuth branch mobile
    // uses (apple_identity_token). Needs NEXT_PUBLIC_APPLE_CLIENT_ID = the
    // Services ID registered for this domain (Apple Developer -> Identifiers
    // -> Services IDs: domain verified, the page origin listed as a Return
    // URL), and the server accepts that audience via APPLE_WEB_CLIENT_ID.
    // Unset = no Apple button on web. Apple refuses localhost, so test it on
    // the real domain (or a tunnel on a registered host).
    const [appleQueued, setAppleQueued] = useState(false);
    const appleLogin = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ? async () => {
        if (appleQueued) return;
        setAppleQueued(true);
        let signedIn = false;
        try {
            if (!window.AppleID) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
                    s.async = true;
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('Apple sign-in script failed to load'));
                    document.head.appendChild(s);
                });
            }
            window.AppleID.auth.init({
                clientId: process.env.NEXT_PUBLIC_APPLE_CLIENT_ID,
                scope: 'name email',
                redirectURI: window.location.origin,
                usePopup: true,
            });
            const result = await window.AppleID.auth.signIn();
            const idToken = result?.authorization?.id_token;
            if (!idToken) throw new Error('No Apple identity token');
            const res = await fetchWithFallback(
                clientConfig().authUrl + "/api/googleAuth",
                clientConfig().apiUrl + "/api/googleAuth",
                {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ apple_identity_token: idToken, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
                },
                'appleAuthLogin',
                {}
            );
            const data = await res.json();
            if (data.secret) {
                signedIn = true;
                applySignIn(data, { method: "apple", isNew: !data.username });
            } else {
                console.error("[Auth] Apple sign-in refused:", data.error);
                toast.error(data.error || "Login error, contact support if this persists", { autoClose: 12000 });
            }
        } catch (e) {
            // Backing out of Apple's popup is not an error.
            const code = e?.error || '';
            if (code !== 'popup_closed_by_user' && code !== 'user_cancelled_authorize') {
                console.error("[Auth] Apple sign-in failed:", code || e?.message || e);
                toast.error("Apple sign-in failed. Please try again.");
            }
        } finally {
            // Same rule as Google: on success the button stays busy through
            // the modal's close (unreachable once signed in; signOut reloads).
            if (!signedIn) setAppleQueued(false);
        }
    } : null;



    const [isApp, setIsApp] = useState(false);
    const [inCrazyGames, setInCrazyGames] = useState(false);
    const [maintenance, setMaintenance] = useState(false);


    useEffect(() => {

        if (!inCrazyGames) {
            setSession(mainSession)
        }
    }, [JSON.stringify(mainSession), inCrazyGames])

    useEffect(() => {
        const handlePageClose = () => {
            window.isPageClosing = true;
            // Reset flag if unload is cancelled by another handler
            setTimeout(() => { window.isPageClosing = false; }, 0);
        };
        window.addEventListener('beforeunload', handlePageClose);
        return () => window.removeEventListener('beforeunload', handlePageClose);
    }, [])

    // this breaks stuff like logout and set username reloads
    // useEffect(() => {
    //   window.onbeforeunload = function(e) {
    //     if(screen === "home") {

    //     } else  {
    //       e.preventDefault();
    //       return e.returnValue = 'Are you sure you want to leave?';
    //     }
    //   }
    // }, [screen])


    const [config, setConfig] = useState(null);
    const [eloData, setEloData] = useState(null);

    // Use session data for initial display only, then fetch fresh data when modal opens
    useEffect(() => {
        if (!session?.token?.username) return;

        // Only use session data as initial fallback when eloData hasn't been set yet
        // Don't overwrite fresh data (e.g., from websocket updates) with stale session data
        setEloData((prev) => {
            if (prev !== null) return prev; // Keep existing fresh data
            if (session.token.elo === undefined) return prev;
            return {
                id: session.token.accountId,
                elo: session.token.elo,
                rank: session.token.rank,
                league: session.token.league,
                duels_wins: session.token.duels_wins,
                duels_losses: session.token.duels_losses,
                duels_tied: session.token.duels_tied,
                win_rate: session.token.win_rate
            };
        });

        // Fetch fresh data when account modal opens (to get updated elo after games)
        if (accountModalOpen) {
            fetch(clientConfig().apiUrl + "/api/eloRank?username=" + session.token.username+"&secret=" + session.token.secret)
                .then((res) => res.json())
                .then((data) => {
                    if (data && data.elo !== undefined) {
                        setEloData(data);
                        // Update session with fresh elo data to prevent stale data issues
                        setSession((prev) => ({
                            ...prev,
                            token: {
                                ...prev?.token,
                                elo: data.elo,
                                rank: data.rank,
                                league: data.league,
                                duels_wins: data.duels_wins,
                                duels_losses: data.duels_losses,
                                duels_tied: data.duels_tied,
                                win_rate: data.win_rate
                            }
                        }));
                    }
                })
                .catch(() => {}); // Keep existing data on error
        }
    }, [session?.token?.username, accountModalOpen])
    // The rating count-up and its width reservation moved into PlayerCard,
    // which now owns BOTH counters (rating and Stamps balance). They used to
    // live in two files and the only thing keeping the twins in step was that
    // each happened to call the same hook.
    // Warm the maps-modal chunk while the menu idles. It's next/dynamic
    // (ssr:false), so the first open otherwise pays the whole fetch+evaluate
    // inside the click — measured as a 2.3s EvaluateScript task on a
    // CPU-throttled dev build.
    useEffect(() => {
        const warm = () => { import("@/components/maps/mapsModal").catch(() => {}); };
        if (typeof window !== "undefined" && "requestIdleCallback" in window) {
            const id = window.requestIdleCallback(warm, { timeout: 8000 });
            return () => window.cancelIdleCallback(id);
        }
        const t = setTimeout(warm, 3500);
        return () => clearTimeout(t);
    }, []);
    useEffect(() => {
        const clientConfigData = clientConfig();
        setConfig(clientConfigData);
        window.cConfig = clientConfigData;

        if (window.location.search.includes("app=true")) {
            setIsApp(true);
        }
        if (window.location.search.includes("instantJoin=true")) {
            // crazygames
        }


        async function crazyAuthListener() {
          // Never let this reject. It runs both as `.then(finish)` below and as
          // the SDK's registered auth-listener callback; an unguarded throw (the
          // SDK being disabled / not yet initialized on this domain) would escape
          // as an unhandled promise rejection.
          try {
            const user = await window.CrazyGames.SDK.user.getUser();
            if (user) {
                const token = await window.CrazyGames.SDK.user.getUserToken();
                if (token && user.username) {
                    // /api/crazyAuth
                    let loadingStopCalled = false;
                    const callLoadingStop = () => {
                        if (loadingStopCalled) return;
                        loadingStopCalled = true;
                        try {
                            window.CrazyGames.SDK.game.loadingStop();
                        } catch (e) { }
                    };

                    const crazyAuthStart = performance.now();
                    fetch(clientConfigData.apiUrl + "/api/crazyAuth", {
                        method: "POST",
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ token, username: user.username })
                    }).then((res) => {
                        // Call loadingStop immediately when response is received (before JSON parsing)
                        callLoadingStop();
                        return res.json();
                    }).then((data) => {
                        if (data.secret && data.username) {
                            // Store full auth data including extended fields (elo, rank, etc.)
                            // Shared store too — CrazyGames players buy
                            // backgrounds like everyone else, and useSession()
                            // never verifies on this path (no wg_secret is
                            // stored), so this call is the ONLY thing that can
                            // tell pages/_app.js the session exists.
                            publishSession(data);
                            setSession({ token: data })
                            // verify the ws
                            window.verifyPayload = JSON.stringify({ type: "verify", secret: data.secret, username: data.username, platform: getPlatform(), teamSupport: true });

                            setWs((prev) => {
                                if (prev) prev.send(window.verifyPayload)
                                return prev;
                            });
                        } else if (data.error) {
                            // Explicit server refusal (blocklisted identity
                            // re-signup from crazyAuth) — show the real reason.
                            console.error("[CrazyAuth] sign-in refused:", data.error);
                            toast.error(data.error, { autoClose: 12000 });
                        } else {
                            toast.error("CrazyGames auth failed")
                        }
                    }).catch((e) => {
                        // Call loadingStop in case of network error (where first .then() never ran)
                        callLoadingStop();
                        const crazyAuthDuration = (performance.now() - crazyAuthStart).toFixed(0);
                        console.error(`[CrazyAuth] failed (took ${crazyAuthDuration}ms)`, e)
                    });

                }
            } else {
                // user not logged in
                // verify with not_logged_in
                let rc = gameStorage.getItem("rejoinCode");

                window.verifyPayload = JSON.stringify({
                    type: "verify", secret: "not_logged_in", username: "not_logged_in",
                    rejoinCode: rc, platform: getPlatform(), teamSupport: true
                });
                setWs((prev) => {
                    if (prev) prev.send(window.verifyPayload)
                    return prev;
                });
            }
          } catch (e) {
            console.error("crazygames auth listener failed", e);
          }
        }

        function finish() {
            const onboardingCompletedd = gameStorage.getItem("onboarding");
            if (onboardingCompletedd !== "done") {
                // CrazyGames sits outside the onboarding A/B — always the old
                // modal flow.
                const started = startOnboarding();
                if (started) setWelcomeOverlayShown(true);
            }
            else setOnboardingCompleted(true)

            if (window.location.search.includes("map=")) {
                // get map slug map=slug from url
                const params = new URLSearchParams(window.location.search);
                const mapSlug = params.get("map");
                hasEnteredSingleplayer.current = true;
                setScreen("singleplayer")

                openMap(mapSlug)
            }
        }
        if (window.location.search.includes("crazygames")) {
            setInCrazyGames(true);
            window.inCrazyGames = true;
            setLoading(true)

            window.onCrazyload = () => {

                // initialize the sdk
                try {
                    window.CrazyGames.SDK.init().then(async () => {
                        setLoading(false)
                        try {
                            window.CrazyGames.SDK.game.loadingStart();
                        } catch (e) { }

                        // gameStorage's CrazyGames.SDK.data store only became
                        // readable now — earlier renders seeded the audio
                        // volume caches with defaults, orphaning saved values.
                        refreshVolumesFromStorage();
                        // Same disease, React-state edition: these mount-time
                        // seeds also read the pre-init void. Re-pull each one.
                        // loadOptions matters most: its write-through effect
                        // would otherwise stomp the saved blob with defaults
                        // on the first settings change of the session.
                        // (rejoinCode needs no repair — sendVerify's CG branch
                        // waits for window.verifyPayload, built post-init.)
                        loadOptions();
                        try {
                            setMultiplayerEmotesEnabled(gameStorage.getItem('multiplayerEmotesEnabled') !== 'false');
                            setMultiplayerChatEnabled(gameStorage.getItem('multiplayerChatEnabled') !== 'false');
                            const savedStreak = parseInt(gameStorage.getItem('countryStreak'));
                            if (!isNaN(savedStreak)) setCountryStreak(savedStreak);
                            const savedCgStreak = parseInt(gameStorage.getItem('countryGuessrStreak'));
                            if (!isNaN(savedCgStreak)) setCgStreak(savedCgStreak);
                        } catch (e) { }

                        crazyAuthListener().then(() => {
                            // check if onboarding is done
                            finish()
                        })


                        window.CrazyGames.SDK.user.addAuthListener(crazyAuthListener);

                    }).catch((e) => {
                        finish()
                        console.error("crazygames sdk init failed", e)
                        setLoading(false)
                    })
                } catch (e) {
                    console.error("crazygames sdk init failed", e)
                    finish()
                    setLoading(false)
                }
            }

            if (window.CrazyGames) {
                window.onCrazyload();
            }
        }
        initialMultiplayerState.createOptions.displayLocation = text("allCountries")

        return () => {
            try {
                if (!window.CrazyGames || !window.CrazyGames.SDK || !window.CrazyGames.SDK.user) return;
                window.CrazyGames.SDK.user.removeAuthListener(crazyAuthListener);
            } catch (e) {
                console.error("crazygames remove auth listener error", e)
            }
        }

    }, []);

    const [onboarding, setOnboarding] = useState(null);
    // Mirror DailyChallengeScreen's internal phase so the navbar can hide its
    // back button only during the actual round, not on landing/results.
    const [dailyPhase, setDailyPhase] = useState(null);
    const [onboardingCompleted, setOnboardingCompleted] = useState(null);
    const [otherOptions, setOtherOptions] = useState([]); // for country guesser
    const [showCountryButtons, setShowCountryButtons] = useState(true);
    const [countryGuesserCorrect, setCountryGuesserCorrect] = useState(false);
    const [welcomeOverlayShown, setWelcomeOverlayShown] = useState(false);
    // A new user's ENTIRE bootstrap — variant fetch → startOnboarding →
    // GameUI stamping the round-1 location (which sets loading=true in the
    // same batch) — expressed as one continuous condition. Handing off
    // between separate flags left one-frame gaps that blanked the spinner.
    // Deliberately ignores welcomeOverlayShown: cutting the spinner when the
    // modal STARTS its 0.4s fade left a beat of raw background — instead the
    // spinner keeps running and the modal (z-10000) fades in over it.
    // {0,0} is the cleared-location sentinel, not a real location.
    const newUserBooting = onboardingCompleted === false
        && !onboarding?.completed
        && (!latLong || (latLong.lat === 0 && latLong.long === 0));
    // Gates the onboarding GameUI mount — and with it the round-1 street view
    // preload — until load + idle while the welcome overlay is up (modal
    // variant only). See the effect next to the onboarding-start effect.
    const [svPreloadReady, setSvPreloadReady] = useState(false);
    const [countryGuessrMode, setCountryGuessrMode] = useState({ subMode: "country", region: "all" });
    const hasEnteredSingleplayer = useRef(false);
    const lastSingleplayerScreen = useRef(null);

    // Guest clicked a login-locked mode: '2v2' | 'ranked' picks the variant
    // copy the LoginModal renders as its title/subtitle. (leaveConfirm-style)
    // it survives closing so the modal doesn't blank mid fade-out; it is
    // replaced on the NEXT open (openLoginModal), never cleared on close.
    const [linkGoogleModal, setLinkGoogleModal] = useState(null);
    // Inviter's username when the upsell came from a party-invite gate
    // (server's hostName on the gameJoinError). Personalizes the modal copy;
    // replaced whenever the modal opens from any other surface.
    const [linkGoogleInviter, setLinkGoogleInviter] = useState(null);
    // CrazyGames only: open/close of the CG-branded SuggestAccountModal (the
    // variant + inviter above are shared with the LoginModal path).
    const [linkGoogleModalOpen, setLinkGoogleModalOpen] = useState(false);
    // Non-null only while the modal is up from the periodic home prompt (the
    // 7-day effect below): `{ repeat }`. Any periodic open is unprompted, so
    // the email field must not autofocus on touch devices (LoginModal
    // `unprompted`: a keyboard never ambushes a phone 2.5s after landing);
    // a REPEAT show also carries the quiet "Don't show this again" opt-out.
    const [periodicLoginPrompt, setPeriodicLoginPrompt] = useState(null);
    // THE one way the email + code LoginModal opens. Every surface (navbar /
    // onboarding AccountBtn via window.login, the locked-mode upsells, the
    // periodic home prompt) lands here, so no copy flag can survive from a
    // previous open. Stable (setters only) so effects may depend on it.
    const openLoginModal = useCallback(({ variant = null, inviterName = null, periodic = null } = {}) => {
        setLinkGoogleModal(variant);
        setLinkGoogleInviter(inviterName);
        setPeriodicLoginPrompt(periodic);
        setLoginModalOpen(true);
    }, []);
    // ONE entry for every login-locked surface (Ranked, 2v2, the 2v2 invite
    // gate): the LoginModal opens with the mode's copy. CrazyGames links the
    // platform account through its SDK, not through our login, so there the
    // CG-branded SuggestAccountModal opens instead (its CTA is the SDK auth
    // prompt; the CG auth listener above completes the session + ws
    // re-verify, which is also what retries a gated party join). Reads
    // window.inCrazyGames (stamped with the state) so the ws handler's
    // closure is never stale.
    const openLoginUpsell = (variant, inviterName = null) => {
        if (typeof window !== 'undefined' && window.inCrazyGames) {
            setLinkGoogleInviter(inviterName);
            setLinkGoogleModal(variant);
            setLinkGoogleModalOpen(true);
            return;
        }
        openLoginModal({ variant, inviterName });
    };
    // window.login opens the modal with the plain "Welcome" copy. Unconditional
    // (not inside the Google block above): a build with no Google client id
    // must still be able to sign in, and auth.js signIn() calls this from
    // every prompt.
    useEffect(() => {
        window.login = () => openLoginModal();
    }, [openLoginModal]);
    // Party code whose join bounced off the server's guest 2v2 gate
    // ("Link your Google account to play 2v2"). Google sign-in is a popup
    // (no reload), so after linking, the account verify ack on this same
    // socket retries the join — invite link → sign in → friend's lobby.
    const joinAfterLoginRef = useRef(null);
    // Closing the login modal BY HAND (the ×, backdrop, Escape, the opt-out
    // link) abandons any pending gated-join retry; the post-login close goes
    // through the session effect, not here, so a successful sign-in keeps it.
    const closeLoginModal = () => { setLoginModalOpen(false); joinAfterLoginRef.current = null; };
    // Last code a joinPrivateGame was SENT with — stamped synchronously at the
    // send site. The gate-error handlers must read this, NOT joinOptions
    // .gameCode: on a deep link the state stamp races the server's rejection
    // (boot-storm renders commit late), and the subscribe closure still sees
    // null while the manual join screen path had it in state all along.
    const lastJoinCodeRef = useRef(null);
    // Fresh session at verify-ack time. The ws subscribe closure only refreshes
    // on multiplayerState changes, so its `session` can predate the sign-in
    // that triggered the ack — the retry must read through this ref to tell a
    // fresh signup (no username yet) from an existing account.
    const sessionRef = useRef(null);
    useEffect(() => { sessionRef.current = session; }, [session]);
    // Park a party code in the URL (no navigation) so it survives the
    // first-run username modal's post-save reload: the boot lands on the
    // existing ?party= deep-link auto-join, now as a named account.
    const parkPartyJoin = (code) => {
        try {
            const params = new URLSearchParams(window.location.search);
            params.set('party', String(code));
            window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
        } catch (e) { }
    };
    const [showDiscordModal, setShowDiscordModal] = useState(false);
    const [singlePlayerRound, setSinglePlayerRound] = useState(null);
    const [partyModalShown, setPartyModalShown] = useState(false);
    const [selectCountryModalShown, setSelectCountryModalShown] = useState(false);
    const [connectionErrorModalShown, setConnectionErrorModalShown] = useState(false);

    // Leave/forfeit confirmation (replaces window.confirm). The payload
    // survives closing so the message doesn't blank mid fade-out animation.
    const [leaveConfirm, setLeaveConfirm] = useState(null);
    const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

    // Friend-invite accept confirmation: accepting while in a live game
    // forfeits it server-side (acceptInvite → removePlayer), which can cost
    // ELO or count as an instant loss. Same payload-survives-close pattern
    // as leaveConfirm above.
    const [inviteConfirm, setInviteConfirm] = useState(null);
    const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false);


    // Build-time platform flags, same pattern as inPoki below: NEXT_PUBLIC_*
    // is inlined by Next at compile time, identical in the server and client
    // bundles, so a plain constant can't cause a hydration mismatch. These
    // used to be useState(false) + a post-paint useEffect flip, which painted
    // one wrong frame (login button / Ranked button / footer links visible)
    // on every CoolMath and GameDistribution load.
    const inCoolMathGames = process.env.NEXT_PUBLIC_COOLMATH === "true";
    const inGameDistribution = process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true";
    // Poki mirrors the CoolMath treatment for account features: no login surface,
    // so ranked/2v2 (which require an account) and social links are hidden too.
    const inPoki = process.env.NEXT_PUBLIC_POKI === "true";
    // 6x is a Poki-style accountless zip (relative assets, unknown mount path),
    // but UNLIKE the other portals it keeps the Playwire ad stack — never add
    // it to the ad-slot exclusion lists below.
    const inSixX = process.env.NEXT_PUBLIC_6X === "true";
    const [navSlideOut, setNavSlideOut] = useState(false);
    // IS THE TOP-RIGHT COLUMN LEAVING WITH THE MENU, OR JUST MOVING?
    //
    // Most destinations unmount it, so it fades out alongside the footer — it
    // lives outside .home__content and would otherwise hard-pop at the flip.
    // The matchmaking queue does NOT unmount it: the same element stays on
    // screen and only changes inset (.hudCorner--tight). Fading it there meant
    // the card dissolved for 300ms and then cut back in, a corner over, which
    // is two edits where the eye expects one move. On those destinations it
    // keeps its opacity and SLIDES to the new inset instead.
    //
    // Known at press time and nowhere else: during the slide-out the screen is
    // still "home", so no piece of state yet says where we are going.
    const [cornerLeaving, setCornerLeaving] = useState(false);

    // Play the nav slide-out animation, then run the action once it finishes.
    // Every main-menu button that leaves the home screen must go through this —
    // acting immediately unmounts the menu with no transition.
    //
    // `keepCorner` is for destinations that keep the top-right column mounted
    // (see cornerLeaving above). Passing it where the column actually unmounts
    // would bring back the hard pop the fade exists to hide.
    const navSlideOutThen = (action, { keepCorner = false } = {}) => {
        setNavSlideOut(true);
        setCornerLeaving(!keepCorner);
        setTimeout(() => {
            setNavSlideOut(false); // Reset for next use
            setCornerLeaving(false);
            action();
        }, 300);
    };

    // Forum SSO. On top-level web, go straight into DiscourseConnect:
    // wg_secret is already in the localStorage /discourse-sso reads, so the
    // bridge would only copy it onto itself. Embedded contexts (CrazyGames)
    // can't do that — crazyAuth keeps the secret in React state only (never
    // localStorage), and the iframe origin is a crazygames domain anyway — so
    // mint a one-time code and hand the session to top-level
    // www.worldguessr.com (the origin /discourse-sso reads localStorage on)
    // before continuing to the forum.
    // Used by the "Join our community" banner button.
    const openForum = async () => {
        let forumSecret = null;
        try { forumSecret = window.localStorage.getItem("wg_secret"); } catch (e) { }
        if (!forumSecret) forumSecret = session?.token?.secret || null;
        if (!forumSecret) return window.open("https://worldguessr.forum", "_blank");
        // Cross-origin parents throw on window.top access; that means iframe
        const embedded = (() => { try { return window.self !== window.top; } catch { return true; } })();
        if (!embedded) return window.open("https://worldguessr.forum/session/sso", "_blank");
        try {
            const resp = await fetch(clientConfig().apiUrl + "/api/forumBridge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "create", secret: forumSecret }),
            });
            const data = await resp.json();
            if (data.code) return window.open("https://www.worldguessr.com/forum-bridge?code=" + data.code, "_blank");
        } catch (e) { }
        window.open("https://worldguessr.forum", "_blank");
    };

    // Daily challenge navigation (in-app pushState, no real Next route change)
    const screenRef = useRef('home');
    useEffect(() => { screenRef.current = screen; }, [screen]);
    const isDailyPath = useCallback((p) => /^\/(?:(?:es|fr|de|ru|en)\/)?daily$/.test(p || ''), []);
    const enterDailyMode = useCallback(() => {
        // Poki (and 6x) host each deploy at a nested path with document-
        // RELATIVE assets (assetPrefix '.'), so rewriting the URL to /daily
        // makes every later lazy-chunk request (e.g. DailyChallengeScreen's
        // next/dynamic chunk) resolve against the CDN root and 404 — React
        // then tears down to a blank page. The iframe URL is invisible on
        // those portals anyway; skip the URL sync entirely. exitDailyMode and
        // the screen→URL sync effect self-guard via isDailyPath(), which can
        // never match when nothing was pushed.
        if (!inPoki && !inSixX && typeof window !== 'undefined' && !isDailyPath(window.location.pathname)) {
            const lang = (typeof window !== 'undefined' && window.language) || 'en';
            const dailyPath = lang === 'en' ? '/daily' : `/${lang}/daily`;
            window.history.pushState({ wgDaily: true }, '', dailyPath);
        }
        setNavSlideOut(true);
        setTimeout(() => {
            setNavSlideOut(false);
            setScreen('daily');
        }, 300);
    }, [isDailyPath]);
    const exitDailyMode = useCallback(() => {
        if (typeof window !== 'undefined' && isDailyPath(window.location.pathname)) {
            // Infer locale from current path: /daily → /, /es/daily → /es, etc.
            const match = /^\/(es|fr|de|ru|en)\/daily$/.exec(window.location.pathname);
            const target = match ? `/${match[1]}` : '/';
            window.history.pushState({}, '', target);
        }
        setScreen('home');
    }, [isDailyPath]);

    // HOME SWEEPER — the single choke point for "arriving on the menu".
    // Every exit to home (back button, ws kick, gameCancelled, join errors,
    // connection loss, daily/onboarding exits, browser popstate) must drop
    // the round's location AND the loading cover. Per-exit inline cleanup was
    // tried (Aug 17) and immediately grew two bug classes: exits that forgot
    // setLatLong left a live SV embed streaming behind the menu, and exits
    // that remembered it but forgot setLoading latched the menu behind the
    // loading overlay forever — nulling latLong unmounts the iframe whose
    // onLoad is the only thing that clears `loading`. One effect keyed on the
    // screen cannot forget either. Layout effect: the teardown lands before
    // the home frame paints.
    useLayoutEffect(() => {
        if (screen !== 'home') return;
        // Already-clean bail: without it the mount-time run (screen starts
        // 'home', latLong starts the {0,0} sentinel) failed React's eager
        // bailout and bought a full synchronous re-render of this ~6k-line
        // component before first paint.
        const latLongClear = !latLong || (latLong.lat === 0 && latLong.long === 0);
        if (latLongClear && !panoLocation && !loading) return;
        // CrazyGames boot exception: on that platform, `loading` doubles as
        // the SDK-init gate ON the home screen with no pano state at all —
        // sweeping it wipes the boot cover. Pano-state teardown (a kicked
        // game etc.) still runs because latLong/panoLocation are set then.
        if (inCrazyGames && latLongClear && !panoLocation) return;
        // Also invalidate any in-flight location load: a community-map fetch
        // resolving AFTER this sweep would setLatLong a fresh pano onto the
        // menu (mounted, streaming, invisible). Bumping the request token is
        // the same cancellation every other abort path uses.
        cancelInFlightLocationLoad();
        setLatLong(null);
        setPanoLocation(null);
        setLoading(false);
    }, [screen, latLong, panoLocation, loading]);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (initialScreen === 'daily' || isDailyPath(window.location.pathname)) {
            setScreen('daily');
        }
        const onPop = () => {
            if (isDailyPath(window.location.pathname)) setScreen('daily');
            else if (screenRef.current === 'daily') setScreen('home');
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [initialScreen, isDailyPath]);

    // Keep the URL in sync with the `screen` state for daily mode. Anything
    // that transitions screen away from 'daily' (back button on the navbar,
    // exit from results modal, popstate, etc.) must also clear `/daily` from
    // the URL. Doing it here rather than inside each exit path means we
    // can't forget to call it.
    const prevScreenForUrlRef = useRef(screen);
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const prev = prevScreenForUrlRef.current;
        prevScreenForUrlRef.current = screen;
        if (prev === 'daily' && screen !== 'daily' && isDailyPath(window.location.pathname)) {
            const match = /^\/(es|fr|de|ru|en)\/daily$/.exec(window.location.pathname);
            const target = match ? `/${match[1]}` : '/';
            window.history.pushState({}, '', target);
        }
    }, [screen, isDailyPath]);

    // Close the login modal once the user is signed in (covers the Google and
    // Apple popup paths, which resolve outside the modal's control), and the
    // CrazyGames link prompt (its SDK auth listener lands the session outside
    // the modal's control too).
    useEffect(() => {
        if (session?.token?.secret && loginModalOpen) {
            setLoginModalOpen(false);
        }
        if (session?.token?.secret && linkGoogleModalOpen) {
            setLinkGoogleModalOpen(false);
        }
    }, [session?.token?.secret, loginModalOpen, linkGoogleModalOpen]);

    // Open the LoginModal itself on the home screen for logged-out users.
    //   1st time  — any home visit (never seen before).
    //   Nth time  — 7 days after the last show, if they still haven't signed in. Every
    //               repeat show renders a "Don't show this again" link under the form;
    //               clicking it sets `suggestLoginNeverShow` and permanently opts
    //               out. Otherwise the modal keeps reappearing on the 7-day cadence.
    // Delayed ~2.5s so it doesn't feel like a page-load ambush and so the session has
    // time to resolve. Embedded platforms (CrazyGames / CoolMath / GameDistribution)
    // skip entirely. This used to open a "Track your progress" teaser whose Sign-in
    // button THEN opened the login modal; the teaser is gone, the login is one
    // click closer.
    useEffect(() => {
        if (screen !== "home") return;
        // The tutorial guards itself via screen==="onboarding", but a NEW user
        // spends their first moments on screen==="home" while onboarding start
        // is still pending (loading gate, embed preroll) — gating on `screen`
        // alone let the timer below ambush that boot phase and burn the
        // first-show stamp before the tutorial even began.
        // null = still resolving, false = tutorial pending; only a definitive
        // true may arm the timer, so the first ask lands after onboarding.
        if (onboardingCompleted !== true) return;
        if (session?.token?.secret) return;
        if (inCrazyGames || HIDE_ACCOUNT_UI) return;
        if (typeof window === 'undefined') return;
        // The modal is up, from whatever surface (this prompt, a navbar sign-in,
        // a locked-mode upsell): that IS a show. Stamp it so the 7-day clock
        // counts from here, and return — never stack, never double-count, and
        // closing it re-runs this effect into the cooldown instead of
        // re-arming the timer into a 2.5s re-pop. This dep change also cancels
        // a pending timer (cleanup) when the user opens the modal themselves.
        if (loginModalOpen) {
            try { window.localStorage.setItem("suggestLoginLastShown", String(Date.now())); } catch (e) {}
            return;
        }

        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        let willShowNeverAgain = false;
        try {
            // Hard opt-out: user clicked "Don't show this again"
            if (window.localStorage.getItem("suggestLoginNeverShow")) return;

            // Migrate legacy one-time flag: treat as just-shown-now so the 7-day rule applies
            const legacy = window.localStorage.getItem("suggestLoginShown");
            if (legacy && !window.localStorage.getItem("suggestLoginLastShown")) {
                window.localStorage.setItem("suggestLoginLastShown", String(Date.now()));
                window.localStorage.removeItem("suggestLoginShown");
            }

            const lastShownRaw = window.localStorage.getItem("suggestLoginLastShown");
            const lastShown = lastShownRaw ? parseInt(lastShownRaw, 10) : null;

            if (lastShown) {
                // Seen before — only show again once the cooldown window has elapsed.
                // The only permanent opt-out is the `suggestLoginNeverShow` flag that the
                // user sets explicitly by clicking "Don't show this again".
                if (Date.now() - lastShown < SEVEN_DAYS_MS) return;
                // Any repeat show (2nd onward) gets the "Don't show again" opt-out link
                willShowNeverAgain = true;
            }
        } catch (e) { return; }

        const timer = setTimeout(() => {
            // Re-check at fire time in case things changed during the delay
            if (session?.token?.secret) return;
            try {
                if (window.localStorage.getItem("suggestLoginNeverShow")) return;
                window.localStorage.setItem("suggestLoginLastShown", String(Date.now()));
                const prev = parseInt(window.localStorage.getItem("suggestLoginShownCount") || "0", 10);
                window.localStorage.setItem("suggestLoginShownCount", String(prev + 1));
            } catch (e) { return; }
            openLoginModal({ periodic: { repeat: willShowNeverAgain } });
        }, 2500);

        return () => clearTimeout(timer);
    }, [screen, onboardingCompleted, session?.token?.secret, inCrazyGames, inCoolMathGames, inGameDistribution, loginModalOpen, openLoginModal]);

    // check if ?coolmath=true
    useEffect(() => {
        if (process.env.NEXT_PUBLIC_COOLMATH === "true") {
            window.lastCoolmathAd = Date.now();

            // Fade out and remove the static HTML splash from _document.js
            const splash = document.getElementById('cmg-splash');
            if (splash) {
                // Ensure splash was visible for at least 1s total
                const elapsed = Date.now() - (window.__cmgSplashStart || 0);
                const remaining = Math.max(0, 1000 - elapsed);

                const fadeOutTimer = setTimeout(() => {
                    splash.style.transition = 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                    splash.style.opacity = '0';
                    splash.style.pointerEvents = 'none';
                }, remaining);
                const removeTimer = setTimeout(() => {
                    splash.remove();
                }, remaining + 600);

                return () => {
                    clearTimeout(fadeOutTimer);
                    clearTimeout(removeTimer);
                }
            }
        }
    }, [])

    // GameDistribution SDK initialization
    useEffect(() => {
        if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") {
            window.inGameDistribution = true;

            // Set up GD SDK event callbacks
            // Called by the GD SDK bridge in headContent.js
            //
            // GD is the only partner that renders its ads INSIDE our document:
            // the SDK appends <div id="gdsdk__advertisement"> to document.body
            // at z-index 1010, position fixed, full viewport. CrazyGames, Poki
            // and CoolMath all paint from their own parent frame where our
            // z-index cannot reach, which is why this only ever broke here.
            // Everything of ours above 1010 punched straight through the ad
            // (.navbar is 1120, .guessBtn 1500, toasts 10020). Hiding our own
            // roots for the duration is the fix; see .gd-ad-active in
            // globals.scss for why it hides by name rather than by z-index.
            let adBreakWatchdog = null;
            let adPauseProbe = null;
            const clearAdPauseProbe = () => {
                if (adPauseProbe) {
                    clearTimeout(adPauseProbe);
                    adPauseProbe = null;
                }
            };
            const isAdvertisementVisible = () => {
                const ad = document.getElementById('gdsdk__advertisement');
                if (!ad || !ad.isConnected || ad.childElementCount === 0) return false;
                const style = window.getComputedStyle(ad);
                const rect = ad.getBoundingClientRect();
                return style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && Number.parseFloat(style.opacity || '1') !== 0
                    && rect.width > 0
                    && rect.height > 0;
            };
            const endAdBreak = () => {
                clearAdPauseProbe();
                if (adBreakWatchdog) {
                    clearTimeout(adBreakWatchdog);
                    adBreakWatchdog = null;
                }
                document.body.classList.remove('gd-ad-active');
                duckAudio(false);
            };
            const beginAdBreak = () => {
                document.body.classList.add('gd-ad-active');
                duckAudio(true);
                if (adBreakWatchdog) clearTimeout(adBreakWatchdog);
                adBreakWatchdog = setTimeout(() => {
                    console.warn("GD ad break watchdog fired, restoring UI");
                    endAdBreak();
                }, 60000);
            };
            window.onGDPauseGame = () => {
                clearAdPauseProbe();
                if (window._gdAdRequestActive || isAdvertisementVisible()) {
                    beginAdBreak();
                    return;
                }

                // Publisher wrappers can emit an unsolicited PAUSE during
                // startup and never follow it with START. Give a real automatic
                // ad one paint to appear, but never black out the app for an
                // empty/no-fill pause.
                adPauseProbe = setTimeout(() => {
                    adPauseProbe = null;
                    if (window._gdAdRequestActive || isAdvertisementVisible()) {
                        beginAdBreak();
                    } else {
                        console.warn("Ignoring GD pause without an active advertisement");
                    }
                }, 250);
            };
            window.onGDResumeGame = () => {
                // Idempotent on purpose: GD fires SDK_GAME_START with no
                // preceding SDK_GAME_PAUSE at SDK init and on splash skip, so
                // this runs at least once before any ad has ever played.
                endAdBreak();
                window._gdAdRequestActive = false;
                if (window._gdAdTimeout) {
                    clearTimeout(window._gdAdTimeout);
                    window._gdAdTimeout = null;
                }
                if (window._gdAdFinished) {
                    window._gdAdFinished();
                    window._gdAdFinished = null;
                }
            };

            const requestGDInterstitial = (onFinished = () => { }) => {
                if (typeof gdsdk === 'undefined' || typeof gdsdk.showAd === 'undefined') {
                    onFinished();
                    return;
                }

                if (window._gdAdTimeout) clearTimeout(window._gdAdTimeout);
                window._gdAdRequestActive = true;
                window._gdAdFinished = onFinished;

                const resume = () => {
                    if (window.onGDResumeGame) {
                        window.onGDResumeGame();
                        return;
                    }
                    window._gdAdRequestActive = false;
                    if (window._gdAdTimeout) clearTimeout(window._gdAdTimeout);
                    window._gdAdTimeout = null;
                    const callback = window._gdAdFinished;
                    window._gdAdFinished = null;
                    if (callback) callback();
                };

                window._gdAdTimeout = setTimeout(() => {
                    console.warn("GD ad timeout, forcing resume");
                    resume();
                }, 15000);

                try {
                    const result = gdsdk.showAd('interstitial');
                    if (result && typeof result.then === 'function') {
                        result.then(resume).catch(resume);
                    }
                } catch (error) {
                    console.warn("GD interstitial error:", error);
                    resume();
                }
            };
            window.requestGDInterstitial = requestGDInterstitial;

            // Show interstitial pre-roll on first user interaction (GD SDK requires a user gesture)
            const handleFirstInteraction = () => {
                // A brand-new user's first click lands INSIDE the tutorial,
                // so an unconditional preroll fires over onboarding. Skip the
                // preroll for that entire first session (same storage key
                // home.js uses to decide whether to start the tutorial);
                // between-round interstitials take over once they play a
                // real game. Returning users are unchanged.
                try {
                    if (gameStorage.getItem("onboarding") !== "done") {
                        document.removeEventListener('click', handleFirstInteraction);
                        document.removeEventListener('touchstart', handleFirstInteraction);
                        return;
                    }
                } catch (e) { }
                requestGDInterstitial();
                document.removeEventListener('click', handleFirstInteraction);
                document.removeEventListener('touchstart', handleFirstInteraction);
            };
            document.addEventListener('click', handleFirstInteraction, { once: true });
            document.addEventListener('touchstart', handleFirstInteraction, { once: true });

            // Handle Google OAuth redirect callback (redirect flow for iframe compatibility)
            const params = new URLSearchParams(window.location.search);
            const code = params.get("code");
            if (code) {
                // Clean the code from URL
                window.history.replaceState({}, '', window.location.pathname);
                setLoginQueued(true);
                fetchWithFallback(
                    clientConfig().authUrl + "/api/googleAuth",
                    clientConfig().apiUrl + "/api/googleAuth",
                    {
                        body: JSON.stringify({ code, redirect_uri: window.location.origin + window.location.pathname }),
                        method: "POST",
                        headers: { 'Content-Type': 'application/json' }
                    },
                    'googleAuthRedirect',
                    {}
                ).then((res) => res.json()).then((data) => {
                    if (data.secret) {
                        sendEvent(data.username ? "login" : "sign_up", { method: "google" });
                        // Shared store first, same as the popup flow above.
                        publishSession(data);
                        setSession({ token: data });
                        window.localStorage.setItem("wg_secret", data.secret);
                    } else if (data.error) {
                        // Same as the popup flow: surface an explicit server
                        // refusal (banned-identity re-signup) verbatim.
                        console.error("[Auth] GD redirect sign-in refused:", data.error);
                        toast.error(data.error, { autoClose: 12000 });
                    } else {
                        console.error("[Auth] GD redirect login: no secret received");
                        toast.error("Login error, contact support if this persists");
                    }
                }).catch((e) => {
                    console.error("[Auth] GD redirect login failed:", e);
                    toast.error("Login failed, please try again");
                }).finally(() => {
                    setLoginQueued(false);
                });
            }

            return () => {
                document.removeEventListener('click', handleFirstInteraction);
                document.removeEventListener('touchstart', handleFirstInteraction);
                endAdBreak();
                if (window._gdAdTimeout) clearTimeout(window._gdAdTimeout);
                window._gdAdTimeout = null;
                window._gdAdRequestActive = false;
                window._gdAdFinished = null;
                if (window.requestGDInterstitial === requestGDInterstitial) {
                    delete window.requestGDInterstitial;
                }
            };
        }
    }, [])

    useEffect(() => {
        if (screen === "singleplayer" || screen === "countryGuesser") {
            lastSingleplayerScreen.current = screen;
            setSinglePlayerRound({
                round: 1,
                totalRounds: screen === "countryGuesser" ? 10 : 5,
                locations: [],
            })
            if (screen === "countryGuesser") {
                setShowCountryButtons(true);
            }
        }
    }, [screen])

    const [allLocsArray, setAllLocsArray] = useState([]);
    const allLocsArrayRef = useRef([]);
    allLocsArrayRef.current = allLocsArray;

    function startOnboarding(mode = "classic") {

        if (inCrazyGames || window.inCrazyGames) {
            // make sure its not an invite link
            try {
                const code = window.CrazyGames?.SDK?.game?.getInviteParam?.("code")
                if (code && code.length === 6) {
                    return false;
                }
            } catch (e) {
                console.error("crazygames invite check failed", e);
            }

            // make sure tis not already completed
            const onboarding = gameStorage.getItem("onboarding");
            if (onboarding === "done") {
                return false;
            }
        }

        setScreen("onboarding")

        // 3 universally recognizable locations, ordered easiest-to-pin first
        // (Times Square: instantly readable + the US is a huge map target).
        // factKey pairs each location with its locale fact — the facts predate
        // this ordering, so round index must NOT be used to pick them.
        const onboardingLocations = [
            { lat: 40.7566514, long: -73.986534, heading: 31, country: "US", otherOptions: ["GB", "JP", "AU"], factKey: "onboardingFact2" },
            { lat: 48.8583601, long: 2.2915727, heading: 41, country: "FR", otherOptions: ["IT", "ES", "DE"], factKey: "onboardingFact3" },
            { lat: 29.9773337, long: 31.1321796, heading: 223, pitch: 5, country: "EG", otherOptions: ["TR", "BR", "IN"], factKey: "onboardingFact1" },
        ]

        setOnboarding({
            round: 1,
            locations: onboardingLocations,
            startTime: Date.now(),
            mode: mode,
        })
        sendEvent("tutorial_begin", { mode })
        setShowCountryButtons(mode !== "classic")
        return true;
    }

    // The skipped-mode analytics event fires inside WelcomeOverlay (the only
    // surface with a skip control right now) — not here, or it double-fires.
    function skipOnboarding() {
        try { gameStorage.setItem("onboarding", "done"); } catch (e) { }
        // The onboarding GameUI has started the round-1 street view load
        // (loading=true). Clearing latLong below unmounts the iframe, so its
        // onLoad — the only thing that resets loading — never fires; without
        // this, home is stuck behind the loading mask.
        cancelInFlightLocationLoad();
        setLoading(false);
        setLatLong(null);
        setShowAnswer(false);
        setOnboarding(null);
        setOnboardingCompleted(true);
        setScreen("home");
    }
    function openMap(mapSlug) {
        const country = countries.find((c) => c === mapSlug.toUpperCase());
        let officialCountryMap = null;
        if (country) {
            officialCountryMap = officialCountryMaps.find((c) => c.countryCode === mapSlug);
        }
        setAllLocsArray([])

        if (!country && mapSlug !== gameOptions.location) {
            if (((window?.lastPlayTrack || 0) + 20000 < Date.now())) {

                try {
                    fetch(clientConfig()?.apiUrl + `/mapPlay/${mapSlug}`, { method: "POST" })
                } catch (e) { }

            }

            try {
                window.lastPlayTrack = Date.now();
            } catch (e) { }
        }

        setGameOptions((prev) => {
            const newOptions = {
                ...prev,
                location: mapSlug,
                official: (country || mapSlug === 'all') ? true : false,
                countryMap: country,
                communityMapName: (country || mapSlug === 'all') ? "" : prev.communityMapName, // Clear community map name for official maps
                maxDist: country ? countryMaxDists[country] : 20000,
                extent: country && officialCountryMap && officialCountryMap.extent ? officialCountryMap.extent : null
            };


            return newOptions;
        })
    }

    function cancelInFlightLocationLoad() {
        loadLocationRequestRef.current += 1;
    }

    function setWorldMapOptions() {
        setGameOptions((prev) => ({
            ...prev,
            location: "all",
            official: true,
            countryMap: false,
            communityMapName: "",
            maxDist: 20000,
            extent: null
        }));
    }

    function enterCountryGuessrMode(subMode) {
        cancelInFlightLocationLoad();
        setLoading(false);
        setAllLocsArray([]);
        setLatLong(null);
        setShowAnswer(false);
        setPinPoint(null);
        setHintShown(false);
        setCountryGuessrMode({ subMode, region: "all" });
        setShowCountryButtons(true);
        setWorldMapOptions();
        setPendingCountryGuessrLoad((prev) => prev + 1);

        if (screen !== "countryGuesser") {
            setScreen("countryGuesser");
        } else {
            setSinglePlayerRound({ round: 1, totalRounds: 10, locations: [] });
        }
    }

    useEffect(() => {
        if (!pendingCountryGuessrLoad) return;
        if (screen !== "countryGuesser") return;
        if (gameOptions.location !== "all") return;

        setPendingCountryGuessrLoad(0);
        loadLocation({ force: true, ignoreCache: true });
    }, [pendingCountryGuessrLoad, screen, gameOptions.location, countryGuessrMode.subMode])

    useEffect(() => {
        if (screen !== "countryGuesser" || !loading || showAnswer) return;

        const recoveryId = countryGuessrLoadRecoveryRef.current + 1;
        countryGuessrLoadRecoveryRef.current = recoveryId;

        const recoveryTimeout = setTimeout(() => {
            if (countryGuessrLoadRecoveryRef.current !== recoveryId) return;
            cancelInFlightLocationLoad();
            setLoading(false);
            setAllLocsArray([]);
            setLatLong(null);
            setWorldMapOptions();
            setPendingCountryGuessrLoad((prev) => prev + 1);
        }, 12000);

        return () => clearTimeout(recoveryTimeout);
    }, [screen, loading, showAnswer, countryGuessrMode.subMode, gameOptions.location])

    // useLayoutEffect (not useEffect): this is the single path that loads the
    // next onboarding location. Running after paint leaves one frame where
    // showAnswer is cleared, the round bumped, but loading is still false and
    // latLong is still the old round — the old StreetView flashes uncovered.
    // useLayoutEffect runs before paint so the iframe is covered cleanly.
    useLayoutEffect(() => {
        if (onboarding?.round > 1) {
            loadLocation({ keepAnswer: !!window._countryGuessrKeepAnswer })
        }
    }, [onboarding?.round])

    // Completion-rate metric for the onboarding A/B: tutorial_end only fires
    // on an exit-card CLICK, which misses players who finish round 3 and then
    // close the tab. This stamps the actual completion moment, once.
    const tutorialCompleteFiredRef = useRef(false);
    useEffect(() => {
        if (onboarding?.completed) {
            if (!tutorialCompleteFiredRef.current) {
                tutorialCompleteFiredRef.current = true;
                sendEvent("tutorial_complete", { mode: onboarding.mode });
            }
            setOnboardingCompleted(true)
        }
    }, [onboarding?.completed])

    // Restore extent when entering singleplayer mode if map is selected but extent is missing
    useEffect(() => {
        if (screen === "singleplayer" && gameOptions.location && gameOptions.location !== "all" && !gameOptions.extent) {
            // Re-open the map to restore extent
            openMap(gameOptions.location);
        }
    }, [screen])

    // Country/continent guesser always plays on the world map — if the user had
    // a country-specific map loaded in singleplayer (e.g. "CA"), clear it so we
    // don't keep serving the same country over and over.
    useEffect(() => {
        if (screen === "countryGuesser" && gameOptions.location !== "all") {
            openMap("all");
            setAllLocsArray([]);
        }
    }, [screen])
    useEffect(() => {
        try {
            const onboarding = gameStorage.getItem("onboarding");
            // check url
            const cg = window.location.search.includes("crazygames");
            const specifiedMapSlug = window.location.search.includes("map=");
            // Party-link entry (?party=...) must skip onboarding for this
            // session: the auto-join effect runs after `multiplayerState.verified`
            // flips, which is later than onboarding's startup, so the tutorial
            // would briefly start, allocate a streetview round, then get torn
            // down — producing the "connection lost" glitch. Like ?map= and
            // /daily, we don't write "done" to storage so the tutorial still
            // appears next time the user lands on home without a party link.
            const hasPartyParam = typeof window !== 'undefined'
              && new URLSearchParams(window.location.search).has('party');
            // Direct /daily entry skips the classic-mode tutorial — first-time
            // users came here for the daily challenge, not for an onboarding
            // street-view round. We don't write "done" to localStorage so
            // they'll still see the tutorial later if they navigate to home.
            const onDailyEntry = initialScreen === 'daily'
              || (typeof window !== 'undefined' && isDailyPath(window.location.pathname));
            // A stored account secret means this browser has played before —
            // never a tutorial candidate, even if the "onboarding" flag is
            // missing (cleared game keys, pre-flag accounts). Without this,
            // logged-in users sit in the undecided window for the whole
            // session-verify round trip: hidden navbar, GrowthBook fetch, and
            // a tutorial that starts then gets torn down when verify lands.
            const hasStoredAccount = !!window.localStorage.getItem("wg_secret");
            if (onboarding && onboarding === "done") {
                setOnboardingCompleted(true)


            }
            else if (hasStoredAccount && !cg) setOnboardingCompleted(true)
            else if (specifiedMapSlug && !cg) setOnboardingCompleted(true)
            else if (hasPartyParam) setOnboardingCompleted(true)
            else if (onDailyEntry) setOnboardingCompleted(true)
            else setOnboardingCompleted(false)
        } catch (e) {
            console.error(e, "onboard");
            setOnboardingCompleted(true);
        }
    }, [])



    useEffect(() => {

        // check if pirated
        if (isForbiddenIframe() && !window.blocked) {
            // display a message
            window.blocked = true;
            // documentElement.innerHTML swap, NOT document.write(): a post-load
            // write() implicitly open()s the document, leaving document.body
            // null mid-parse — React's next effect/cleanup then fatals — and
            // errorTracking's post-load write-guard blocks write() anyway.
            document.documentElement.innerHTML = `
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Play WorldGuessr</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body, html {
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      background: url('https://www.worldguessr.com/street1.jpg') no-repeat center center/cover;
      font-family: 'Arial', sans-serif;
    }

    .container {
      text-align: center;
      background-color: rgba(255, 255, 255, 0.8);
      padding: 30px;
      border-radius: 10px;
    }

    h1 {
      font-size: 2.5rem;
      margin-bottom: 20px;
    }

    a {
      text-decoration: none;
    }

    .play-button {
      background-color: #2563eb;
      color: white;
      padding: 15px 30px;
      font-size: 1.5rem;
      border-radius: 50px;
      border: none;
      cursor: pointer;
      transition: background-color 0.3s ease, transform 0.2s ease;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    }

    .play-button:hover {
      background-color: #1d4ed8;
      transform: scale(1.05);
    }

    .play-button:active {
      background-color: #1e40af;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Welcome to WorldGuessr!</h1>
    <a href="https://worldguessr.com" target="_blank">
      <button class="play-button">Open in New Tab ↗</button>
    </a>
  </div>
</body>
`;
            sendEvent("blocked_iframe")
        }
        // check if learn mode
        if (window.location.search.includes("learn=true")) {
            window.learnMode = true;
            hasEnteredSingleplayer.current = true;
            // immediately open single player
            setScreen("singleplayer")
        }
        // check if from map screen
        if (window.location.search.includes("map=") && !window.location.search.includes("crazygames")) {
            // get map slug map=slug from url
            const params = new URLSearchParams(window.location.search);
            const mapSlug = params.get("map");
            hasEnteredSingleplayer.current = true;
            setScreen("singleplayer")

            openMap(mapSlug)
        }

        if (window.location.search.includes("createPrivateGame=true")) {
        }
    }, [])

    // Separate useEffect to clean up URL parameters after component has mounted
    useEffect(() => {
        // Remove map parameter from URL if present, without causing hydration issues
        if (window.location.search.includes("map=") && !window.location.search.includes("crazygames")) {
            setTimeout(() => {
                const params = new URLSearchParams(window.location.search);
                params.delete("map");
                const newSearch = params.toString();
                const newUrl = window.location.pathname + (newSearch ? '?' + newSearch : '');
                window.history.replaceState({}, '', newUrl);
            }, 1000); // Delay to ensure the component has mounted
        }
    }, [])

    useEffect(() => {

        // check if learn mode
        if (window.location.search.includes("learn=true")) {
            setOnboardingCompleted(true)
        }


        if (onboardingCompleted === false) {
            if (!loading) {

                if (startOnboarding("classic")) {
                    // Mode-select welcome overlay on top of round 1 — every
                    // new user, no variant fetch to wait on.
                    setWelcomeOverlayShown(true);
                    return;
                }

                if (inIframe() && window.adBreak && !inCrazyGames && !inPoki) {
                    window.onboardPrerollEnd = false;
                    setLoading(true)
                    window.adBreak({
                        type: "preroll",
                        adBreakDone: function (e) {
                            if (window.onboardPrerollEnd) return;
                            setLoading(false)
                            window.onboardPrerollEnd = true;
                            sendEvent("interstitial", { type: "preroll", ...e })
                            startOnboarding()
                        }
                    })

                    setTimeout(() => {
                        if (!window.onboardPrerollEnd) {
                            window.onboardPrerollEnd = true;
                            setLoading(false)
                            startOnboarding()
                        }
                    }, 3000)
                } else if (!inCrazyGames) {

                    startOnboarding()
                }
            }
        }
    }, [onboardingCompleted])

    // While the welcome overlay covers the screen (modal variant), hold the
    // onboarding GameUI mount (whose mount effect loads round 1 and with it
    // the ~700 KB Google Maps embed + pano tiles) until the load event plus an
    // idle callback. Real users spend seconds reading the modal, so the
    // preload still wins the race; picking a mode drops the overlay, which
    // mounts GameUI immediately regardless of this flag.
    useEffect(() => {
        if (!welcomeOverlayShown || svPreloadReady) return;
        let cancelled = false;
        const allow = () => { if (!cancelled) setSvPreloadReady(true); };
        const whenIdle = () => {
            if ('requestIdleCallback' in window) requestIdleCallback(allow, { timeout: 4000 });
            else setTimeout(allow, 1500);
        };
        if (document.readyState === 'complete') whenIdle();
        else window.addEventListener('load', whenIdle, { once: true });
        return () => {
            cancelled = true;
            window.removeEventListener('load', whenIdle);
        };
    }, [welcomeOverlayShown, svPreloadReady])

    useEffect(() => {
        if (session && session.token && session.token.username && !inCrazyGames) {
            setOnboardingCompleted(true)
            try {
                gameStorage.setItem("onboarding", 'done')
            } catch (e) { }

            // If user is currently in onboarding, redirect to home
            if (screen === "onboarding") {
                setScreen("home")
                setOnboarding(null)
            }
        }
    }, [session])

    useEffect(() => {
        if (!options?.language) return;
        try {
            window.localStorage.setItem("lang", options?.language)
            window.language = options?.language;
            window.dispatchEvent(new CustomEvent('langChange', { detail: options?.language }));

            // Embedded platforms don't own their URL, so skip the locale
            // redirect: GD for historical reasons, Poki because its deploys
            // live at a nested per-version path with document-relative assets
            // (assetPrefix '.') — router.push('/es') would strand the document
            // at the CDN root and every later lazy-chunk request would 404.
            // In-app language switching still works via window.language +
            // the langChange event dispatched above.
            if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true" || process.env.NEXT_PUBLIC_POKI === "true" || process.env.NEXT_PUBLIC_6X === "true") return;

            // On the very first paint, trust whatever URL the user landed on
            // and skip the auto-redirect entirely. Previously, e.g. visiting
            // `/daily` with localStorage.lang === "es" would `router.replace`
            // to `/es/daily`, unmounting and remounting Home and (until the
            // MultiplayerProvider lift) leaking the WebSocket connection,
            // which the server then kicked with "userAlreadyConnected".
            // Subsequent language changes (from settings) still redirect.
            if (langInitRef.current) {
                langInitRef.current = false;
                return;
            }

            const currentPath = stripBase(window.location.pathname);

            // Special-case /daily (and /[lang]/daily): stay on daily, just swap
            // the locale segment. Without this, the redirect below would yank
            // the user off the daily challenge and onto /{lang}.
            const dailyRegex = /^\/(?:(es|fr|de|ru|en)\/)?daily$/;
            if (dailyRegex.test(currentPath)) {
                const desiredDaily = options.language === 'en' ? '/daily' : `/${options.language}/daily`;
                if (currentPath !== desiredDaily) {
                    router.replace(desiredDaily);
                }
                return;
            }

            const target = `/${options.language}`;
            // Don't redirect to /en from root — English is the default
            const isDefaultOnRoot = options.language === "en" && (currentPath === "/" || currentPath === "");
            if (!isDefaultOnRoot && currentPath !== target) {
                const currentQueryParams = new URLSearchParams(window.location.search);
                const qPsuffix = currentQueryParams.toString() ? `?${currentQueryParams.toString()}` : "";
                router.push(target + qPsuffix);
            }
        } catch (e) { }
    }, [options?.language]);

    const loadOptions = async () => {

        // try to fetch options from localstorage
        try {
            const options = gameStorage.getItem("options");

            // Detect language: URL path wins, then localStorage.lang, then "en"
            let detectedLang = "en";
            try {
                const knownLangs = ["en", "es", "fr", "de", "ru"];
                const urlSegment = stripBase(window.location.pathname).split("/").filter(Boolean)[0];
                if (knownLangs.includes(urlSegment)) {
                    detectedLang = urlSegment;
                } else {
                    const storedLang = window.localStorage.getItem("lang");
                    if (storedLang && knownLangs.includes(storedLang)) {
                        detectedLang = storedLang;
                    }
                }
            } catch(e) {}

            if (options) {
                const parsed = JSON.parse(options);
                parsed.language = detectedLang;
                setOptions(parsed)
            } else {
                let system = "metric";

                // Detect US/UK users for imperial units using timezone + locale
                try {
                    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    const locale = navigator.language;

                    // US timezone detection
                    const isUSTimezone = timezone && (
                        timezone.startsWith('America/') &&
                        !timezone.startsWith('America/Argentina') &&
                        !timezone.startsWith('America/Brazil') &&
                        !timezone.includes('Mexico')
                    );

                    // UK timezone detection
                    const isUKTimezone = timezone && timezone.startsWith('Europe/London');

                    // Locale detection
                    const isUSLocale = locale && locale.startsWith('en-US');
                    const isUKLocale = locale && locale.startsWith('en-GB');

                    if (isUSTimezone || isUKTimezone || isUSLocale || isUKLocale) {
                        system = "imperial";
                    }
                } catch (e) {
                    // If everything fails, default to metric
                }


                setOptions({
                    units: system,
                    mapType: "m", //m for normal
                    language: detectedLang
                })
            }
        } catch (e) { }

    }
    useEffect(() => { loadOptions() }, [])

    // Log commit hash on app startup
    useEffect(() => {
        console.log(`🌍 WorldGuessr build: ${process.env.NEXT_PUBLIC_COMMIT_HASH || 'unknown'}`);
        console.log(`📅 Build time: ${process.env.NEXT_PUBLIC_BUILD_TIME || 'unknown'}`);
    }, [])

    useEffect(() => {
        if (options && options.units && options.mapType) {
            try {
                gameStorage.setItem("options", JSON.stringify(options))
            } catch (e) { }
        }
    }, [options])

    // multiplayer stuff — connection lives in MultiplayerProvider (mounted in
    // _app.js) so it survives Next.js route changes and can't be opened twice.
    const { ws, setWs, multiplayerState, setMultiplayerState, subscribeMessages, ensureConnected } = useMultiplayer();
    // Fresh handle for long-lived closures: an invite toast lives ~10s, and
    // its accept handler must judge "am I in a live game?" against the state
    // at CLICK time, not at toast creation (a match can start in between).
    const multiplayerStateRef = useRef(multiplayerState);
    multiplayerStateRef.current = multiplayerState;
    // Tell the provider to actually open the WS. Provider is lazy by default
    // so non-Home pages (/banned, /leaderboard, /maps, /mod, /learn, /user,
    // /svEmbed, /privacy-*) don't open a socket they'll never use.
    useEffect(() => { ensureConnected(); }, [ensureConnected]);

    // Competitive music for the whole matchmade pipeline: any live PUBLIC
    // game (ranked duels and 2v2 are {public, duel}; unranked "duels" are
    // actually public non-duel FFA joins server-side — all matchmade, all
    // competitive; private parties are never public), any queue wait (every
    // gameQueued value — publicDuel/unrankedDuel/2v2 — is matchmade), and
    // the play-again bridge (nextGameQueued: state already reset but the
    // re-queue hasn't fired yet — without it Play Again blips chill between
    // matches). Leaving for the menu crossfades back to chill.
    const inMatchmadePipeline = !!(
        (multiplayerState?.inGame && multiplayerState?.gameData?.public)
        || multiplayerState?.gameQueued
        || multiplayerState?.nextGameQueued
    );
    useEffect(() => {
        setMusicPlaylist(inMatchmadePipeline ? 'competitive' : 'chill');
    }, [inMatchmadePipeline]);

    // The opponent-locked ping must land instantly — decode it as soon as a
    // live game could produce one.
    const multinotiPossible = !!multiplayerState?.inGame;
    useEffect(() => {
        if (multinotiPossible) preloadSfx('multinoti');
    }, [multinotiPossible]);

    // ---- GA4 engagement instrumentation ----
    // The whole site is one Next page, so GA4 never saw a second page_view and
    // engagement rested entirely on the 10s timer — which only starts counting
    // once the deferred gtag lib boots on window load (_document.js). Players
    // who demonstrably played were logged as bounces.

    // Virtual page_view per screen change. The initial screen's real page_view
    // already fires from the gtag config snippet. The automatic home→onboarding
    // flip is the landing experience, not a navigation (there's no manual way
    // to enter onboarding from home), so it advances the ref silently.
    const prevScreenForGaRef = useRef(screen);
    useEffect(() => {
        if (screen === prevScreenForGaRef.current) return;
        if (screen === "onboarding" && prevScreenForGaRef.current === "home") {
            prevScreenForGaRef.current = screen;
            return;
        }
        prevScreenForGaRef.current = screen;
        sendEvent("page_view", {
            page_location: window.location.origin + (screen === "home" ? "/" : `/${screen.toLowerCase()}`),
            page_title: `WorldGuessr - ${screen}`,
        });
        // Playwire pageviews are NOT registered here: each ad slot mount
        // declares its layout via spaAds({countPageView: true}), so the
        // slot lifecycle IS the pageview signal (bannerAdPlaywire.js).
    }, [screen]);

    // game_start = a round is actually in front of the player. Every mode
    // funnels its round location through latLong (SP/CG fetch or rotate,
    // onboarding stamps tutorial spots, MP stamps incoming round locations,
    // daily drives it from singlePlayerRound), so one effect covers them all.
    // Mark game_start as a key event in GA4 admin: any session that reaches
    // gameplay then counts as engaged regardless of the 10s timer.
    const lastGameStartRef = useRef(null);
    useEffect(() => {
        // {0,0} is the cleared-location sentinel (clearLocation/initial state)
        if (!latLong || (latLong.lat === 0 && latLong.long === 0)) return;
        // home menu keeps a live background pano — not a round
        if (screen === "home") return;
        // round-1 street view preloading behind the welcome modal isn't play
        if (screen === "onboarding" && welcomeOverlayShown) return;
        // daily landing/results keep the last pano mounted for the crossfade
        if (screen === "daily" && dailyPhase !== "game") return;
        // MP stamps latLong on the getready→guess flip; anything else holding
        // a location (lobby leftovers, rejoin answer-view restore) isn't a
        // fresh round
        if (screen === "multiplayer" && multiplayerState?.gameData?.state !== "guess") return;
        const key = `${screen}:${latLong.lat},${latLong.long}`;
        if (lastGameStartRef.current === key) return;
        lastGameStartRef.current = key;
        sendEvent("game_start", { mode: screen });
    }, [latLong, screen, welcomeOverlayShown, dailyPhase, multiplayerState?.gameData?.state]);

    // Own-analytics session clock: visible-tab seconds, every mode and screen
    // (see visibleTime.js). Module-level latch makes re-mounts harmless.
    useEffect(() => {
        trackVisibleTime();
    }, []);

    // logged_in user property: stamps every subsequent GA4 event so BigQuery
    // can split logged vs guest (the site sends no user_id — without this the
    // auth dimension does not exist in the export). Mirrors the app's own
    // logged-out definition (!secret); per-user queries take MAX over the
    // day, so the pre-resolution 'false' on a slow session load is harmless.
    useEffect(() => {
        try {
            window.gtag("set", "user_properties", {
                logged_in: session?.token?.secret ? "true" : "false",
            });
        } catch (e) {}
    }, [session?.token?.secret]);

    const [multiplayerEmotesEnabled, setMultiplayerEmotesEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        try { return gameStorage.getItem('multiplayerEmotesEnabled') !== 'false'; } catch { return true; }
    });

    const [multiplayerChatEnabled, setMultiplayerChatEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        try { return gameStorage.getItem('multiplayerChatEnabled') !== 'false'; } catch { return true; }
    });

    const updateTimeOffsetFromSync = (serverNow, clientSentAt) => {
        if (!serverNow || !clientSentAt) return;
        const now = Date.now();
        const rtt = Math.max(0, now - clientSentAt);
        const offset = serverNow - (clientSentAt + rtt / 2);
        const sync = timeSyncRef.current;
        const tooOld = now - sync.lastSyncAt > 60000;
        const betterRtt = rtt <= sync.bestRtt + 25;
        if (sync.lastSyncAt === 0 || betterRtt || tooOld) {
            const prevBestRtt = sync.bestRtt;
            sync.bestRtt = Math.min(sync.bestRtt, rtt);
            sync.lastSyncAt = now;
            sync.lastServerNow = serverNow;
            if (window.debugTimeSync) {
                console.log("[TimeSync] update", {
                    offset,
                    rtt,
                    serverNow,
                    clientSentAt,
                    prevBestRtt
                });
            }
            setTimeOffset(offset);
        }
    };

    const sendTimeSync = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: "timeSync", clientSentAt: Date.now() }));
    };


    // Auto-close connection error modal when connected
    useEffect(() => {
        if (multiplayerState.connected) {
            setConnectionErrorModalShown(false);
        }
    }, [multiplayerState.connected]);

    // Signature of ONLY the roster fields that can reshape the HP-bar name pill.
    // The probe below does a getBoundingClientRect (a forced synchronous layout)
    // and used to depend on the `players` ARRAY, which gets a brand-new identity
    // on every `place` message — i.e. on every guess anyone locks in. Those
    // messages change `guess`/`final`/`latLong`, none of which the pill renders,
    // so every one of them bought a full document reflow for an identical
    // result. This is duel-only code, which is part of why duels felt heavier
    // than public games.
    const duelPillSignature = (multiplayerState?.gameData?.players || [])
        .map((p) => `${p.id}:${p.username}:${p.countryCode}:${p.elo}:${p.team ?? ''}:${p.disconnected ? 1 : 0}`)
        .join('|');

    // Collision probe for the in-duel reload button (see duelReloadBtnTop).
    // The left HP bar slides into place after this effect first commits, so an
    // immediate rect read sees its off-screen transform and misses the settled
    // username tile. Re-measure when that entrance finishes and whenever the
    // tile's actual dimensions change; no username length or viewport guess.
    useEffect(() => {
        if (!(multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === "guess")) {
            setDuelReloadBtnTop((top) => top === DUEL_RELOAD_DEFAULT_TOP ? top : DUEL_RELOAD_DEFAULT_TOP);
            return;
        }

        const leftBar = document.querySelector(".hb-left");
        const pill = leftBar?.querySelector(".player-name-wrapper");
        const button = duelReloadBtnRef.current;
        if (!leftBar || !pill || !button) return;

        let frameId = null;
        const measure = () => {
            if (frameId !== null) cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                frameId = null;
                const r = pill.getBoundingClientRect();
                const b = button.getBoundingClientRect();
                const crossesButtonColumn = r.right > b.left && r.left < b.right;
                const nextTop = crossesButtonColumn
                    ? Math.max(DUEL_RELOAD_DEFAULT_TOP, Math.ceil(r.bottom) + DUEL_RELOAD_CLEARANCE)
                    : DUEL_RELOAD_DEFAULT_TOP;
                setDuelReloadBtnTop((top) => top === nextTop ? top : nextTop);
            });
        };

        const onEntranceEnd = (event) => {
            if (event.target === leftBar) measure();
        };
        leftBar.addEventListener("animationend", onEntranceEnd);
        window.addEventListener("resize", measure);

        const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
        observer?.observe(pill);
        observer?.observe(button);
        measure();

        return () => {
            leftBar.removeEventListener("animationend", onEntranceEnd);
            window.removeEventListener("resize", measure);
            observer?.disconnect();
            if (frameId !== null) cancelAnimationFrame(frameId);
        };
    }, [multiplayerState?.gameData?.state, multiplayerState?.gameData?.duel, duelPillSignature, width]);

    useEffect(() => {
        if (!session?.token?.secret) return;

        // verify the ws
        if (ws && !window.verified && !window.location.search.includes("crazygames")) {
            ws.send(JSON.stringify({ type: "verify", secret: session.token.secret, username: session.token.username, teamSupport: true }))
        }
    }, [session?.token?.secret, ws])

    useEffect(() => {
        if (!ws) return;
        timeSyncRef.current = { bestRtt: Infinity, lastSyncAt: 0, lastServerNow: 0 };
        setTimeOffset(0);
        sendTimeSync();
        const interval = setInterval(() => {
            sendTimeSync();
        }, 30000);
        return () => clearInterval(interval);
    }, [ws])

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === "visible") {
                sendTimeSync();
            }
        };
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    }, [ws])

    const { t: text } = useTranslation("common");

    // NOTE: join-code errors are cleared by the join input's onChange (typing
    // dismisses them) — no auto-dismiss timer, so the message stays readable.

    useEffect(() => {
        if (multiplayerState?.connected && multiplayerError) {
            setMultiplayerError(null)
        }
    }, [multiplayerState?.connected, multiplayerError])

    // ── Queue-join confirmation watchdog ──────────────────────────────────────
    // The server acks a queue join with `queueJoined` (ranked also sends
    // `publicDuelRange`). If neither arrives within WS_QUEUE_CONFIRM_TIMEOUT_MS the
    // join never registered server-side, so we bail off the searching screen with a
    // toast instead of leaving the user waiting on a queue they were never in.
    function clearQueueConfirmWatchdog() {
        if (queueConfirmTimerRef.current) {
            clearTimeout(queueConfirmTimerRef.current);
            queueConfirmTimerRef.current = null;
        }
    }
    function armQueueConfirmWatchdog() {
        clearQueueConfirmWatchdog();
        queueConfirmTimerRef.current = setTimeout(() => {
            queueConfirmTimerRef.current = null;
            const st = mpStateRef.current;
            // Already moved on (match started, cancelled, or disconnected) — the
            // join clearly worked or no longer matters.
            if (!st || !st.gameQueued || st.inGame) return;
            // No ack: the server never queued us. Drop us (a no-op server-side if it
            // never had us), leave the searching screen, and surface the failure.
            try { ws?.send(JSON.stringify({ type: "leaveQueue" })); } catch (e) {}
            setMultiplayerState((prev) => ({ ...prev, gameQueued: false, publicDuelRange: null, queuedAt: null, queueEta: null, placementPending: false }));
            setScreen("home");
            toast(text("queueJoinFailed") || "Couldn't join the queue. Please try again.", { type: 'error', theme: "dark" });
        }, WS_QUEUE_CONFIRM_TIMEOUT_MS);
    }

    // ── Create-lobby confirmation watchdog ────────────────────────────────────
    // The party / 2v2 create shell renders instantly with every control
    // disabled (partyLobby's `pending`) and waits for the server's `game`
    // snapshot. If the server never answers — the create was silently dropped —
    // the shell used to hang forever: masked code, dead buttons, no error.
    // Condition-driven rather than armed per action so it also covers the 2v2
    // queue back-out, which re-shows the shell awaiting a lobby restore. Any
    // resolution (snapshot lands → inGame, user backs out → lobbyIntent
    // cleared, queue starts, disconnect) flips the condition and disarms via
    // the effect cleanup, so a fire always means a genuinely hung shell.
    const pendingCreateShellActive = !!(multiplayerState?.connected
        && !multiplayerState?.inGame
        && !multiplayerState?.gameQueued
        && (multiplayerState?.lobbyIntent === 'party' || multiplayerState?.lobbyIntent === '2v2'));
    useEffect(() => {
        if (!pendingCreateShellActive) return;
        const timer = setTimeout(() => {
            // Fire-time re-check via the ref, mirroring the queue watchdog
            // above: effect cleanup is a PASSIVE effect (runs after paint), so
            // a `game` snapshot landing just before the deadline could see the
            // timer fire before the cleanup clears it — and tear down the
            // lobby that just arrived.
            const st = mpStateRef.current;
            if (!st || st.inGame || st.gameQueued || !st.connected
                || !(st.lobbyIntent === 'party' || st.lobbyIntent === '2v2')) return;
            // Same exit as the navbar back button from this shell (its
            // lobbyIntent branch): leaveGame — which tears down a ghost lobby
            // if the create DID land server-side, and is a no-op otherwise —
            // then state reset + home. skipConfirm: no confirm modal from a
            // timer, and the shell has nothing worth confirming anyway.
            backBtnPressed(false, undefined, true);
            toast(text("createLobbyFailed") || "Could not reach the game server. Please try again.", { type: 'error', theme: "dark" });
        }, WS_QUEUE_CONFIRM_TIMEOUT_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingCreateShellActive]);

    function handleMultiplayerAction(action, ...args) {
        if (!ws || !multiplayerState.connected) {
            setConnectionErrorModalShown(true);

            return;
        }

        // Cancel stage-1 teammate matchmaking WITHOUT leaving the lobby (the
        // back-button path would send leaveGame — inGame stays true during
        // stage 1). Drop the queue entry server-side; the lobby restore
        // re-sends state, confirming the optimistic flip below. Must run
        // before the gameQueued guard — we ARE queued while cancelling.
        if (action === "cancelTeammateSearch") {
            ws.send(JSON.stringify({ type: "leaveQueue" }));
            sendEvent("multiplayer_cancel_teammate_search");
            setMultiplayerState((prev) => ({ ...prev, gameQueued: false, queueStage: null }));
            return;
        }

        if (multiplayerState.gameQueued || multiplayerState.connecting) return;

        if (action === "publicDuel") {
            crazyMidgame(() => {
            setScreen("multiplayer")
            setMultiplayerState((prev) => ({
                ...prev,
                gameQueued: "publicDuel",
                nextGameType: undefined,
                nextGameQueued: false,
                // Cleared, not stamped: the SERVER's queuedAt arrives on the
                // queueJoined ack a moment later and is the only value the
                // timer may run on. Guessing one here would start the clock
                // before the join is even acknowledged.
                queuedAt: null,
                queueEta: null,
                // Cleared for the same reason — a previous queue's band must
                // not flash. NO optimistic range here: a guess from cached elo
                // was tried and visibly self-corrected one RTT in (stale elo,
                // league-table drift). The queue screen reserves the cell's
                // LAYOUT itself and fades the server's range in when it lands.
                publicDuelRange: null,
                // Stale placement labelling from a previous queue must not
                // leak into this one; the server re-announces if it applies.
                placementPending: false
            }))
            sendEvent("multiplayer_request_ranked_duel")
            ws.send(JSON.stringify({ type: "publicDuel" }))
            armQueueConfirmWatchdog()
            })
        }

        if (action === "unrankedDuel") {
            crazyMidgame(() => {
            setScreen("multiplayer")
            setMultiplayerState((prev) => ({
                ...prev,
                gameQueued: "unrankedDuel",
                nextGameType: undefined,
                nextGameQueued: false,
                publicDuelRange: null,
                queuedAt: null,
                queueEta: null,
                placementPending: false
            }))
            sendEvent("multiplayer_request_unranked_duel")
            ws.send(JSON.stringify({ type: "unrankedDuel" }))
            armQueueConfirmWatchdog()
            })
        }

        if (action === "joinPrivateGame") {

            if (args[0]) {
                setScreen("multiplayer")

                // Synchronous stamp BEFORE the send: the gate-error handlers
                // read this ref — a state stamp races the server's reply on
                // deep links (boot-storm renders commit after the rejection).
                lastJoinCodeRef.current = args[0];
                setMultiplayerState((prev) => ({
                    ...prev,
                    joinOptions: {
                        ...prev.joinOptions,
                        // Mirror into state for the join screen's input only.
                        gameCode: args[0],
                        error: false,
                        progress: true
                    }
                }));
                // join Party
                ws.send(JSON.stringify({ type: "joinPrivateGame", gameCode: args[0] }))
                sendEvent("multiplayer_join_private_game", { gameCode: args[0] })

            } else {
                setScreen("multiplayer")
                // Reachable from inside the 2v2 staging lobby ("have a code?"
                // link) — leave the server-side lobby so it can't linger as a
                // ghost. No-op from home/onboarding (not in any lobby).
                if ((multiplayerState?.inGame && multiplayerState?.gameData?.state === "waiting")
                    || multiplayerState?.lobbyIntent) {
                    try { ws.send(JSON.stringify({ type: 'leaveGame' })) } catch (e) { }
                }
                setMultiplayerState((prev) => {
                    return {
                        ...initialMultiplayerState,
                        connected: true,
                        lobbyIntent: 'join',
                        playerCount: prev.playerCount,
                        guestName: prev.guestName
                    }

                })
            }
        }

        if (action === "createLobby") {
            // One create path for both flavors: a party, or a 2v2 staging
            // lobby (mode:'2v2' → server caps it at 2 and skips game options).
            // The lobby card renders its pending shell immediately; options
            // live behind the lobby's Edit button (no modal ambush on create).
            const intent = args[0] === "2v2" ? "2v2" : "party";
            setScreen("multiplayer")
            setMultiplayerState((prev) => ({
                ...prev,
                lobbyIntent: intent,
                joinOptions: { ...initialMultiplayerState.joinOptions },
                createOptions: { ...prev.createOptions, progress: true },
            }));
            ws.send(JSON.stringify({
                type: "createPrivateGame",
                ...(intent === "2v2" ? { mode: "2v2" } : {}),
            }));
            // Parties open the options modal right away so hosts pick their
            // settings first (2v2 staging has no options to edit).
            if (intent === "party") setPartyModalShown(true)
            sendEvent(intent === "2v2" ? "multiplayer_create_2v2_lobby" : "multiplayer_create_private_game")
        }

        if (action === "setPrivateGameOptions" && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {

            if (inCrazyGames) {
                window.CrazyGames.SDK.game.showInviteButton({ code: multiplayerState?.gameData?.code })
            }

            // Use the passed options directly to avoid stale state issues
            const options = args[0] || multiplayerState.createOptions;
            // Every option the party modal commits MUST be enumerated here.
            // The server treats a missing field as "this client predates the
            // option" and keeps the current value, so forgetting one makes
            // its toggle silently dead on web.
            ws.send(JSON.stringify({
                type: "setPrivateGameOptions",
                rounds: options.rounds,
                timePerRound: options.timePerRound,
                nm: options.nm,
                npz: options.npz,
                showRoadName: options.showRoadName,
                location: options.location,
                displayLocation: options.displayLocation,
                disableEmotes: options.disableEmotes,
                disableChat: options.disableChat
            }));
        }

        if (action === 'startGameHost' && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {
            ws.send(JSON.stringify({ type: "startGameHost" }))
            sendEvent("multiplayer_start_game_host")
        }

        if (action === "kickPlayer" && args[0] && multiplayerState?.gameData?.host) {
            ws.send(JSON.stringify({ type: "kickPlayer", playerId: args[0] }))
        }

        if (action === "transferHost" && args[0] && multiplayerState?.gameData?.host) {
            ws.send(JSON.stringify({ type: "transferHost", playerId: args[0] }))
        }

        // Separate wire message from setPrivateGameOptions on purpose: that
        // path regenerates the party's locations on every call. Partial
        // payload: the lobby lock button sends only `locked`, the settings
        // modal sends only `allowGuests` — the server ignores absent fields,
        // so neither control can stomp the other.
        if (action === "setPartySecurity" && args[0] && multiplayerState?.gameData?.host) {
            const payload = { type: "setPartySecurity" };
            if (typeof args[0].locked === 'boolean') payload.locked = args[0].locked;
            if (typeof args[0].allowGuests === 'boolean') payload.allowGuests = args[0].allowGuests;
            ws.send(JSON.stringify(payload))
        }

        // ---- Intra-party team mode ----
        // Client gates MIRROR the server's (host/waiting/allowTeamPick); the
        // server re-validates everything and its broadcast is authoritative.
        if (action === "setTeamConfig" && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting") {
            ws.send(JSON.stringify({ type: "setTeamConfig", ...args[0] }))
            sendEvent("multiplayer_set_team_config")
        }

        if (action === "shuffleTeams" && multiplayerState?.inGame && multiplayerState?.gameData?.host && multiplayerState?.gameData?.state === "waiting" && multiplayerState?.gameData?.teamGame) {
            ws.send(JSON.stringify({ type: "shuffleTeams" }))
            sendEvent("multiplayer_shuffle_teams")
        }

        if (action === "setPlayerTeam" && args[0] && (args[1] === 'a' || args[1] === 'b')
            && multiplayerState?.inGame && multiplayerState?.gameData?.state === "waiting" && multiplayerState?.gameData?.teamGame) {
            const gd = multiplayerState.gameData;
            const isSelf = args[0] === gd.myId;
            if (!(gd.host || (gd.allowTeamPick && isSelf))) return;
            ws.send(JSON.stringify({ type: "setPlayerTeam", playerId: args[0], team: args[1] }))
            // Optimistic flip so the row jumps columns instantly; the next
            // 'game' broadcast replaces players wholesale and self-corrects.
            setMultiplayerState((prev) => prev.gameData ? ({
                ...prev,
                gameData: {
                    ...prev.gameData,
                    players: prev.gameData.players.map((p) => p.id === args[0] ? { ...p, team: args[1] } : p)
                }
            }) : prev);
        }

        // Find Match: host queues the lobby (solo or duo) for 2v2 matchmaking.
        if (action === "find2v2Match") {
            ws.send(JSON.stringify({ type: "find2v2Match" }))
            sendEvent("multiplayer_find_2v2_match")
        }

        if (action === 'screen') {
            ws.send(JSON.stringify({ type: "screen", screen: args[0] }))
        }


    }

    // WebSocket connect / reconnect lives in MultiplayerProvider (pages/_app.js)
    // so navigation between pages that mount Home (e.g. / -> /es, /daily -> /es/daily)
    // doesn't tear down and re-open the connection — which previously caused the
    // server to kick the older connection with a "userAlreadyConnected" error.

    useEffect(() => {
        if (inCrazyGames || window.poki) {
            // Determine if actual gameplay is happening
            const isInGameplay = ((screen === "singleplayer" || screen === "countryGuesser") && singlePlayerRound && !singlePlayerRound.done) ||
                (screen === "onboarding" && onboarding && !onboarding.completed) ||
                (multiplayerState?.inGame && multiplayerState?.gameData?.state === "guess");

            if (isInGameplay) {
                try {
                    window.CrazyGames.SDK.game.gameplayStart();
                } catch (e) { }
                try {
                    if (window.poki) window.PokiSDK.gameplayStart();
                } catch (e) { }
            } else {
                try {
                    window.CrazyGames.SDK.game.gameplayStop();
                } catch (e) { }
                try {
                    if (window.poki) window.PokiSDK.gameplayStop();
                } catch (e) { }
            }
        }
    }, [screen, inCrazyGames, singlePlayerRound, onboarding, multiplayerState?.inGame, multiplayerState?.gameData?.state])

    useEffect(() => {
        // Wait for verified (not just connected) to ensure verify message was received by server
        if (multiplayerState?.verified && inCrazyGames) {

            // check if joined via invite link
            try {
                let code = window.CrazyGames.SDK.game.getInviteParam("code")
                let instantJoin = (inCrazyGames && window.CrazyGames.SDK.game.isInstantMultiplayer) || window.location.search.includes("instantJoin");

                if (window.CrazyGames.SDK.game.getInviteParam("code") || window.CrazyGames.SDK.game.isInstantMultiplayer) {
                    setInCrazyGames(true);
                }

                if (code || instantJoin) {

                    if (typeof code === "string") {
                        try {
                            code = parseInt(code)
                        } catch (e) {
                        }
                    }

                    setOnboardingCompleted(true)
                    setOnboarding(null)
                    setLoading(false)
                    setScreen("home")
                    if (code) {

                        // join Party
                        handleMultiplayerAction("joinPrivateGame")
                        // set the code
                        setMultiplayerState((prev) => ({
                            ...prev,
                            joinOptions: {
                                ...prev.joinOptions,
                                gameCode: code,
                                progress: true
                            }
                        }))
                        // press go
                        setTimeout(() => {
                            handleMultiplayerAction("joinPrivateGame", code)
                        }, 1000)
                    } else {
                        // create Party
                        handleMultiplayerAction("createLobby", "party")
                    }

                }

            } catch (e) { }

        }
    }, [multiplayerState?.verified, inCrazyGames])

    // Handle ?party= URL param to auto-join a party
    useEffect(() => {
        if (!multiplayerState?.verified || inCrazyGames) return;
        const params = new URLSearchParams(window.location.search);
        const partyCode = params.get("party");
        if (!partyCode) return;

        // Clean up the URL
        params.delete("party");
        const newSearch = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));

        const code = parseInt(partyCode);
        if (isNaN(code)) return;

        // Skip if already in this exact party
        if (multiplayerState?.inGame && multiplayerState?.gameData?.code === code) return;

        // Clear onboarding state if active
        setOnboardingCompleted(true);
        setOnboarding(null);
        setLoading(false);

        // Server already skipped rejoin due to skipRejoin flag, so player is free to join
        handleMultiplayerAction("joinPrivateGame", code);
    }, [multiplayerState?.verified])

    useEffect(() => {
        if (multiplayerState?.inGame && multiplayerState?.gameData?.state === "end") {
            // save the final players
            setMultiplayerState((prev) => {
                if (!prev.gameData) return prev;
                return {
                    ...prev,
                    gameData: {
                        ...prev.gameData,
                        finalPlayers: prev.gameData.players
                    }
                };
            })
        }

        if (multiplayerState?.gameData?.state === "waiting") {
            // remove gameData.finalPlayers
            setMultiplayerState((prev) => {
                if (!prev.gameData) return prev;
                return { ...prev, gameData: { ...prev.gameData, finalPlayers: undefined } };
            });
        }
    }, [multiplayerState?.gameData?.state])

    useEffect(() => {
        if (multiplayerState?.inGame && multiplayerState?.gameData?.state === "end") {
            setMultiplayerEndAnswerHoldExpired(false);
            if (multiplayerEndAnswerHoldTimerRef.current) {
                clearTimeout(multiplayerEndAnswerHoldTimerRef.current);
            }
            multiplayerEndAnswerHoldTimerRef.current = setTimeout(() => {
                setMultiplayerEndAnswerHoldExpired(true);
                multiplayerEndAnswerHoldTimerRef.current = null;
            }, ROUND_OVER_FADE_MS);
            return () => {
                if (multiplayerEndAnswerHoldTimerRef.current) {
                    clearTimeout(multiplayerEndAnswerHoldTimerRef.current);
                    multiplayerEndAnswerHoldTimerRef.current = null;
                }
            };
        }

        setMultiplayerEndAnswerHoldExpired(false);
        if (multiplayerEndAnswerHoldTimerRef.current) {
            clearTimeout(multiplayerEndAnswerHoldTimerRef.current);
            multiplayerEndAnswerHoldTimerRef.current = null;
        }
    }, [multiplayerState?.inGame, multiplayerState?.gameData?.state])


    useEffect(() => {
        // Subscribe to WS messages via the provider. The provider owns the
        // connection lifecycle (so onmessage/onclose/onerror live there too)
        // and forwards every parsed message to subscribers like this one.
        const unsubscribe = subscribeMessages((data) => {

            if (data.type === "restartQueued") {
                setMaintenance(data.value ? true : false)
                if (data.value) {
                    toast.info(text("maintenanceModeStarted"))
                } else if (!data.value && window.maintenance) {
                    toast.info(text("maintenanceModeEnded"))
                }
                window.maintenance = data.value ? true : false;

            }
            if (data.type === "t") {
                const offset = data.t - Date.now();
                const sync = timeSyncRef.current;
                const now = Date.now();
                const useFallback = sync.lastSyncAt === 0 || (now - sync.lastSyncAt) > 60000;
                if (useFallback && Math.abs(offset) < 300000) {
                    if (window.debugTimeSync) {
                        console.log("[TimeSync] fallback", {
                            offset,
                            serverNow: data.t,
                            lastSyncAt: sync.lastSyncAt
                        });
                    }
                    setTimeOffset(offset)
                }
            }
            if (data.type === "timeSync") {
                updateTimeOffsetFromSync(data.serverNow, data.clientSentAt);
            }

            if (data.type === "elo") {
                setEloData((prev) => ({
                    ...prev,
                    league: data.league,
                    elo: data.elo,
                }))
                // Also update session to keep it in sync
                setSession((prev) => ({
                    ...prev,
                    token: {
                        ...prev?.token,
                        elo: data.elo,
                        league: data.league,
                    }
                }));
            }

            // verify / cnt / error state updates live in MultiplayerProvider
            // (they must run even with no consumer mounted). Home adds only
            // what the provider can't do:
            if (data.type === "error") {
                // Force the close→reconnect cycle. For 'verifyError' (DB blip
                // during verify) the server deliberately leaves the socket
                // open and THIS close is what paces the retry; for uac /
                // failedToLogin the server closes anyway, so it's a no-op.
                ws.close();
                // Translated toast (the provider has no `text`).
                toast(data.message === 'uac' ? text('userAlreadyConnected') : data.message, { type: 'error' });

            } else if (data.type === "game") {
                // A match (or private game) started — we're no longer waiting on a
                // queue ack, so retire the watchdog.
                clearQueueConfirmWatchdog();
                // Dispatch global event to close any open modals/screens
                window.dispatchEvent(new CustomEvent('gameStarting'));

                // Close all open modals except party modal for party games
                setAccountModalOpen(false);
                // Shop mounts only while open (its render is flag-gated), so
                // this unmounts it instantly — same treatment as the account
                // modal, and it also covers a profile→shop handoff in flight.
                setShopModalOpen(false);
                setShopModalCoveredEntry(false);
                setGameOptionsModalShown(false);
                setSettingsModal(false);
                setMapModal(false);
                setFriendsModal(false);
                setLoginModalOpen(false);
                setShowDiscordModal(false);
                setSelectCountryModalShown(false);
                setConnectionErrorModalShown(false);

                setScreen("multiplayer")

                // Play Again duo regroup: the staging lobby arrives queue-bound
                // (queueBoundDuo) and the server's enter2v2Queue follows in the
                // same burst. Skip straight to the queue screen instead of
                // painting the lobby card for a frame in between. Solo
                // survivors never get the flag — stage-1 teammate search
                // renders inside their lobby card — and the deliberate
                // "Queueing in 3…" preview beats don't set it either.
                if (data.is2v2Lobby && data.state === "waiting" && data.queueBoundDuo) {
                    setMultiplayerState((prev) => ({
                        ...prev,
                        inGame: false,
                        gameData: null,
                        lobbyIntent: null,
                        gameQueued: "2v2",
                        queueStage: "opponents",
                        // Emotes stay live on the queue banner (the duo still
                        // shares its staging lobby server-side) — keep my id
                        // around for self-styling now that gameData is gone.
                        queueMyId: data.myId,
                        joinOptions: initialMultiplayerState.joinOptions,
                    }));
                    return;
                }

                setMultiplayerState((prev) => {
                    setGameOptions((prev) => ({
                        ...prev,
                        nm: data.nm,
                        npz: data.npz,
                        showRoadName: data.showRoadName
                    }))

                    const incomingRoundLoc = (data.locations ?? prev?.gameData?.locations)?.[data.curRound - 1];
                    const needsRejoinGuessLocation = !!(
                        prev?.gameData?.state === "guess" &&
                        data.state === "guess" &&
                        !prev?.gameData?.locations?.[data.curRound - 1] &&
                        incomingRoundLoc
                    );

                    // Two DISTINCT questions about the between-rounds preload,
                    // and conflating them was the "white flash at round start"
                    // bug:
                    //  - pointed: the pano was told to navigate to THIS round.
                    //    Means we must not renavigate it (that would throw the
                    //    in-flight work away), NOT that there is anything
                    //    watchable on screen yet.
                    //  - ready: the iframe's load event fired for this round.
                    //    Only THEN may the round start with no loading screen —
                    //    unhiding a pointed-but-still-loading iframe shows
                    //    Google's white mid-load document with nothing covering
                    //    it. Ref, not state: this closure is long-lived.
                    // pointed && !ready = short reveal / slow network: keep the
                    // in-flight load, but put the loading overlay up; the
                    // iframe's own onLoad clears it (same path a normal load
                    // takes).
                    const panoPointedAtThisRound = !!(
                        incomingRoundLoc && mpPanoRoundRef.current === data.curRound
                    );
                    const panoPreloadedForThisRound = panoPointedAtThisRound &&
                        mpPanoLoadedRoundRef.current === data.curRound;

                    // `state !== "guess"`, not `=== "getready"`: a reconnect
                    // snapshot can jump waiting -> guess directly (the server
                    // only ever ADVANCES getready -> guess, but a full payload
                    // after a dropped socket lands wherever the game is now).
                    // The old getready-only test skipped setLoading + the pano
                    // swap on that path — no cover, no location, a stale pano
                    // unhiding the instant the waiting term dropped.
                    if (((!prev.gameData || (prev?.gameData?.state !== "guess")) && data.state === "guess") || needsRejoinGuessLocation) {
                        setPinPoint(null)
                        // Set loading state when new round starts to show loading animation
                        if (!panoPreloadedForThisRound) setLoading(true)
                        // Close the mobile minimap IN THIS BATCH, not in
                        // gameUI's after-paint effect: multiplayerShowAnswer
                        // derives false the moment state hits 'guess', so a
                        // still-true miniMapShown rendered the expanded
                        // guess/hint buttons for a frame between the reveal
                        // teardown and the effect's reset — the "opened
                        // minimap flashes at round start" bug.
                        setMiniMapShown(false)
                        // latLong ALWAYS advances here — it is the round's
                        // answer, and the reveal map / EndBanner read it.
                        if (incomingRoundLoc) {
                            setLatLong(incomingRoundLoc)
                        }
                        if (!panoPointedAtThisRound) {
                            // Increment key to force refresh even if coords are the same
                            setLatLongKey(k => k + 1)
                            setPanoLocation(incomingRoundLoc ?? null)
                            // Keep the ref honest: this path is now the thing
                            // that owns which round the pano shows.
                            mpPanoRoundRef.current = incomingRoundLoc ? data.curRound : null;
                        }
                    }

                    // Rejoin — restore latLong and pinPoint from game state
                    if (!prev.gameData && data.state === "getready" && data.locations && data.curRound > 1) {
                        setLatLong(data.locations[data.curRound - 2])
                    }
                    if ((!prev.gameData || needsRejoinGuessLocation) && data.players) {
                        const me = data.players.find(p => p.id === data.myId);
                        if (me?.guess) {
                            import('leaflet').then(L => {
                                setPinPoint(L.latLng(me.guess[0], me.guess[1]));
                            });
                        }
                    }

                    return {
                        ...prev,
                        gameQueued: false,
                        queueStage: null,
                        queuedAt: null,
                        queueEta: null,
                        // Queue-scoped flag ends here; gameData.isPlacement
                        // carries the in-game labelling from this point on.
                        placementPending: false,
                        inGame: true,
                        gameData: {
                            ...prev.gameData,
                            ...data,
                            type: undefined
                        },
                        // A joiner's 'join' intent is served once the game
                        // arrives; creators keep 'party'/'2v2' for lobby
                        // presentation (primary action, title).
                        lobbyIntent: prev.lobbyIntent === 'join' ? null : prev.lobbyIntent,
                        joinOptions: initialMultiplayerState.joinOptions,
                    }
                })


            } else if (data.type === "playAgain2v2") {
                // Post-game Play Again consensus counter for the results
                // screen ("Play Again (1/2)"). Server re-broadcasts on every
                // ack and on teammate departure (which resets acks).
                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            playAgain2v2: { needed: data.needed, ackedIds: data.ackedIds || [] }
                        }
                    };
                });
            } else if (data.type === "duelEnd") {
                // { draw: boolean, newElo: number, oldElo: number, winner: boolean, timeElapsed: number }

                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            duelEnd: data,
                            // Fresh consensus per match — a stale counter from a
                            // previous game must never render on this end screen
                            // (the server re-broadcasts the real one right after).
                            playAgain2v2: null,
                            // Same rule, same reason: last match's receipt must
                            // never be on screen with this match's verdict. The
                            // new one lands moments later on its own message.
                            stampsEarned: null
                        }
                    };
                });
            } else if (data.type === "stampsEarned") {
                // The stamps receipt for the game that just ended. It rides its
                // OWN message rather than duelEnd because the grants sit behind
                // the game save (ws Game.js sendStampEarnings) — duelEnd must
                // never wait on a DB write. `stampsPending` on duelEnd told the
                // end screen to reserve the row; this fills it.
                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            stampsEarned: data
                        }
                    };
                });
                // The wallet total, straight from the server's post-grant read.
                // Without this the navbar/shop balance stays at its pre-game
                // value until something else refetches entitlements.
                if (typeof data.balance === 'number') {
                    setSession((prev) => (prev?.token
                        ? { ...prev, token: { ...prev.token, stamps: data.balance } }
                        : prev));
                }
            } else if (data.type === "queueJoined") {
                // Server confirms we're actually in the duel queue (sent for BOTH
                // ranked and unranked). This is the ack the join watchdog waits on;
                // without it there's no way to tell "queued, waiting" apart from
                // "server never queued me".
                clearQueueConfirmWatchdog();
                // The SERVER's join instant. The elapsed timer is derived from
                // it on every render against timeOffset rather than counted up
                // locally, so a throttled background tab can't lose seconds.
                // Falls back to our own clock only for a server predating this.
                setMultiplayerState((prev) => ({
                    ...prev,
                    queuedAt: typeof data.queuedAt === "number" ? data.queuedAt : Date.now() + timeOffset
                }));
            } else if (data.type === "queuePlacement") {
                // Follow-up to queueJoined, sent only when this ranked queue
                // will resolve into the placement seeding match (the server's
                // eligibility read lands after the join ack). Drives the
                // "Placement match" labelling on the searching screen.
                setMultiplayerState((prev) => ({ ...prev, placementPending: !!data.placement }));
            } else if (data.type === "enter2v2Queue") {
                // Server moved us into 2v2 matchmaking — from a lobby's Find
                // Match, or an auto-requeue after a pre-game cancel.
                // Stage 1 (finding a teammate) renders INSIDE the lobby card,
                // so keep inGame/gameData/lobbyIntent — PartyLobby shows the
                // searching seat. Stage 2 (finding opponents) shows the queue
                // banner as before.
                const teammateStage = data.stage === "teammate";
                setScreen("multiplayer")
                setMultiplayerState((prev) => ({
                    ...prev,
                    inGame: teammateStage ? prev.inGame : false,
                    // Stage 1 keeps the lobby card, but any "Queueing in 3…"
                    // countdown is over the moment we're actually queued —
                    // clear the stamp so a stale one can't keep ticking.
                    gameData: teammateStage
                        ? (prev.gameData ? { ...prev.gameData, autoQueueInMs: null } : prev.gameData)
                        : null,
                    lobbyIntent: teammateStage ? prev.lobbyIntent : null,
                    gameQueued: "2v2",
                    queueStage: teammateStage ? "teammate" : "opponents",
                    // Stage 2 wipes gameData but the duo still shares its
                    // staging lobby server-side, so emotes keep flowing on the
                    // queue banner — preserve my id for self-styling.
                    queueMyId: prev.gameData?.myId ?? prev.queueMyId,
                    // 2v2 never receives a `queueJoined` ack, so it had no
                    // start instant and the queue screen showed no clock at all
                    // (mobile, which always renders the digits, showed a frozen
                    // "0:00"). Stamp one. ONCE PER SEARCH — `??` keeps any
                    // existing value, because stage 2 arrives as a SECOND
                    // enter2v2Queue partway through the same search and
                    // re-stamping would restart the clock at 0:00 the moment a
                    // teammate was found. Every queue teardown nulls it, so a
                    // null here always means this is a new search.
                    //
                    // A LOCAL instant, unlike the 1v1 server stamp. Safe: the
                    // queue screen uses this only as the search's IDENTITY and
                    // anchors its timer on a local performance.now() at first
                    // sight of it. Nothing reads the value as server time.
                    queuedAt: prev.queuedAt ?? Date.now(),
                }))
            } else if (data.type === "publicDuelRange") {
                // Also a valid join confirmation for ranked — retire the watchdog.
                clearQueueConfirmWatchdog();
                setMultiplayerState((prev) => ({
                    ...prev,
                    publicDuelRange: data.range
                }))
            } else if (data.type === "queueEta") {
                // How long this rating band's queue USUALLY takes, in total,
                // from the moment you joined — not a countdown. The server
                // latches it for the session, so it lands once and then only
                // ever flips state. Ranked only.
                setMultiplayerState((prev) => ({
                    ...prev,
                    queueEta: {
                        state: data.state,
                        value: data.value ?? null,
                        unit: data.unit ?? null,
                        tier: data.tier ?? null,
                        seconds: typeof data.seconds === "number" ? data.seconds : null,
                        longAfterSeconds: typeof data.longAfterSeconds === "number"
                            ? data.longAfterSeconds
                            : null
                    }
                }))
            } else if (data.type === "maxDist") {
                const maxDist = data.maxDist;
                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            maxDist
                        }
                    };
                })

            } else if (data.type === "player") {
                if (data.action === "remove") {
                    setMultiplayerState((prev) => {
                        if (!prev.gameData?.players) return prev;
                        return {
                            ...prev,
                            gameData: {
                                ...prev.gameData,
                                players: prev.gameData.players.filter((p) => p.id !== data.id)
                            }
                        };
                    })
                } else if (data.action === "add") {
                    setMultiplayerState((prev) => {
                        if (!prev.gameData?.players) return prev;
                        return {
                            ...prev,
                            gameData: {
                                ...prev.gameData,
                                players: [...prev.gameData.players, data.player]
                            }
                        };
                    })
                } else if (data.action === "update") {
                    // PARTIAL merge, never a replace. The server sends this when
                    // someone equips a cosmetic mid-game (ws.js
                    // /cosmetics-updated/) and deliberately ships only a `patch`
                    // of the changed fields — a whole-object swap here would
                    // stomp live roster state (score, latLong, final,
                    // disconnected) with values that endpoint never knew.
                    //
                    // This branch did not exist, so the patch was parsed and
                    // silently discarded: equipping a pin or glow during a match
                    // changed nothing on anyone else's screen until a rejoin.
                    const id = data.id;
                    const patch = data.patch;
                    if (id && patch) {
                        setMultiplayerState((prev) => {
                            if (!prev.gameData?.players) return prev;
                            return {
                                ...prev,
                                gameData: {
                                    ...prev.gameData,
                                    players: prev.gameData.players.map((p) =>
                                        p.id === id ? { ...p, ...patch } : p
                                    )
                                }
                            };
                        });
                    }
                }
            } else if (data.type === "place") {
                // Interim teammate placements AND final placements (broadcast
                // to everyone) both go through setState. The old final-guess
                // path mutated the player object in place with no re-render —
                // it only appeared to work because the 100ms round-timer tick
                // happened to repaint during 'guess'.
                const id = data.id;
                setMultiplayerState((prev) => {
                    if (!prev.gameData?.players) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            players: prev.gameData.players.map((p) =>
                                p.id === id ? { ...p, final: data.final, latLong: data.latLong } : p
                            )
                        }
                    };
                });
            } else if (data.type === "gameShutdown") {
                // gameShutdown only needs to force-reset the client when the
                // user is still in a game client-side (e.g. party host left
                // mid-round — the server is telling them the game is gone).
                // Two cases where we must NOT run the reset:
                //
                //  1. Public game in 'end' state — the user is viewing the
                //     results screen; back / play-again own the teardown.
                //
                //  2. !inGame already — backBtnPressed has already done the
                //     teardown locally. The server's gameShutdown is the
                //     echo of our own leaveGame. Running the reset here
                //     would clobber state that the re-queue effect has
                //     meanwhile set up (e.g. Play Again → handleMultiplayerAction
                //     sets gameQueued="publicDuel" + screen="multiplayer",
                //     and we'd wipe both and bounce the user to home).
                //
                // Check from the outer closure, not from inside a setState
                // updater — updaters run later in the commit phase, so a
                // flag set there is still false when we branch on it and
                // we'd flash setScreen("home") before the render settles,
                // which made the navbar glitch.
                if (
                    !multiplayerState?.inGame ||
                    (
                        multiplayerState?.gameData?.public &&
                        multiplayerState?.gameData?.state === 'end'
                    )
                ) {
                    return;
                }

                setScreen("home") // location + loading teardown: home sweeper
                setMultiplayerState((prev) => ({
                    ...initialMultiplayerState,
                    connected: true,
                    nextGameQueued: prev.nextGameQueued,
                    nextGameType: prev.nextGameType,
                    playerCount: prev.playerCount,
                    guestName: prev.guestName,
                    createOptions: prev.createOptions,
                    joinOptions: prev.joinOptions,
                }));
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null
                }))
            } else if (data.type === "gameCancelled") {
                // Game was cancelled before it started (opponent left during countdown)
                // No ELO was lost - just return to home and optionally re-queue
                toast.info(text("opponentLeftBeforeStart") || "Opponent left before the game started. Returning to queue...");

                setScreen("home") // location + loading teardown: home sweeper

                setMultiplayerState((prev) => {
                    return {
                        ...initialMultiplayerState,
                        connected: true,
                        nextGameQueued: true, // Auto re-queue the player
                        nextGameType: 'ranked',
                        playerCount: prev.playerCount,
                        guestName: prev.guestName
                    }
                });
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null
                }))
            } else if (data.type === "verify") {
                // Account verify ack (guest acks carry guestName; this one
                // doesn't, so an account is now attached to this socket — the
                // server stamps accountId BEFORE sending the ack). If a guest's
                // 2v2 party join was gated and they signed in from the
                // conversion modal, complete the join.
                if (!data.guestName && joinAfterLoginRef.current) {
                    const code = joinAfterLoginRef.current;
                    joinAfterLoginRef.current = null;
                    const sess = sessionRef.current;
                    if (sess?.token?.secret && !sess.token.username && !inCrazyGames) {
                        // FRESH SIGNUP: no username yet, so the mandatory
                        // username modal is about to cover the screen and its
                        // save reloads the page — joining now would seat a
                        // nameless account and the reload would orphan it
                        // (the server refuses unnamed joins anyway). Park the
                        // code back in the URL: after the reload the existing
                        // ?party= deep-link flow joins the now-named account.
                        parkPartyJoin(code);
                    } else {
                        // Existing account: no modal, no reload — join now,
                        // same socket, already upgraded.
                        handleMultiplayerAction("joinPrivateGame", code);
                    }
                }
            } else if (data.type === "gameJoinError") {
                if (data.error === 'Link your Google account to play 2v2' && !HIDE_ACCOUNT_UI) {
                    // ws joinPrivateGame's guest gate on 2v2 staging lobbies.
                    // A guest opening a friend's 2v2 invite is a conversion
                    // moment, not a bad code — don't let the generic mapping
                    // below render it as "invalid party code". Open the same
                    // login upsell the home 2v2 button shows, and stash the
                    // code for the post-login retry (verify branch above).
                    joinAfterLoginRef.current = lastJoinCodeRef.current || null;
                    // Personalize with the inviter when the server sent it
                    // (additive field; old ws builds simply don't include it).
                    openLoginUpsell('2v2', data.hostName || null);
                    if (multiplayerState.lobbyIntent) {
                        // Manual code entry: stay on the join screen, just stop
                        // the spinner — the modal carries the messaging.
                        setMultiplayerState((prev) => ({
                            ...prev,
                            joinOptions: { ...prev.joinOptions, progress: false, error: false }
                        }));
                    } else {
                        // Deep link (?party=): land on home behind the modal —
                        // same teardown as the generic branch, minus the toast.
                        setScreen("home");
                        setMultiplayerState((prev) => ({
                            ...initialMultiplayerState,
                            connected: prev.connected,
                            verified: prev.verified,
                            playerCount: prev.playerCount,
                            guestName: prev.guestName
                        }));
                    }
                } else if (data.error === 'Choose a username first' && lastJoinCodeRef.current) {
                    // Server unnamed-guard: the account exists but hasn't
                    // picked a name, so the username modal owns the screen and
                    // its save reloads the page. Re-park the attempted code so
                    // the reload's ?party= flow completes the join — this
                    // self-heals any race where a join fired before the client
                    // learned the account is unnamed. No toast: the modal is
                    // the messaging.
                    parkPartyJoin(lastJoinCodeRef.current);
                    if (multiplayerState.lobbyIntent) {
                        setMultiplayerState((prev) => ({
                            ...prev,
                            joinOptions: { ...prev.joinOptions, progress: false, error: false }
                        }));
                    } else {
                        setScreen("home");
                    }
                } else {
                    // Map ONLY the known bad-code strings to locale keys;
                    // any other server sentence (gate messages like 'Choose a
                    // username first') passes through verbatim — collapsing
                    // unknowns into invalidPartyCode told gated users the code
                    // was bad instead of showing the real reason. Mirrors the
                    // mobile store's gameJoinError mapping.
                    const errorKey = data.error === 'Game is full' ? 'partyFull'
                        : data.error === 'Invalid game code' ? 'invalidPartyCode'
                            // Gate sentences that name Google/login ("Log in to
                            // join this party", the 2v2 link message) swap to
                            // neutral copy on no-account builds; null everywhere
                            // else, so the server's own wording still passes.
                            : neutralGateKey(data.error)
                                ?? null;
                    const errorMsg = errorKey ? (text(errorKey) || data.error) : data.error;
                    if (multiplayerState.lobbyIntent) {
                        // On the join screen (or a lobby shell) → inline error.
                        setMultiplayerState((prev) => ({
                            ...prev,
                            joinOptions: {
                                ...prev.joinOptions,
                                error: errorMsg,
                                progress: false
                            }
                        }))
                    } else {
                        // Joined via link — show toast and go home
                        toast(errorMsg, { type: 'error' });
                        setScreen("home");
                        setMultiplayerState((prev) => ({
                            ...initialMultiplayerState,
                            connected: prev.connected,
                            verified: prev.verified,
                            playerCount: prev.playerCount,
                            guestName: prev.guestName
                        }));
                    }
                }
            } else if (data.type === 'generating') {
                // location generation before round
                setMultiplayerState((prev) => {
                    if (!prev.gameData) return prev;
                    return {
                        ...prev,
                        gameData: {
                            ...prev.gameData,
                            generated: data.generated
                        }
                    }
                })
            } else if (data.type === "friendReq") {
                const from = data.name;
                const id = data.id;
                const toAccept = (closeToast) => {
                    ws.send(JSON.stringify({ type: 'acceptFriend', id }))
                    closeToast()
                }
                const toDecline = (closeToast) => {
                    ws.send(JSON.stringify({ type: 'declineFriend', id }))
                    closeToast()
                }
                const toastComponent = function ({ closeToast }) {
                    return (
                        <div>
                            <span>{text("youGotFriendReq", { from })}</span>

                            <button onClick={() => toAccept(closeToast)} className={"accept-button"}>✔</button>
                            &nbsp;
                            <button onClick={() => toDecline(closeToast)} className={"decline-button"}>✖</button>
                        </div>
                    )
                }

                toast(toastComponent, { type: 'info', theme: "dark" })


            } else if (data.type === 'toast') {
                // Round-pressure nudges (opponent guessed / other team locked in,
                // you're the last guesser) get an audible ping — the toast
                // alone is easy to miss while panning a street view. Mix
                // ratio ~-6dB: at full tilt the ping barked over everything.
                if (['opponentLocked', 'otherTeamLocked', 'lastGuesser'].includes(data.key)) playSfx('multinoti', { volume: 0.5 });
                // Sentence-as-key gate toasts name Google/login; no-account
                // builds get neutral copy instead (null = pass through).
                const toastKey = neutralGateKey(data.key) ?? data.key;
                toast(text(toastKey, data), { type: data.toastType ?? 'info', theme: "dark", closeOnClick: data.closeOnClick ?? false, autoClose: data.autoClose ?? 5000 })
            } else if (data.type === 'invite') {
                // code, invitedByName, invitedById
                const { code, invitedByName, invitedById } = data;

                const toAccept = (closeToast) => {
                    // Accepting yanks you out of the current game server-side
                    // (forfeit): mid-match that can cost ELO or insta-lose, so
                    // route through the confirm modal instead of sending.
                    // Read through the ref — this closure can outlive several
                    // state changes while the toast sits on screen.
                    const mp = multiplayerStateRef.current;
                    const liveGame = mp?.inGame && mp?.gameData && !["waiting", "end"].includes(mp.gameData.state);
                    if (liveGame) {
                        setInviteConfirm({ code, invitedById, from: invitedByName });
                        setInviteConfirmOpen(true);
                        closeToast();
                        return;
                    }
                    ws.send(JSON.stringify({ type: 'acceptInvite', code, invitedById }))
                    closeToast()
                }
                const toDecline = (closeToast) => {
                    closeToast()
                }
                const toastComponent = function ({ closeToast }) {
                    return (
                        <div>
                            <span>{text("youGotInvite", { from: invitedByName })}</span>

                            <button onClick={() => toAccept(closeToast)} className={"accept-button"}>{text("join")}</button>
                            &nbsp;
                            <button onClick={() => toDecline(closeToast)} className={"decline-button"}>{text("decline")}</button>
                        </div>
                    )
                }

                toast(toastComponent, { type: 'info', theme: "dark", autoClose: 10000 })
            } else if (data.type === 'streak') {
                const streak = data.streak;

                // Only streak CONTINUATIONS (2+) toast. Resets are silent by
                // ruling, and the "streak started" toast was removed (server
                // no longer sends streak:1; the guard also keeps a stale
                // server from rendering a bogus started/0-day toast).
                if (streak > 1) {
                    toast(text("streakGained", { streak }), { type: 'info', theme: "dark", autoClose: 5000, closeOnClick: true })
                }
            }
        });

        return unsubscribe;
        // The handler closes over multiplayerState/timeOffset/gameOptions.extent;
        // re-subscribe whenever any of those change so the closure stays fresh.
    }, [subscribeMessages, ws, multiplayerState, timeOffset, gameOptions?.extent]);

    // Home-side cleanup when the WS goes from connected to disconnected.
    // The provider already resets multiplayerState on close; this effect handles
    // the home-only side effects (error modal, redirect to home, toast).
    // `text` is read through a ref so we don't re-fire on every Home render
    // (useTranslation returns a fresh `t` closure each render).
    const textRef = useRef(text);
    useEffect(() => { textRef.current = text; }, [text]);
    // Keep the latest multiplayerState readable from the delayed queue-confirm
    // watchdog (which would otherwise close over a stale snapshot).
    useEffect(() => { mpStateRef.current = multiplayerState; }, [multiplayerState]);
    const prevWsForCloseRef = useRef(null);
    useEffect(() => {
        if (prevWsForCloseRef.current && !ws) {
            if (window.screen !== "home" && window.screen !== "singleplayer" && window.screen !== "onboarding" && window.screen !== "countryGuesser" && window.screen !== "daily") {
                setMultiplayerError(true);
                setLoading(false);
                toast.info(textRef.current("connectionLostRecov"));
                setScreen("home");
            }
        }
        prevWsForCloseRef.current = ws;
    }, [ws]);

    useEffect(() => {
        window.screen = screen;
    }, [screen])

    // useLayoutEffect (not useEffect): the Play Again / gameCancelled
    // teardown commits screen "home" + nextGameQueued in one pass, and this
    // effect is what re-queues into "multiplayer". As a plain useEffect that
    // ran AFTER paint, so the full home screen (menu, ELO button, home-mode
    // navbar) flashed for a frame on every Play Again. Pre-paint, the
    // re-queue's setScreen lands in the same visual frame as the teardown —
    // the home frame never paints. Safe against double-fire: publicDuel/
    // unrankedDuel clear nextGameQueued synchronously, so the re-run this
    // triggers no-ops. On ad platforms crazyMidgame defers the callback
    // behind an interstitial — home showing under the ad overlay there is
    // unavoidable and pre-existing.
    useLayoutEffect(() => {
        if (multiplayerState?.connected && !multiplayerState?.inGame && multiplayerState?.nextGameQueued) {
            if (multiplayerState?.nextGameType === "ranked") {
                handleMultiplayerAction("publicDuel")
            } else if (multiplayerState?.nextGameType === "unranked") {
                handleMultiplayerAction("unrankedDuel")
            }
        }
    }, [multiplayerState, timeOffset])

    useEffect(() => {
        if (multiplayerState?.connected) {
            handleMultiplayerAction("screen", screen);
        }
    }, [screen]);


    function guessMultiplayer(send) {
        if (!send) return;
        // Use the ref to always get the latest pinPoint, avoiding stale closure issues
        // where pinPoint from a previous render (or even previous round) could be sent
        const latestPinPoint = pinPointRef.current;
        if (!multiplayerState.inGame || multiplayerState.gameData?.state !== "guess" || !latestPinPoint) return;

        // Prevent duplicate sends (e.g. space bar spam) — check optimistic final flag
        const me = multiplayerState.gameData.players.find(p => p.id === multiplayerState.gameData.myId);
        if (me?.final) return;

        const pinpointLatLong = [latestPinPoint.lat, latestPinPoint.lng];

        // Optimistically update local player state so UI updates instantly
        if (me) {
            me.final = true;
            me.latLong = pinpointLatLong;
        }

        ws.send(JSON.stringify({ type: "place", latLong: pinpointLatLong, final: true, round: multiplayerState.gameData?.curRound }))
    }

    function sendInvite(id) {
        if (!ws || !multiplayerState?.connected) return;
        ws.send(JSON.stringify({ type: 'inviteFriend', friendId: id }))
    }

    useEffect(() => {
        try {
            const streak = gameStorage.getItem("countryStreak");
            if (streak) {
                const parsedStreak = parseInt(streak);
                if (!isNaN(parsedStreak)) {
                    setCountryStreak(parsedStreak)
                } else {
                    setCountryStreak(0)
                    gameStorage.setItem("countryStreak", 0)
                }
            }
            const cgs = gameStorage.getItem("countryGuessrStreak");
            if (cgs) {
                const parsed = parseInt(cgs);
                if (!isNaN(parsed)) setCgStreak(parsed);
            }

            // preload/cache pin images (kept alive in window.__pinImageCache)
            preloadPinImages();
        } catch (e) { }

    }, [])

    // Leading-edge throttle: every press restarts the pano fetch, so spam
    // clicks queue reloads and judder the iframe. Both reload buttons
    // (navbar + duel) route through here.
    const lastReloadAtRef = useRef(0);
    function reloadBtnPressed() {
        const now = Date.now();
        if (now - lastReloadAtRef.current < 1000) return;
        lastReloadAtRef.current = now;
        if (window.reloadLoc) {
            window.reloadLoc()
        }
    }

    function crazyMidgame(adFinishedRaw = () => { }) {
        // Silence music/SFX for the whole ad break (Poki QA requires it; CG
        // wants it too). Every exit path below funnels through adFinished, so
        // the unduck can't be missed. The no-ad fallthrough ducks and unducks
        // back-to-back, which is inaudible.
        duckAudio(true);
        const adFinished = () => { duckAudio(false); adFinishedRaw(); };
        if (window.inCrazyGames && window.CrazyGames.SDK.environment !== "disabled") {
            try {
                const callbacks = {
                    adFinished: () => adFinished(),
                    adError: (error) => adFinished(),
                };
                window.CrazyGames.SDK.ad.requestAd("midgame", callbacks);
            } catch (e) {
                console.warn("error requesting midgame ad", e)
                adFinished()
            }
        } else if (process.env.NEXT_PUBLIC_COOLMATH === "true" && Date.now() - window.lastCoolmathAd > 600000) {
            try {
                window.lastCoolmathAd = Date.now();
                let cleanedUp = false;
                let safetyTimeout = null;
                const cleanup = () => {
                    if (cleanedUp) return;
                    cleanedUp = true;
                    document.removeEventListener("adBreakStart", onStart);
                    document.removeEventListener("adBreakComplete", onEnd);
                    if (safetyTimeout) {
                        clearTimeout(safetyTimeout);
                        safetyTimeout = null;
                    }
                };
                function onEnd() {
                    cleanup();
                    adFinished();
                }
                function onStart() {
                    // Real ad started — cancel the no-fill fallback so it can't resume mid-ad.
                    if (safetyTimeout) {
                        clearTimeout(safetyTimeout);
                        safetyTimeout = null;
                    }
                }
                document.addEventListener("adBreakStart", onStart);
                document.addEventListener("adBreakComplete", onEnd);
                window.cmgAdBreak();
                // Fallback: if adBreakComplete never fires (no fill, blocker), release listeners and resume.
                safetyTimeout = setTimeout(() => {
                    console.warn("CMG ad timeout, forcing resume");
                    cleanup();
                    adFinished();
                }, 15000);
            } catch (e) {
                console.warn("error requesting midgame ad", e)
                adFinished()
            }
        } else if (process.env.NEXT_PUBLIC_POKI === "true") {
            try {
                // window.poki is only set after PokiSDK.init() resolves; the SDK
                // self-throttles ad frequency and resolves immediately on no-fill.
                if (window.poki && window.PokiSDK) {
                    window.PokiSDK.commercialBreak().then(() => adFinished()).catch(() => adFinished());
                } else {
                    adFinished();
                }
            } catch (e) {
                console.warn("error requesting poki commercial break", e)
                adFinished()
            }
        } else if (process.env.NEXT_PUBLIC_GAMEDISTRIBUTION === "true") {
            // The SDK initialization owns the GD request lifecycle so preroll
            // and midgame ads share identical promise/event/timeout cleanup.
            if (typeof window.requestGDInterstitial === 'function') {
                window.requestGDInterstitial(adFinished);
                return;
            }
            try {
                if (typeof gdsdk !== 'undefined' && typeof gdsdk.showAd !== 'undefined') {
                    // Clear any previous pending state to avoid leaking the prior closure.
                    if (window._gdAdTimeout) {
                        clearTimeout(window._gdAdTimeout);
                        window._gdAdTimeout = null;
                    }
                    window._gdAdFinished = adFinished;
                    // Every exit path funnels through onGDResumeGame: it
                    // removes the ad-break UI hide, clears the timeout and
                    // consumes _gdAdFinished exactly once (idempotent, so
                    // promise + SDK event + timeout can all fire safely).
                    const resume = () => {
                        if (window.onGDResumeGame) { window.onGDResumeGame(); return; }
                        if (window._gdAdTimeout) {
                            clearTimeout(window._gdAdTimeout);
                            window._gdAdTimeout = null;
                        }
                        const cb = window._gdAdFinished;
                        window._gdAdFinished = null;
                        if (cb) cb();
                    };
                    // Safety timeout in case SDK events never fire (dev mode, errors)
                    window._gdAdTimeout = setTimeout(() => {
                        console.warn("GD ad timeout, forcing resume");
                        resume();
                    }, 15000);
                    const res = gdsdk.showAd('interstitial');
                    // No-fill ("Promo not found") REJECTS this promise but does
                    // not reliably follow with SDK_GAME_START — relying on
                    // events alone left the round stuck until the 15s timeout.
                    // The promise is the authoritative completion signal.
                    if (res && typeof res.then === 'function') {
                        res.then(resume).catch(resume);
                    }
                } else {
                    adFinished();
                }
            } catch (e) {
                console.warn("error requesting GD midgame ad", e);
                adFinished();
            }
        } else {
            adFinished()
        }
    }


    useEffect(() => {
        window.crazyMidgame = crazyMidgame;

    }, []);

    function clearDuelEndExitTimers() {
        duelEndExitTimersRef.current.forEach((timer) => clearTimeout(timer));
        duelEndExitTimersRef.current = [];
    }

    function beginDuelEndExit(afterCovered) {
        clearDuelEndExitTimers();
        setDuelEndExitMaskRevealing(false);
        setDuelEndExitMaskShown(true);

        const actionTimer = setTimeout(() => {
            try {
                afterCovered();
            } finally {
                const revealTimer = setTimeout(() => {
                    setDuelEndExitMaskRevealing(true);
                    const clearTimer = setTimeout(() => {
                        setDuelEndExitMaskShown(false);
                        setDuelEndExitMaskRevealing(false);
                    }, DUEL_END_EXIT_REVEAL_MS);
                    duelEndExitTimersRef.current.push(clearTimer);
                }, DUEL_END_EXIT_COVER_MS);
                duelEndExitTimersRef.current.push(revealTimer);
            }
        }, DUEL_END_EXIT_COVER_MS);
        duelEndExitTimersRef.current.push(actionTimer);
    }

    useEffect(() => () => clearDuelEndExitTimers(), []);


    function backBtnPressed(queueNextGame = false, nextGameType, skipConfirm = false) {
        // EVERY public matchmade duel end-screen exit goes under the cover
        // mask, not just team2v2's: the 1v1 in-card Home / Play Again used to
        // run the raw single-commit teardown, which is exactly the laggy,
        // glitchy cut the mask exists to hide (see DUEL_END_EXIT_COVER_MS).
        // Private-game end screens keep their own flows (confirm modals,
        // lobby returns) and are excluded by showPublicDuelEndScreen's gate.
        if (!skipConfirm && showPublicDuelEndScreen) {
            beginDuelEndExit(() => backBtnPressed(queueNextGame, nextGameType, true));
            return;
        }

        // Confirm gate runs before any teardown so cancelling leaves the game
        // untouched (window.confirm used to run after the pin/location resets,
        // wiping them even on cancel).
        if (!skipConfirm) {
            const gd = multiplayerState?.gameData;

            // Warning for ranked duels in progress - prevent accidental forfeits
            const isRankedDuel = multiplayerState?.inGame &&
                gd?.duel && !gd?.public && gd?.state !== "end";

            // public === false, not !public: real payloads always carry the
            // boolean, but hollow rejoin roster broadcasts omit it — undefined
            // must never read as "private party" (a latched ranked-duel ghost
            // got the "leave party" confirm, July 23).
            const isPrivateParty = multiplayerState?.inGame &&
                !!gd && !gd.duel && gd.public === false;
            const liveRound = !["waiting", "end"].includes(gd?.state);
            // Round-1 countdown = server's own preGame definition (teamDuel
            // routes these leaves to a penalty-free cancel): nothing played
            // yet, so host back is a silent cancel-start, no confirm. Bounded
            // by curRound <= 1 — the post-final ghost getready (curRound =
            // rounds+1) must KEEP the confirm, it guards the results screen.
            const preGameCountdown = gd?.state === "getready" && (gd?.curRound ?? 0) <= 1;

            // Host backing out mid-game ends the match for everyone
            // (resetGame → lobby) — team and classic FFA parties alike.
            const isHostEndMatch = isPrivateParty && gd.host && liveRound && !preGameCountdown;

            // Host backing out of a waiting party lobby disbands it for everyone
            // (server host-leave rule; 2v2 staging lobbies pass the crown to a
            // teammate instead). Only worth a confirm with other players inside.
            const isPartyDisband = isPrivateParty && gd.host &&
                gd.state === "waiting" &&
                !gd.is2v2Lobby &&
                (gd.players?.length ?? 0) > 1;

            // Members: leaving a party is permanent (rejoining needs the code),
            // so confirm in every state — lobby, live rounds and especially the
            // results screen. Mid-round team mode gets the team-abandon wording.
            // 2v2 staging lobbies are exempt: they're disposable by design
            // (entering a friend's code already hops out of one silently).
            const isPartyMemberLeave = isPrivateParty && !gd.host && !gd.is2v2Lobby;

            if (isRankedDuel || isHostEndMatch || isPartyDisband || isPartyMemberLeave) {
                setLeaveConfirm({
                    messageKey: isRankedDuel ? "forfeitWarning"
                        : isPartyDisband ? "disbandPartyWarning"
                        : isHostEndMatch ? "endMatchWarning"
                        : gd.teamGame && liveRound ? "leaveTeamGameWarning"
                        : "leavePartyWarning",
                    confirmKey: isRankedDuel ? "forfeit"
                        : isPartyDisband ? "disbandParty"
                        : isHostEndMatch ? "endMatch"
                        : gd.teamGame && liveRound ? "leaveMatch"
                        : "leaveParty",
                    // navbar wires this straight to onClick, so the first arg
                    // can be a click event — coerce before stashing
                    queueNextGame: queueNextGame === true,
                    nextGameType,
                });
                setLeaveConfirmOpen(true);
                return;
            }
        }

        setOnboardingCompleted(true)
        setLatLong(null)
        setShowAnswer(false)
        setPinPoint(null)

        if (loading) setLoading(false);
        if (multiplayerError) setMultiplayerError(false)

        setPartyModalShown(false)

        if (window.learnMode) {
            // redirect to home
            window.location.href = navigate("/")
            return;
        }

        if (screen === "onboarding") {
            setLatLong(null)
            setShowAnswer(false)
            setScreen("home")
            setOnboarding(null)
            gameStorage.setItem("onboarding", 'done')

            return;
        }

        if (multiplayerState?.inGame) {
            if (!multiplayerState?.gameData?.host || multiplayerState?.gameData?.state === "waiting") {
                const prevState = multiplayerState?.gameData?.state;

                ws.send(JSON.stringify({
                    type: 'leaveGame'
                }))

                if (inCrazyGames) {
                    try {
                        window.CrazyGames.SDK.game.hideInviteButton();
                    } catch (e) { }
                }

                // Kill the MP pano in THIS commit. Left to the
                // wasInMultiplayerRef cleanup below, home's first frame
                // painted its transparent content onto the final round's
                // still-mounted fullscreen pano (the end-screen exit white
                // flash — SP never flashed because its pano feeds from
                // latLong, nulled synchronously above). That cleanup is now
                // a pre-paint useLayoutEffect and catches server-driven
                // exits too; clearing here as well spares this hot path the
                // extra synchronous render the layout effect would trigger.
                mpPanoRoundRef.current = null;
                setMpPanoLoadedRound(null);
                setPanoLocation(null);

                // Own the full teardown here instead of waiting for the
                // server's gameShutdown to reset inGame — public end-state
                // games intentionally ignore that message, so this branch
                // must clear gameData itself or the RoundOverScreen (gated on
                // inGame && state==='end' in GameUI) would keep overlaying home.
                //
                // Preserve createOptions / joinOptions so a user who customised
                // their private-game settings doesn't lose them when backing
                // out of a played game.
                setMultiplayerState((prev) => ({
                    ...initialMultiplayerState,
                    connected: true,
                    nextGameQueued: queueNextGame === true,
                    nextGameType,
                    playerCount: prev.playerCount,
                    guestName: prev.guestName,
                    createOptions: prev.createOptions,
                    joinOptions: prev.joinOptions,
                }))
                setScreen("home")
                // NOTE: pano/loading teardown on arrival at home is owned by
                // the HOME SWEEPER effect (search "HOME SWEEPER"). The inline
                // setLatLong(null) at the top of backBtnPressed ALSO stays —
                // it is load-bearing for the branches here that return WITHOUT
                // setScreen("home") (e.g. the 2v2 queue-back path keeps
                // screen "multiplayer", so the sweeper never fires for them).
                // Do not add per-exit clearLocation() calls beyond that pair.
                // gameShutdown used to clear this; now that we own the
                // teardown, do it here so a stale community-map extent
                // doesn't leak into the next singleplayer / multiplayer game.
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null,
                }))

                if (["getready", "guess"].includes(prevState)) {
                    crazyMidgame()
                }
            } else {
                ws.send(JSON.stringify({ type: "resetGame" }))
            }
        } else if (multiplayerState?.lobbyIntent && multiplayerState?.connected) {
            // Covers the join screen AND a pending create shell. If the server
            // already created the lobby but its `game` message hasn't landed
            // yet, leaveGame prevents a ghost lobby (harmless no-op otherwise).
            try { ws.send(JSON.stringify({ type: 'leaveGame' })) } catch (e) { }

            setMultiplayerState((prev) => {
                return {
                    ...initialMultiplayerState,
                    connected: true,
                    playerCount: prev.playerCount,
                    guestName: prev.guestName

                }
            })
            setScreen("home")

        } else if (multiplayerState?.gameQueued) {
            clearQueueConfirmWatchdog();
            ws.send(JSON.stringify({ type: "leaveQueue" }))

            if (multiplayerState.gameQueued === "2v2") {
                // Backing out of 2v2 matchmaking returns to the team lobby.
                // The server keeps the staging lobby alive while queued and
                // re-sends its state (same code, same teammate) on leaveQueue;
                // show the lobby shell until that lands.
                setMultiplayerState((prev) => ({
                    ...prev,
                    gameQueued: false,
                    queueStage: null,
                    lobbyIntent: '2v2',
                    joinOptions: { ...initialMultiplayerState.joinOptions },
                }));
                return;
            }

            setMultiplayerState((prev) => {
                return {
                    ...prev,
                    gameQueued: false,
                    // publicDuelRange was already leaking here before the queue
                    // screen existed — the next queue painted the previous
                    // one's ELO range for a frame. Clear the whole queue slice.
                    publicDuelRange: null,
                    queuedAt: null,
                    queueEta: null,
                    placementPending: false
                }
            });
            setScreen("home")

        } else {
            const afterBack = () => {
                setScreen("home");
                setGameOptions((prev) => ({
                    ...prev,
                    extent: null
                }))
                clearLocation();
            };
            // Show midgame ad when leaving an active singleplayer game
            if (screen === "singleplayer" || screen === "countryGuesser") {
                // crazyMidgame(afterBack);
                afterBack();
            } else {
                afterBack();
            }
        }
    }

    function clearLocation() {
        setLatLong({ lat: 0, long: 0 })
        setShowAnswer(false)
        setPinPoint(null)
        setHintShown(false)
    }

    function loadLocation({ keepAnswer, force, ignoreCache } = {}) {
        if (loading && !force) return;
        const loadLocationRequestId = ++loadLocationRequestRef.current;
        const isCurrentLocationLoad = () => loadLocationRequestId === loadLocationRequestRef.current;

        // --- Preload commit: pano already pointed at the next round during
        // the answer reveal. Promote latLong only — no loading overlay, no
        // iframe remount. Same idea as the multiplayer getready→guess skip.
        if (keepAnswer && screen === "onboarding" && onboarding?.locations) {
            const loc = onboarding.locations[onboarding.round - 1];
            const key = `onboarding:${onboarding.round}`;
            if (loc && spPanoKeyRef.current === key) {
                // Read BEFORE the clears below null the ref. Pointed-but-still-
                // loading means the iframe is already navigating to the right
                // place — keep that (no key bump, no renavigation) but the
                // round must open UNDER the loading overlay, not on Google's
                // white mid-load document. The in-flight load's own onLoad
                // clears `loading`, exactly like a non-preloaded round.
                const panoReady = spPanoLoadedKeyRef.current === key;
                setPanoLocation(null);
                spPanoKeyRef.current = null;
                setSpPanoLoadedKey(null);
                reservedNextLocRef.current = null;
                setHintShown(false);
                setLatLong(loc);
                const mode = onboarding.mode || "classic";
                if (mode === "continent") {
                    setOtherOptions([...ALL_CONTINENTS]);
                } else if (mode === "country") {
                    const distractors = [];
                    const available = countries.filter(c => c !== loc.country);
                    while (distractors.length < 3) {
                        const pick = available[Math.floor(Math.random() * available.length)];
                        if (!distractors.includes(pick)) distractors.push(pick);
                    }
                    setOtherOptions(shuffle([...distractors, loc.country]));
                } else {
                    let options = JSON.parse(JSON.stringify(loc.otherOptions || []));
                    options.push(loc.country);
                    setOtherOptions(shuffle(options));
                }
                beginSpRoundLoading(panoReady);
                return;
            }
        }
        if (keepAnswer && (screen === "singleplayer" || screen === "countryGuesser") && reservedNextLocRef.current) {
            const loc = reservedNextLocRef.current;
            reservedNextLocRef.current = null;
            const key = `sp:${loc.lat},${loc.long}`;
            setHintShown(false);
            setLatLong(loc);
            if (spPanoKeyRef.current === key) {
                // Same read-before-clear as the onboarding branch above:
                // pointed means keep the in-flight load, ready decides whether
                // the loading overlay is owed.
                const panoReady = spPanoLoadedKeyRef.current === key;
                setPanoLocation(null);
                spPanoKeyRef.current = null;
                setSpPanoLoadedKey(null);
                beginSpRoundLoading(panoReady);
                return;
            }
            // Reserved but pano never pointed — fall through to a normal load
            // of this exact loc (already removed from the pool).
            beginSpRoundLoading(false);
            setLatLongKey((k) => k + 1);
            setPanoLocation(null);
            spPanoKeyRef.current = null;
            setSpPanoLoadedKey(null);
            return;
        }

        beginSpRoundLoading(false);
        if (!keepAnswer) setShowAnswer(false)
        if (!keepAnswer) setPinPoint(null)
        if (!keepAnswer) setLatLong(null)
        setHintShown(false)
        // Stale preload from a cancelled reveal must not stick.
        if (!keepAnswer) {
            setPanoLocation(null);
            spPanoKeyRef.current = null;
            setSpPanoLoadedKey(null);
            reservedNextLocRef.current = null;
        }

        if (screen === "onboarding") {
            const loc = onboarding.locations[onboarding.round - 1];
            setLatLong(loc);
            const mode = onboarding.mode || "classic";
            if (mode === "continent") {
                const { ALL_CONTINENTS } = require("@/components/utils/continentFromCode");
                setOtherOptions([...ALL_CONTINENTS]);
            } else if (mode === "country") {
                // Pick 3 random wrong countries for onboarding (4 total - simpler for new players)
                const distractors = [];
                const available = countries.filter(c => c !== loc.country);
                while (distractors.length < 3) {
                    const pick = available[Math.floor(Math.random() * available.length)];
                    if (!distractors.includes(pick)) distractors.push(pick);
                }
                setOtherOptions(shuffle([...distractors, loc.country]));
            } else {
                let options = JSON.parse(JSON.stringify(loc.otherOptions));
                options.push(loc.country);
                setOtherOptions(shuffle(options));
            }
        } else {
            async function defaultMethod() {
                // Country/continent guesser can't tolerate Unknown-country spots.
                // With findCountry's local fallback, this rejection should rarely
                // fire (only for ocean / missing-polygon edge cases).
                const requireKnownCountry = screen === "countryGuesser" || (!!onboarding && onboarding?.mode !== "classic");
                const requireKnownContinent = (screen === "countryGuesser" && countryGuessrMode.subMode === "continent") ||
                    (!!onboarding && onboarding?.mode === "continent");
                try {
                    const mod = await import("@/components/findLatLong");
                    const findLatLongRandom = mod.default;
                    const latLong = await findLatLongRandom({ ...gameOptions, requireKnownCountry, requireKnownContinent });
                    if (!isCurrentLocationLoad()) return;
                    setLatLong(latLong);
                } catch (err) {
                    if (!isCurrentLocationLoad()) return;
                    console.error("[ERROR] Failed to load location:", err);
                    setLoading(false);
                    toast(text("errorLoadingMap"), { type: 'error' });
                }
            }
            function fetchMethod() {
                //gameOptions.countryMap && gameOptions.offical
                const config = clientConfig();
                if (!config?.apiUrl) {
                    defaultMethod();
                    return;
                }
                const url = config.apiUrl + ((gameOptions.location === "all") ? `/${window?.learnMode ? 'clue' : 'all'}Countries.json` :
                    gameOptions.countryMap && gameOptions.official ? `/countryLocations/${gameOptions.countryMap}` :
                        `/mapLocations/${gameOptions.location}`);
                fetch(url).then((res) => {
                    return res.json();
                }).then((data) => {
                    if (!isCurrentLocationLoad()) return;
                    if (data.ready) {
                        // this uses long for lng
                        for (let i = 0; i < data.locations.length; i++) {
                            if (data.locations[i].lng && !data.locations[i].long) {
                                data.locations[i].long = data.locations[i].lng;
                                delete data.locations[i].lng;
                            }
                        }

                        // Official maps: order the response so spots this player
                        // has never seen come first, then the ones they saw
                        // longest ago. Ordering instead of filtering means a
                        // small pool (Cyprus serves 796 spots) degrades to
                        // least-recently-seen rather than starving, so a
                        // player's history never has to be wiped to make room.
                        const official = isOfficialMap(gameOptions);
                        const pool = official
                            ? orderByFreshness(data.locations, seenLocs())
                            : shuffle(data.locations);

                        // Invariant from here down: allLocsArray holds only
                        // spots not yet played this session. Every pick site
                        // removes what it takes, so nothing is handed out twice
                        // and the walk never has to refetch mid-game.
                        let idx = official ? 0 : Math.floor(Math.random() * pool.length);
                        if (!official && pool.length > 1) {
                            // Community maps pick at random, so the spot in play
                            // can be re-rolled. Bounded, unlike the old loop: a
                            // one-location map used to spin here forever.
                            for (let tries = 0; tries < 20 && latLong &&
                                pool[idx].lat === latLong.lat && pool[idx].long === latLong.long; tries++) {
                                idx = Math.floor(Math.random() * pool.length);
                            }
                        }

                        setAllLocsArray(pool.filter((l, i) => i !== idx));
                        setLatLong(pool[idx]);

                        if (data.name) {

                            // calculate extent - simple bounding box [minLng, minLat, maxLng, maxLat]
                            const lngs = data.locations.map(l => l.long);
                            const lats = data.locations.map(l => l.lat);
                            const extent = [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];

                            setGameOptions((prev) => ({
                                ...prev,
                                communityMapName: data.name,
                                official: data.official ?? false,
                                maxDist: data.maxDist ?? 20000,
                                extent: extent
                            }))

                        }

                    } else {
                        if (gameOptions.location !== "all") {
                            toast(text("errorLoadingMap"), { type: 'error' })
                        }
                        defaultMethod()
                    }
                }).catch(() => {
                    if (!isCurrentLocationLoad()) return;
                    if (!window._sentMapLoadErrorToast) {
                    toast(text("errorLoadingMap"), { type: 'error' })
                    window._sentMapLoadErrorToast = true;
                    }
                    defaultMethod()
                });
            }

            if (ignoreCache || allLocsArray.length === 0) {
                fetchMethod()
            } else {
                // Walk the pool. It only ever holds unplayed spots, so the next
                // round is just "take one and remove it" — no lookup of the
                // current location, and no refetch while spots remain.
                //
                // The old code looked latLong up in the pool and refetched when
                // it was missing, which the reveal preloader guaranteed by
                // removing it. That refetch put every spot already played this
                // game back into the pool: the actual source of "I got dropped
                // in the same place twice in one game".
                setAllLocsArray((prev) => {
                    if (!isCurrentLocationLoad()) return prev;
                    if (!prev || prev.length === 0) return prev;
                    const idx = isOfficialMap(gameOptions) ? 0 : Math.floor(Math.random() * prev.length);
                    setLatLong(prev[idx]);
                    return prev.filter((l, i) => i !== idx);
                });
            }
        }

    }

    // Every location a player actually lands on, on any official map, is
    // remembered here. One latLong choke-point covers every pick site: fetch,
    // cached-walk, reserve-during-reveal, countryGuesser rotate, and
    // multiplayer rounds pushed by the ws server. One shared ring, so a spot
    // from a ranked duel will not come back in the next singleplayer game
    // either. See components/utils/seenLocations.js.
    useEffect(() => {
        if (!latLong || latLong.lat == null || latLong.long == null) return;
        // clearLocation() parks latLong at the null island on the way back to
        // the menu. That is not a round.
        if (latLong.lat === 0 && latLong.long === 0) return;

        if (screen === "multiplayer") {
            // gameData.map is the server's this.location: "all", a country
            // code, or a community slug.
            if (!isOfficialMapSlug(multiplayerState?.gameData?.map)) return;
        } else if (!isOfficialMap(gameOptions)) return;

        markSeenLoc(latLong);
    }, [latLong]);

    // Generate country/continent options when location or submode changes in country guesser mode.
    // Continent options are fixed (the 6 continent names), so we pre-populate them as soon as
    // subMode flips — otherwise switching country<->continent before the next location arrives
    // leaves the row rendered with stale options, which can look empty on mobile.
    //
    // We also refuse to render a round whose correct answer isn't resolvable: a spot with
    // no country (or, in continent mode, a country that doesn't map to a continent) would
    // otherwise show "??" as the right answer. Instead, skip silently to the next location.
    useEffect(() => {
        if (screen !== "countryGuesser") return;

        const isContinentMode = countryGuessrMode.subMode === "continent";

        if (isContinentMode) {
            setOtherOptions([...ALL_CONTINENTS]);
        }

        if (!latLong || !latLong.lat) return;

        const correctCountry = latLong.country;
        const invalid = !correctCountry || correctCountry === "Unknown" ||
            (isContinentMode && continentFromCode(correctCountry) === "Unknown");

        if (invalid) {
            // Don't let a "??" round reach the player. Hide the option row and
            // rotate to the next preloaded location (cheap — no refetch). If the
            // preloaded array is empty or exhausted, fall through to loadLocation,
            // which will fetch fresh data once the in-flight load settles.
            setShowCountryButtons(false);
            setAllLocsArray((prev) => {
                if (!prev || prev.length === 0) return prev;
                const idx = isOfficialMap(gameOptions) ? 0 : Math.floor(Math.random() * prev.length);
                setLatLong(prev[idx]);
                return prev.filter((l, i) => i !== idx);
            });
            return;
        }

        if (!isContinentMode) {
            const distractors = [];
            const available = countries.filter((c) => c !== correctCountry);
            while (distractors.length < 5 && available.length > distractors.length) {
                const pick = available[Math.floor(Math.random() * available.length)];
                if (!distractors.includes(pick)) distractors.push(pick);
            }
            setOtherOptions(shuffle([...distractors, correctCountry]));
        }
        setShowCountryButtons(true);
    }, [latLong, screen, countryGuessrMode.subMode]);

    function onNavbarLogoPress() {
        // Daily locations are fixed for everyone — the logo's "roll a new
        // location" shortcut would swap in a random pano mid-challenge.
        if (screen === "onboarding" || screen === "daily") return;

        // Once the answer is up the guess has already banked its points, and
        // this raw loadLocation() bypasses advanceRound — the round counter
        // never moves, so clicking the logo replays the same round forever
        // (reported: 9-round "5-round" matches). Answer up = logo inert.
        if (showAnswer) return;

        if (screen !== "home" && !loading) {
            if (screen === "multiplayer" && multiplayerState?.connected && !multiplayerState?.inGame) {
                return;
            }
            if (!multiplayerState?.inGame) loadLocation()
            else if (multiplayerState?.gameData?.state === "guess") {

            }
        }
    }

    // My team ('a'|'b'|null) for emote allegiance coloring — derived outside
    // the memo so it only re-renders on an actual team change, not on every
    // players-array update.
    const myEmoteTeam = getMyTeam(multiplayerState?.gameData?.players, multiplayerState?.gameData?.myId);
    // Comms XOR: 2v2 surfaces (staging/queue/match) are chat-only now, so the
    // stage-2 queue term is gone — with gameData wiped during that window the
    // disableEmotes flag is unreadable and the FAB would show dead (server
    // drops emotes in the staging room). In-game surfaces still gate on the
    // server's disableEmotes below.
    // ── THE TOP-RIGHT COLUMN'S TWO HOMES ──────────────────────────────────
    // It is the home screen's chrome, and it is ALSO on the matchmaking queue —
    // waiting for a match is dead time the player is already staring at, and
    // their rating and tier are what they want to look at while the clock runs.
    //
    // But ONLY the card travels. On the queue the column deliberately drops the
    // Stamps tile, the ad-free chip and the Community Maps button: the shop and
    // the maps picker are whole screens, and opening one mid-queue means the
    // match lands behind a modal. USER RULING — "it shouldnt be possible to see
    // maps page or stamps shop while waiting for queue in ranked".
    //
    // The queue term mirrors multiplayerHome.js's queueMode: 2v2 stage 1 is
    // excluded because it renders inside the lobby card, which has its own
    // roster and its own corner.
    const hudCornerOnHome = screen === "home" && onboardingCompleted === true;
    const hudCornerOnQueue = screen === "multiplayer" && !!multiplayerState?.gameQueued
        && !(multiplayerState.gameQueued === '2v2' && multiplayerState.queueStage === 'teammate');

    const emotesLive = multiplayerState?.inGame;
    // The picker's roster, straight off the session token (api/stampShop.js
    // entitlementFields ships both on every auth response, and useStampShop
    // patches them into this same object the moment the shop writes). Guests
    // have neither, which resolveEmoteBar reads as the free eight.
    const myEmoteOrder = session?.token?.cosmetics?.emoteOrder;
    const myOwnedCosmetics = session?.token?.cosmetics?.owned;
    const EmoteReactionsMemo = React.useMemo(() => <EmoteReactions
        ws={ws}
        subscribeMessages={subscribeMessages}
        enabled={multiplayerEmotesEnabled && !process.env.NEXT_PUBLIC_SCHOOLGUESSR && !multiplayerState?.gameData?.disableEmotes}
        inGame={emotesLive}
        myId={multiplayerState?.gameData?.myId ?? multiplayerState?.queueMyId}
        myTeam={myEmoteTeam}
        emoteOrder={myEmoteOrder}
        ownedCosmetics={myOwnedCosmetics}
        // Hide names only in 1v1 duels, where attribution is obvious (you or
        // the one opponent). 2v2 duels NEED the name + team color — with four
        // players an anonymous emote is unreadable.
        hideName={multiplayerState?.gameData?.duel && !multiplayerState?.gameData?.team2v2}
        rightSide={multiplayerState?.inGame && multiplayerState?.gameData?.state === 'end'}
    />, [ws, subscribeMessages, multiplayerEmotesEnabled, emotesLive, multiplayerState?.inGame, multiplayerState?.gameData?.myId, multiplayerState?.queueMyId, myEmoteTeam, multiplayerState?.gameData?.duel, multiplayerState?.gameData?.team2v2, multiplayerState?.gameData?.state, multiplayerState?.gameData?.disableEmotes, myEmoteOrder, myOwnedCosmetics])

    // Chat audience mirrors the server gate: private games (parties, teamGame,
    // 2v2 staging) or matchmade 2v2 (team2v2, teammate-only server-side).
    // Public FFA and 1v1 duels are excluded. Stage-2 2v2 queue rides the
    // persisting staging lobby, same as emotes.
    const chatLive = (multiplayerState?.inGame && multiplayerState?.gameData
        && (!multiplayerState?.gameData?.public || multiplayerState?.gameData?.team2v2))
        || multiplayerState?.gameQueued === '2v2';
    const GameChatMemo = React.useMemo(() => <GameChat
        ws={ws}
        subscribeMessages={subscribeMessages}
        // hostGuest: guest-hosted parties are emotes-only server-side — hide
        // the whole chat surface (FAB included) for every member.
        enabled={multiplayerChatEnabled && !multiplayerState?.gameData?.disableChat && !multiplayerState?.gameData?.hostGuest}
        live={!!chatLive}
        canSend={!!session?.token?.username}
        myId={multiplayerState?.gameData?.myId ?? multiplayerState?.queueMyId}
        // Team contexts get the Team/All channel picker; 2v2 defaults to the
        // team channel (its legacy audience), team parties default to All.
        // STICKY across the whole 2v2 flow: is2v2Lobby covers the staging
        // room, gameQueued covers the stage-2 queue window where gameData is
        // wiped — without those terms the picker vanished and reappeared with
        // every state hop (July 30 report). Server-safe in staging: its
        // teamCapable gate zeroes teamOnly there, and the duo IS the team.
        teamCapable={!!(multiplayerState?.gameData?.team2v2 || multiplayerState?.gameData?.teamGame
            || multiplayerState?.gameData?.is2v2Lobby || multiplayerState?.gameQueued === '2v2')}
        defaultTeamChannel={!!(multiplayerState?.gameData?.team2v2
            || multiplayerState?.gameData?.is2v2Lobby || multiplayerState?.gameQueued === '2v2')}
        myTeam={myEmoteTeam}
        // 2v2 staging/queue rooms hold only your duo — every message is an
        // ally's, tint blue at receive regardless of team-field presence.
        allAllies={!!((multiplayerState?.gameData?.is2v2Lobby || multiplayerState?.gameQueued === '2v2')
            && !multiplayerState?.gameData?.team2v2)}
        // Per-room log clearing: a new room = fresh chat. The key is the
        // server's gameId (ws Game.js `this.id`, now on BOTH `game` payloads):
        // stable across a party's resetGame replays so party chat still spans
        // play-agains, and fresh per matchmade match so those clear.
        // The old `code || 2v2m:${startTime}` key could not work — startTime is
        // stamped in start(), which runs AFTER addPlayer, so it shipped null
        // and no later payload carried it (the between-rounds broadcast has
        // neither field). Every matchmade match keyed to the same constant, so
        // last match's chat survived into the rematch. The queue's gameData
        // wipe still yields null, which is ignored rather than cleared.
        roomCode={multiplayerState?.gameData?.gameId ?? null}
        gameState={multiplayerState?.gameData?.state}
        // Chat shares the bottom-left corner with the emote FAB; stack above
        // it whenever emotes are concurrently visible (2v2 — parties are XOR).
        stackUp={multiplayerEmotesEnabled && !multiplayerState?.gameData?.disableEmotes && emotesLive}
    />, [ws, subscribeMessages, multiplayerChatEnabled, chatLive, session?.token?.username, multiplayerState?.gameData?.myId, multiplayerState?.queueMyId, multiplayerState?.gameData?.team2v2, multiplayerState?.gameData?.teamGame, multiplayerState?.gameData?.is2v2Lobby, multiplayerState?.gameQueued, multiplayerState?.gameData?.gameId, multiplayerState?.gameData?.hostGuest, myEmoteTeam, multiplayerState?.gameData?.state, multiplayerState?.gameData?.disableChat, multiplayerEmotesEnabled, multiplayerState?.gameData?.disableEmotes, emotesLive])



    useEffect(() => {
        // Silent cheat detection. We deliberately do NOT notify the user, redirect,
        // write to localStorage, or fire a gtag event: the popular "CheatGuessr"
        // userscript neutralizes all three on worldguessr (it swallows gtag events
        // whose name contains "cheat", drops localStorage writes whose key contains
        // "banned", and its settings panel has no id, so the old DOM-id checks miss
        // it entirely). Instead we fingerprint the artifacts it leaves on the page
        // and quietly report which signals tripped over the already-authenticated
        // websocket, so the server can attribute it to the logged-in account.
        // The client never transmits the account secret — the server derives
        // identity from the socket it verified.
        function detectCheatSignals() {
            const signals = [];

            // Injected DOM from other overlay cheats (kept from the prior check).
            if (document.getElementById("coo1rdinates")) signals.push("dom:coordinates");
            if (document.getElementById("map-canvas")) signals.push("dom:mapcanvas");
            if (document.querySelector(".sgp-fab")) signals.push("dom:sgpfab");
            if (document.getElementById("gmf-panel")) signals.push("dom:gmfpanel");
            if (document.getElementById("wg-helper-ui")) signals.push("dom:wghelper");
            if (document.getElementById("cgx-settings-panel")) signals.push("dom:cgx");
            if (document.getElementById("cmTitle")) signals.push("dom:cmtitle");

            // CheatGuessr Universal (v12.x) fingerprints — the parts of the script
            // that patch the page to defeat detection are themselves detectable:

            // 1. It pins document.visibilityState to always return "visible" (killing
            //    tab-switch detection) by redefining the prototype getter with a plain
            //    JS function. A real browser's getter stringifies to "[native code]".
            try {
                const d = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
                if (d && typeof d.get === "function" && !String(d.get).includes("[native code]")) {
                    signals.push("vis-getter");
                }
            } catch (e) {}

            // 2. It proxies Storage.setItem to silently drop any key containing
            //    "banned". Probe it: a value we write but can't read back was eaten.
            try {
                const k = "wg_bannedprobe";
                window.localStorage.removeItem(k);
                window.localStorage.setItem(k, "1");
                if (window.localStorage.getItem(k) !== "1") signals.push("ls-swallow");
                window.localStorage.removeItem(k);
            } catch (e) {}

            // 3. It locks window.banned to an immutable, non-configurable `true`.
            try {
                const d = Object.getOwnPropertyDescriptor(window, "banned");
                if (d && d.value === true && d.writable === false && d.configurable === false) {
                    signals.push("win-banned-lock");
                }
            } catch (e) {}

            return signals;
        }

        // A logged-in user has an account secret; the server verifies identity
        // from it and pulls username + ELO from the DB. A guest has no secret at
        // all, only an ephemeral name, so it is reported best-effort and flagged
        // unverified server-side. The secret (when present) goes to our own API
        // over HTTPS solely as the identity lookup key; it is never forwarded to
        // the webhook, and the webhook URL is server-only.
        const token = session?.token?.secret || null;
        const guestName = (!token && multiplayerState?.guestName) ? multiplayerState.guestName : null;

        let lastReported = "";
        async function reportIfCheating() {
            const signals = detectCheatSignals();
            if (!signals.length) return;
            const sig = signals.slice().sort().join(",");
            if (sig === lastReported) return; // don't re-send an unchanged finding

            if (!window.cConfig?.apiUrl) return;
            // Need something to attribute the report to — a logged-in secret or,
            // failing that, a guest name. Anonymous with neither: nothing to send.
            if (!token && !guestName) return;

            try {
                const res = await fetch(window.cConfig.apiUrl + "/api/reportClientState", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, guestName, signals }),
                });
                // Only latch once the server accepted it, so a transient failure
                // (offline, not yet connected) retries on the next tick.
                if (res.ok) lastReported = sig;
            } catch (e) {
                // Silent by design — never surface anything to the user.
            }
        }

        reportIfCheating();
        const i = setInterval(reportIfCheating, 10000);
        return () => clearInterval(i);
    }, [session?.token?.secret, multiplayerState?.guestName])

    // Note: Both banned users and users with pending name change CAN still play singleplayer
    // They just can't do multiplayer - the check is done in the websocket server
    // Banned users are also excluded from leaderboards (handled in api/leaderboard.js)

    // Multiplayer's gameOptions, memoized. It used to be an object literal in
    // the GameUI mount below, so it got a fresh identity on every render of
    // this component — which means every WebSocket message, including the
    // `place` broadcasts that fire on each opponent/teammate map click. That
    // churn propagates into the (memoized) Leaflet map as a prop change and
    // re-walks the whole subtree for nothing.
    // extent: server-stamped ONLY. gameOptions.extent is singleplayer state —
    // preferring it here leaked a stale community-map bbox (e.g. Taiwan) into
    // multiplayer games joined via invite, zooming the guess map to the old map.
    const multiplayerGameOptions = useMemo(() => ({
        location: "all",
        maxDist: 20000,
        extent: multiplayerState?.gameData?.extent ?? null,
        nm: multiplayerState?.gameData?.nm,
        npz: multiplayerState?.gameData?.npz,
        showRoadName: multiplayerState?.gameData?.showRoadName,
    }), [
        multiplayerState?.gameData?.extent,
        multiplayerState?.gameData?.nm,
        multiplayerState?.gameData?.npz,
        multiplayerState?.gameData?.showRoadName,
    ]);

    const multiplayerGameState = multiplayerState?.gameData?.state;
    const multiplayerEndAnswerHoldActive = multiplayerGameState === 'end' && !multiplayerEndAnswerHoldExpired;
    const multiplayerShowAnswer = multiplayerEndAnswerHoldActive || (
        multiplayerState?.gameData?.curRound !== 1 && multiplayerGameState === 'getready'
    );
    const multiplayerGameUiShown = !!(
        multiplayerState?.inGame && ['guess', 'getready', 'end'].includes(multiplayerGameState)
    );
    // Public duels can emit one short `waiting` snapshot after pairing and
    // before Game.start() advances them to `getready`. Keep the queue's ad
    // instance alive through that bridge too — otherwise the creative would
    // still be torn down between matching and the first countdown.
    const multiplayerMatchedDuelWaiting = !!(
        multiplayerState?.inGame &&
        multiplayerGameState === 'waiting' &&
        multiplayerState?.gameData?.public &&
        multiplayerState?.gameData?.duel
    );
    const multiplayerPlaywireAdShown = hudCornerOnQueue || multiplayerMatchedDuelWaiting || multiplayerGameUiShown;
    const multiplayerTimerShownForAd = multiplayerGameUiShown && !(
        multiplayerShowAnswer ||
        (multiplayerGameState === 'getready' && multiplayerState?.gameData?.curRound === 1) ||
        multiplayerGameState === 'end'
    );
    const isTeam2v2EndScreen = !!(
        screen === "multiplayer" &&
        multiplayerState?.inGame &&
        multiplayerGameState === "end" &&
        multiplayerState?.gameData?.team2v2
    );
    const showPublicDuelEndScreen = !!(
        multiplayerState?.inGame &&
        multiplayerGameState === 'end' &&
        multiplayerState?.gameData?.public &&
        (multiplayerState?.gameData?.duelEnd || multiplayerState?.gameData?.team2v2)
    );

    /* ------------------------------------------------------------------
     *  Multiplayer Street View preload
     * ------------------------------------------------------------------
     * SERVER FACT this rests on: the round counter is incremented at the
     * guess -> getready edge, BEFORE the reveal is shown (ws/ws.js, the
     * `game.curRound++; game.state = 'getready';` pair). And `locations` is
     * the whole game's array, delivered once at start/join and carried
     * forward by the client's merge because ordinary round updates omit the
     * key entirely. So for the entire between-rounds reveal,
     * `gameData.locations[curRound - 1]` is ALREADY the next round's spot,
     * sitting in state, costing nothing to read.
     *
     * Two things were wrong before this:
     *
     *  1. Nothing loaded a pano until the getready -> guess flip, which is
     *     the same instant the server starts the round clock. On a slow
     *     machine that is ten seconds of a sixty second round spent staring
     *     at a loading screen. Ranked duels hit it every round.
     *
     *  2. Worse, at round-1 getready NOTHING set `latLong` at all, so the
     *     pano still held the HOME MENU's background location — and the
     *     queue's `gameQueued` hide had just been dropped, so it was fully
     *     visible. Players watched a random unrelated Street View for the
     *     whole 5s "VS" countdown, then it flashed out and the real round
     *     loaded. That is a wasted full pano load + 5s of live rendering
     *     immediately before the moment that actually needs the GPU.
     *
     * Both are the same fix: point the pano at the upcoming round as soon as
     * `getready` arrives, and keep it concealed until the round starts.
     */
    // Which round number the pano currently points at. A ref, not state: it
    // exists to let the guess transition SKIP a reload, and re-rendering for
    // it would defeat the purpose.
    const mpPanoRoundRef = useRef(null);
    // Which round the pano has actually FINISHED loading, as opposed to which
    // one it has been pointed at. The two differ for exactly as long as a load
    // is in flight, and that gap is the whole reason this exists: reassigning
    // an iframe's src does not blank it, the old document stays up until the
    // new one commits. Without this, opening "show street view" mid-reveal
    // would paint the preloaded UPCOMING round for those few hundred ms.
    const [mpPanoLoadedRound, _setMpPanoLoadedRound] = useState(null);
    // Ref mirror for the same reason as spPanoLoadedKeyRef: the guess-flip
    // consult happens inside the WS handler's closure.
    const mpPanoLoadedRoundRef = useRef(null);
    const setMpPanoLoadedRound = useCallback((v) => {
        mpPanoLoadedRoundRef.current = v;
        _setMpPanoLoadedRound(v);
    }, []);
    const notePanoLoaded = useCallback(() => {
        if (multiplayerState?.inGame) {
            // Null-guarded like the SP arm: after a degraded fire unpoints
            // (mpPanoRoundRef = null), a later successful load that round —
            // the reload button, an engine remount — must not stamp
            // setMpPanoLoadedRound(null), which would conceal the NEXT
            // reveal's correctly painted pano.
            if (mpPanoRoundRef.current !== null) setMpPanoLoadedRound(mpPanoRoundRef.current);
        } else if (spPanoKeyRef.current != null) {
            setSpPanoLoadedKey(spPanoKeyRef.current);
        }
    }, [multiplayerState?.inGame]);
    // Rematch/replay reset: a party play-again keeps inGame TRUE and the SAME
    // gameId, so the leave-cleanup below never runs, and a stale
    // mpPanoRoundRef from the previous match (e.g. a round-1 forfeit) makes
    // point(1) early-return — the new round would then skip its reload and
    // play against the PREVIOUS game's pano. Reset whenever a match boundary
    // passes: the staging lobby, or a fresh round-1 getready. Runs before
    // point(1)'s delayed (+450ms) write, so it cannot clobber a live preload.
    //
    // Deps MUST be the raw state/curRound fields, never the derived boolean:
    // a host abort during the round-1 countdown walks getready/1 → waiting →
    // getready/1, which keeps mpMatchBoundary true the whole way — a boolean
    // dep skips every one of those renders, the ref stays stamped at 1, and
    // the restarted game plays the aborted game's pano against fresh coords.
    const mpMatchBoundary =
        multiplayerState?.gameData?.state === 'waiting' ||
        (multiplayerState?.gameData?.state === 'getready' && multiplayerState?.gameData?.curRound === 1);
    useLayoutEffect(() => {
        if (!multiplayerState?.inGame || !mpMatchBoundary) return;
        mpPanoRoundRef.current = null;
        setMpPanoLoadedRound(null);
    }, [
        multiplayerState?.inGame,
        multiplayerState?.gameData?.state,
        multiplayerState?.gameData?.curRound,
    ]);
    // Only clear panoLocation when LEAVING multiplayer — a continuous
    // `if (!inGame) setPanoLocation(null)` would wipe singleplayer / daily /
    // onboarding preloads every render outside a match.
    //
    // useLayoutEffect, deliberately: server-driven exits (kick, gameShutdown,
    // reconnect-fail) reach home without passing through backBtnPressed's
    // synchronous clear, and as a passive effect this ran one frame late —
    // home's first frame painted its transparent content onto the still-
    // mounted final-round pano (the end-screen exit white flash). Pre-paint,
    // the clear flushes before the browser can show that frame. On the
    // backBtnPressed path everything here is already null, the setters bail,
    // and no extra render happens.
    const wasInMultiplayerRef = useRef(false);
    useLayoutEffect(() => {
        if (multiplayerState?.inGame) {
            wasInMultiplayerRef.current = true;
            return;
        }
        if (wasInMultiplayerRef.current) {
            mpPanoRoundRef.current = null;
            setMpPanoLoadedRound(null);
            setPanoLocation(null);
        }
        wasInMultiplayerRef.current = false;
    }, [multiplayerState?.inGame]);
    // Preload half: point the pano at the upcoming round once getready lands.
    // Passive on purpose — its swap timing is tuned and user-verified; only
    // the leave-clear above needed to become pre-paint.
    useEffect(() => {
        if (!multiplayerState?.inGame) return;
        const gd = multiplayerState.gameData;
        if (gd?.state !== "getready") return;
        // Post-final ghost getready: the server runs one after the last round
        // and curRound overshoots. There is no next round to preload.
        if (!gd.rounds || gd.curRound > gd.rounds) return;

        const point = (round) => {
            const loc = gd.locations?.[round - 1];
            if (!loc || mpPanoRoundRef.current === round) return;
            mpPanoRoundRef.current = round;
            // latLongKey is the "load even if the coordinates are identical"
            // signal — two rounds can legitimately sample the same spot, and
            // without the bump the pano components' content-key check would
            // no-op and leave stale content up.
            setLatLongKey((k) => k + 1);
            // setPanoLocation, NOT setLatLong: moving latLong here would fly
            // the reveal map to the upcoming location and make EndBanner score
            // the round against the wrong place ("It was X" naming next round's
            // country). Map.js's answerSnapshot would absorb some of that, but
            // EndBanner's per-render points/country would not.
            setPanoLocation(loc);
        };

        // Do NOT swap on this frame. Navigating an iframe unloads the current
        // document, and what shows through until the next one paints is the
        // element's own #1a1a2e background — a black flash. On this frame the
        // outgoing pano is still fully visible: concealment has only just
        // started its 200ms opacity fade, and the answer map is 300ms into
        // growing from the corner rect to fullscreen. Swapping now flashes
        // black in the gap between the two.
        //
        // Wait until the pano is genuinely covered, THEN navigate. Nobody can
        // see it after that, and an 8s reveal does not miss 450ms of head
        // start. Round 1 is not exempt: it has no answer map to hide behind,
        // only the concealment fade, and that is exactly when a black flash
        // would be most visible.
        //
        // Between rounds (curRound > 1) the reveal map is also FLYING to the
        // answer for 0.5-1.8s — wait that out too, so the iframe load can't
        // steal the flight's frames. See REVEAL_FLY_MS.
        let delay = PANO_PRELOAD_DELAY_MS;
        if (gd.curRound > 1) {
            const myGuess = gd.players?.find?.((p) => p.id === gd.myId)?.guess;
            delay += (myGuess ? REVEAL_FLY_MS.pin : REVEAL_FLY_MS.world)
                + PANO_PRELOAD_MARGIN_MS;
        }
        const swap = setTimeout(() => point(gd.curRound), delay);
        return () => clearTimeout(swap);
    }, [
        multiplayerState?.inGame,
        multiplayerState?.gameData?.state,
        multiplayerState?.gameData?.curRound,
        multiplayerState?.gameData?.rounds,
        multiplayerState?.gameData?.locations,
    ]);

    // ONE rule: during a reveal, hide the pano unless what it is actually
    // DISPLAYING is the round that just ended. Nothing else — not the toggle,
    // not `loading`, not whether a preload is in flight.
    //
    // Expressed the other way round (hide as soon as the reveal starts, show it
    // back for the toggle) it caused the residual black flash: concealment
    // landed on frame 0 and ran #streetview's 200ms opacity fade while the
    // answer map was only partway through its own 300ms grow, so the part of
    // the screen the map had not reached yet watched the pano dissolve. The
    // pano at that instant is still showing the finished round, which is
    // exactly what the player is entitled to see, so there was never a reason
    // to hide it. Now it just sits there until the map covers it.
    //
    // Everything else falls out of the same rule:
    //  - round 1, where the pano still holds the HOME MENU location and there
    //    is no answer map to cover it: loaded round is null, entitled round is
    //    0, so it hides immediately. No menu pano, ever.
    //  - the preload swap at +450ms: by then the map is fullscreen and opaque,
    //    so the iframe going dark mid-navigation is unobservable.
    //  - "show street view": the swap back to the finished round un-hides
    //    itself the moment it lands, and stays hidden while in flight, so the
    //    upcoming location can never be painted.
    //  - the post-final ghost getready never preloads, so the pano still holds
    //    the last round and the toggle works there too.
    const multiplayerRevealEntitledRound = (multiplayerState?.gameData?.curRound ?? 0) - 1;
    const multiplayerPanoConcealed = !!(
        multiplayerState?.inGame &&
        multiplayerGameState === "getready" &&
        mpPanoLoadedRound !== multiplayerRevealEntitledRound
    );

    // Onboarding: preload locations[round] (next) while showing answer for
    // locations[round-1]. Key matches what loadLocation will look for on advance.
    useEffect(() => {
        if (screen !== "onboarding" || !showAnswer || !onboarding?.locations) return;
        if (onboarding.completed) return;
        const nextRound = onboarding.round + 1;
        if (nextRound > onboarding.locations.length) return;
        const nextLoc = onboarding.locations[nextRound - 1];
        if (!nextLoc) return;
        const key = `onboarding:${nextRound}`;
        const t = setTimeout(() => beginSpPanoPreload(nextLoc, key), PANO_PRELOAD_DELAY_MS);
        return () => clearTimeout(t);
    }, [screen, showAnswer, onboarding?.round, onboarding?.locations, onboarding?.completed, beginSpPanoPreload]);

    // Singleplayer / country guesser: reserve next from the pool (or fetch)
    // during the answer reveal, then point the pano at it under the map.
    useEffect(() => {
        if (screen !== "singleplayer" && screen !== "countryGuesser") return;
        if (!showAnswer) return;
        if (singlePlayerRound?.totalRounds && singlePlayerRound.round >= singlePlayerRound.totalRounds) {
            return;
        }

        // Same fly collision as the multiplayer preload above, and this is the
        // path that runs EVERY singleplayer round: the reveal map is flying to
        // the answer while the pano iframe would be loading a whole new
        // document. Wait the flight out. SP reveals are user-paced (the round
        // only advances on Next), so the extra ~600ms costs no head start.
        const spFlyMs = pinPoint
            ? REVEAL_FLY_MS.pin
            : (screen === "countryGuesser" ? REVEAL_FLY_MS.country : REVEAL_FLY_MS.world);

        let cancelled = false;
        const timer = setTimeout(() => {
            if (cancelled) return;
            if (reservedNextLocRef.current) return;

            // The pool holds unplayed spots only, so the round in play is
            // already out of it: reserve one and drop just that one.
            const remaining = allLocsArrayRef.current || [];

            const take = (loc) => {
                if (cancelled || !loc) return;
                reservedNextLocRef.current = loc;
                setAllLocsArray((prev) =>
                    (prev || []).filter((l) => l.lat !== loc.lat || l.long !== loc.long)
                );
                beginSpPanoPreload(loc, `sp:${loc.lat},${loc.long}`);
            };

            if (remaining.length > 0) {
                const loc = isOfficialMap(gameOptions)
                    ? remaining[0]
                    : remaining[Math.floor(Math.random() * remaining.length)];
                take(loc);
                return;
            }

            // Pool empty — resolve a fresh spot in the background.
            (async () => {
                try {
                    const requireKnownCountry = screen === "countryGuesser";
                    const requireKnownContinent = screen === "countryGuesser" && countryGuessrMode.subMode === "continent";
                    const mod = await import("@/components/findLatLong");
                    const loc = await mod.default({ ...gameOptions, requireKnownCountry, requireKnownContinent });
                    if (cancelled) return;
                    take(loc);
                } catch (err) {
                    console.error("[preload] Failed to reserve next location:", err);
                }
            })();
        }, PANO_PRELOAD_DELAY_MS + spFlyMs + PANO_PRELOAD_MARGIN_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // pinPoint is read for the fly-duration pick only. It is stable for the
        // whole reveal (placed during the guess phase, cleared on advance), and
        // a guess-phase change re-runs into the !showAnswer early return.
    }, [
        screen,
        showAnswer,
        singlePlayerRound?.round,
        singlePlayerRound?.totalRounds,
        latLong?.lat,
        latLong?.long,
        gameOptions.location,
        gameOptions.maxDist,
        countryGuessrMode.subMode,
        beginSpPanoPreload,
    ]); // eslint-disable-line react-hooks/exhaustive-deps

    // Leaving SP modes drops any reserved preload so it can't bleed into home.
    useEffect(() => {
        if (multiplayerState?.inGame) return;
        if (screen === "singleplayer" || screen === "countryGuesser" || screen === "onboarding" || screen === "daily") {
            return;
        }
        clearSpPanoPreload();
    }, [screen, multiplayerState?.inGame, clearSpPanoPreload]);

    // SP/daily/onboarding conceal: once the pano has finished loading a location
    // that isn't the answer (latLong), hide it — the answer map covers the swap.
    const samePanoAsAnswer = !!(
        panoLocation && latLong &&
        panoLocation.lat === latLong.lat && panoLocation.long === latLong.long
    );
    const spPanoConcealed = !!(
        !multiplayerState?.inGame &&
        panoLocation &&
        spPanoLoadedKey != null &&
        !samePanoAsAnswer
    );
    const panoConcealed = multiplayerPanoConcealed || spPanoConcealed;

    // Round-1 VS → first guess: slow the pano opacity fade so it rises under
    // the dissolving intro (see components/utils/duelIntroTiming.js). Kept
    // longer than DUEL_INTRO_EXIT_MS on purpose — the pano should still be
    // easing in when the corner bars start their slide.
    const [duelPanoEnter, setDuelPanoEnter] = useState(false);
    const wasDuelRound1GetreadyRef = useRef(false);
    const duelRound1Getready = !!(
        multiplayerState?.inGame &&
        multiplayerState?.gameData?.duel &&
        multiplayerGameState === "getready" &&
        multiplayerState?.gameData?.curRound === 1
    );
    useLayoutEffect(() => {
        if (wasDuelRound1GetreadyRef.current && multiplayerGameState === "guess") {
            setDuelPanoEnter(true);
        }
        wasDuelRound1GetreadyRef.current = duelRound1Getready;
    }, [duelRound1Getready, multiplayerGameState]);
    useEffect(() => {
        if (!duelPanoEnter) return;
        const t = setTimeout(() => setDuelPanoEnter(false), DUEL_PANO_ENTER_MS);
        return () => clearTimeout(t);
    }, [duelPanoEnter]);
    useEffect(() => {
        if (multiplayerState?.inGame) return;
        setDuelPanoEnter(false);
        wasDuelRound1GetreadyRef.current = false;
    }, [multiplayerState?.inGame]);

    // Pano coords: diverge from latLong whenever a reveal preload is active
    // (multiplayer or singleplayer-family).
    const panoSource = panoLocation || latLong;

    // PURE-IDLE pano states: not "faded out and coming back" but "parked"
    // (staging lobby, join screen, matchmaking queue, 2v2 end, home menu).
    // Extracted VERBATIM from the third group of the hidden expressions below
    // so idle ⊆ hidden stays a compile-time property. The IFRAME gets
    // display:none in these states (Chrome stops servicing a display:none
    // cross-origin frame's rAF — the embed's render loop actually halts);
    // the CANVAS never does (its resize() reads clientWidth, which lies under
    // display:none, and the engine's own draw gate already idles it).
    // state==='end' covers EVERY end screen (2v2, public duel, FFA/party) —
    // they are all fullscreen-opaque, and the public-duel end alone used to
    // leave the pano painting + streaming z4/z5 for its whole 20-60s dwell.
    const mpIdle = !!(screen === "multiplayer" && (multiplayerState?.gameData?.state === "end" || multiplayerState?.gameData?.state === "waiting" || multiplayerState?.lobbyIntent === 'join' || multiplayerState?.gameQueued));
    // No `screen === "home"` term: the home sweeper (above) unmounts the SV
    // components outright on the menu (latLong null), which beats display:none.
    // `hidden` keeps a home term as belt-and-braces for any unswept mount.
    const svFrameIdle = mpIdle;
    // `display` is not transitionable, so BOTH edges of the idle state need a
    // grace or the 200ms opacity fade dies:
    // - ENTRY: applying display:none in the same commit as .hidden hard-cuts
    //   the fade-OUT. idleSettled delays the class ~250ms so the fade
    //   completes first (the pano is already opacity-0-bound the whole time).
    // - EXIT: dropping display:none and .hidden together repaints at opacity 1
    //   with no transition (hard snap of a possibly-stale pano). unIdleGrace
    //   holds `hidden` for two frames — the element must be RENDERED
    //   (display:block, opacity 0) for one paint before a transition has a
    //   start value.
    const [idleSettled, setIdleSettled] = useState(false);
    useEffect(() => {
        if (svFrameIdle) {
            // Must outlast the opacity fade #streetview is actually running:
            // the base 200ms rule normally, or the 750ms duel round-1 enter
            // (DUEL_PANO_ENTER_MS) when a duel dies inside its enter window —
            // that fade being hard-cut by display:none is real (an opponent
            // disconnect in round 1 is not pregame-exempt). Conditional so the
            // COMMON idle entries (queue, lobby, end screens) don't keep the
            // cross-origin embed rendering 550ms longer than needed.
            // eslint-disable-next-line react-hooks/exhaustive-deps -- duelPanoEnter
            // is DELIBERATELY not a dep: adding it re-runs this effect when the
            // enter flag self-clears at 750ms, cancelling the 800ms timer and
            // restarting at 300ms — display:none would then land mid-fade for
            // any duel dying >300ms into its enter window.
            const t = setTimeout(() => setIdleSettled(true), duelPanoEnter ? DUEL_PANO_ENTER_MS + 50 : 300);
            return () => clearTimeout(t);
        }
        setIdleSettled(false);
    }, [svFrameIdle]);
    const svFrameIdleApplied = svFrameIdle && idleSettled;
    const prevSvIdleRef = useRef(false);
    const [unIdleGrace, setUnIdleGrace] = useState(false);
    useLayoutEffect(() => {
        const was = prevSvIdleRef.current;
        prevSvIdleRef.current = svFrameIdleApplied;
        if (was && !svFrameIdleApplied) {
            setUnIdleGrace(true);
            let id2 = 0;
            const id1 = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setUnIdleGrace(false)); });
            return () => { cancelAnimationFrame(id1); if (id2) cancelAnimationFrame(id2); };
        }
    }, [svFrameIdleApplied]);

    return (
        <>
            <HeadContent
                text={text}
                inCoolMathGames={inCoolMathGames}
                inCrazyGames={inCrazyGames}
                inGameDistribution={inGameDistribution}
                titleOverride={initialScreen === 'daily' ? `${text('dailyChallenge')} - WorldGuessr` : undefined}
                descOverride={initialScreen === 'daily' ? text('dailyLandingTagline') : undefined}
                canonicalOverride={initialScreen === 'daily' ? 'https://www.worldguessr.com/daily' : undefined}
            />



            {accountModalOpen && <AccountModal inCrazyGames={inCrazyGames} shown={true} session={session} setSession={setSession} setAccountModalOpen={setAccountModalOpen}
                eloData={eloData} accountModalPage={accountModalPage} setAccountModalPage={setAccountModalPage}
                ws={ws} canSendInvite={
                    // === false: hollow payloads omit the boolean; undefined
                    // must not read as an invitable private game.
                    multiplayerState?.inGame && multiplayerState?.gameData?.public === false
                    // No inviting into a full party / 2v2 staging lobby — the
                    // invite could only ever bounce off gameIsFull. Same seat
                    // fallback as partyLobby (2v2 lobbies cap at 2).
                    && (multiplayerState?.gameData?.players?.length ?? 0) <
                        (multiplayerState?.gameData?.maxPlayers ?? (multiplayerState?.gameData?.is2v2Lobby ? 2 : Infinity))
                } sendInvite={sendInvite} options={options}
                // The wallet chip in the account header. The destination chunk
                // is guaranteed ready before the handoff begins; ShopModal then
                // removes this profile only after its own DOM has committed.
                onOpenShop={openShopFromAccount}
            />}
            {/* The Stamps shop. Mounted ONLY while open, which is what tears the
                ad-free countdown interval down on close — ShopModal plays its
                own exit animation first and then calls back here to unmount. */}
            {shopModalOpen && (
                <ShopModal
                    session={session}
                    setSession={setSession}
                    coveredEntry={shopModalCoveredEntry}
                    onReady={shopModalCoveredEntry ? completeShopHandoff : undefined}
                    onClose={() => {
                        setShopModalOpen(false);
                        setShopModalCoveredEntry(false);
                    }}
                />
            )}
            {session?.token?.secret && !session.token.username && <SetUsernameModal shown={true} session={session} />}
            {/* Email + code login. Stays mounted so ui/Modal can play its exit;
                it resets itself on every open. Closed by the session effect
                above once applySignIn publishes the session. Google is a
                button inside it (null when the build has no client id). */}
            <LoginModal
                open={loginModalOpen}
                // Locked-mode upsells (openLoginUpsell) swap the headline and
                // pitch for the mode's copy; a plain sign-in keeps the defaults.
                title={linkGoogleModal ? text(linkGoogleModal === '2v2' ? 'signInToPlay2v2' : 'signInToPlayRanked') : undefined}
                subtitle={linkGoogleModal
                    ? (linkGoogleModal === '2v2' && linkGoogleInviter
                        ? text('linkGoogle2v2InvitedDesc', { name: linkGoogleInviter })
                        : text(linkGoogleModal === '2v2' ? 'linkGoogle2v2Desc' : 'linkGoogleRankedDesc'))
                    : undefined}
                onClose={closeLoginModal}
                onSuccess={(data) => applySignIn(data, { method: "email", isNew: !!data.isNewAccount })}
                onGoogle={googleLogin ? () => { setLoginQueued(true); googleLogin(); } : null}
                googleBusy={loginQueued}
                onApple={appleLogin}
                appleBusy={appleQueued}
                // Periodic prompt: no tap opened it (see the 7-day effect). A
                // repeat show adds the permanent opt-out: same key the effect
                // reads, same close path as ×.
                unprompted={!!periodicLoginPrompt}
                onNeverShowAgain={periodicLoginPrompt?.repeat ? () => {
                    try { window.localStorage.setItem("suggestLoginNeverShow", "1"); } catch (e) {}
                    closeLoginModal();
                } : null}
            />
            {/* CrazyGames only: the locked-mode link prompt (openLoginUpsell).
                Stays mounted after its first open so the close animates
                (open-prop driven; react-responsive-modal renders nothing while
                closed). Closing it by hand does NOT clear joinAfterLoginRef:
                the CG auth prompt's success closes the modal itself before the
                SDK auth listener re-verifies, and clearing here would kill the
                gated-join retry mid-conversion. */}
            {linkGoogleModal && inCrazyGames && <SuggestAccountModal shown={linkGoogleModalOpen} setOpen={(v) => { if (!v) setLinkGoogleModalOpen(false); }} variant={linkGoogleModal} inviterName={linkGoogleInviter} />}
            {showDiscordModal && typeof window !== 'undefined' && window.innerWidth >= 768 && <DiscordModal shown={true} setOpen={setShowDiscordModal} />}
            {pendingNameChangeModal && <PendingNameChangeModal session={session} isOpen={true} onClose={() => setPendingNameChangeModal(false)} />}
            {/* Season 1 migration notice, once per account. The server decides
                WHETHER (it omits eloNotice entirely once acked), this decides
                WHEN. Home screen only, so it never lands mid-game or over the
                onboarding flow, and behind the two forced modals (username,
                pending name change) so it can never stack on top of a flow the
                user has to complete. Gated on `username` rather than `secret`
                because a brand-new account has no eloNotice anyway and the
                username gate is what keeps SetUsernameModal alone on screen. */}
            {screen === "home" && session?.token?.eloNotice && session?.token?.username
                && !session?.token?.pendingNameChange && !pendingNameChangeModal && (
                <Season1NoticeModal session={session} eloNotice={session.token.eloNotice} />
            )}
            {!process.env.NEXT_PUBLIC_SCHOOLGUESSR && EmoteReactionsMemo}
            {/* CoolMath explicitly opted out of chat; SchoolGuessr is the
                school build. Both are compile-time flags, so the chat chunk
                drops out of those bundles entirely. */}
            {!process.env.NEXT_PUBLIC_SCHOOLGUESSR && !process.env.NEXT_PUBLIC_COOLMATH && GameChatMemo}
            <ToastContainer pauseOnFocusLoss={false} />

            {welcomeOverlayShown && screen === "onboarding" && (
                <WelcomeOverlay
                    onModeSelected={(mode) => {
                        // Update the running onboarding with the chosen mode
                        setOnboarding((prev) => prev ? { ...prev, mode } : prev);
                        setShowCountryButtons(mode !== "classic");
                        setWelcomeOverlayShown(false);
                    }}
                    onSkip={() => {
                        setWelcomeOverlayShown(false);
                        skipOnboarding();
                    }}
                />
            )}

            {/* Coolmath splash is now rendered statically in _document.js and removed via useEffect */}
            {/* Site background image is rendered via body::before in _document.js */}

            {/* data-nosnippet: everything in here is game chrome, not prose —
                Google was assembling search snippets out of it ("© Google
                Google Adivinar", the guess button, SV attribution) instead of
                using the meta description. Snippet-only; indexing unaffected. */}
            <main className={`home`} id="main" data-nosnippet="">

                {/* Daily challenge rules are fixed for everyone (no NMPZ, road
                    labels on). gameOptions still holds whatever the last
                    singleplayer toggle or multiplayer game stamped into it
                    (nm/npz/showRoadName), so the shared pano must not read
                    those while the daily owns it. */}
                {((screen === "singleplayer" || screen === "countryGuesser" || screen === "multiplayer") && gameOptions?.nm) ? (
                    /* No Move + NMPZ modes: in-house WebGL pano (movement
                       structurally impossible; npz additionally freezes
                       pan/zoom) replaces the Google embed. SP, country/
                       continent guesser, and multiplayer parties (the MP
                       'game' handler stamps server nm/npz into gameOptions;
                       ranked/public games never set nm). Server locations
                       carry no freshPano, so MP always fresh-resolves. */
                    <CustomStreetView
                        lat={panoSource?.lat}
                        long={panoSource?.long}
                        heading={panoSource?.heading}
                        panoId={panoSource?.freshPano}
                        npz={gameOptions?.npz}
                        showAnswer={showAnswer}
                        slowEnter={duelPanoEnter}
                        /* LOAD-BEARING: `loading` must stay a hidden term. Every
                           path that changes the load-effect deps in the same
                           commit as clearing another hidden term also sets
                           loading — that is the invariant that makes
                           "unhide == already painted" true for the engine's
                           synchronous reveal paint. */
                        hidden={!!((!panoSource || !panoSource.lat || !panoSource.long) || loading) || panoConcealed || mpIdle}
                        refreshKey={latLongKey}
                        onLoad={(degraded) => {
                            // degraded = the engine is UNBLOCKING the round
                            // (failsafe/resolve failure), not certifying a
                            // painted pano. Clear the cover, but do NOT stamp
                            // the loaded-round/key markers — a lying stamp
                            // makes the next round's preload-commit skip its
                            // loading cover over an unpainted canvas.
                            if (degraded) {
                                // A degraded PRELOAD must also stop being
                                // "pointed": the commit path trusts the
                                // pointer, raises the cover, and waits on an
                                // onLoad this generation already consumed — a
                                // permanent loading latch (no dep changes, no
                                // new generation, no retry). Unpointing makes
                                // the round advance fall through to a REAL
                                // load: key bump, fresh generation, honest
                                // cover. Same inGame split as notePanoLoaded:
                                // MP points via mpPanoRoundRef, SP via
                                // spPanoKeyRef, and a stale SP pointer must
                                // never be "unpointed" mid-MP-game. In SP a
                                // degraded LIVE-round fire has nothing
                                // pointed (no-op); in MP the pointer is live
                                // all round — see the MP branch note.
                                if (multiplayerState?.inGame) {
                                    // POINTER ONLY — do NOT null panoLocation
                                    // here (tried Aug 17, reverted same day):
                                    // that made panoSource fall back to the
                                    // round-N coords and fired an unrequested
                                    // full reload mid-reveal (and a whole
                                    // engine teardown at round 1). Nulling
                                    // just the pointer means the guess flip
                                    // reads "not pointed" and takes the
                                    // repoint block: key bump, fresh
                                    // generation, honest loading cover. The
                                    // concealment term keeps the failed pano
                                    // hidden through getready meanwhile. This
                                    // also fires on a degraded LIVE-round
                                    // load (MP points for the whole round) —
                                    // harmless: the null-guarded stamp in
                                    // notePanoLoaded skips, and the next
                                    // flip repoints normally.
                                    mpPanoRoundRef.current = null;
                                } else if (spPanoKeyRef.current) {
                                    spPanoKeyRef.current = null;
                                    setSpPanoLoadedKey(null);
                                    setPanoLocation(null);
                                }
                            } else notePanoLoaded();
                            // 100 not 300: unlike the iframe, tiles are already
                            // painted when this fires — the long grace only
                            // slowed the reveal. SP-family rounds additionally
                            // hold the cover to their minimum dwell; the floor
                            // stamp is always expired/zero in multiplayer.
                            //
                            // Token guard: reveal-time PRELOADS also land here
                            // and schedule a pointless setLoading(false).
                            // Background-tab throttling can park that stale
                            // timeout until refocus, where it fired right
                            // after the next round raised the cover and
                            // killed the loading screen. Once a newer
                            // round-loading begins, this timer owns nothing.
                            // MP never bumps the token, so it always clears.
                            const token = spRoundLoadingTokenRef.current;
                            const floorLeft = multiplayerState?.inGame ? 0
                                : spLoadingFloorRef.current - Date.now();
                            setTimeout(() => {
                                if (spRoundLoadingTokenRef.current !== token) return;
                                setLoading(false)
                                setMapSwitchMaskShown(false);
                                setMapSwitchSawLoading(false);
                            }, Math.max(100, floorLeft))

                        }}
                    />
                ) : (
                <StreetView
                    nm={screen === "daily" ? false : gameOptions?.nm}
                    npz={screen === "daily" ? false : gameOptions?.npz}
                    showAnswer={showAnswer}
                    lat={panoSource?.lat}
                    long={panoSource?.long}
                    panoId={panoSource?.panoId}
                    heading={panoSource?.heading}
                    pitch={panoSource?.pitch}
                    showRoadLabels={screen === "onboarding" ? false : screen === "daily" ? true : gameOptions?.showRoadName}
                    slowEnter={duelPanoEnter}
                    /* LOAD-BEARING: `loading` must stay a hidden term — see the
                       CustomStreetView note above. unIdleGrace holds the fade's
                       start value across the display:none -> block edge. */
                    hidden={!!((!panoSource || !panoSource.lat || !panoSource.long) || loading) || panoConcealed || screen === "home" || svFrameIdle || unIdleGrace}
                    idle={svFrameIdleApplied}
                    refreshKey={latLongKey}
                    onLoad={() => {
                        notePanoLoaded();
                        // SP-family rounds hold the cover to their minimum
                        // dwell (see beginSpRoundLoading); multiplayer keeps
                        // the plain 300ms grace. Token guard: same stale-
                        // preload-timer protection as the CustomStreetView
                        // handler above (background-tab throttling parks the
                        // preload's no-op clear until refocus, where it
                        // killed the NEXT round's cover).
                        const token = spRoundLoadingTokenRef.current;
                        const floorLeft = multiplayerState?.inGame ? 0
                            : spLoadingFloorRef.current - Date.now();
                        setTimeout(() => {
                            if (spRoundLoadingTokenRef.current !== token) return;
                            setLoading(false)
                            setMapSwitchMaskShown(false);
                            setMapSwitchSawLoading(false);
                        }, Math.max(300, floorLeft))

                    }}
                />
                )}

                {duelEndExitMaskShown && (
                    <div
                        className={`duel-end-exit-mask ${duelEndExitMaskRevealing ? 'duel-end-exit-mask--revealing' : ''}`}
                        aria-hidden="true"
                    />
                )}

                {/* Loading overlay - covers iframe with background image to prevent white flicker.
                    newUserBooting: a new user's bootstrap (A/B fetch → onboarding start)
                    has NOTHING else on screen (home UI + navbar are gated) — without the
                    spinner that window is a dead static image. */}
                <div className={`loading-overlay ${(loading || mapSwitchMaskShown || newUserBooting) ? 'loading-overlay--visible' : ''}`}>
                    {/* var(--site-bg) = the background _document.js declared and
                        preloaded pre-paint, so this reuses the already-cached
                        image and follows a purchased one. It used to be a
                        hardcoded street2 NextImage with `priority`, which made
                        every visitor download a second full-size hero image and
                        kept the loading screen on art the menu was not using. */}
                    <div
                        aria-hidden="true"
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            background: 'var(--site-bg) center/cover no-repeat',
                            opacity: 0.5,
                        }}
                    />
                    {/* Dark background behind the semi-transparent image to match home screen look */}
                    <div style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        backgroundColor: "#000",
                        zIndex: -1,
                    }} />
                </div>

                <BannerText text={`${text("loading")}...`} shown={loading || newUserBooting} showCompass={true} />



                <Navbar
                    joinCodePress={() => {
                        setOnboarding(null)
                        setOnboardingCompleted(true)
                        gameStorage.setItem("onboarding", 'done')
                        setScreen("multiplayer")
                        setMultiplayerState((prev) => ({
                            ...prev,
                            lobbyIntent: 'join'
                        }))
                    }}
                    accountModalOpen={accountModalOpen}
                    inGameDistribution={inGameDistribution}
                    maintenance={maintenance}
                    inCrazyGames={inCrazyGames}
                    loading={loading}
                    onFriendsPress={() => { setAccountModalOpen(true); setAccountModalPage("list"); }}
                    loginQueued={loginQueued}
                    setLoginQueued={setLoginQueued}
                    // AccountBtn renders on the home screen only (navbar gates
                    // it there), so the old lobbyIntent/joinOptions clauses
                    // that raced to hide the navbar pill on multiplayer
                    // sub-screens — and their stale-deep-link fragility — are
                    // gone with the pill itself. This now only guards against
                    // being in a live game while a menu screen shows.
                    inGame={multiplayerState?.inGame}
                    openAccountModal={() => { setAccountModalOpen(true); setAccountModalPage("profile"); }}
                    session={session}
                    reloadBtnPressed={reloadBtnPressed}
                    backBtnPressed={backBtnPressed}
                    setGameOptionsModalShown={setGameOptionsModalShown}
                    onNavbarPress={() => onNavbarLogoPress()}
                    gameOptions={gameOptions}
                    screen={screen}
                    multiplayerState={multiplayerState}
                    latLong={latLong}
                    // !(home && onboardingCompleted !== true): a brand-new
                    // user's first paint is screen "home" while the A/B
                    // variant resolves — without this the home-mode navbar
                    // (login button) flashes before onboarding takes over.
                    shown={(!multiplayerState?.gameData?.duel || (multiplayerState?.gameData?.team2v2 && multiplayerState?.gameData?.state === 'end'))
                        && !(screen === "home" && onboardingCompleted !== true)}
                    // && !mapModalClosing: the flag stays up through the maps
                    // modal's 400ms exit animation, which kept the navbar's
                    // back/reload buttons visibility-hidden long after the
                    // modal had visually cleared them. Un-hide the moment the
                    // close starts — the fading shell is still above them, so
                    // they're revealed by the fade instead of popping in late.
                    gameOptionsModalShown={gameOptionsModalShown && !mapModalClosing}
                    selectCountryModalShown={selectCountryModalShown}
                    partyModalShown={partyModalShown}
                    dailyPhase={dailyPhase}
                    mapModalOpen={mapModal}
                    onConnectionError={() => setConnectionErrorModalShown(true)}
                    countryGuessrMode={countryGuessrMode}
                />

                {/* Pending Name Change Banner */}
                {session?.token?.pendingNameChange && screen === 'home' && !dismissedNameChangeBanner && (
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

                {/* Account Banned Banner */}
                {session?.token?.banned && !session?.token?.pendingNameChange && screen === 'home' && !dismissedBanBanner && (
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
                                {session?.token?.banType === 'temporary' && session?.token?.banExpiresAt && (
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

                {/* Account Pending Deletion Banner — within the 30-day grace period.
                    Explicit Restore (we never auto-cancel on login). */}
                {session?.token?.pendingDeletion && screen === 'home' && !dismissedDeletionBanner && (
                    <div className="modBanner modBanner--error">
                        <button
                            onClick={() => setDismissedDeletionBanner(true)}
                            className="modBanner__close"
                            title="Dismiss"
                        >
                            ×
                        </button>
                        <div className="modBanner__content">
                            <span>🗑️</span>
                            <span className="modBanner__text">
                                {session?.token?.scheduledDeletionAt
                                    ? text("accountScheduledForDeletion", { date: new Date(session.token.scheduledDeletionAt).toLocaleDateString() })
                                    : text("accountScheduledForDeletionShort")}
                            </span>
                        </div>
                        <button
                            className="modBanner__detailsBtn"
                            onClick={async () => {
                                try {
                                    const res = await fetch(window.cConfig.apiUrl + '/api/cancelDeletion', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ secret: session?.token?.secret }),
                                    });
                                    if (res.ok) {
                                        setSession((prev) => prev ? { token: { ...prev.token, pendingDeletion: false, scheduledDeletionAt: null } } : prev);
                                        toast.success(text("accountRestoredBody"));
                                    } else {
                                        const data = await res.json().catch(() => ({}));
                                        toast.error(data.error || text("deletionAlreadyProcessed"));
                                    }
                                } catch (e) {
                                    toast.error(text("deleteAccountFailed"));
                                }
                            }}
                        >
                            {text("restoreAccount")}
                        </button>
                    </div>
                )}

                {/* onboardingCompleted === true: a new user's first paint is
                    screen "home" during the A/B bootstrap — without this gate
                    the ad flashes before screen flips to onboarding. */}
                {/* Home menu banner — Playwire, Nitro-style mount/unmount
                    lifecycle (spaAds re-inits per mount — see
                    bannerAdPlaywire.js). Sizes picked client-side:
                    320x50 → head1, 300x250 → cntr1, so phones get the small
                    banner like the Nitro era. */}
                {/* !adFree: the bought pass. lib/adFree.js reads the expiry off
                    the session, so the purchase lands here on the same tick and
                    the slot unmounts (out of the DOM, not hidden; RAMP reclaims
                    the unit on the next spaAds declare). */}
                {!adFree && screen === 'home' && onboardingCompleted === true && !inCrazyGames && !inPoki && !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION &&
                    <div className="home_ad">
                        <PlaywireAd
                            selectorId="pw-home-ad"
                            showAdvertisementText={false} screenH={height} types={height < 510 ? HOME_AD_TYPES_SHORT : HOME_AD_TYPES_TALL} screenW={width} vertThresh={width < 600 ? 0.28 : 0.5} />
                    </div>
                }
                {/* One continuous multiplayer slot, not a queue copy. This
                    condition stays true across queue → paired waiting → GameUI,
                    so React preserves the PlaywireAd instance and its creative;
                    GameUI deliberately owns Playwire only for non-multiplayer. */}
                {!adFree && multiplayerPlaywireAdShown && !inCrazyGames && !inPoki && !process.env.NEXT_PUBLIC_COOLMATH && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION && !process.env.NEXT_PUBLIC_SCHOOLGUESSR &&
                    <div className={`topAdFixed ${multiplayerTimerShownForAd ? 'moreDown' : ''}`}>
                        <PlaywireAd
                            selectorId="pw-game-ad"
                            showAdvertisementText={false} screenH={height} types={MULTIPLAYER_AD_TYPES_LEADERBOARD} screenW={Math.max(400, width - 450)} vertThresh={0.3} />
                    </div>
                }
                {inGameDistribution && screen === 'home' && onboardingCompleted === true && (
                    <div className="home_ad">
                        <GameDistributionBanner
                            id="gd-banner-home"
                            screenH={height} types={[[300, 250]]} screenW={width} vertThresh={width < 600 ? 0.28 : 0.5} />
                    </div>
                )}
                <span id="g2_playerCount" className={`bigSpan onlineText desktop ${screen !== 'home' ? 'notHome' : ''} ${(screen === 'singleplayer' || screen === 'onboarding' || screen === 'countryGuesser' || screen === 'daily' || (screen === 'home' && onboardingCompleted !== true) || (multiplayerState?.inGame && !['waitingForPlayers', 'findingGame', 'findingOpponent'].includes(multiplayerState?.gameData?.state)) || !multiplayerState?.connected || !multiplayerState?.playerCount) ? 'hide' : ''}`}>
                    {maintenance ? text("maintenanceMode") : text("onlineCnt", { cnt: multiplayerState?.playerCount || 0 })}
                </span>

                {/* reload button for public game. duelReloadBtnTop is 90 unless
                    the collision probe found the HP-bar name pill actually
                    covering it (long teammate names in team duels).
                    NOTE (July 24 flicker audit): the per-round remount here is
                    fine — .navbar .navBtn's hudEnter can't reach this button
                    (it renders outside the navbar) and no other rule animates
                    it, so appearing at "guess" is already instant. Verified;
                    don't "fix" this again. */}
                {multiplayerState?.gameData?.duel && multiplayerState?.gameData?.state === "guess" && (
                    <div className="gameBtnContainer" style={{ position: 'fixed', top: `${duelReloadBtnTop}px`, left: width > 830 ? '10px' : '7px', zIndex: 1000000 }}>

                        <button ref={duelReloadBtnRef} className="gameBtn navBtn backBtn reloadBtn" onClick={() => reloadBtnPressed()}><img src={asset("/return.png")} alt="reload" height={13} style={{ filter: 'invert(1)', transform: 'scale(1.5)' }} /></button>
                    </div>
                )}



                {/* THE TOP-RIGHT CORNER — one flex column (styles/playerCard.css).
                    It used to be five separately-fixed elements (username pill,
                    friends icon, league chip, Stamps balance, Maps button) whose
                    vertical stacking was a set of hand-tuned `top:` values that
                    quoted each other in comments, plus a whole --below-login
                    variant of the Maps button whose only job was dodging the
                    taller login button above it. Stacking is computed now, so
                    none of those numbers survive and nothing can overlap.

                    ORDER IS PLAIN READING ORDER. The old row was row-reverse
                    with a load-bearing DOM order because two siblings shared one
                    fixed coordinate and each carried its own entrance animation.
                    The column owns both now: the entrance is on .hudCorner
                    itself, so a child mounting later (the Stamps flag arriving)
                    cannot replay anything.

                    Modals hide the column with visibility, never an unmount —
                    ONE site, replacing the five places that contract used to be
                    restated at. */}
                {/* onboardingCompleted === true is the navbar's `shown` gate,
                    restated: a brand-new user's FIRST PAINT is screen "home"
                    while the A/B variant resolves, and this column no longer
                    lives inside the navbar to inherit that guard. Without it the
                    login button flashes in the corner for a frame before
                    onboarding takes over. */}
                {/* ALSO ON THE MATCHMAKING QUEUE, not just home. Waiting for a
                    match is dead time the player is already staring at, and the
                    card is where their rating, tier and Stamps live — so it is
                    the natural thing to look at while the clock runs. It also
                    replaces the bare friends icon the navbar used to show here
                    (see the gate in components/ui/navbar.js): that button had
                    nothing to do in a matchmade 1v1, and the card's menu already
                    contains Friends for anyone who wants it.
                    The queue term mirrors multiplayerHome.js's queueMode — 2v2
                    stage 1 is excluded because it renders inside the lobby card,
                    which has its own roster and its own corner. */}
                {(hudCornerOnHome || hudCornerOnQueue) && !HIDE_ACCOUNT_UI && (
                    <HudCorner covered={accountModalOpen || mapModal} tight={hudCornerOnQueue} leaving={cornerLeaving}>
                        {session?.token?.secret ? (
                            <PlayerCard
                                session={session}
                                eloData={eloData}
                                friendRequests={multiplayerState?.friendRequestCount || 0}
                                onOpenProfile={() => { setAccountModalOpen(true); setAccountModalPage("profile"); }}
                                onOpenElo={() => { setAccountModalOpen(true); setAccountModalPage("elo"); }}
                            />
                        ) : (
                            /* showAccBtn's ?app=true gate, restated: the WebView
                               build has its own account UI. AccountBtn itself
                               still returns null for CrazyGames/GD when signed
                               out, and the column simply closes the gap. */
                            !isApp && !multiplayerState?.inGame && (
                                <AccountBtn
                                    inCrazyGames={inCrazyGames}
                                    inGameDistribution={inGameDistribution}
                                    session={session}
                                    navbarMode={false}
                                    openAccountModal={() => { setAccountModalOpen(true); setAccountModalPage("profile"); }}
                                    loginQueued={loginQueued}
                                    setLoginQueued={setLoginQueued}
                                />
                            )
                        )}

                        {/* The balance, as its own tile rather than a fourth
                            cell inside the card. It renders nothing unless the
                            server's kill switch is on and there is a session,
                            so the column simply closes the gap.

                            HOME ONLY — see hudCornerOnQueue. */}
                        {hudCornerOnHome && <StampsTile session={session} onOpen={openShopFromHome} />}

                        {/* The running ad-free pass, directly under the card
                            that sold it. Renders nothing at all unless a pass is
                            live, which is why it is unconditional here. See
                            components/ui/adFreeChip.js: buying one used to be
                            invisible the moment the shop closed. */}
                        {hudCornerOnHome && <AdFreeChip session={session} />}

                        {/* Community Maps LEFT THIS COLUMN — it is a footer
                            button now. It was never account chrome and never a
                            game mode; it sat here only because this is where
                            loose buttons had accumulated, and pairing it with
                            the stamps tile meant its label had to track a type
                            size chosen for a currency balance. See .footer_btns
                            below. */}
                    </HudCorner>
                )}

                {/* Daily challenge screen (landing → game → results) */}
                {screen === "daily" && (
                    <DailyChallengeScreen
                        session={session}
                        options={options}
                        onExit={exitDailyMode}
                        inCrazyGames={inCrazyGames}
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        landingBootstrap={dailyBootstrap}
                        latLong={latLong}
                        setLatLong={setLatLong}
                        setLatLongKey={setLatLongKey}
                        loading={loading}
                        setLoading={setLoading}
                        beginRoundLoading={beginSpRoundLoading}
                        onPhaseChange={setDailyPhase}
                        beginSpPanoPreload={beginSpPanoPreload}
                        clearSpPanoPreload={clearSpPanoPreload}
                        spPanoKeyRef={spPanoKeyRef}
                        spPanoLoadedKeyRef={spPanoLoadedKeyRef}
                        setSpPanoLoadedKey={setSpPanoLoadedKey}
                        setPanoLocation={setPanoLocation}
                    />
                )}

                {screen == "home" &&
                    <div className={`home__content g2_modal ${screen !== "home" ? "hidden" : "cshown"} `}>
                        <div className={`g2_nav_ui ${navSlideOut ? 'g2_slide_out' : ''} ${onboardingCompleted !== true ? 'hide' : ''}`} >


                            {onboardingCompleted === null ? (
                                <>

                                </>
                            ) : (
                                <>


                                    {onboardingCompleted && (

                                        <>
                                            <h1 className={`home__title g2_nav_title wg_font ${navSlideOut ? 'g2_slide_out' : ''}`}>WorldGuessr</h1>

                                            {/* <MaintenanceBanner /> */}
                                        </>

                                    )}



                                    {onboardingCompleted && (

                                        <>

                                            <div className="g2_nav_hr"></div>
                                            <div className="g2_nav_group">
                                                <button className="g2_nav_text singleplayer"

                                                    onClick={() => {
                                                        if (loading) return;
                                                        setMiniMapShown(false);
                                                        navSlideOutThen(() => crazyMidgame(() => {
                                                            // First entry this session: check localStorage preference
                                                            if (!hasEnteredSingleplayer.current) {
                                                                hasEnteredSingleplayer.current = true;
                                                                const pref = gameStorage.getItem("singleplayerDefaultMode");
                                                                if (pref === "countryGuesser") {
                                                                    enterCountryGuessrMode("country");
                                                                    return;
                                                                } else if (pref === "continentGuesser") {
                                                                    enterCountryGuessrMode("continent");
                                                                    return;
                                                                }
                                                            }
                                                            // Subsequent entries: restore last screen used this session
                                                            setScreen(lastSingleplayerScreen.current || "singleplayer");
                                                        }));
                                                    }}>
                                                    {text("singleplayer")}
                                                </button>
                                                {/* Ranked shows for guests too — clicking opens the link-Google
                                                    conversion modal instead of the queue (server publicDuel
                                                    requires accountId anyway). Hidden on the no-account builds
                                                    (CoolMath / Poki / GameDistribution), where there is no login
                                                    surface at all for that modal to lead to. */}
                                                {!HIDE_ACCOUNT_UI && (
                                                    <button className="g2_nav_text ranked" aria-label="Duels" onClick={() => {
                                                        if (!session?.token?.secret) {
                                                            openLoginUpsell('ranked');
                                                            return;
                                                        }
                                                        if (!ws || !multiplayerState?.connected) {
                                                            setConnectionErrorModalShown(true);
                                                            return;
                                                        }
                                                        // keepCorner: the queue keeps this column on screen
                                                        // (hudCornerOnQueue), so it must not fade out and back
                                                        // in — it slides from the home inset to the tight one.
                                                        navSlideOutThen(() => handleMultiplayerAction("publicDuel"), { keepCorner: true });
                                                    }}>{text("rankedDuel")}</button>
                                                )}
                                                <button className="g2_nav_text" aria-label="Duels" onClick={() => {
                                                    if (!ws || !multiplayerState?.connected) {
                                                        setConnectionErrorModalShown(true);
                                                        return;
                                                    }
                                                    // Same queue, same column: slide, don't fade. See above.
                                                    navSlideOutThen(() => handleMultiplayerAction("unrankedDuel"), { keepCorner: true });
                                                }}>{
                                                    // Ranked is hidden on the no-account builds, so "Unranked"
                                                    // would be meaningless jargon there — it's just "Find Match".
                                                    HIDE_ACCOUNT_UI ? text("findMatch") :
                                                    session?.token?.secret ? text("unrankedDuel") : text("findDuel")}</button>

                                                {!HIDE_ACCOUNT_UI && (
                                                    <button className="g2_nav_text" aria-label="2v2 Match" onClick={() => {
                                                        if (!session?.token?.secret) {
                                                            openLoginUpsell('2v2');
                                                            return;
                                                        }
                                                        if (!ws || !multiplayerState?.connected) {
                                                            setConnectionErrorModalShown(true);
                                                            return;
                                                        }
                                                        navSlideOutThen(() => handleMultiplayerAction("createLobby", "2v2"));
                                                    }}>{text("twovtwo")}</button>
                                                )}



                                            </div>
                                            <div className="g2_nav_hr"></div>

                                            <div className="g2_nav_group">
                                                <button className="g2_nav_text" disabled={maintenance} onClick={() => {
                                                    if (!ws || !multiplayerState?.connected) {
                                                        setConnectionErrorModalShown(true);
                                                        return;
                                                    }

                                                    navSlideOutThen(() => handleMultiplayerAction("createLobby", "party"));
                                                }}>{text("createGame")}</button>
                                                <button className="g2_nav_text" disabled={maintenance} onClick={() => {
                                                    if (!ws || !multiplayerState?.connected) {
                                                        setConnectionErrorModalShown(true);
                                                        return;
                                                    }
                                                    navSlideOutThen(() => handleMultiplayerAction("joinPrivateGame"));
                                                }}>{text("joinGame")}</button>
                                            </div>

                                            <div className="g2_nav_hr"></div>

                                            <div className="g2_nav_group">
                                                <DailyMenuItem session={session} onClick={() => enterDailyMode()} />

                                            </div>
                                        </>
                                    )}

                                </>
                            )}
                            <br />

                        </div>

                        {/* Community banner sits directly above the footer; shown
                            outside schoolguessr/embed contexts (which hide all social
                            surfaces, same as the footer's social buttons), and only
                            when signed in: the forum bridge needs a session token. */}
                        {!process.env.NEXT_PUBLIC_SCHOOLGUESSR && session?.token?.secret &&
                            !isApp && !inCoolMathGames && !inGameDistribution && !inPoki && (
                            <CommunityBanner
                                visible={screen === "home" && onboardingCompleted === true}
                                covered={!!(mapModal || friendsModal || accountModalOpen)}
                                onVisitForum={openForum}
                                text={text}
                            />
                        )}

                        {/* Footer moved outside of sliding navigation */}
                        {/* visible drives the entrance ANIMATION (replays on
                            screen returns — leaving home display:nones the
                            ancestor, and re-rendering restarts animations).
                            covered = visibility-hidden under modals: same
                            screen, so closing a modal must NOT replay. */}
                        <div className={`home__footer ${(screen === "home" && onboardingCompleted === true) ? "visible" : ""} ${(mapModal || friendsModal || accountModalOpen) ? "covered" : ""}`}>
                            <div className="footer_btns">
                                {!isApp && !inCoolMathGames && !inGameDistribution && !inPoki && !inSixX && (
                                    <>
                                        {!process.env.NEXT_PUBLIC_SCHOOLGUESSR && (
                                            <Link target="_blank" href={"https://discord.gg/ADw47GAyS5"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container discord" aria-label="Discord"><FaDiscord className="home__squarebtnicon" /></button></Link>
                                        )}

                                        <Link target="_blank" href={"https://www.youtube.com/@worldguessr?sub_confirmation=1"}><button className="g2_hover_effect home__squarebtn gameBtn g2_container youtube" aria-label="Youtube"><FaYoutube className="home__squarebtnicon" /></button></Link>
                                        {/* The CoolMathGames backlink used to sit here. It moved
                                            into the settings footer (settingsModal.js) beside
                                            GitHub / Terms — it is a credit link, not a thing
                                            players reach for mid-session, and this row is for
                                            buttons they do. */}
                                        <Link href={"/leaderboard" + (inCrazyGames ? "?crazygames" : "")}>

                                            <button className="g2_hover_effect home__squarebtn gameBtn g2_container_full " aria-label="Leaderboard"><FaRankingStar className="home__squarebtnicon" /></button></Link>
                                    </>
                                )}
                                {/* COMMUNITY MAPS, and it is ICON-ONLY HERE ON
                                    PURPOSE. It used to be a labelled pill under
                                    the player card; .footer_btns forces
                                    aspect-ratio: 1/1 on its buttons, so a pill
                                    with a word in it cannot live in this row
                                    without fighting the rule that makes the row
                                    a row. The label survives as the aria-label
                                    and the tooltip, exactly like every other
                                    button beside it.

                                    Its own gates, not the social block's: those
                                    hide for the app and CrazyGames, and the map
                                    picker is wanted in both. */}
                                {onboardingCompleted && !inPoki && !inSixX && !process.env.NEXT_PUBLIC_COOLMATH
                                    && !process.env.NEXT_PUBLIC_GAMEDISTRIBUTION && (
                                    <button className="g2_hover_effect home__squarebtn gameBtn g2_container_full" aria-label={text("communityMaps")} title={text("communityMaps")} onClick={() => setMapModal(true)}><FaMapMarkedAlt className="home__squarebtnicon" /></button>
                                )}

                                <button className="g2_hover_effect home__squarebtn gameBtn g2_container_full " aria-label="Settings" onClick={() => setSettingsModal(true)}><FaGear className="home__squarebtnicon" /></button>
                            </div>
                        </div>

                    </div>
                }
                {(mapModal || gameOptionsModalShown) && <MapsModal shown={true} session={session} onClose={() => {
                    if (mapModalClosing) return;
                    setMapModalClosing(true);
                    setTimeout(() => {
                        setMapModal(false);
                        setGameOptionsModalShown(false);
                        setMapModalClosing(false);
                    }, MAP_MODAL_CLOSE_ANIMATION_MS);
                }}
                    mapModalClosing={mapModalClosing}
                    text={text}
                    customChooseMapCallback={(gameOptionsModalShown && (screen === "singleplayer" || screen === "countryGuesser")) ? (map) => {
                        if (mapModalClosing) return;
                        const selectedMapSlug = map.countryMap || map.slug;
                        const selectingCountryGuesser = map.slug === "__countryGuesser";
                        const selectingContinentGuesser = map.slug === "__continentGuesser";
                        const selectingRegularMap = !selectingCountryGuesser && !selectingContinentGuesser;
                        const isSameSelection =
                            (selectingCountryGuesser && screen === "countryGuesser" && countryGuessrMode?.subMode === "country") ||
                            (selectingContinentGuesser && screen === "countryGuesser" && countryGuessrMode?.subMode === "continent") ||
                            (selectingRegularMap && screen === "singleplayer" && selectedMapSlug === gameOptions.location);

                        const closeMapChooser = () => {
                            setTimeout(() => {
                                setMapModal(false);
                                setGameOptionsModalShown(false);
                                setMapModalClosing(false);
                            }, MAP_MODAL_CLOSE_ANIMATION_MS);
                        };

                        // No-op if user clicks the currently active map/mode.
                        if (isSameSelection) {
                            setMapSwitchMaskShown(false);
                            setMapSwitchSawLoading(false);
                            setMapModalClosing(true);
                            closeMapChooser();
                            return;
                        }

                        setMapModalClosing(true);
                        setMapSwitchMaskShown(true);
                        setMapSwitchSawLoading(false);

                        const applyMapSelection = () => {
                            if (map.slug === "__countryGuesser") {
                                try { gameStorage.setItem("singleplayerDefaultMode", "countryGuesser"); } catch(e) {}
                                enterCountryGuessrMode("country");
                            } else if (map.slug === "__continentGuesser") {
                                try { gameStorage.setItem("singleplayerDefaultMode", "continentGuesser"); } catch(e) {}
                                enterCountryGuessrMode("continent");
                            } else {
                                cancelInFlightLocationLoad();
                                setLoading(false);
                                setLatLong(null);
                                setShowAnswer(false);
                                setShowCountryButtons(false);
                                if (screen === "countryGuesser") setScreen("singleplayer");
                                try { gameStorage.setItem("singleplayerDefaultMode", "world"); } catch(e) {}
                                openMap(selectedMapSlug);
                            }
                        };

                        // Let the close class render first so fade-out starts immediately.
                        if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
                            window.requestAnimationFrame(() => {
                                window.requestAnimationFrame(applyMapSelection);
                            });
                        } else {
                            setTimeout(applyMapSelection, 0);
                        }

                        closeMapChooser();
                    } : null}
                    showAllCountriesOption={(gameOptionsModalShown && (screen === "singleplayer" || screen === "countryGuesser"))}
                    showOptions={screen === "singleplayer" || screen === "countryGuesser"}
                    showTimerOption={screen === "singleplayer" || screen === "countryGuesser"}
                    gameOptions={gameOptions} setGameOptions={setGameOptions} />}

                {settingsModal && <SettingsModal inCrazyGames={inCrazyGames} inGameDistribution={inGameDistribution} isApp={isApp} options={options} setOptions={setOptions} multiplayerEmotesEnabled={multiplayerEmotesEnabled} setMultiplayerEmotesEnabled={(v) => { setMultiplayerEmotesEnabled(v); try { gameStorage.setItem('multiplayerEmotesEnabled', v ? 'true' : 'false'); } catch {} }} multiplayerChatEnabled={multiplayerChatEnabled} setMultiplayerChatEnabled={(v) => { setMultiplayerChatEnabled(v); try { gameStorage.setItem('multiplayerChatEnabled', v ? 'true' : 'false'); } catch {} }} shown={true} onClose={() => setSettingsModal(false)} session={session} setSession={setSession} ws={ws} />}

                <Modal
                    isOpen={leaveConfirmOpen}
                    onClose={() => setLeaveConfirmOpen(false)}
                    title={text("areYouSure")}
                    actions={
                        <>
                            <button onClick={() => setLeaveConfirmOpen(false)}>{text("cancel")}</button>
                            <button onClick={() => {
                                setLeaveConfirmOpen(false);
                                backBtnPressed(leaveConfirm?.queueNextGame, leaveConfirm?.nextGameType, true);
                            }}>{leaveConfirm ? text(leaveConfirm.confirmKey) : ""}</button>
                        </>
                    }
                >
                    <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{leaveConfirm ? text(leaveConfirm.messageKey) : ""}</p>
                </Modal>

                {/* Friend-invite accept while in a live game — same design as
                    the leave confirm above. Confirming sends the acceptInvite
                    the toast would have sent; the server then pulls us out of
                    the current game (forfeit) and into the friend's party. */}
                <Modal
                    isOpen={inviteConfirmOpen}
                    onClose={() => setInviteConfirmOpen(false)}
                    title={text("areYouSure")}
                    actions={
                        <>
                            <button onClick={() => setInviteConfirmOpen(false)}>{text("cancel")}</button>
                            <button onClick={() => {
                                setInviteConfirmOpen(false);
                                try {
                                    ws?.send(JSON.stringify({ type: 'acceptInvite', code: inviteConfirm?.code, invitedById: inviteConfirm?.invitedById }));
                                } catch (e) {}
                            }}>{text("join")}</button>
                        </>
                    }
                >
                    <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{inviteConfirm ? text("acceptInviteWarning", { from: inviteConfirm.from }) : ""}</p>
                </Modal>

                {connectionErrorModalShown && <AlertModal
                    isOpen={true}
                    onClose={() => setConnectionErrorModalShown(false)}
                    title={multiplayerState.connecting ? text("multiplayerConnecting") : text("multiplayerNotConnected")}
                    message={multiplayerState.connecting
                        ? text("connectingMessage", {
                            currentRetry: multiplayerState.currentRetry,
                            maxRetries: multiplayerState.maxRetries
                        })
                        : text("multiplayerConnectionErrorMessage")
                    }
                    type={multiplayerState.connecting ? "warning" : "error"}
                />}




                {screen === "singleplayer" && <div className="home__singleplayer">
                    <GameUI
                        mapSwitchMaskShown={mapSwitchMaskShown}
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound} showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal} inCrazyGames={inCrazyGames} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} mapModal={mapModal} latLong={latLong} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {screen === "countryGuesser" && <div className="home__singleplayer">
                    <GameUI
                        mapSwitchMaskShown={mapSwitchMaskShown}
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
singlePlayerRound={singlePlayerRound} setSinglePlayerRound={setSinglePlayerRound} showDiscordModal={showDiscordModal} setShowDiscordModal={setShowDiscordModal} inCrazyGames={inCrazyGames} countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect} showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons} otherOptions={otherOptions} countryGuesser={true} countryGuessrMode={countryGuessrMode} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} mapModal={mapModal} latLong={latLong} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {/* (!welcomeOverlayShown || svPreloadReady): while the welcome
                    overlay is up (modal A/B variant), GameUI's mount is what
                    triggers the round-1 street view load — deferred to
                    load+idle, see svPreloadReady */}
                {screen === "onboarding" && (onboarding?.round || onboarding?.completed) && (!welcomeOverlayShown || svPreloadReady) && <div className="home__onboarding">
                    <GameUI
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        welcomeOverlayShown={welcomeOverlayShown}
                        inCrazyGames={inCrazyGames} countryGuesserCorrect={countryGuesserCorrect} setCountryGuesserCorrect={setCountryGuesserCorrect} showCountryButtons={showCountryButtons} setShowCountryButtons={setShowCountryButtons} otherOptions={otherOptions} onboarding={onboarding} countryGuesser={onboarding?.mode && onboarding.mode !== "classic"} setOnboarding={setOnboarding} backBtnPressed={backBtnPressed} options={options} countryStreak={countryStreak} setCountryStreak={setCountryStreak} hintShown={hintShown} setHintShown={setHintShown} pinPoint={pinPoint} setPinPoint={setPinPoint} showAnswer={showAnswer} setShowAnswer={setShowAnswer} loading={loading} setLoading={setLoading} session={session} gameOptionsModalShown={gameOptionsModalShown} setGameOptionsModalShown={setGameOptionsModalShown} latLong={latLong} loadLocation={loadLocation} gameOptions={gameOptions} setGameOptions={setGameOptions} />
                </div>}

                {screen === "onboarding" && onboarding?.completed &&
                    <RoundOverScreen
                        points={onboarding.points}
                        time={msToTime(onboarding.timeTaken)}
                        maxPoints={onboarding.maxPoints || (onboarding.mode === "classic" ? 15000 : 3000)}
                        history={onboarding.locations || EMPTY_ARRAY}
                        options={options}
                    />
                }

                {screen === "onboarding" && onboarding?.completed &&
                    <OnboardingComplete
                        mode={onboarding.mode}
                        points={onboarding.points}
                        maxPoints={onboarding.maxPoints || (onboarding.mode === "classic" ? 15000 : 3000)}
                        onClassic={() => {
                            sendEvent("tutorial_end", { mode: "classic" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setMiniMapShown(false);
                            setLatLong(null);
                            setScreen("singleplayer");
                        }}
                        onDuel={() => {
                            sendEvent("tutorial_end", { mode: "duel" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            handleMultiplayerAction("unrankedDuel");
                        }}
                        onCommunityMaps={() => {
                            sendEvent("tutorial_end", { mode: "community" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setScreen("home");
                            setTimeout(() => setMapModal(true), 350);
                        }}
                        onCountryGuesser={() => {
                            sendEvent("tutorial_end", { mode: "country" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            try { gameStorage.setItem("singleplayerDefaultMode", "countryGuesser"); } catch(e) {}
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            enterCountryGuessrMode("country");
                        }}
                        onHome={() => {
                            sendEvent("tutorial_end", { mode: "home" });
                            try { gameStorage.setItem("onboarding", "done"); } catch(e) {}
                            setLatLong(null);
                            setShowAnswer(false);
                            setOnboarding(null);
                            setOnboardingCompleted(true);
                            setScreen("home");
                        }}
                    />
                }

                {screen === "multiplayer" && <div className="home__multiplayer">
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
                        openFriends={() => { setAccountModalPage('list'); setAccountModalOpen(true); }}
                    />
                </div>}

                {multiplayerGameUiShown && (
                    <GameUI
                        inCoolMathGames={inCoolMathGames}
                        inGameDistribution={inGameDistribution}
                        miniMapShown={miniMapShown} setMiniMapShown={setMiniMapShown}
                        inCrazyGames={inCrazyGames} options={options} timeOffset={timeOffset} ws={ws} backBtnPressed={backBtnPressed} multiplayerState={multiplayerState} pinPoint={pinPoint} setPinPoint={setPinPoint} loading={loading} setLoading={setLoading} session={session} latLong={latLong} loadLocation={() => { }} gameOptions={multiplayerGameOptions} setGameOptions={() => { }} showAnswer={multiplayerShowAnswer} setShowAnswer={guessMultiplayer} />
                )}

                {/* End screen for PUBLIC matchmade duels (ranked 1v1 + 2v2) —
                    private games (party team duels set duelEnd too) are owned
                    by GameUI's mounts; without the public gate both screens
                    stack and every button shows twice. Keep this after GameUI:
                    the final answer map also uses z-index 1000, so later DOM
                    order lets the summary's fade-in remain visible. */}
                {showPublicDuelEndScreen && (
                    <RoundOverScreen
                        duel={true}
                        data={multiplayerState?.gameData?.duelEnd ?? deriveTeamEndFallback(multiplayerState?.gameData)}
                        multiplayerState={multiplayerState}
                        session={session}
                        // Saved history doc id from the finisher (matchmade
                        // games have code=null). Reporting is history-view
                        // only, so on this live screen the id just names the
                        // game (copy-ID surface).
                        gameId={multiplayerState?.gameData?.duelEnd?.historyGameId || multiplayerState?.gameData?.code}
                        button1Text={text("playAgain")}
                        options={options}
                        button1Press={() => {
                            backBtnPressed(true, "ranked")
                        }}
                        // team2v2 drops the in-card Home button: Play Again +
                        // Back cover the card, and the navbar back button (shown
                        // for team2v2 end screens, see Navbar shown= below) is
                        // the straight-to-home exit for everyone — including
                        // chosen-duo guests, who get no in-card Back.
                        button2Text={multiplayerState?.gameData?.team2v2 ? null : text("home")}
                        button2Press={() => {
                            backBtnPressed()
                        }}
                        teamActions={multiplayerState?.gameData?.team2v2 ? {
                            playAgain: ({ willExit } = {}) => {
                                const sendPlayAgain = () => { try { ws.send(JSON.stringify({ type: 'playAgain2v2' })); } catch (e) {} };
                                if (willExit) beginDuelEndExit(sendPlayAgain);
                                else sendPlayAgain();
                            },
                            back: () => { beginDuelEndExit(() => { try { ws.send(JSON.stringify({ type: 'teamDuelBack' })); } catch (e) {} }); }
                        } : null}
                    />
                )}



                <Script id="clarity">
                    {`

document.addEventListener(
  'wheel',
  function touchHandler(e) {
    if (e.ctrlKey) {
      e.preventDefault();
    }
  },
  { passive: false }
);
            window.gameOpen = Date.now();

            setTimeout(() => {
                if (window.PokiSDK) {
                    window.PokiSDK.init().then(() => {
                        window.poki = true;
                        window.PokiSDK.gameLoadingFinished();
                    }).catch(() => {
                        // Poki init failed — load the game anyway.
                    });
                }
            }, 1000);


  	window.aiptag = window.aiptag || {cmd: []};
	aiptag.cmd.display = aiptag.cmd.display || [];

	//CMP tool settings
	aiptag.cmp = {
		show: true,
		position: "centered",  //centered, bottom
		button: true,
		buttonText: "Privacy settings",
		buttonPosition: "bottom-left" //bottom-left, bottom-right, bottom-center, top-left, top-right
	}
   window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = adConfig = function(o) {adsbygoogle.push(o);}
   adConfig({preloadAdBreaks: 'on'});

  `}
                </Script>

                <WhatsNewModal changelog={changelog} text={text} />
            </main>
        </>
    )
}
