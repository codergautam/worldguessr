import findDistance from "./findDistance";

export default function calcPoints({lat, lon, guessLat, guessLon}) {
  const dist = findDistance(lat, lon, guessLat, guessLon);
  const maxDist = -2000; // max distance between two points on earth
  return Math.round(5000 * Math.E ** ((dist / maxDist)));
}