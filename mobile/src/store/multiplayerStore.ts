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

// Module-level emote send throttle + id counter (mirrors web emoteReactions.js).
let lastEmoteSend = 0;
let nextEmoteId = 1;

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

export interface DuelEndData {
  winner: boolean;
  draw: boolean;
  newElo: number;
  oldElo: number;
  timeElapsed: number;
}

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
}

/** A floating in-game emote reaction (replaces chat). */
export interface EmoteReaction {
  id: number;
  emote: string; // the glyph (from EMOTES)
  name: string;
  countryCode: string | null;
  isSelf: boolean;
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
  socketId?: string;
  supporter?: boolean;
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

interface MultiplayerState {
  // Connection (from home.js:59-83)
  connected: boolean;
  connecting: boolean;
  verified: boolean;
  playerCount: number;
  guestName: string | null;
  error: string | null;

  // Queue
  gameQueued: false | 'publicDuel' | 'unrankedDuel';
  publicDuelRange: [number, number] | null;
  nextGameQueued: boolean;
  nextGameType: 'ranked' | 'unranked' | null;

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
  /** Last `friendReqState` code we received (and the moment we received it, for auto-clear). */
  friendReqState: FriendReqState | null;
  friendReqStateAt: number;

  // Toasts (queue — newest appended; rendered stacked)
  toasts: ToastData[];

  // Maintenance
  maintenance: boolean;

  // Actions
  handleMessage: (data: any) => void;
  setGameQueued: (type: false | 'publicDuel' | 'unrankedDuel') => void;
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
  inviteFriendToGame: (friendSocketId: string, friendId?: string) => void;
  acceptGameInvite: (code: string, invitedById: string) => void;
  joinPrivateGame: (code: string) => void;
  leaveGame: () => void;
  reset: () => void;
}

// ── Initial state (ported from home.js:59-83) ───────────────

const initialState = {
  connected: false,
  connecting: false,
  verified: false,
  playerCount: 0,
  guestName: null as string | null,
  error: null as string | null,
  gameQueued: false as false | 'publicDuel' | 'unrankedDuel',
  publicDuelRange: null as [number, number] | null,
  nextGameQueued: false,
  nextGameType: null as 'ranked' | 'unranked' | null,
  enteringGameCode: false,
  joinError: null as string | null,
  inGame: false,
  gameData: null as GameData | null,
  emotes: [] as EmoteReaction[],
  friendRequests: [] as FriendRequest[],
  gameInvites: [] as GameInvite[],
  invitedFriends: {} as Record<string, number>,
  friends: [] as Friend[],
  sentRequests: [] as FriendRequestEntry[],
  receivedRequests: [] as FriendRequestEntry[],
  allowFriendReq: true,
  friendReqState: null as FriendReqState | null,
  friendReqStateAt: 0,
  toasts: [] as ToastData[],
  maintenance: false,
};

// ── Store ───────────────────────────────────────────────────

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  ...initialState,

  setGameQueued: (type) => set({ gameQueued: type }),

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
  setAllowFriendReqOnServer: (allow) =>
    wsService.send({ type: 'setAllowFriendReq', allow }),
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
    // Drop the invite from the queue locally — server will deliver gameJoin events.
    set((s) => ({
      gameInvites: s.gameInvites.filter((inv) => inv.code !== code),
    }));
  },
  // Join a private game by 6-digit code. Shared by the join-code form and the
  // deep-link handler so there's one path (matches join.tsx handleJoin).
  joinPrivateGame: (code) => {
    set({ joinError: null, enteringGameCode: true });
    wsService.send({ type: 'joinPrivateGame', gameCode: code });
  },

  // Leave the current game: tell the server (so it clears player.gameId, freeing
  // the player to re-queue) then drop all game-scoped state. Used by the in-game
  // back button and the results-screen Play Again / Home actions.
  leaveGame: () => {
    wsService.send({ type: 'leaveGame' });
    get().reset();
  },

  reset: () =>
    set((s) => ({
      ...initialState,
      connected: s.connected,
      verified: s.verified,
      playerCount: s.playerCount,
      guestName: s.guestName,
    })),

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
        ...(terminal && wasInMultiplayer
          ? { inGame: false, gameData: null, gameQueued: false, emotes: [] }
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
      set({
        gameQueued: false,
        inGame: true,
        enteringGameCode: false,
        joinError: null,
        gameData: {
          ...(prevGameData ?? {}),
          ...data,
          type: undefined, // Remove the message type field
          ...(enteringWaiting ? { locations: [], roundHistory: [], duelEnd: undefined } : {}),
          players: mergedPlayers,
        } as GameData,
      });
      return;
    }

    // ── duelEnd (home.js:1691-1701) ───────────────────────
    if (data.type === 'duelEnd') {
      if (!state.gameData) return;
      set({
        gameData: {
          ...state.gameData,
          duelEnd: data,
        },
      });
      return;
    }

    // ── publicDuelRange (home.js:1702-1706) ───────────────
    if (data.type === 'publicDuelRange') {
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
        ...initialState,
        connected: true,
        verified: state.verified,
        nextGameQueued: state.nextGameQueued,
        nextGameType: state.nextGameType,
        playerCount: state.playerCount,
        guestName: state.guestName,
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
        ...initialState,
        connected: true,
        verified: state.verified,
        nextGameQueued: true, // Auto re-queue
        nextGameType: state.gameQueued === 'unrankedDuel' ? 'unranked' : 'ranked',
        playerCount: state.playerCount,
        guestName: state.guestName,
      });
      get().pushToast({
        key: 'opponentLeftBeforeStart',
        toastType: 'info',
      });
      return;
    }

    // ── gameJoinError (home.js:1794-1804) ──────────────────
    if (data.type === 'gameJoinError') {
      set({
        joinError: data.error,
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
            isSelf: data.id === state.gameData?.myId,
          },
        ],
      }));
      // Auto-expire so the component stays a pure renderer (no per-item timers).
      setTimeout(() => {
        set((s) => ({ emotes: s.emotes.filter((e) => e.id !== id) }));
      }, EMOTE_TTL_MS);
      return;
    }

    // ── streak (home.js:1868-1877) ────────────────────────
    if (data.type === 'streak') {
      const key =
        data.streak === 0
          ? 'streakLost'
          : data.streak === 1
            ? 'streakStarted'
            : 'streakGained';
      get().pushToast({
        key,
        toastType: 'info',
        // `streakGained` (and `restoreYourStreak` etc.) contain a `{{streak}}`
        // placeholder — pass the value via `vars` so `t()` interpolates it.
        // `streakLost`/`streakStarted` have no placeholder and ignore it.
        vars: { streak: data.streak },
      });
      return;
    }

    // ── friends — full sync (ws/classes/Player.js:414-440 sendFriendData) ──
    // Server pushes whenever the friend list changes (accept/decline/cancel/remove,
    // setAllowFriendReq toggle) and in response to client's `getFriends` polls.
    if (data.type === 'friends') {
      set({
        friends: Array.isArray(data.friends) ? data.friends : [],
        sentRequests: Array.isArray(data.sentRequests) ? data.sentRequests : [],
        receivedRequests: Array.isArray(data.receivedRequests) ? data.receivedRequests : [],
        allowFriendReq: !!data.allowFriendReq,
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
