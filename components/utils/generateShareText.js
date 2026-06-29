export default function generateShareText({ rounds, totalPoints, maxPoints, mode }) {
  const modeLabel = mode === "classic" ? "Classic" : mode === "country" ? "Country Guesser" : "Continent Guesser";
  const pointsPerRound = mode === "classic" ? 5000 : 1000;

  const squares = rounds.map(r => {
    if (mode !== "classic") {
      return r.points >= pointsPerRound ? "\u{1F7E9}" : "\u{1F7E5}";
    }
    const pts = r.points || 0;
    if (pts >= 4000) return "\u{1F7E9}";
    if (pts >= 2000) return "\u{1F7E8}";
    if (pts >= 500) return "\u{1F7E7}";
    return "\u{1F7E5}";
  }).join("");

  const starCount = Math.round((totalPoints / maxPoints) * 3);
  const stars = "\u2B50".repeat(Math.max(starCount, 0));

  return `\u{1F30D} WorldGuessr \u2014 ${modeLabel}\n${stars} ${totalPoints} / ${maxPoints}\n\n${squares}\n\nPlay free: worldguessr.com`;
}
