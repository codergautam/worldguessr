import findDistance from "./findDistance";

export default function calcPoints({lat, lon, guessLat, guessLon, usedHint}) {
  const dist = findDistance(lat, lon, guessLat, guessLon);
  const maxDist = -2000; // max distance between two points on earth
  let pts = 5000 * Math.E ** ((dist / maxDist));
  if(usedHint) pts = pts / 2;
  return Math.round(pts);
}