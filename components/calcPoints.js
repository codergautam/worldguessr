import findDistance from "./findDistance";

export default function calcPoints({lat, lon, guessLat, guessLon, usedHint, maxDist}) {
  console.log(lat, lon, guessLat, guessLon, usedHint, maxDist);
  const dist = findDistance(lat, lon, guessLat, guessLon);
  let pts = 5000 * Math.E ** (-10*(dist / maxDist));
  if(usedHint) pts = pts / 2;
  return Math.round(pts);
}