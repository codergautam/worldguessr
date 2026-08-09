export const INBOUND: { INIT: "init"; UPDATE_PROPS: "updateProps" };
export const OUTBOUND: {
  READY: "ready";
  GUESS: "guess";
  KM: "km";
  OPEN_MAPS: "openMaps";
  REVEAL_READY: "revealReady";
  SV_LOADED: "svLoaded";
  SV_PREFETCHED: "svPrefetched";
};
export const APPLY_FN: "__embedApply";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Serializable props for the live map embed (/embed/map → components/Map.js).
 *  Function props (setPinPoint/setKm) are owned inside the embed and surfaced
 *  as OUTBOUND messages, so they are NOT part of the wire contract. */
export interface EmbedMapProps {
  shown?: boolean;
  options?: { mapType?: "m" | "s" | "p" | "y" };
  session?: { token?: { username?: string } } | null;
  pinPoint?: LatLng | null;
  answerShown?: boolean;
  location?: { lat: number; long: number } | null;
  multiplayerState?: unknown;
  showHint?: boolean;
  round?: number;
  gameOptions?: { extent?: number[] | null; maxDist?: number } | null;
  countryGuessPin?: LatLng | null;
  /** When false, map taps don't drop a pin (country/continent mode). */
  interactive?: boolean;
  stopCameraAnimations?: boolean;
  resetKey?: number;
  cameraCancelKey?: number;
  /* NO `myNameGlow` HERE ANY MORE. It crossed this bridge for exactly one
   * consumer — the "Your guess" pin label — and that label wears no glow: it is
   * chrome, not a name (components/utils/guessPinLabel.js). Skins still travel
   * (myMarkerSkin, EmbedResultsProps below) because a pin IS identity. */
  /** Drives the tile-label language (hl=) via useTranslation. */
  lang?: string;
}

/** Serializable props for the results map embed (/embed/results →
 *  components/ResultsMap.js). `rounds` is the roundOverScreen finalHistory shape. */
export interface EmbedResultsProps {
  /** Google Maps tile layer for the results map (matches the live map's setting). */
  mapType?: "m" | "s" | "p" | "y";
  rounds?: unknown[];
  activeRound?: number | null;
  myId?: string | null;
  /** Highlighted player from the host's Final Scores list. */
  selectedPlayer?: string | null;
  /** Team games: playerId -> 'a' | 'b'. */
  teams?: Record<string, "a" | "b"> | null;
  /** THE CURRENT PLAYER'S OWN PIN SKIN, and it has to travel as a prop because
   *  their guess is drawn off round.guessLat/Long rather than off a
   *  round.players entry — there is nothing else on this screen to read it
   *  from. Everyone else's rides on their own entry in `rounds[].players`.
   *  There is no glow beside it: your own pin's label reads "Your guess" and a
   *  glow dresses a NAME. Opponents' labels still glow, off `rounds[].players`. */
  myMarkerSkin?: string | null;
  isDuel?: boolean;
  isCountryGuesser?: boolean;
  lang?: string;
}

export type InboundMessage =
  | { type: "init"; props: EmbedMapProps & EmbedResultsProps }
  | { type: "updateProps"; props: EmbedMapProps & EmbedResultsProps };

export type OutboundMessage =
  | { type: "ready" }
  | { type: "guess"; lat: number; lng: number }
  | { type: "km"; km: string }
  | { type: "openMaps"; lat: number; lng: number; panoId?: string }
  | { type: "revealReady" }
  | { type: "svLoaded" }
  | { type: "svPrefetched"; panoId: string };

/** Serializable props for the Street View embed (embed/svEntry.jsx →
 *  components/streetview/customStreetView.js). The host withholds coords until
 *  panoId is natively resolved — the in-page resolver is shimmed out. */
export interface EmbedSvProps {
  lat?: number;
  long?: number;
  heading?: number | null;
  /** Freshly resolved pano id — REQUIRED alongside coords (never map-file ids). */
  panoId?: string | null;
  npz?: boolean;
  showAnswer?: boolean;
  refreshKey?: number;
  /** NEXT round's fresh pano id — the page prefetches its base tiles. */
  prefetchPano?: string | null;
}
