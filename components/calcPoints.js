Number.prototype.toRad = function() {
  return this * Math.PI / 180;
}
export function findDistance(lat1, lon1, lat2, lon2) {
  var R = 6371; // km
  var dLat = (lat2-lat1).toRad();
  var dLon = (lon2-lon1).toRad();
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1.toRad()) * Math.cos(lat2.toRad()) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c;
  return d;
}
export default function calcPoints({lat, lon, guessLat, guessLon, usedHint, maxDist}) {
  console.log(lat, lon, guessLat, guessLon, usedHint, maxDist);
  const dist = findDistance(lat, lon, guessLat, guessLon);
  let pts = 5000 * Math.E ** (-10*(dist / maxDist));
  if(usedHint) pts = pts / 2;
  return Math.round(pts);
}