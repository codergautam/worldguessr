/**
 * Continent silhouette icons from Wikimedia Commons (CC-BY-SA).
 * Replaces the indistinguishable globe emojis (🌍🌎🌏).
 */
const CONTINENT_IMAGES = {
  "Africa": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/AfricaContour.svg/200px-AfricaContour.svg.png",
  "Asia": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/AsiaContour.svg/200px-AsiaContour.svg.png",
  "Europe": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/EuropeContour.svg/200px-EuropeContour.svg.png",
  "North America": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/NorthAmericaContour.svg/200px-NorthAmericaContour.svg.png",
  "South America": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/SouthAmericaContours.svg/200px-SouthAmericaContours.svg.png",
  "Oceania": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/AustraliaContour.svg/200px-AustraliaContour.svg.png",
};

export default function ContinentIcon({ continent, size = 30, className = "" }) {
  const src = CONTINENT_IMAGES[continent];
  if (!src) return null;

  return (
    <img
      className={className}
      src={src}
      alt={continent}
      width={size}
      height={size}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        objectFit: "contain",
        filter: "brightness(0) invert(1)",
      }}
    />
  );
}

export { CONTINENT_IMAGES };
