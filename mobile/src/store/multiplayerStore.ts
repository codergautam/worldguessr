/**
 * Zustand multiplayer state store.
 *
 * Ported from:
 *  - components/home.js:59-83   (initialMultiplayerState)
 *  - components/home.js:1506-1880 (ws.onmessage handler)
 *
 * The handleMessage method is a near-direct copy of the web's
 * ws.onmessage handler, adapted for Zustand + React Native.
 */

import { create } from 'zustand';
import { wsService } from '../services/websocket';
import { useAuthStore } from './authStore';
import { EMOTES, EMOTE_TTL_MS, EMOTE_COOLDOWN_MS } from '../shared/emotes';
import { WS_QUEUE_CONFIRM_TIMEOUT_MS } from '../services/websocketConfig';

// Module-level emote send throttle + id counter (mirrors web emoteReactions.js).
let lastEmoteSend = 0;
let nextEmoteId = 1;

// "Did the server actually queue me?" watchdog. Started when we send a duel join
// (joinQueue); cleared the moment the server acks (queueJoined / publicDuelRange)
// or a match starts (game). If it fires, the join never registered and we bail
// out of the queue screen instead of stranding the user there. Module-level
// because at most one queue join is ever in flight.
let queueConfirmTimer: ReturnType<typeof setTimeout> | null = null;
function clearQueueConfirmTimer() {
  if (queueConfirmTimer) {
    clearTimeout(queueConfirmTimer);
    queueConfirmTimer = null;
  }
}

// ── Types ───────────────────────────────────────────────────

export interface MPPlayer {
  id: string;
  username: string;
  accountId?: string;
  countryCode?: string;
  score: number;
  final: boolean;
  latLong?: [number, number] | null;
  elo?: number;
  supporter?: boolean;
  host?: boolean;
  tag?: string;
  /** Team assignment in team modes (team parties / matchmade 2v2). */
  team?: 'a' | 'b';
  /**
   * Stamped by the server ONLY mid-game (broadcast in getready/guess/end
   * states) while the player sits in the rejoin grace window — never in
   * waiting lobbies, where departures remove the row instead.
   */
  disconnected?: boolean;
}

export interface MPLocation {
  lat: number;
  long: number;
  country?: string;
  panoId?: string;
  heading?: number;
  head?: number;
  pitch?: number;
}

export interface RoundHistoryEntry {
  round: number;
  location: MPLocation;
  players: Record<
    string,
    {
      username: string;
      countryCode?: string;
      lat: number | null;
      long: number | null;
      points: number;
      final: boolean;
      timeTaken?: number;
    }
  >;
}

/** Per-team totals: HP (5000 start) in team2v2, cumulative points in teamGame. */
export interface TeamScores {
  a: number;
  b: number;
}

/**
 * Server's `lastRoundTeamScores` — per-round team outcome stamped in
 * givePoints(). When `damage` is stamped, render it verbatim; NEVER re-derive
 * |a−b| client-side (the server applies a round multiplier the raw gap misses).
 */
export interface TeamRoundScores {
  round: number;
  scores: TeamScores;
  damage?: number;
  multiplier?: number;
}

/** Post-game Play Again consensus counter for the 2v2 end screen ("1/2"). */
export interface PlayAgain2v2State {
  needed: number;
  ackedIds: string[];
}

/** Frozen roster entry in a team `duelEnd` (teamGame players also carry score). */
export interface DuelEndPlayer {
  id: string;
  username: string;
  countryCode?: string;
  team?: 'a' | 'b';
  /** null for guests and bots — gates profile links / report eligibility. */
  accountId?: string | null;
  score?: number;
}

/**
 * Three payload shapes ride the same `type:'duelEnd'` message. Discriminate on
 * `team2v2` / `teamGame` — a team2v2 game ALSO arrives with `gameData.duel`
 * true (server sets duel = duel || teamDuel), so `duel` alone can never pick
 * the 1v1 shape.
 */
export interface DuelEnd1v1 {
  winner: boolean;
  draw: boolean;
  newElo: number;
  oldElo: number;
  timeElapsed: number;
  /** Saved history doc id ('duel_<id>') — names the doc for the history view. */
  historyGameId?: string;
  opponent?: { accountId: string | null; username: string };
}

export interface DuelEndTeam2v2 {
  team2v2: true;
  /** Always on the live/replayed payload; ABSENT on a client-derived fallback
   * whose viewer team didn't resolve (consumers derive from winningTeam). */
  winner?: boolean;
  winningTeam: 'a' | 'b' | null;
  teamScores: TeamScores;
  players: DuelEndPlayer[];
  draw: boolean;
  timeElapsed?: number;
  historyGameId?: string;
  /**
   * Per-recipient (describe YOUR team): matchmade pairing vs chosen duo, and
   * the chosen duo's host. Drive the end card's Back-button visibility. Absent
   * on fallback-derived payloads — they exist only in the live/replayed
   * duelEnd (the server reads them off staging lobbies before teardown).
   */
  autoPaired?: boolean;
  teamHostId?: string | null;
}

export interface DuelEndTeamGame {
  teamGame: true;
  teamScoring?: 'closest' | 'average';
  winningTeam: 'a' | 'b' | null;
  draw: boolean;
  teamScores: TeamScores;
  players: DuelEndPlayer[];
  winner?: boolean;
  timeElapsed?: number;
}

export type DuelEndData = DuelEnd1v1 | DuelEndTeam2v2 | DuelEndTeamGame;

export interface GameData {
  state: 'waiting' | 'getready' | 'guess' | 'end';
  myId: string;
  host: boolean;
  code: string | null;
  public: boolean;
  duel: boolean;
  curRound: number;
  rounds: number;
  timePerRound: number;
  waitBetweenRounds: number;
  startTime: number;
  nextEvtTime: number;
  maxDist: number;
  maxPlayers: number;
  extent: [number, number, number, number] | null;
  locations: MPLocation[];
  players: MPPlayer[];
  roundHistory: RoundHistoryEntry[];
  generated: number;
  displayLocation: string | null;
  nm: boolean;
  npz: boolean;
  showRoadName: boolean;
  duelEnd?: DuelEndData;
  map?: string;
  // ── Team modes (wire contract: ws Game.js getInitialSendState/getSendableState) ──
  // `duel:true` trap: the server sets duel = duel || teamDuel, so every
  // matchmade 2v2 arrives with BOTH duel and team2v2 true. Any 1v1-only gate
  // must be `duel && !team2v2`.
  /** Matchmade 2v2 team duel (wire name `team2v2`; server-internal `teamDuel`). */
  team2v2?: boolean;
  /** Intra-party cumulative team mode — never confuse with team2v2. */
  teamGame?: boolean;
  /** Private 2v2 staging lobby (pre-match, capped at 2, no game options). */
  is2v2Lobby?: boolean;
  teamScoring?: 'closest' | 'average';
  /** Host setting: may non-hosts move themselves between teams? */
  allowTeamPick?: boolean;
  /** Host setting: emote reactions muted for this game (server-enforced too). */
  disableEmotes?: boolean;
  teamScores?: TeamScores | null;
  teamRoundScores?: TeamRoundScores | null;
  /**
   * Remaining ms until this 2v2 staging lobby auto-queues (the "Queueing in
   * 3…" preview countdown). Rides ONLY the initial snapshot — the spread-merge
   * below keeps it alive across per-round broadcasts, and enter2v2Queue
   * explicitly nulls it (queued = countdown over).
   */
  autoQueueInMs?: number | null;
  /**
   * Play Again duo regroup: this staging lobby is already queue-bound and the
   * server's enter2v2Queue follows in the same burst — skip painting the lobby
   * card. Initial snapshot only (same spread-merge caveat as autoQueueInMs).
   */
  queueBoundDuo?: boolean;
  playAgain2v2?: PlayAgain2v2State | null;
  /**
   * Did we join the CURRENT match while it was already underway (vs. being
   * present from the start)? The first `game` message of the session decides —
   * a genuine starter sees state:'waiting' first; a late join / cold reconnect
   * mid-game sees getready/guess/end first. Any 'waiting' snapshot re-arms it
   * to false (in the lobby = present before the next match), so a party's
   * surviving gameData can't carry a stale true into later matches. Used to
   * skip the 5s get-ready and drop straight into normal loading.
   */
  joinedInProgress?: boolean;
}

/** A floating in-game emote reaction (replaces chat). */
export interface EmoteReaction {
  id: number;
  emote: string; // the glyph (from EMOTES)
  name: string;
  countryCode: string | null;
  isSelf: boolean;
  /** Sender's team in team modes — drives mine/opponent allegiance coloring. */
  team: 'a' | 'b' | null;
}

/** Notification queued when an opponent sends us a friend request. */
export interface FriendRequest {
  id: string;
  name: string;
  timestamp: number;
}

/** Notification queued when a friend invites us to their private game. */
export interface GameInvite {
  code: string;
  invitedByName: string;
  invitedById: string;
  timestamp: number;
}

/** Confirmed friend (from server's friends list — online flag computed server-side). */
export interface Friend {
  id: string;
  name: string;
  online: boolean;
  socketId?: string | null;
  supporter?: boolean;
  /**
   * Epoch ms of the friend's last disconnect; null while online, when the
   * friend opted out (hideLastSeen), or on servers predating the field.
   */
  lastSeen?: number | null;
}

/** Outgoing or incoming friend request entry in the friends modal. */
export interface FriendRequestEntry {
  id: string;
  name: string;
  supporter?: boolean;
}

/**
 * `friendReqState` codes mirror web's `ws.js` validation responses (sendFriendRequest handler).
 *   0 = invalid (guest / bad name)
 *   1 = success
 *   2 = recipient not accepting friend requests
 *   3 = user not found
 *   4 = already sent
 *   5 = already received (reverse request pending)
 *   6 = already friends
 *   7+ = quota / self / generic error
 */
export type FriendReqState = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ToastData {
  /** Unique id used as the React key and for dismissal. */
  id: string;
  key: string;
  toastType: 'success' | 'error' | 'info';
  message?: string;
  timestamp: number;
  /** Auto-dismiss duration in ms (defaults applied by the renderer). */
  autoClose?: number;
  vars?: Record<string, string | number>;
}

/** Max number of toasts kept on screen at once (oldest dropped first). */
const MAX_TOASTS = 4;

/**
 * Dedup window for the "Reconnected!" toast. A reconnect into an active game
 * produces TWO triggers close together — the client-side reconnect event and the
 * server's game-rejoin `toast` message — so we suppress a second within this
 * window. Tracked as a standalone timestamp (NOT by scanning the visible toast
 * list, which may have already auto-dismissed before the second trigger arrives).
 */
const RECONNECTED_TOAST_DEDUP_MS = 3000;
let lastReconnectedToastAt = 0;

let toastSeq = 0;
/** Create a ToastData with a generated id + timestamp from partial input. */
function makeToast(
  input: Omit<ToastData, 'id' | 'timestamp'> & { timestamp?: number },
): ToastData {
  return {
    ...input,
    id: `toast-${Date.now()}-${toastSeq++}`,
    timestamp: input.timestamp ?? Date.now(),
  };
}

/** Which queue we're in. '2v2' is set ONLY by server messages (enter2v2Queue /
 * the queueBoundDuo short-circuit) — the client never optimistically enters it. */
export type GameQueuedType = false | 'publicDuel' | 'unrankedDuel' | '2v2';

/** 2v2 matchmaking stage: finding a teammate (lobby card stays mounted) vs
 * finding opponents (gameData is wiped; the queue screen owns the UI). */
export type QueueStage = null | 'teammate' | 'opponents';

/** Why we're on/behind the lobby card — drives the pre-snapshot shell and the
 * back-out-of-queue restore (a stage-2 cancel must return to the 2v2 lobby
 * card, not home). Mirrors web home.js lobbyIntent. */
export type LobbyIntent = null | 'join' | 'party' | '2v2';

interface MultiplayerState {
  // Connection (from home.js:59-83)
  connected: boolean;
  connecting: boolean;
  // An ESTABLISHED socket genuinely dropped (server died / network cut) and the
  // service is auto-reconnecting. Distinct from plain `connecting`: housekeeping
  // reconnects (foreground-after-idle, login/logout secret swap) flip `connecting`
  // but never set this. WsIndicator uses it to surface the drop on every screen —
  // gating purely on the multiplayer context hid real outages entirely, because
  // every disconnect path tears the multiplayer state down in the same update.
  // Set by useWebSocket's onDisconnect handler; cleared by the next verify.
  connectionDropped: boolean;
  verified: boolean;
  playerCount: number;
  guestName: string | null;
  error: string | null;

  // Queue
  gameQueued: GameQueuedType;
  publicDuelRange: [number, number] | null;
  nextGameQueued: boolean;
  nextGameType: 'ranked' | 'unranked' | null;
  // 2v2 matchmaking state that must SURVIVE the stage-2 gameData wipe —
  // lives top-level, not on gameData (see enter2v2Queue handler).
  queueStage: QueueStage;
  /**
   * My player id, preserved across the stage-2 gameData wipe. The duo still
   * shares its staging lobby server-side, so emotes keep flowing on the queue
   * screen — this is what keeps self-styling working with gameData null.
   */
  queueMyId: string | null;
  lobbyIntent: LobbyIntent;

  // Private game join
  enteringGameCode: boolean;
  joinError: string | null;

  // In-game
  inGame: boolean;
  gameData: GameData | null;

  // In-game emote reactions (replaces chat)
  emotes: EmoteReaction[];

  // Friends / invites
  friendRequests: FriendRequest[];
  gameInvites: GameInvite[];

  /** accountId -> timestamp(ms) of the last party invite we sent that friend. */
  invitedFriends: Record<string, number>;

  // Friends list state (full sync from server `friends` message)
  friends: Friend[];
  sentRequests: FriendRequestEntry[];
  receivedRequests: FriendRequestEntry[];
  allowFriendReq: boolean;
  /** Own "hide my last seen" preference; null until the first server echo. */
  hideLastSeen: boolean | null;
  /** Last `friendReqState` code we received (and the moment we received it, for auto-clear). */
  friendReqState: FriendReqState | null;
  friendReqStateAt: number;

  // Toasts (queue — newest appended; rendered stacked)
  toasts: ToastData[];

  // Maintenance
  maintenance: boolean;

  // Actions
  handleMessage: (data: any) => void;
  setGameQueued: (type: GameQueuedType) => void;
  /**
   * Join a duel queue: send the `publicDuel`/`unrankedDuel` message, flip
   * `gameQueued`, and arm a watchdog. If the server doesn't confirm the join
   * within WS_QUEUE_CONFIRM_TIMEOUT_MS we toast and clear `gameQueued` (the queue
   * screen pops itself home on `!gameQueued && !inGame`) instead of leaving the
   * user spinning. Use this instead of sending the join message by hand.
   */
  joinQueue: (type: 'publicDuel' | 'unrankedDuel') => void;
  /**
   * Create a private lobby — one path for both flavors (web createLobby
   * parity): a party, or a 2v2 staging lobby (mode:'2v2' → server caps it at
   * 2 and skips game options). Stamps lobbyIntent for the pre-snapshot shell
   * and the back-out-of-queue lobby restore.
   */
  createPrivateGame: (intent: 'party' | '2v2') => void;
  /**
   * Host queues the 2v2 staging lobby (solo or duo) for matchmaking. No
   * optimistic state: the server's enter2v2Queue answers (stage 'teammate'
   * for a solo, straight to a `game` burst for a full duo) and an idempotent
   * re-press recovers a lost send.
   */
  find2v2Match: () => void;
  /**
   * Cancel stage-1 teammate matchmaking WITHOUT leaving the lobby (inGame
   * stays true during stage 1 — the back-button path would send leaveGame).
   * Drops the queue entry server-side; the lobby restore re-sends state,
   * confirming the optimistic clear here. Web parity: home.js
   * cancelTeammateSearch, which deliberately runs before any queued-guard
   * ("we ARE queued while cancelling").
   */
  cancelTeammateSearch: () => void;
  /** Host: set intra-party team config (enabled / scoring / allowTeamPick). */
  setTeamConfig: (config: {
    enabled?: boolean;
    scoring?: 'closest' | 'average';
    allowTeamPick?: boolean;
  }) => void;
  /** Host: randomly re-split the party roster into two teams. */
  shuffleTeams: () => void;
  /**
   * Move a player between teams. Allowed for the host (anyone) or, when
   * allowTeamPick, for yourself. Optimistic flip — the server rejectAndResyncs
   * with a full snapshot on rejection.
   */
  setPlayerTeam: (playerId: string, team: 'a' | 'b') => void;
  /** Host: kick a lobby member (server refuses kicking queued members). */
  kickPlayer: (playerId: string) => void;
  /**
   * Ack Play Again on the team2v2 end screen. Does NOT leave the game — the
   * session must stay attached for the queue-bound regroup burst on consensus.
   */
  sendPlayAgain2v2: () => void;
  /** Return the team2v2 end screen to a fresh staging lobby (server enforces
   * the Back-visibility rule: auto-paired members, chosen-duo host, or last
   * living member). Dead-game senders get restaged — never a dead click. */
  sendTeamDuelBack: () => void;
  setEnteringGameCode: (value: boolean) => void;
  sendEmote: (index: number) => void;
  clearEmote: (id: number) => void;
  clearGameInvite: (code: string) => void;
  clearFriendRequest: (id: string) => void;
  /** Enqueue a toast (id + timestamp generated automatically). */
  pushToast: (toast: Omit<ToastData, 'id' | 'timestamp'> & { timestamp?: number }) => void;
  /**
   * Enqueue the "Reconnected!" success toast, deduped within a short window. Both
   * the client-driven reconnect event and the server's game-rejoin toast route
   * through here so they collapse into a single toast.
   */
  pushReconnectedToast: () => void;
  /** Remove a toast from the queue by id. */
  dismissToast: (id: string) => void;
  clearFriendReqState: () => void;
  // Friend WS actions — direct ports of ws.js handlers
  requestFriends: () => void;
  sendFriendRequest: (name: string) => void;
  acceptFriend: (id: string) => void;
  declineFriend: (id: string) => void;
  cancelFriendRequest: (id: string) => void;
  removeFriend: (id: string) => void;
  setAllowFriendReqOnServer: (allow: boolean) => void;
  setHideLastSeenOnServer: (hide: boolean) => void;
  inviteFriendToGame: (friendSocketId: string, friendId?: string) => void;
  acceptGameInvite: (code: string, invitedById: string) => void;
  /**
   * Join a private game by 6-digit code. `viaLink` distinguishes a tap on a
   * shared party link (deep-link handler, no join screen mounted) from a manual
   * code entry on /party/join — it governs how a `gameJoinError` is surfaced
   * (toast vs. inline). See the gameJoinError handler.
   */
  joinPrivateGame: (code: string, viaLink?: boolean) => void;
  leaveGame: () => void;
  resetGame: () => void;
  reset: () => void;
  resetAccount: () => void;
}

// ── Initial state (ported from home.js:59-83) ───────────────

// Game-scoped state — the ONLY fields the game-lifecycle resets (reset(),
// gameShutdown, gameCancelled) may wipe. Deliberately excludes connection
// state (connected/verified/playerCount/guestName) and account/social state
// (friends, requests, allowFriendReq, hideLastSeen, game invites): those
// outlive any single game. Wiping them on an ordinary game-leave greyed out
// the Settings toggles and emptied the friends list until the next 'friends'
// push — add new game fields here, account-level fields below.
const gameInitialState = {
  error: null as string | null,
  gameQueued: false as GameQueuedType,
  publicDuelRange: null as [number, number] | null,
  nextGameQueued: false,
  nextGameType: null as 'ranked' | 'unranked' | null,
  // 2v2 matchmaking state (survives the stage-2 gameData wipe, but is still
  // game-scoped: every lifecycle reset must drop it or a stale stage strands
  // the nav machine — that's why it lives HERE and not beside account state).
  queueStage: null as QueueStage,
  queueMyId: null as string | null,
  lobbyIntent: null as LobbyIntent,
  enteringGameCode: false,
  joinError: null as string | null,
  inGame: false,
  gameData: null as GameData | null,
  emotes: [] as EmoteReaction[],
  // Party-scoped "invite sent" checkmarks (InviteFriendsModal) — meaningless
  // outside the party they were sent for, so they reset with the game.
  invitedFriends: {} as Record<string, number>,
  toasts: [] as ToastData[],
};

// The queue/lobby slice of gameInitialState. Spread this at every teardown
// that kills matchmaking context WITHOUT spreading full gameInitialState
// (terminal errors, join failures, the useWebSocket disconnect/reconnect
// paths). Historically those sites cleared only gameQueued/publicDuelRange —
// written for the 1v1 world where queue and game were mutually exclusive.
// 2v2 stage-1 (queued while inside a staging lobby) broke that assumption,
// so the queue fields must travel as one unit or a background-reconnect
// strands stale queueStage/lobbyIntent and the nav machine misfires.
export const queueTeardownState = {
  gameQueued: gameInitialState.gameQueued,
  publicDuelRange: gameInitialState.publicDuelRange,
  queueStage: gameInitialState.queueStage,
  queueMyId: gameInitialState.queueMyId,
  lobbyIntent: gameInitialState.lobbyIntent,
};

// Account-scoped state — friends/presence, requests, invites, and the
// server-backed settings toggles. Wiped ONLY on logout (resetAccount), never
// by game-lifecycle resets.
const accountInitialState = {
  friendRequests: [] as FriendRequest[],
  gameInvites: [] as GameInvite[],
  friends: [] as Friend[],
  sentRequests: [] as FriendRequestEntry[],
  receivedRequests: [] as FriendRequestEntry[],
  allowFriendReq: true,
  hideLastSeen: null as boolean | null,
  friendReqState: null as FriendReqState | null,
  friendReqStateAt: 0,
};

// ── Account-settings ack watchdog ────────────────────────────
// An optimistic toggle flip is only truthful if the server's authoritative
// `friends` echo eventually lands (the server echoes after EVERY write
// attempt — accepted, cooldown-rejected, or failed). If no echo arrives —
// half-open zombie socket (readyState OPEN but nothing delivered, the known
// verifyLiveness gap) or a message lost mid-flight — undo the flip and
// surface an error instead of leaving the UI showing a value the server
// never stored.
const SETTINGS_ACK_TIMEOUT_MS = 6000;
const settingsAckTimers: Partial<
  Record<'allowFriendReq' | 'hideLastSeen', ReturnType<typeof setTimeout>>
> = {};

function armSettingsAckWatchdog(
  field: 'allowFriendReq' | 'hideLastSeen',
  revert: () => void,
) {
  clearTimeout(settingsAckTimers[field]);
  settingsAckTimers[field] = setTimeout(() => {
    delete settingsAckTimers[field];
    revert();
    useMultiplayerStore.getState().pushToast({ key: 'errorOccurredTryAgain', toastType: 'error' });
  }, SETTINGS_ACK_TIMEOUT_MS);
}

/** Any `friends` sync is authoritative for both toggles — cancel pending undos. */
function clearSettingsAckWatchdogs() {
  for (const field of Object.keys(settingsAckTimers) as Array<keyof typeof settingsAckTimers>) {
    clearTimeout(settingsAckTimers[field]);
    delete settingsAckTimers[field];
  }
}

const initialState = {
  connected: false,
  connecting: false,
  connectionDropped: false,
  verified: false,
  playerCount: 0,
  guestName: null as string | null,
  maintenance: false,
  ...accountInitialState,
  ...gameInitialState,
};

// ── Store ───────────────────────────────────────────────────

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  ...initialState,
  // Seed the connection flags from the LIVE socket, not the hardcoded `false`
  // above. On a dev Fast-Refresh this store is recreated (resetting these to
  // false) while the wsService singleton keeps its open, already-verified
  // socket — connect() then short-circuits without sending a fresh `verify`, so
  // nothing would ever flip these back true and the home-screen multiplayer
  // buttons falsely report "Not connected". Reading the surviving socket keeps
  // the UI honest across a hot reload. On a cold start the socket isn't open yet
  // so isVerified is false (correct).
  connected: wsService.isVerified,
  verified: wsService.isVerified,

  setGameQueued: (type) => set({ gameQueued: type }),

  joinQueue: (type) => {
    clearQueueConfirmTimer();
    wsService.send({ type });
    set({ gameQueued: type, publicDuelRange: null });
    queueConfirmTimer = setTimeout(() => {
      queueConfirmTimer = null;
      const s = get();
      // We already moved on (a match started, or the user cancelled / got
      // disconnected and the queue was cleared) — the join clearly worked or no
      // longer matters. Nothing to do.
      if (!s.gameQueued || s.inGame) return;
      // No ack within the window: the server never put us in the queue. Tell it to
      // drop us (a no-op server-side if it never had us) and clear local queue
      // state — the queue screen pops itself home on `!gameQueued && !inGame` — so
      // the user isn't misled into waiting on a queue they were never in.
      wsService.send({ type: 'leaveQueue' });
      set({ gameQueued: false, publicDuelRange: null });
      get().pushToast({
        key: 'queueJoinFailed',
        toastType: 'error',
        message: "Couldn't join the queue. Please try again.",
      });
    }, WS_QUEUE_CONFIRM_TIMEOUT_MS);
  },

  createPrivateGame: (intent) => {
    set({ lobbyIntent: intent });
    wsService.send({
      type: 'createPrivateGame',
      ...(intent === '2v2' ? { mode: '2v2' } : {}),
    });
  },

  find2v2Match: () => {
    wsService.send({ type: 'find2v2Match' });
  },

  cancelTeammateSearch: () => {
    wsService.send({ type: 'leaveQueue' });
    // Optimistic clear; the server's lobby-restore snapshot confirms it.
    set({ gameQueued: false, queueStage: null });
  },

  // ── Intra-party team mode (client gates MIRROR the server's; the server
  // re-validates everything and its broadcast is authoritative) ─────────────
  setTeamConfig: (config) => {
    const gd = get().gameData;
    if (!gd?.host || gd.state !== 'waiting') return;
    wsService.send({ type: 'setTeamConfig', ...config });
    // Optimistic merge so the modal's controls respond instantly (same
    // pattern as setPlayerTeam); every game snapshot carries all three fields
    // (getInitialSendState/getSendableState), so the server echo self-corrects
    // a rejected write. Team ASSIGNMENTS are left alone — enabling shuffles
    // rosters server-side and only the snapshot knows the result.
    set((s) =>
      s.gameData
        ? {
            gameData: {
              ...s.gameData,
              ...(config.enabled !== undefined ? { teamGame: config.enabled } : {}),
              ...(config.scoring !== undefined ? { teamScoring: config.scoring } : {}),
              ...(config.allowTeamPick !== undefined
                ? { allowTeamPick: config.allowTeamPick }
                : {}),
            },
          }
        : s,
    );
  },

  shuffleTeams: () => {
    const gd = get().gameData;
    if (!gd?.host || gd.state !== 'waiting' || !gd.teamGame) return;
    wsService.send({ type: 'shuffleTeams' });
  },

  setPlayerTeam: (playerId, team) => {
    const gd = get().gameData;
    if (!gd || gd.state !== 'waiting' || !gd.teamGame) return;
    const isSelf = playerId === gd.myId;
    if (!(gd.host || (gd.allowTeamPick && isSelf))) return;
    wsService.send({ type: 'setPlayerTeam', playerId, team });
    // Optimistic flip so the row jumps columns instantly; the next 'game'
    // broadcast replaces players wholesale and self-corrects.
    set((s) =>
      s.gameData
        ? {
            gameData: {
              ...s.gameData,
              players: s.gameData.players.map((p) =>
                p.id === playerId ? { ...p, team } : p,
              ),
            },
          }
        : s,
    );
  },

  kickPlayer: (playerId) => {
    if (!get().gameData?.host) return;
    wsService.send({ type: 'kickPlayer', playerId });
  },

  sendPlayAgain2v2: () => {
    wsService.send({ type: 'playAgain2v2' });
  },

  sendTeamDuelBack: () => {
    wsService.send({ type: 'teamDuelBack' });
  },

  setEnteringGameCode: (value) => set({ enteringGameCode: value }),

  // Send an emote reaction (client-side throttle; server also enforces 1.5s).
  sendEmote: (index) => {
    if (index < 0 || index >= EMOTES.length) return;
    const now = Date.now();
    if (now - lastEmoteSend < EMOTE_COOLDOWN_MS) return;
    lastEmoteSend = now;
    wsService.send({ type: 'emote', emote: index });
  },

  clearEmote: (id) => set((s) => ({ emotes: s.emotes.filter((e) => e.id !== id) })),

  clearGameInvite: (code) =>
    set((s) => ({
      gameInvites: s.gameInvites.filter((inv) => inv.code !== code),
    })),

  clearFriendRequest: (id) =>
    set((s) => ({
      friendRequests: s.friendRequests.filter((req) => req.id !== id),
    })),

  clearFriendReqState: () => set({ friendReqState: null, friendReqStateAt: 0 }),

  pushToast: (toast) =>
    set((s) => ({
      // Append newest, cap the queue (drop oldest) so the stack stays tidy.
      toasts: [...s.toasts, makeToast(toast)].slice(-MAX_TOASTS),
    })),

  pushReconnectedToast: () => {
    const now = Date.now();
    if (now - lastReconnectedToastAt < RECONNECTED_TOAST_DEDUP_MS) return;
    lastReconnectedToastAt = now;
    get().pushToast({ key: 'reconnected', toastType: 'success' });
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  // ── Friend WS actions (1:1 with web ws.js) ────────────────
  requestFriends: () => wsService.send({ type: 'getFriends' }),
  sendFriendRequest: (name) => {
    wsService.send({ type: 'sendFriendRequest', name });
  },
  acceptFriend: (id) => {
    wsService.send({ type: 'acceptFriend', id });
    // Optimistically drop the toast notification for this requester
    set((s) => ({
      friendRequests: s.friendRequests.filter((r) => r.id !== id),
    }));
  },
  declineFriend: (id) => {
    wsService.send({ type: 'declineFriend', id });
    set((s) => ({
      friendRequests: s.friendRequests.filter((r) => r.id !== id),
    }));
  },
  cancelFriendRequest: (id) => wsService.send({ type: 'cancelRequest', id }),
  removeFriend: (id) => wsService.send({ type: 'removeFriend', id }),
  // Optimistic flips — the server pushes an authoritative 'friends' echo after
  // every write attempt (accepted, cooldown-rejected, or failed), confirming
  // the flip or snapping it back. Two guards keep the optimism truthful:
  //   1. flip ONLY when send() actually delivered (Settings disables these
  //      toggles while unverified, so a dropped send here is a rare race);
  //   2. the ack watchdog undoes the flip if no `friends` echo lands at all
  //      (zombie socket / old server / lost message — see armSettingsAckWatchdog).
  setAllowFriendReqOnServer: (allow) => {
    if (!wsService.send({ type: 'setAllowFriendReq', allow })) return;
    const prev = get().allowFriendReq;
    set({ allowFriendReq: allow });
    armSettingsAckWatchdog('allowFriendReq', () => set({ allowFriendReq: prev }));
  },
  setHideLastSeenOnServer: (hide) => {
    if (!wsService.send({ type: 'setHideLastSeen', hide })) return;
    const prev = get().hideLastSeen;
    set({ hideLastSeen: hide });
    armSettingsAckWatchdog('hideLastSeen', () => set({ hideLastSeen: prev }));
  },
  inviteFriendToGame: (friendSocketId, friendId) => {
    wsService.send({ type: 'inviteFriend', friendId: friendSocketId });
    // Record when we invited this friend (keyed by their accountId) so the UI
    // can show a "sent" check that survives the modal closing/reopening.
    if (friendId) {
      set((s) => ({
        invitedFriends: { ...s.invitedFriends, [friendId]: Date.now() },
      }));
    }
  },
  acceptGameInvite: (code, invitedById) => {
    wsService.send({ type: 'acceptInvite', code, invitedById });
    // Drop the invite from the queue locally — server will deliver gameJoin
    // events. 'join' intent, same as a code join: it clears on arrival and
    // stomps any stale creator intent from an earlier abandoned create.
    set((s) => ({
      gameInvites: s.gameInvites.filter((inv) => inv.code !== code),
      lobbyIntent: 'join',
    }));
  },
  // Join a private game by 6-digit code. Shared by the join-code form and the
  // deep-link handler so there's one path (matches join.tsx handleJoin).
  // `enteringGameCode` mirrors web's flag: TRUE only for a manual entry (the
  // /party/join screen is mounted to render `joinError`), FALSE for a link tap
  // (no such screen) — the gameJoinError handler branches on it.
  joinPrivateGame: (code, viaLink = false) => {
    // 'join' intent is transient: the game handler nulls it once the lobby
    // snapshot arrives (creators keep 'party'/'2v2' — web home.js parity).
    set({ joinError: null, enteringGameCode: !viaLink, lobbyIntent: 'join' });
    wsService.send({ type: 'joinPrivateGame', gameCode: code });
  },

  // Leave the current game: tell the server (so it clears player.gameId, freeing
  // the player to re-queue) then drop all game-scoped state. Used by the in-game
  // back button and the results-screen Play Again / Home actions.
  leaveGame: () => {
    wsService.send({ type: 'leaveGame' });
    get().reset();
  },

  // Host-only: ask the server to reset a private party back to the lobby (web
  // parity: home.js backBtnPressed → ws {type:'resetGame'}). Does NOT call
  // reset() — the server's broadcast game{state:'waiting'} drives all clients
  // (host + guests) back to the MultiplayerLobby.
  resetGame: () => {
    wsService.send({ type: 'resetGame' });
  },

  // Zustand set() merges, so spreading ONLY gameInitialState leaves connection
  // and account/social state untouched by construction — no preserve-list to
  // keep in sync as fields are added.
  reset: () => set({ ...gameInitialState }),

  // Logout teardown: wipe account-scoped AND game-scoped state (everything but
  // the connection itself, which the guest reconnect re-syncs). Game resets
  // must NOT clear account state — that's why this is separate from reset().
  resetAccount: () => {
    clearSettingsAckWatchdogs(); // pending undos target the old account's values
    set({ ...accountInitialState, ...gameInitialState });
  },

  /**
   * Central message handler — direct port of home.js:1506-1880.
   * Each case matches 1:1 with the web implementation.
   */
  handleMessage: (data: any) => {
    const state = get();

    // ── restartQueued (home.js:1509-1518) ─────────────────
    if (data.type === 'restartQueued') {
      set({ maintenance: !!data.value });
      if (data.value) {
        get().pushToast({
          key: 'maintenanceModeStarted',
          toastType: 'info',
        });
      }
      return;
    }

    // ── t — fallback time sync (home.js:1519-1533) ────────
    // Handled internally by wsService.updateTimeOffsetFallback

    // ── timeSync (home.js:1535-1537) ──────────────────────
    // Handled internally by wsService.updateTimeOffsetFromSync

    // ── elo (home.js:1539-1554) ───────────────────────────
    if (data.type === 'elo') {
      // Update authStore ELO (replaces web's setSession/setEloData)
      useAuthStore.getState().updateUser({
        elo: data.elo,
      });
      return;
    }

    // ── cnt — player count (home.js:1556-1560) ────────────
    if (data.type === 'cnt') {
      set({ playerCount: data.c });
      return;
    }

    // ── verify (home.js:1561-1572) ────────────────────────
    if (data.type === 'verify') {
      set({
        connected: true,
        connecting: false,
        // The session is re-established — whatever drop we were surfacing is over.
        connectionDropped: false,
        verified: true,
        guestName: data.guestName ?? state.guestName,
      });
      // Store rejoinCode for reconnection
      if (data.rejoinCode) {
        wsService.storeRejoinCode(data.rejoinCode);
      }
      return;
    }

    // ── error (home.js:1574-1595) ─────────────────────────
    if (data.type === 'error') {
      // A `uac` (another device took over) or a `failedToLogin` are TERMINAL: both
      // set `dontReconnect`, so the client will NOT auto-reconnect and the socket
      // close that follows no-ops in handleDisconnect(). If we're sitting in a
      // multiplayer game / party / queue when that happens, the screen would be
      // left frozen on a dead session. Tear the game-scoped state down (mirroring
      // onReconnectFailed) so each multiplayer screen's own effect pops the user
      // home smoothly: game/[id] on `!inGame` (covers the `waiting` party lobby
      // too), queue on `!gameQueued && !inGame`. Singleplayer/daily never set these
      // fields, so they're unaffected. Web parity: home.js bounces to home on close.
      const terminal = data.message === 'uac' || !!data.failedToLogin;
      const wasInMultiplayer = state.inGame || !!state.gameData || !!state.gameQueued;
      set({
        connecting: false,
        connected: false,
        error: data.message,
        // Terminal = the session is gone server-side. `verified` must drop with
        // it, or verified-gated flows (party create's createPrivateGame effect,
        // the screen-presence sender) keep firing into a kicked session while
        // its socket lingers OPEN. Non-terminal errors keep `verified` so the
        // useWebSocket re-sync can restore `connected` from the live socket.
        ...(terminal ? { verified: false } : {}),
        ...(terminal && wasInMultiplayer
          ? { inGame: false, gameData: null, emotes: [], ...queueTeardownState }
          : {}),
      });
      if (data.message === 'uac') {
        wsService.setDontReconnect(true);
      }
      if (data.failedToLogin) {
        wsService.setDontReconnect(true);
        useAuthStore.getState().logout();
      }
      get().pushToast({
        key: data.message === 'uac' ? 'userAlreadyConnected' : 'connectionError',
        toastType: 'error',
        message: data.message,
      });
      return;
    }

    // ── game — full game state (home.js:1596-1688) ────────
    if (data.type === 'game') {
      // A match (or private-game/reconnect) started — we're no longer waiting on a
      // queue ack, so retire the watchdog.
      clearQueueConfirmTimer();

      // Play Again duo regroup (web home.js queueBoundDuo short-circuit): the
      // staging lobby arrives queue-bound and the server's enter2v2Queue
      // follows in the same burst. Skip straight to the queue state instead of
      // painting the lobby card for a frame in between. Solo survivors never
      // get the flag — stage-1 teammate search renders inside their lobby card.
      if (data.is2v2Lobby && data.state === 'waiting' && data.queueBoundDuo) {
        set({
          inGame: false,
          gameData: null,
          lobbyIntent: null,
          gameQueued: '2v2',
          queueStage: 'opponents',
          // Emotes stay live on the queue screen (the duo still shares its
          // staging lobby server-side) — keep my id for self-styling now that
          // gameData is gone.
          queueMyId: data.myId,
          enteringGameCode: false,
          joinError: null,
        });
        return;
      }

      const prevGameData = state.gameData;

      // When a private game is reset back to the lobby (server resetGame), it
      // clears locations/roundHistory/duelEnd. Force-drop any stale values from
      // the previous game on this transition so the shallow merge below can't
      // leak a finished game's data into the fresh lobby (bug E). Only on the
      // edge into 'waiting' — steady-state waiting accumulates generated data.
      const enteringWaiting =
        data.state === 'waiting' && !!prevGameData && prevGameData.state !== 'waiting';

      // Map each player's guess to `latLong`, exactly like web (it reads
      // `player.guess`). The server keeps `player.guess` populated through the
      // between-rounds 'getready' state — saveRoundToHistory() does NOT clear it;
      // clearGuesses() only runs when the NEXT round's guess phase starts — and
      // includes it in every `game` message. Mobile previously read `latLong`
      // (set only by `place` broadcasts and then overwritten by this merge),
      // which is why the answer reveal showed no guess pins until a reconnect.
      const incomingPlayers: MPPlayer[] = data.players ?? prevGameData?.players ?? [];
      const mergedPlayers: MPPlayer[] = incomingPlayers.map((p) => {
        const guess = (p as { guess?: unknown }).guess;
        return {
          ...p,
          latLong: Array.isArray(guess) ? (guess as [number, number]) : null,
          final: !!p.final,
        };
      });

      console.log('[Store] game message received — state:', data.state, 'code:', data.code, 'host:', data.host, 'players:', data.players?.length);

      // Optimistically bump the live profile totals when a game finishes, so XP /
      // games-played update instantly without an app reload. Fire exactly once,
      // on the edge into the 'end' state. Mirrors the server's award rules:
      //   • every game (duel / unranked / party) → totalGamesPlayed +1
      //   • XP only for ranked duels and public unranked (awardXp = duel||public)
      //   • XP per round = floor(points/50) capped at 100 (Game.calculatePlayerXp)
      const enteringEnd = data.state === 'end' && prevGameData?.state !== 'end';
      if (enteringEnd) {
        const myId = data.myId ?? prevGameData?.myId;
        const roundHistory = data.roundHistory ?? prevGameData?.roundHistory ?? [];
        const awardXp = !!data.duel || !!data.public;
        let earnedXp = 0;
        if (awardXp && myId) {
          for (const round of roundHistory) {
            const points = round?.players?.[myId]?.points;
            if (points) earnedXp += Math.min(100, Math.floor(points / 50));
          }
        }
        // Only registered users earn (applyGameResult no-ops without a user).
        useAuthStore.getState().applyGameResult({ xp: earnedXp, gamesPlayed: 1 });
      }

      set({
        gameQueued: false,
        queueStage: null,
        // A joiner's 'join' intent is served once the game arrives; creators
        // keep 'party'/'2v2' for lobby presentation (web home.js parity).
        // The SNAPSHOT corrects a stale intent: a '2v2' stamp left behind by
        // a failed create (suspension/maintenance toast, no game) must never
        // dress a later plain party up as a 2v2 staging lobby.
        lobbyIntent:
          state.lobbyIntent === 'join'
            ? null
            : data.is2v2Lobby
              ? '2v2'
              : state.lobbyIntent === '2v2'
                ? null
                : state.lobbyIntent,
        inGame: true,
        enteringGameCode: false,
        joinError: null,
        gameData: {
          ...(prevGameData ?? {}),
          ...data,
          type: undefined, // Remove the message type field
          ...(enteringWaiting
            ? { locations: [], roundHistory: [], duelEnd: undefined, playAgain2v2: null }
            : {}),
          players: mergedPlayers,
          // First `game` message of a session (prevGameData == null) decides: a
          // real starter's first state is 'waiting'; a late join / mid-game
          // reconnect sees getready/guess/end first → joinedInProgress. Any
          // LATER 'waiting' snapshot re-arms it to false — back in the lobby
          // means present before the next match starts. Without that re-arm, a
          // mid-game reconnect latched true forever (a party's gameData
          // survives the game→lobby→game cycle), so every following match
          // skipped its "Get Ready 5…" countdown. Set LAST so the server
          // payload — which never sends this field — can't clobber it.
          joinedInProgress:
            data.state === 'waiting'
              ? false
              : prevGameData
                ? prevGameData.joinedInProgress
                : true,
        } as GameData,
      });
      return;
    }

    // ── duelEnd — all three shapes: 1v1 / team2v2 / teamGame ──────────────
    if (data.type === 'duelEnd') {
      if (!state.gameData) return;
      set({
        gameData: {
          ...state.gameData,
          duelEnd: data,
          // Fresh consensus per match — a stale counter from a previous game
          // must never render on this end screen (the server re-broadcasts
          // the real one right after).
          playAgain2v2: null,
        },
      });
      return;
    }

    // ── playAgain2v2 — post-game Play Again consensus counter ─────────────
    // For the results screen ("Play Again (1/2)"). Server re-broadcasts on
    // every ack and on teammate departure (which resets acks).
    if (data.type === 'playAgain2v2') {
      if (!state.gameData) return;
      set({
        gameData: {
          ...state.gameData,
          playAgain2v2: { needed: data.needed, ackedIds: data.ackedIds || [] },
        },
      });
      return;
    }

    // ── enter2v2Queue — server moved us into 2v2 matchmaking ──────────────
    // From a lobby's Find Match, an auto-requeue after a pre-game cancel, or
    // the silent stage-2 → stage-1 demotion (partner's queue entry confirmed
    // gone — a fresh lobby `game` snapshot precedes this message).
    // Stage 1 (finding a teammate) renders INSIDE the lobby card, so keep
    // inGame/gameData/lobbyIntent. Stage 2 (finding opponents) wipes gameData;
    // the queue screen owns the UI and top-level queueStage/queueMyId carry
    // what it needs.
    if (data.type === 'enter2v2Queue') {
      // Also the 2v2 queue-join confirmation: stage-1 solo gets this with NO
      // accompanying `game` snapshot, so it must clear the watchdog itself
      // (4th clearing site beside game / queueJoined / publicDuelRange).
      clearQueueConfirmTimer();
      const teammateStage = data.stage === 'teammate';
      set({
        inGame: teammateStage ? state.inGame : false,
        // Stage 1 keeps the lobby card, but any "Queueing in 3…" countdown is
        // over the moment we're actually queued — clear the stamp so a stale
        // one can't keep ticking.
        gameData: teammateStage
          ? state.gameData
            ? { ...state.gameData, autoQueueInMs: null }
            : state.gameData
          : null,
        lobbyIntent: teammateStage ? state.lobbyIntent : null,
        gameQueued: '2v2',
        queueStage: teammateStage ? 'teammate' : 'opponents',
        // Stage 2 wipes gameData but the duo still shares its staging lobby
        // server-side, so emotes keep flowing on the queue screen — preserve
        // my id for self-styling.
        queueMyId: state.gameData?.myId ?? state.queueMyId,
      });
      return;
    }

    // ── queueJoined — server confirms we're actually in the duel queue ─────
    // Sent for BOTH ranked and unranked right after we're added server-side. This
    // is the ack the join watchdog (joinQueue) waits on; without it there's no way
    // to tell "queued, waiting for a match" apart from "server never queued me".
    if (data.type === 'queueJoined') {
      clearQueueConfirmTimer();
      return;
    }

    // ── publicDuelRange (home.js:1702-1706) ───────────────
    if (data.type === 'publicDuelRange') {
      // Also a valid join confirmation for ranked — clear the watchdog.
      clearQueueConfirmTimer();
      set({ publicDuelRange: data.range });
      return;
    }

    // ── maxDist (home.js:1707-1716) ───────────────────────
    if (data.type === 'maxDist') {
      if (!state.gameData) return;
      set({
        gameData: {
          ...state.gameData,
          maxDist: data.maxDist,
        },
      });
      return;
    }

    // ── player add/remove (home.js:1718-1735) ─────────────
    if (data.type === 'player') {
      if (!state.gameData) return;
      if (data.action === 'remove') {
        set({
          gameData: {
            ...state.gameData,
            players: state.gameData.players.filter((p) => p.id !== data.id),
          },
        });
      } else if (data.action === 'add') {
        set({
          gameData: {
            ...state.gameData,
            players: [...state.gameData.players, data.player],
          },
        });
      }
      return;
    }

    // ── place — opponent guess (home.js:1736-1746) ────────
    if (data.type === 'place') {
      if (!state.gameData) return;
      const updatedPlayers = state.gameData.players.map((p) =>
        p.id === data.id
          ? { ...p, final: data.final, latLong: data.latLong }
          : p,
      );
      set({
        gameData: {
          ...state.gameData,
          players: updatedPlayers,
        },
      });
      return;
    }

    // ── gameOver (home.js:1747-1752) ──────────────────────
    if (data.type === 'gameOver') {
      // Round ended, server will send next state
      return;
    }

    // ── gameShutdown (home.js:1754-1771) ──────────────────
    if (data.type === 'gameShutdown') {
      // Ignore shutdowns that don't apply to a live game we're in: the echo of
      // our own leaveGame (already !inGame), or a public game we've already
      // finished and are viewing results for. Mirrors web's guards
      // (home.js:1754-1771); without them a late shutdown for the OLD game — e.g.
      // arriving as a reconnect restores a NEW one — wipes the fresh game and
      // bounces the user home.
      if (!state.inGame || (state.gameData?.public && state.gameData?.state === 'end')) {
        return;
      }
      set({
        ...gameInitialState,
        nextGameQueued: state.nextGameQueued,
        nextGameType: state.nextGameType,
      });
      return;
    }

    // ── gameCancelled (home.js:1772-1793) ──────────────────
    if (data.type === 'gameCancelled') {
      // Preserve the ORIGINAL queue type so an unranked player whose opponent
      // quits before start re-queues back into unranked (not ranked). The
      // original type is still readable from `state.gameQueued` here because
      // `state` was captured at the top of handleMessage before this reset.
      set({
        ...gameInitialState,
        nextGameQueued: true, // Auto re-queue
        nextGameType: state.gameQueued === 'unrankedDuel' ? 'unranked' : 'ranked',
      });
      get().pushToast({
        key: 'opponentLeftBeforeStart',
        toastType: 'info',
      });
      return;
    }

    // ── gameJoinError (home.js:2184-2206) ──────────────────
    if (data.type === 'gameJoinError') {
      // Manual entry: the /party/join screen is mounted and renders `joinError`
      // inline, so just hand it the message.
      if (state.enteringGameCode) {
        set({ joinError: data.error });
        return;
      }
      // Joined via a shared party link: no join screen is on screen, so an inline
      // `joinError` would be invisible (the silent-failure bug). Surface a toast
      // and drop any half-built game state, exactly like web's else-branch.
      // Map ONLY the known server strings to locale keys; anything else (the
      // team-gate sentences: 'Play team games on worldguessr.com for now',
      // 'Link your Google account to play 2v2') passes through verbatim as a
      // sentence-as-key — t() renders unresolved keys as-is. Collapsing
      // unknowns into invalidPartyCode showed flagless users "Invalid or
      // expired party code" instead of the upgrade message.
      const errorKey =
        data.error === 'Game is full'
          ? 'partyFull'
          : data.error === 'Invalid game code'
            ? 'invalidPartyCode'
            : data.error;
      get().pushToast({
        key: errorKey,
        toastType: 'error',
        message: data.error,
      });
      set({
        joinError: null,
        enteringGameCode: false,
        inGame: false,
        gameData: null,
        emotes: [],
        ...queueTeardownState,
      });
      return;
    }

    // ── generating (home.js:1805-1815) ────────────────────
    if (data.type === 'generating') {
      if (!state.gameData) return;
      set({
        gameData: {
          ...state.gameData,
          generated: data.generated,
        },
      });
      return;
    }

    // ── friendReq (home.js:1816-1839) ─────────────────────
    // Server pushes this when an *online* user receives a new friend request
    // from another online user. Surfaces as an actionable toast (Accept/Decline)
    // until the user responds or the toast auto-dismisses.
    if (data.type === 'friendReq') {
      set({
        friendRequests: [
          ...state.friendRequests.filter((r) => r.id !== data.id),
          { id: data.id, name: data.name, timestamp: Date.now() },
        ],
      });
      return;
    }

    // ── toast (home.js:1842-1843) ─────────────────────────
    if (data.type === 'toast') {
      // Extract template variables (everything except type, key, toastType, closeOnClick)
      const { type: _t, key, toastType, closeOnClick, autoClose, ...vars } = data;
      // Round-pressure nudges (opponent / other team locked in, you're the
      // last guesser) get an audible ping — the toast alone is easy to miss
      // while panning a street view. Mix ratio 0.5 (user ruling: the full-
      // tilt default barked over everything). Lazy import: the sound service
      // pulls THIS store for the playlist gate, and a static import here
      // would close the cycle.
      if (['opponentLocked', 'otherTeamLocked', 'lastGuesser'].includes(key)) {
        import('../services/sound').then(({ playSfx }) => playSfx('multinoti', { volume: 0.5 })).catch(() => {});
      }
      // The server sends a 'reconnected' toast on game rejoin. Route it through
      // the deduped path so it collapses with the client-driven reconnect toast
      // into a single notification.
      if (key === 'reconnected') {
        get().pushReconnectedToast();
        return;
      }
      get().pushToast({
        key,
        toastType: toastType ?? 'info',
        autoClose: typeof autoClose === 'number' ? autoClose : undefined,
        vars: Object.keys(vars).length > 0 ? vars : undefined,
      });
      return;
    }

    // ── invite (home.js:1844-1867) ────────────────────────
    if (data.type === 'invite') {
      set({
        gameInvites: [
          ...state.gameInvites,
          {
            code: data.code,
            invitedByName: data.invitedByName,
            invitedById: data.invitedById,
            timestamp: Date.now(),
          },
        ],
      });
      return;
    }

    // ── emote — in-game reaction broadcast (ws.js:770; replaces chat) ──
    if (data.type === 'emote') {
      if (!Number.isInteger(data.emote) || data.emote < 0 || data.emote >= EMOTES.length) return;
      const id = nextEmoteId++;
      set((s) => ({
        emotes: [
          ...s.emotes,
          {
            id,
            emote: EMOTES[data.emote],
            name: data.name || '',
            countryCode: data.countryCode || null,
            // queueMyId fallback: during the 2v2 stage-2 window gameData is
            // null but the duo's staging-lobby emotes keep flowing — without
            // it self-coloring breaks on the queue screen.
            isSelf: data.id === (state.gameData?.myId ?? state.queueMyId),
            team: data.team === 'a' || data.team === 'b' ? data.team : null,
          },
        ],
      }));
      // Auto-expire so the component stays a pure renderer (no per-item timers).
      setTimeout(() => {
        set((s) => ({ emotes: s.emotes.filter((e) => e.id !== id) }));
      }, EMOTE_TTL_MS);
      return;
    }

    // ── streak (home.js streak handler — web parity) ────────────────────────
    if (data.type === 'streak') {
      // Only streak CONTINUATIONS (2+) toast. Resets are silent by ruling,
      // and the "streak started" toast was removed (server no longer sends
      // streak:1; the guard also keeps a stale server from rendering a
      // bogus started/0-day toast).
      if (!data.streak || data.streak < 2) return;
      get().pushToast({
        key: 'streakGained',
        toastType: 'info',
        // `streakGained` contains a `{{streak}}` placeholder — pass the value
        // via `vars` so `t()` interpolates it.
        vars: { streak: data.streak },
      });
      return;
    }

    // ── friends — full sync (ws/classes/Player.js:414-440 sendFriendData) ──
    // Server pushes whenever the friend list changes (accept/decline/cancel/remove,
    // setAllowFriendReq toggle) and in response to client's `getFriends` polls.
    if (data.type === 'friends') {
      // Authoritative sync for both settings toggles — cancel any pending
      // optimistic-flip undos before applying the server's truth.
      clearSettingsAckWatchdogs();
      set({
        friends: Array.isArray(data.friends) ? data.friends : [],
        sentRequests: Array.isArray(data.sentRequests) ? data.sentRequests : [],
        receivedRequests: Array.isArray(data.receivedRequests) ? data.receivedRequests : [],
        // Authoritative echo for the account-settings toggles: the server
        // pushes this after every set* attempt (accepted OR rejected), so an
        // optimistic flip that the server refused gets snapped back here.
        allowFriendReq: !!data.allowFriendReq,
        hideLastSeen: !!data.hideLastSeen,
      });
      return;
    }

    // ── friendReqState — sendFriendRequest validation result (codes 0-7) ──
    if (data.type === 'friendReqState') {
      set({
        friendReqState: data.state as FriendReqState,
        friendReqStateAt: Date.now(),
      });
      return;
    }
  },
}));
