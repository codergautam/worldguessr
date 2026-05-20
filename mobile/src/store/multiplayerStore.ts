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

export interface ChatMessage {
  id: string;
  name: string;
  message: string;
  timestamp: number;
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
  key: string;
  toastType: 'success' | 'error' | 'info';
  message?: string;
  timestamp: number;
  vars?: Record<string, string | number>;
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
  nextGameType: string | null;

  // Private game join
  enteringGameCode: boolean;
  joinError: string | null;

  // In-game
  inGame: boolean;
  gameData: GameData | null;

  // Chat
  chatMessages: ChatMessage[];
  chatEnabled: boolean;

  // Friends / invites
  friendRequests: FriendRequest[];
  gameInvites: GameInvite[];

  // Friends list state (full sync from server `friends` message)
  friends: Friend[];
  sentRequests: FriendRequestEntry[];
  receivedRequests: FriendRequestEntry[];
  allowFriendReq: boolean;
  /** Last `friendReqState` code we received (and the moment we received it, for auto-clear). */
  friendReqState: FriendReqState | null;
  friendReqStateAt: number;

  // Toasts
  latestToast: ToastData | null;

  // Maintenance
  maintenance: boolean;

  // Actions
  handleMessage: (data: any) => void;
  setGameQueued: (type: false | 'publicDuel' | 'unrankedDuel') => void;
  setEnteringGameCode: (value: boolean) => void;
  addChatMessage: (msg: ChatMessage) => void;
  clearGameInvite: (code: string) => void;
  clearFriendRequest: (id: string) => void;
  clearFriendReqState: () => void;
  // Friend WS actions — direct ports of ws.js handlers
  requestFriends: () => void;
  sendFriendRequest: (name: string) => void;
  acceptFriend: (id: string) => void;
  declineFriend: (id: string) => void;
  cancelFriendRequest: (id: string) => void;
  removeFriend: (id: string) => void;
  setAllowFriendReqOnServer: (allow: boolean) => void;
  inviteFriendToGame: (friendSocketId: string) => void;
  acceptGameInvite: (code: string, invitedById: string) => void;
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
  nextGameType: null as string | null,
  enteringGameCode: false,
  joinError: null as string | null,
  inGame: false,
  gameData: null as GameData | null,
  chatMessages: [] as ChatMessage[],
  chatEnabled: false,
  friendRequests: [] as FriendRequest[],
  gameInvites: [] as GameInvite[],
  friends: [] as Friend[],
  sentRequests: [] as FriendRequestEntry[],
  receivedRequests: [] as FriendRequestEntry[],
  allowFriendReq: true,
  friendReqState: null as FriendReqState | null,
  friendReqStateAt: 0,
  latestToast: null as ToastData | null,
  maintenance: false,
};

// ── Store ───────────────────────────────────────────────────

export const useMultiplayerStore = create<MultiplayerState>((set, get) => ({
  ...initialState,

  setGameQueued: (type) => set({ gameQueued: type }),

  setEnteringGameCode: (value) => set({ enteringGameCode: value }),

  addChatMessage: (msg) =>
    set((s) => ({
      chatMessages: [...s.chatMessages.slice(-99), msg],
    })),

  clearGameInvite: (code) =>
    set((s) => ({
      gameInvites: s.gameInvites.filter((inv) => inv.code !== code),
    })),

  clearFriendRequest: (id) =>
    set((s) => ({
      friendRequests: s.friendRequests.filter((req) => req.id !== id),
    })),

  clearFriendReqState: () => set({ friendReqState: null, friendReqStateAt: 0 }),

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
  inviteFriendToGame: (friendSocketId) =>
    wsService.send({ type: 'inviteFriend', friendId: friendSocketId }),
  acceptGameInvite: (code, invitedById) => {
    wsService.send({ type: 'acceptInvite', code, invitedById });
    // Drop the invite from the queue locally — server will deliver gameJoin events.
    set((s) => ({
      gameInvites: s.gameInvites.filter((inv) => inv.code !== code),
    }));
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
        set({
          latestToast: {
            key: 'maintenanceModeStarted',
            toastType: 'info',
            timestamp: Date.now(),
          },
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
      set({
        connecting: false,
        connected: false,
        error: data.message,
      });
      if (data.message === 'uac') {
        wsService.setDontReconnect(true);
      }
      if (data.failedToLogin) {
        wsService.setDontReconnect(true);
        useAuthStore.getState().logout();
      }
      set({
        latestToast: {
          key: data.message === 'uac' ? 'userAlreadyConnected' : 'connectionError',
          toastType: 'error',
          message: data.message,
          timestamp: Date.now(),
        },
      });
      return;
    }

    // ── game — full game state (home.js:1596-1688) ────────
    if (data.type === 'game') {
      const prevGameData = state.gameData;

      // Enable chat for non-duel games
      const chatEnabled = !data.duel;

      console.log('[Store] game message received — state:', data.state, 'code:', data.code, 'host:', data.host, 'players:', data.players?.length);
      set({
        gameQueued: false,
        inGame: true,
        enteringGameCode: false,
        joinError: null,
        chatEnabled,
        gameData: {
          ...(prevGameData ?? {}),
          ...data,
          type: undefined, // Remove the message type field
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
      set({
        ...initialState,
        connected: true,
        verified: state.verified,
        nextGameQueued: true, // Auto re-queue
        nextGameType: 'ranked',
        playerCount: state.playerCount,
        guestName: state.guestName,
        latestToast: {
          key: 'opponentLeftBeforeStart',
          toastType: 'info',
          timestamp: Date.now(),
        },
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
      const { type: _t, key, toastType, closeOnClick, ...vars } = data;
      set({
        latestToast: {
          key,
          toastType: toastType ?? 'info',
          timestamp: Date.now(),
          vars: Object.keys(vars).length > 0 ? vars : undefined,
        },
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

    // ── chat ──────────────────────────────────────────────
    if (data.type === 'chat') {
      set({
        chatMessages: [
          ...state.chatMessages.slice(-99),
          {
            id: data.id,
            name: data.name,
            message: data.message,
            timestamp: Date.now(),
          },
        ],
      });
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
      set({
        latestToast: {
          key,
          toastType: 'info',
          message: `${data.streak}`,
          timestamp: Date.now(),
        },
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
