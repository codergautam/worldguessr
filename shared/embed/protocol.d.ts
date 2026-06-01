export const INBOUND: { INIT: "init"; UPDATE_PROPS: "updateProps" };
export const OUTBOUND: {
  READY: "ready";
  GUESS: "guess";
  KM: "km";
  OPEN_MAPS: "openMaps";
  REVEAL_READY: "revealReady";
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
  /** Drives the tile-label language (hl=) via useTranslation. */
  lang?: string;
}

/** Serializable props for the results map embed (/embed/results →
 *  components/ResultsMap.js). `rounds` is the roundOverScreen finalHistory shape. */
export interface EmbedResultsProps {
  rounds?: unknown[];
  activeRound?: number | null;
  myId?: string | null;
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
  | { type: "revealReady" };
