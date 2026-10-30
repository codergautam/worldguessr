export interface BorderFeature {
  properties?: { code?: string; name?: string; country?: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: any };
}

export interface OutlinePolygon {
  ring: number[][];
  holes: number[][][];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  area: number;
}

export function polygonsOf(features: BorderFeature[]): { polygons: OutlinePolygon[]; shifted: boolean };
export function primaryCluster(
  polygons: OutlinePolygon[],
  opts?: { padDeg?: number; speck?: number },
): OutlinePolygon[];
export function clusterShare(features: BorderFeature[]): number;
export function totalArea(features: BorderFeature[]): number;
export function clusterBounds(features: BorderFeature[]): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  crossesAntimeridian: boolean;
} | null;
export function outlinePath(
  features: BorderFeature[],
  opts?: { size?: number },
): { d: string; viewBox: string; width: number; height: number };
