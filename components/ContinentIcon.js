/**
 * Continent silhouette icons (originally from Wikimedia Commons, CC-BY-SA).
 * Served locally out of /public/continents so we don't depend on Wikipedia's
 * upload.wikimedia.org hotlink (which rate-limits and blocks generic UAs).
 */
const CONTINENT_IMAGES = {
  "Africa": "/continents/africa.png",
  "Asia": "/continents/asia.png",
  "Europe": "/continents/europe.png",
  "North America": "/continents/north-america.png",
  "South America": "/continents/south-america.png",
  "Oceania": "/continents/oceania.png",
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
