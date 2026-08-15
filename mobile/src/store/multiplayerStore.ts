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
import { EMOTE_TTL_MS, EMOTE_COOLDOWN_MS, getEmote, byLegacyIndex } from '../shared/emotes';
import { t } from '../shared/locale';
import { WS_QUEUE_CONFIRM_TIMEOUT_MS } from '../services/websocketConfig';

// Module-level emote send throttle + id counter (mirrors web emoteReactions.js).
let lastEmoteSend = 0;
let nextEmoteId = 1;

// Chat throttles + id counter (mirror web gameChat.js; server re-enforces both).
// 1100, not 1000: margin over the server's own 1000ms window — jitter could
// otherwise compress inter-arrival and silently drop an optimistic send.
const CHAT_COOLDOWN_MS = 1100;
const TYPING_PING_MS = 1500;
const TYPING_TTL_MS = 3000;
export const CHAT_MAX_LEN = 200;
const CHAT_LOG_CAP = 100;
let lastChatSend = 0;
let lastTypingPing = 0;
let nextChatMsgId = 1;

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
  /** Server-computed league NAME for `elo`. Prefer it over the local table. */
  league?: string | null;
  // ── Cosmetics (ws Player.js getSendableState; patched by `player`/`update`) ──
  /** Equipped name-glow sku, or null. Resolved to a colour at the render site. */
  nameGlow?: string | null;
  /** Equipped map-marker sku, or null. */
  markerSkin?: string | null;
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

/** Frozen roster entry in a `duelEnd` (teamGame players also carry score). */
export interface DuelEndPlayer {
  id: string;
  username: string;
  countryCode?: string;
  team?: 'a' | 'b';
  /** null for guests and bots — gates profile links / report eligibility. */
  accountId?: string | null;
  /** Cosmetics frozen with the end roster so result pins cannot lose identity. */
  nameGlow?: string | null;
  markerSkin?: string | null;
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
  /**
   * Rating v2 placement: this game SEEDED the rating (from ENTRY_RATING to the
   * single-player-derived seed) rather than transferring it. The results screen
   * labels it and suppresses the "+N" delta, which would otherwise read as a
   * ~300-point win bonus. Absent on servers predating v2 placements.
   */
  placement?: boolean;
  timeElapsed: number;
  /** Saved history doc id ('duel_<id>') — names the doc for the history view. */
  historyGameId?: string;
  /** Present on current servers; absent on legacy 1v1 end payloads. */
  players?: DuelEndPlayer[];
  opponent?: { accountId: string | null; username: string };
  /**
   * A stamps receipt is COMING for this game (see StampsEarned). An expectation,
   * not a promise: absent when the economy is off, the opponent was a bot, or
   * the game does not pay. The results screen reserves the receipt row's height
   * on this alone, so a late arrival cannot shove the buttons.
   */
  stampsPending?: boolean;
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
  /** See DuelEnd1v1.stampsPending — matchmade 2v2 pays too. */
  stampsPending?: boolean;
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

/**
 * The stamps receipt for the game that just ended — what the ledger ACTUALLY
 * applied, never the payout table's intent, so a replayed save reports nothing
 * rather than paying the player twice on screen.
 *
 * It rides its own `type:'stampsEarned'` message and lands a beat AFTER duelEnd
 * because the grants sit behind the game save (ws Game.js sendStampEarnings);
 * duelEnd carries `stampsPending` so the results screen can reserve the row's
 * height in the meantime instead of having it appear under the player's thumb.
 */
export interface StampsEarned {
  /** The saved doc id the receipt belongs to — lets a stale one be dropped. */
  gameId?: string;
  total: number;
  lines: { reason: string; amount: number }[];
  /** Authoritative post-grant wallet balance. Absent if the re-read failed. */
  balance?: number;
}

export interface GameData {
  state: 'waiting' | 'getready' | 'guess' | 'end';
  myId: string;
  host: boolean;
  code: string | null;
  /** Server-side room identity (ws Game.js `this.id`, on every `game`
   *  payload). Stable for a room's whole life — including a party's
   *  resetGame replays — and fresh per matchmade match. Backs per-room
   *  chat clearing; do NOT use `code`/`startTime` for that (neither is on
   *  the between-rounds broadcast). Optional: pre-fix servers omit it.
   *  NOT the same id as StampsEarned.gameId, which is the SAVED GAME doc
   *  id — this is the live in-memory room. Same name, different spaces. */
  gameId?: string;
  public: boolean;
  duel: boolean;
  /** Placement seeding match (wire: ws Game.js state payloads). Labels the
   *  GetReadyOverlay matchup and the duel timer. */
  isPlacement?: boolean;
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
  // Party security (host-set): locked = no new joins; allowGuests=false =
  // signed-in accounts only. Wire: ws Game.js getSendableState.
  locked?: boolean;
  allowGuests?: boolean;
  /** Guest-hosted party — emotes-only, chat surface hidden everywhere. */
  hostGuest?: boolean;
  duelEnd?: DuelEndData;
  /** Stamps paid by this game. Arrives after duelEnd; see StampsEarned. */
  stampsEarned?: StampsEarned;
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
  /** Host setting: text chat disabled for this game (server-enforced too). */
  disableChat?: boolean;
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
  emote: string; // the resolved glyph (EMOTE_CATALOG entry, by id or legacy index)
  /**
   * The catalogue's effect id — 'ember' on the skull, null on everything else.
   * Stamped here at receipt rather than looked up at render, like every other
   * bit of a bubble's presentation: `def` is already resolved on this line, and
   * a reaction outlives nothing it would need a second lookup for.
   */
  fx: string | null;
  name: string;
  countryCode: string | null;
  isSelf: boolean;
  /** Sender's team in team modes — drives mine/opponent allegiance coloring. */
  team: 'a' | 'b' | null;
  /**
   * Sender's equipped name-glow sku, stamped by the server onto the emote
   * message itself (ws/ws.js). It rides the message rather than being looked up
   * off the roster because every other bit of a bubble's presentation is
   * latched here at receipt too — and a bubble outlives the roster entry when
   * its sender leaves.
   */
  nameGlow: string | null;
}

/** A text chat message (parties + 2v2; the server scopes the audience). */
export interface ChatMessage {
  id: number;
  senderId: string;
  name: string;
  countryCode: string | null;
  team: 'a' | 'b' | null;
  /**
   * Sender's equipped name-glow sku, server-stamped onto the message. Latched
   * for life exactly like `tint` below: a message keeps the presentation it
   * arrived with, an equip made mid-game shows on the sender's NEXT message,
   * and a hundred-row log never re-renders because somebody visited the shop.
   */
  nameGlow: string | null;
  /** True = sent on the team channel (badge it) — server-stamped. */
  teamChat: boolean;
  text: string;
  isSelf: boolean;
  /**
   * Allegiance tint, stamped ONCE at receive time against the latched team:
   * 'mine' = blue (me / team channel / my team / 2v2 staging duo),
   * 'opp' = green (confirmed opposing team), '' = neutral. Never recomputed —
   * render-time derivation let 2v2 state wipes repaint the whole log.
   */
  tint: '' | 'mine' | 'opp';
}

/** A transient "X is typing" entry, TTL-pruned by the store. */
export interface ChatTypingEntry {
  id: string;
  name: string;
  until: number;
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
  /**
   * Epoch ms of the friend's last disconnect; null while online, when the
   * friend opted out (hideLastSeen), or on servers predating the field.
   */
  lastSeen?: number | null;
  /**
   * Equipped name-glow sku, refreshed on EVERY friends push by
   * ws/classes/Player.js sendFriendsData — from the live Player for anyone
   * online, from the lastSeen lookup that block already runs for anyone
   * offline. Undefined on servers predating the field.
   *
   * Deliberately NOT gated by the friend's hideLastSeen setting: that hides
   * PRESENCE, and a cosmetic is public on every board and profile in the app.
   */
  nameGlow?: string | null;
}

/** Outgoing or incoming friend request entry in the friends modal. */
export interface FriendRequestEntry {
  id: string;
  name: string;
  /** Latched at the sender's verify — these lists change only on send/answer. */
  nameGlow?: string | null;
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
  /**
   * The queue-join instant (absolute ms). The SERVER's, off the `queueJoined`
   * ack, for 1v1; stamped LOCALLY for 2v2, which gets `enter2v2Queue` instead
   * and no server instant with it.
   *
   * That mix is safe because nothing reads the value as a clock. The queue
   * screen uses it only as the IDENTITY of the current search, and anchors its
   * elapsed timer on a local performance.now() taken at first sight of that
   * identity — see the anchor comment in app/queue.tsx. Reading it as server
   * time would be wrong for 2v2, so do not.
   */
  queuedAt: number | null;
  /**
   * How long this rating band's queue USUALLY takes IN TOTAL, from the moment
   * you joined — not a remaining time and not a countdown. The server latches
   * it for the session. Ranked 1v1 only.
   *
   * `rough` means the number came from a MODELLED prior rather than observed
   * waits, and it carries a coarse `tier` instead of a figure. It must be
   * rendered in vague wording and neutral styling — a guess may never wear the
   * confidence of a measurement.
   */
  queueEta: {
    state: 'ok' | 'long' | 'rough' | 'unknown';
    value: number | null;
    unit: 'sec' | 'min' | null;
    tier: 'short' | 'mid' | 'long' | null;
    seconds: number | null;
    longAfterSeconds: number | null;
  } | null;
  /**
   * This ranked queue resolves into the placement seeding match. Server
   * follow-up `queuePlacement` (its eligibility read lands AFTER the
   * queueJoined ack, so it can never ride the ack itself). Drives the
   * "Placement match" labelling on the queue screen; the in-game labelling
   * runs off gameData.isPlacement instead.
   */
  placementPending: boolean;
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

  // Text chat (parties + 2v2 teammate chat) — log/typing/unread are
  // game-scoped; the mute set is session-scoped (store root, never reset).
  chatMessages: ChatMessage[];
  chatTyping: ChatTypingEntry[];
  chatUnread: number;
  /** Last known own team, latched for chat tint stamping — survives the 2v2
   *  stage-2 queue's gameData wipe; resets per room / with the game. */
  chatTeamLatch: 'a' | 'b' | null;
  /** Last chat room key — persistent (NOT derived from prevGameData: the
   *  Play Again regroup path nulls gameData between matches, which would
   *  blind a prev-vs-next comparison and leak the old match's log). */
  chatLastRoomKey: string | null;
  mutedChatIds: Record<string, true>;

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
  /** Voyager+ "only match Voyagers and Nomads" preference; null until echoed. */
  strictMatchmaking: boolean | null;
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
  /** Host: hand the crown to another lobby member (host-leave disband follows the new host). */
  transferHost: (playerId: string) => void;
  /** Host: lock the party / toggle guest joining. Partial: send only the field being changed (lobby lock button vs modal guest switch must never stomp each other). Own wire message — never rides setPrivateGameOptions (that path regenerates locations). */
  setPartySecurity: (opts: { locked?: boolean; allowGuests?: boolean }) => void;
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
  /** Send an emote by its catalogue id (see shared/emotes.ts). */
  sendEmote: (emoteId: string) => void;
  clearEmote: (id: number) => void;
  /** teamOnly: team-channel send (team contexts only; server falls back to the game type's legacy audience when absent). */
  sendChat: (text: string, teamOnly?: boolean) => void;
  sendChatTyping: (teamOnly?: boolean) => void;
  muteChatSender: (id: string) => void;
  unmuteAllChat: () => void;
  markChatRead: () => void;
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
  setStrictMatchmakingOnServer: (strict: boolean) => void;
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
  queuedAt: null as number | null,
  queueEta: null as {
    state: 'ok' | 'long' | 'rough' | 'unknown';
    value: number | null;
    unit: 'sec' | 'min' | null;
    tier: 'short' | 'mid' | 'long' | null;
    seconds: number | null;
    longAfterSeconds: number | null;
  } | null,
  placementPending: false as boolean,
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
  // Chat log/typing/unread are game-scoped and reset with the game. The mute
  // set deliberately lives OUTSIDE this object (store root) so it survives.
  chatMessages: [] as ChatMessage[],
  chatTyping: [] as ChatTypingEntry[],
  chatUnread: 0,
  chatTeamLatch: null as 'a' | 'b' | null,
  chatLastRoomKey: null as string | null,
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
  // queuedAt in particular MUST be here: it is an absolute timestamp, so a
  // stranded one doesn't read as stale, it reads as a queue that started
  // minutes ago — the next queue screen would open at "4:12".
  queuedAt: gameInitialState.queuedAt,
  queueEta: gameInitialState.queueEta,
  placementPending: gameInitialState.placementPending,
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
  strictMatchmaking: null as boolean | null,
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
  Record<'allowFriendReq' | 'hideLastSeen' | 'strictMatchmaking', ReturnType<typeof setTimeout>>
> = {};

function armSettingsAckWatchdog(
  field: 'allowFriendReq' | 'hideLastSeen' | 'strictMatchmaking',
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
  // Session-scoped chat mutes: survive every game/account lifecycle reset
  // (a muted loudmouth stays muted for the whole app session).
  mutedChatIds: {} as Record<string, true>,
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
    // queuedAt stays null until the server's ack lands — the timer must run on
    // the server's join instant, not on when we happened to tap the button.
    // placementPending likewise: the server re-announces per queue if it
    // applies, so a stale flag from a previous queue must not leak in.
    // publicDuelRange stays null too — NO optimistic guess (user ruling
    // Aug 13: a range computed from cached elo visibly self-corrected when the
    // authoritative one landed). The queue screen reserves the ELO cell's
    // LAYOUT itself and fades the server's range in.
    set({ gameQueued: type, publicDuelRange: null, queuedAt: null, queueEta: null, placementPending: false });
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

  transferHost: (playerId) => {
    if (!get().gameData?.host) return;
    wsService.send({ type: 'transferHost', playerId });
  },

  setPartySecurity: (opts) => {
    const gd = get().gameData;
    if (!gd?.host) return;
    const msg: { type: string; locked?: boolean; allowGuests?: boolean } = { type: 'setPartySecurity' };
    const merge: Partial<GameData> = {};
    if (typeof opts.locked === 'boolean') { msg.locked = opts.locked; merge.locked = opts.locked; }
    if (typeof opts.allowGuests === 'boolean') { msg.allowGuests = opts.allowGuests; merge.allowGuests = opts.allowGuests; }
    if (msg.locked === undefined && msg.allowGuests === undefined) return;
    wsService.send(msg);
    // Optimistic, like setTeamConfig: the controls read gameData, and a
    // round-trip lag reads as a broken toggle. The next broadcast reconciles.
    set({ gameData: { ...gd, ...merge } });
  },

  sendPlayAgain2v2: () => {
    wsService.send({ type: 'playAgain2v2' });
  },

  sendTeamDuelBack: () => {
    wsService.send({ type: 'teamDuelBack' });
  },

  setEnteringGameCode: (value) => set({ enteringGameCode: value }),

  // Send an emote reaction (client-side throttle; server also enforces 1.5s).
  //
  // DUAL WIRE FORMAT: `emoteId` is the id-addressed value the server prefers and
  // validates (catalogue membership + ownership); `emote` is the frozen legacy
  // integer index, sent alongside so an older server that only understands
  // indices still shows the free eight. A PAID emote has no legacy index and
  // sends `emote: null` — such a server drops it, which is the correct
  // degradation (nothing beats the wrong glyph).
  sendEmote: (emoteId) => {
    const def = getEmote(emoteId);
    if (!def) return;
    const now = Date.now();
    if (now - lastEmoteSend < EMOTE_COOLDOWN_MS) return;
    lastEmoteSend = now;
    wsService.send({ type: 'emote', emote: def.legacyIndex ?? null, emoteId: def.id });
  },

  clearEmote: (id) => set((s) => ({ emotes: s.emotes.filter((e) => e.id !== id) })),

  // Send a chat message (client-side throttle; server also enforces 1s +
  // audience + guest gates — this never decides who receives it).
  sendChat: (text, teamOnly = false) => {
    const message = text.trim();
    if (message.length < 1 || message.length > CHAT_MAX_LEN) return;
    const now = Date.now();
    if (now - lastChatSend < CHAT_COOLDOWN_MS) return;
    lastChatSend = now;
    wsService.send({ type: 'chat', message, teamOnly: !!teamOnly });
  },

  // Typing ping, throttled hard; receivers TTL-prune, no stop message exists.
  sendChatTyping: (teamOnly = false) => {
    const now = Date.now();
    if (now - lastTypingPing < TYPING_PING_MS) return;
    lastTypingPing = now;
    wsService.send({ type: 'chatTyping', teamOnly: !!teamOnly });
  },

  muteChatSender: (id) =>
    set((s) => ({
      mutedChatIds: { ...s.mutedChatIds, [id]: true as const },
      // Hide their history too, and any live typing entry.
      chatMessages: s.chatMessages.filter((m) => m.senderId !== id),
      chatTyping: s.chatTyping.filter((e) => e.id !== id),
    })),

  unmuteAllChat: () => set({ mutedChatIds: {} }),

  markChatRead: () => set({ chatUnread: 0 }),

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
  setStrictMatchmakingOnServer: (strict) => {
    if (!wsService.send({ type: 'setStrictMatchmaking', strict })) return;
    const prev = get().strictMatchmaking;
    set({ strictMatchmaking: strict });
    armSettingsAckWatchdog('strictMatchmaking', () => set({ strictMatchmaking: prev }));
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
      // Update authStore ELO (replaces web's setSession/setEloData).
      // `league` rides this message as the WHOLE league object (ws sends
      // getLeague(rating)); keep it so every tier render can prefer the
      // server's answer over the local cutoff table — a seasonal re-anchor then
      // needs no store release. Absent on older servers, hence the ?? null.
      useAuthStore.getState().updateUser({
        elo: data.elo,
        league: data.league ?? null,
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

      // Per-ROOM chat clearing (July 30 ruling, mirrors web gameChat.js):
      // a fresh room means a fresh log, so last match's messages never haunt
      // the next one. Compared against the PERSISTENT chatLastRoomKey, not
      // prevGameData — the Play Again regroup nulls gameData between matches.
      // A null key (the stage-2 queue window, where gameData is wiped) is
      // ignored rather than treated as a change, so it can't false-clear. The
      // tint latch resets with the room: new room, new teams.
      //
      // The key is the server's gameId (ws Game.js, on BOTH `game` payloads).
      // The old `code || 2v2m:${startTime}` construction could not work: this
      // broadcast carries neither field, and startTime is stamped in start()
      // which runs after addPlayer, so it arrives null and is never corrected
      // — every matchmade match keyed to the same constant string, so the log
      // was never cleared between them, and the payloads that DID carry a code
      // made the key appear/vanish and cleared mid-match on the alternation.
      // Fall back to the merged value: absent means "this payload didn't carry
      // it", not "the room changed".
      const nextRoomKey = data.gameId ?? prevGameData?.gameId ?? null;
      const chatRoomChanged = !!(state.chatLastRoomKey && nextRoomKey
        && state.chatLastRoomKey !== nextRoomKey);

      // Team switch (self-picked OR host-moved — both arrive as a roster
      // update): July 30 ruling — the old team's channel is not mine anymore,
      // DROP its messages and repaint the remaining log to the new allegiance
      // (live truth). Only a definite→different-definite latch transition
      // counts; wipes to null are state flickers. Moot when the room changed
      // (the whole log clears anyway).
      const chatMyId = data.myId ?? prevGameData?.myId ?? state.queueMyId;
      const chatRoster: Array<{ id: string; team?: 'a' | 'b' | null }> =
        data.players ?? prevGameData?.players ?? [];
      const chatLiveTeam = chatRoster.find((p) => p.id === chatMyId)?.team;
      const chatDefTeam = chatLiveTeam === 'a' || chatLiveTeam === 'b' ? chatLiveTeam : null;
      const chatTeamSwitched = !!(chatDefTeam && state.chatTeamLatch
        && chatDefTeam !== state.chatTeamLatch && !chatRoomChanged);

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
        ...(chatRoomChanged
          ? { chatMessages: [], chatTyping: [], chatUnread: 0, chatTeamLatch: null }
          : null),
        ...(chatTeamSwitched
          ? {
            chatMessages: state.chatMessages
              .filter((m) => !m.teamChat)
              .map((m) => {
                const ally = m.isSelf || !!(m.team && m.team === chatDefTeam);
                const opp = !ally && !!m.team;
                return { ...m, tint: (ally ? 'mine' : opp ? 'opp' : '') as ChatMessage['tint'] };
              }),
          }
          : null),
        // Unconditional when definite (spread order: overrides the room-clear
        // null above) — on match entry the room change and the new room's
        // team assignment ride the SAME payload; leaving the latch null would
        // strand tint stamping for the whole match.
        ...(chatDefTeam ? { chatTeamLatch: chatDefTeam } : null),
        ...(nextRoomKey ? { chatLastRoomKey: nextRoomKey } : null),
        gameQueued: false,
        queueStage: null,
        // The search is over, so its stamp ends with it — web's game handler
        // has always cleared this and mobile never did. It mattered once 2v2
        // started stamping its own: nothing else nulls it on that path (2v2 is
        // server-driven and never calls joinQueue), so a survivor rode into the
        // next Play Again regroup and the queue clock opened at the PREVIOUS
        // search's elapsed time instead of 0:00.
        queuedAt: null,
        // Queue-scoped flag ends here; gameData.isPlacement (riding the
        // payload spread below) carries the in-game labelling from now on.
        placementPending: false,
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
            ? {
              locations: [],
              roundHistory: [],
              duelEnd: undefined,
              playAgain2v2: null,
              // Travels with duelEnd: a receipt outliving its game would show
              // last match's payout on the next one's results screen.
              stampsEarned: undefined,
            }
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
          // Same rule, same reason: the previous match's receipt must never be
          // on screen when this one's verdict is. The new one arrives moments
          // later on its own message.
          stampsEarned: undefined,
        },
      });
      return;
    }

    // ── stampsEarned — the currency receipt for the game that just ended ───
    // Deliberately its own message: the grants sit behind the game save, and
    // duelEnd must never wait on a DB write to paint the results screen.
    if (data.type === 'stampsEarned') {
      if (!state.gameData) return;
      set({
        gameData: {
          ...state.gameData,
          stampsEarned: {
            gameId: data.gameId,
            total: data.total,
            lines: Array.isArray(data.lines) ? data.lines : [],
            ...(typeof data.balance === 'number' ? { balance: data.balance } : {}),
          },
        },
      });
      // The wallet total, from the server's post-grant read. Without this the
      // shop balance stays at its pre-game value until the next auth refresh.
      if (typeof data.balance === 'number') {
        useAuthStore.getState().applyCosmetics({ stamps: data.balance });
      }
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
        // 2v2 never receives a `queueJoined` ack, so the clock had no start
        // instant and sat frozen at "0:00" for the entire search. Stamp one.
        // ONCE PER SEARCH — `?? Date.now()` keeps any existing value, because
        // stage 2 arrives as a SECOND enter2v2Queue partway through the same
        // search and re-stamping would restart the clock at 0:00 the moment a
        // teammate was found. Teardown nulls it between searches, so a null
        // here always means this is a new one.
        queuedAt: state.queuedAt ?? Date.now(),
      });
      return;
    }

    // ── queueJoined — server confirms we're actually in the duel queue ─────
    // Sent for BOTH ranked and unranked right after we're added server-side. This
    // is the ack the join watchdog (joinQueue) waits on; without it there's no way
    // to tell "queued, waiting for a match" apart from "server never queued me".
    if (data.type === 'queueJoined') {
      clearQueueConfirmTimer();
      // The server's join instant drives the elapsed timer. Fall back to our
      // own clock only for a server predating this field.
      set({
        queuedAt: typeof data.queuedAt === 'number'
          ? data.queuedAt
          : Date.now() + wsService.timeOffset,
      });
      return;
    }

    // ── queuePlacement — this ranked queue resolves into the placement ─────
    // seeding match. Follow-up to queueJoined (the server's eligibility read
    // lands after the ack). Only ever sent as true.
    if (data.type === 'queuePlacement') {
      set({ placementPending: !!data.placement });
      return;
    }

    // ── queueEta — how long this band's queue USUALLY takes, in total ──────
    // Not a countdown and not "time remaining": see the field's doc comment.
    // Server-latched, so this normally fires once per queue session and then
    // only again if the state flips.
    if (data.type === 'queueEta') {
      set({
        queueEta: {
          state: data.state,
          value: data.value ?? null,
          unit: data.unit ?? null,
          tier: data.tier ?? null,
          seconds: typeof data.seconds === 'number' ? data.seconds : null,
          longAfterSeconds: typeof data.longAfterSeconds === 'number'
            ? data.longAfterSeconds
            : null,
        },
      });
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
      } else if (data.action === 'update') {
        // PARTIAL PATCH, MERGED BY ID — never a whole-player replace. The
        // server sends this from /cosmetics-updated mid-round with only
        // {nameGlow, markerSkin} in `patch`; assigning `data.player` (or
        // spreading the message itself) would stomp the live roster fields
        // this message knows nothing about — score, latLong, final,
        // disconnected — and visibly rewind the scoreboard. Same merge shape
        // as `type:'place'` below; keep them identical.
        if (!data.patch || typeof data.patch !== 'object') return;
        set({
          gameData: {
            ...state.gameData,
            players: state.gameData.players.map((p) =>
              p.id === data.id ? { ...p, ...data.patch } : p,
            ),
          },
        });
      }
      return;
    }

    // ── cosmetics — the BUYER's own push (ws.js /cosmetics-updated) ──────────
    // Sent to the purchaser whether or not they are in a game, so it patches
    // authStore rather than the roster. Two shapes are accepted on purpose: the
    // ws endpoint currently sends the equipped slots FLAT ({nameGlow, markerSkin,
    // owned}), while the shop/API path sends them nested under `equipped`.
    // Reading both means neither side can silently no-op the other.
    if (data.type === 'cosmetics') {
      const equipped =
        data.equipped && typeof data.equipped === 'object'
          ? data.equipped
          : {
              ...(data.nameGlow !== undefined ? { nameGlow: data.nameGlow ?? null } : {}),
              ...(data.markerSkin !== undefined ? { markerSkin: data.markerSkin ?? null } : {}),
            };
      useAuthStore.getState().applyCosmetics({
        ...(Object.keys(equipped).length > 0 ? { equipped } : {}),
        ...(Array.isArray(data.owned) ? { owned: data.owned } : {}),
        ...(typeof data.stamps === 'number' ? { stamps: data.stamps } : {}),
        // `adFreeUntil` rides this push so a pass bought on ANOTHER device
        // suppresses interstitials here without waiting for a relaunch.
        ...(data.adFreeUntil !== undefined ? { adFreeUntil: data.adFreeUntil ?? null } : {}),
      });
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
      // inline, so just hand it the message. Guest 2v2 gate with an inviter
      // name gets the personalized line here too — the typed code came from
      // that friend, greet them by name (set-time translation is fine:
      // joinError is transient display text, cleared on the next keystroke).
      if (state.enteringGameCode) {
        set({
          joinError:
            data.error === 'Link your Google account to play 2v2' && data.hostName
              ? t('linkGoogle2v2InvitedDesc', { name: data.hostName })
              : data.error,
        });
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
      //
      // Guest 2v2 gate with an inviter name (hostName is additive on the
      // server payload — absent on old ws builds, which keeps this branch
      // dormant there): personalize the conversion toast, a friend's name
      // converts better than the generic upgrade line.
      if (data.error === 'Link your Google account to play 2v2' && data.hostName) {
        get().pushToast({
          key: 'linkGoogle2v2InvitedDesc',
          vars: { name: data.hostName },
          toastType: 'error',
          message: data.error,
        });
      } else {
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
      }
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
      // Round-pressure nudges (opponent guessed / other team locked in, you're the
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
      // emoteId WINS when present — it is the id-addressed value and the only
      // one a paid emote has. The integer is the legacy fallback for servers /
      // clients predating the catalogue. A paid emote broadcasts `emote: -1`
      // precisely so an index-only receiver resolves nothing and renders
      // nothing, so an unresolvable message is DROPPED, never guessed at.
      const def = getEmote(data.emoteId) ?? byLegacyIndex(data.emote);
      if (!def) return;
      const id = nextEmoteId++;
      set((s) => ({
        emotes: [
          ...s.emotes,
          {
            id,
            emote: def.glyph,
            fx: def.fx ?? null,
            name: data.name || '',
            countryCode: data.countryCode || null,
            nameGlow: data.nameGlow || null,
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

    // ── chat — party/2v2 text chat broadcast (server scopes the audience) ──
    if (data.type === 'chat') {
      if (typeof data.message !== 'string' || !data.id) return;
      if (state.mutedChatIds[data.id]) return;
      const isSelf = data.id === (state.gameData?.myId ?? state.queueMyId);
      // Refresh the team latch from live data when available; the latch (not
      // the live value) backs tint stamping so the stage-2 queue's gameData
      // wipe can't misclassify messages that arrive mid-flicker.
      const chatMyId = state.gameData?.myId ?? state.queueMyId;
      const liveTeam = state.gameData?.players?.find((p) => p.id === chatMyId)?.team;
      const latch = liveTeam === 'a' || liveTeam === 'b' ? liveTeam : state.chatTeamLatch;
      // 2v2 staging/queue rooms hold only your duo — every message is an ally's.
      const allAllies = !!((state.gameData?.is2v2Lobby || state.gameQueued === '2v2')
        && !state.gameData?.team2v2);
      const team = data.team === 'a' || data.team === 'b' ? data.team : null;
      // Allegiance decided ONCE, here. Blue = me / team channel (never crosses
      // teams by construction) / staging duo / latched-team match. Green =
      // strictly the confirmed-opposing remainder. Stamped for life.
      const ally = isSelf || !!data.teamChat || allAllies || !!(team && latch && team === latch);
      const opp = !ally && !!(team && latch && team !== latch);
      const msg: ChatMessage = {
        id: nextChatMsgId++,
        senderId: data.id,
        name: data.name || '',
        countryCode: data.countryCode || null,
        nameGlow: data.nameGlow || null,
        team,
        teamChat: !!data.teamChat,
        text: data.message,
        isSelf,
        tint: ally ? 'mine' : opp ? 'opp' : '',
      };
      set((s) => ({
        chatMessages: [...s.chatMessages.slice(-(CHAT_LOG_CAP - 1)), msg],
        // A message from X supersedes X's typing entry immediately.
        chatTyping: s.chatTyping.filter((e) => e.id !== data.id),
        chatUnread: s.chatUnread + (isSelf ? 0 : 1),
        chatTeamLatch: latch ?? s.chatTeamLatch,
      }));
      return;
    }

    // ── chatTyping — transient indicator, TTL-pruned here so the component
    // stays a pure renderer (same pattern as emote auto-expire) ──
    if (data.type === 'chatTyping') {
      if (!data.id || data.id === (state.gameData?.myId ?? state.queueMyId)) return;
      if (state.mutedChatIds[data.id]) return;
      const until = Date.now() + TYPING_TTL_MS;
      set((s) => ({
        chatTyping: [
          ...s.chatTyping.filter((e) => e.id !== data.id),
          { id: data.id, name: data.name || '', until },
        ],
      }));
      setTimeout(() => {
        const now = Date.now();
        set((s) => {
          const alive = s.chatTyping.filter((e) => e.until > now);
          return alive.length === s.chatTyping.length ? s : { chatTyping: alive };
        });
      }, TYPING_TTL_MS + 50);
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
        strictMatchmaking: !!data.strictMatchmaking,
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
