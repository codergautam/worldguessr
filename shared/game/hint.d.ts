export function hintCircle(
  location: { lat: number; long: number },
  maxDist?: number,
  round?: number,
  maxRadiusMeters?: number,
): { center: { lat: number; lng: number }; radiusMeters: number };
