// ChinaGuessr (temporary): projected Street View navigation for Baidu panos.
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const SVG_SIZE = 100;

const groundQuad = (center, bearingDeg, width, depth) => {
  const bearing = bearingDeg * Math.PI / 180;
  const forward = { x: Math.sin(bearing), y: Math.cos(bearing) };
  const right = { x: Math.cos(bearing), y: -Math.sin(bearing) };
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  return [
    { x: center.x - right.x * halfWidth + forward.x * halfDepth, y: center.y - right.y * halfWidth + forward.y * halfDepth },
    { x: center.x + right.x * halfWidth + forward.x * halfDepth, y: center.y + right.y * halfWidth + forward.y * halfDepth },
    { x: center.x + right.x * halfWidth - forward.x * halfDepth, y: center.y + right.y * halfWidth - forward.y * halfDepth },
    { x: center.x - right.x * halfWidth - forward.x * halfDepth, y: center.y - right.y * halfWidth - forward.y * halfDepth },
  ];
};

const projectPoint = (frame, point) => {
  const m = frame.vp;
  const x = point.x;
  const y = -frame.nav.height;
  const z = -point.y;
  const clipX = m[0] * x + m[4] * y + m[8] * z + m[12];
  const clipY = m[1] * x + m[5] * y + m[9] * z + m[13];
  const clipW = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (!Number.isFinite(clipW) || clipW <= 0.01) return null;
  return {
    x: (clipX / clipW * 0.5 + 0.5) * frame.width,
    y: (0.5 - clipY / clipW * 0.5) * frame.height,
  };
};

const projectQuad = (frame, points) => {
  const quad = points.map((point) => projectPoint(frame, point));
  if (quad.some((point) => !point)) return null;
  if (quad.every((point) => point.x < 0) || quad.every((point) => point.x > frame.width)
    || quad.every((point) => point.y < 0) || quad.every((point) => point.y > frame.height)) return null;
  return quad;
};

const projectPancakeQuad = (frame, center, bearingDeg) => {
  // A full-size ground quad can cross the camera plane at the very bottom of
  // the viewport. Keep reducing only that near-camera disc until CSS can
  // project it; the center and move target stay unchanged.
  for (let diameter = 1.6; diameter >= 0.2; diameter /= 2) {
    const quad = projectQuad(frame, groundQuad(center, bearingDeg, diameter, diameter));
    if (quad) return quad;
  }
  return null;
};

const homography = (quad) => {
  const [p0, p1, p2, p3] = quad;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-6 || Math.abs(dy3) > 1e-6) {
    const denominator = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(denominator) < 1e-6) return null;
    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + h * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + h * p3.y;
  const f = p0.y;
  const values = [
    a / SVG_SIZE, d / SVG_SIZE, 0, g / SVG_SIZE,
    b / SVG_SIZE, e / SVG_SIZE, 0, h / SVG_SIZE,
    0, 0, 1, 0,
    c, f, 0, 1,
  ];
  if (values.some((value) => !Number.isFinite(value))) return null;
  return `matrix3d(${values.map((value) => value.toFixed(7)).join(',')})`;
};

const placeGroundElement = (element, quad) => {
  if (!element || !quad) {
    if (element) element.style.display = 'none';
    return false;
  }
  const matrix = homography(quad);
  if (!matrix) {
    element.style.display = 'none';
    return false;
  }
  element.style.display = 'block';
  element.style.transform = matrix;
  return true;
};

export default function SvNavOverlay({ engine, visible }) {
  const [links, setLinks] = useState([]);
  const linksRef = useRef([]);
  const navRef = useRef(null);
  const chevronsRef = useRef(new Map());
  const pancakeRef = useRef(null);
  const tooltipRef = useRef(null);
  const lastFrameRef = useRef(null);

  const drawFrame = useCallback((frame) => {
    lastFrameRef.current = frame;
    if (!visible || !frame?.nav) {
      for (const element of chevronsRef.current.values()) element.style.display = 'none';
      if (pancakeRef.current) pancakeRef.current.style.display = 'none';
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      if (navRef.current || linksRef.current.length) {
        navRef.current = null;
        linksRef.current = [];
        setLinks([]);
      }
      return;
    }

    if (frame.moving) {
      for (const element of chevronsRef.current.values()) element.style.display = 'none';
      if (pancakeRef.current) pancakeRef.current.style.display = 'none';
      if (tooltipRef.current) tooltipRef.current.style.display = 'none';
      return;
    }

    if (navRef.current !== frame.nav) {
      for (const element of chevronsRef.current.values()) element.style.display = 'none';
      navRef.current = frame.nav;
      linksRef.current = frame.nav.links || [];
      setLinks(linksRef.current);
    }

    const hoveredId = frame.hover?.chevron?.id || null;
    let tooltipAnchor = null;
    let tooltipText = '';
    for (const link of linksRef.current) {
      const element = chevronsRef.current.get(link.id);
      const bearing = link.bearing * Math.PI / 180;
      const center = { x: Math.sin(bearing) * 3.5, y: Math.cos(bearing) * 3.5 };
      const quad = projectQuad(frame, groundQuad(center, link.bearing, 1.4, 0.9));
      placeGroundElement(element, quad);
      if (element) element.classList.toggle('is-hover', link.id === hoveredId);
      if (link.id === hoveredId && link.road) {
        tooltipAnchor = projectPoint(frame, center);
        tooltipText = link.road;
      }
    }

    const tooltip = tooltipRef.current;
    if (tooltip && tooltipAnchor && tooltipText) {
      tooltip.style.display = 'block';
      tooltip.style.left = `${tooltipAnchor.x.toFixed(2)}px`;
      tooltip.style.top = `${tooltipAnchor.y.toFixed(2)}px`;
      tooltip.textContent = tooltipText;
    } else if (tooltip) {
      tooltip.style.display = 'none';
    }

    const pancake = pancakeRef.current;
    const groundPoint = frame.hover?.groundPt;
    const target = frame.hover?.target;
    if (!groundPoint || !target || hoveredId) {
      if (pancake) pancake.style.display = 'none';
      return;
    }
    // Keep the arrow stable for this destination while aiming it along the
    // route from the panorama origin. Cursor position only places the disc.
    const targetBearing = Math.atan2(target.x, target.y) * 180 / Math.PI;
    const pancakeQuad = projectPancakeQuad(frame, groundPoint, targetBearing);
    if (!placeGroundElement(pancake, pancakeQuad)) return;
  }, [visible]);

  useEffect(() => {
    if (!engine || !visible) return undefined;
    return engine.onCamera(drawFrame);
  }, [engine, visible, drawFrame]);

  useLayoutEffect(() => {
    if (lastFrameRef.current) drawFrame(lastFrameRef.current);
  }, [links, drawFrame]);

  return (
    <div className="sv-nav-overlay" aria-hidden="true">
      {links.map((link) => (
        <svg
          key={link.id}
          ref={(element) => {
            if (element) chevronsRef.current.set(link.id, element);
            else chevronsRef.current.delete(link.id);
          }}
          className="sv-nav-chevron"
          viewBox="0 0 100 100"
        >
          <path d="M19 68 L50 31 L81 68" />
        </svg>
      ))}
      <svg ref={pancakeRef} className="sv-nav-pancake" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" />
        <g className="sv-nav-pancake__arrow">
          <path d="M50 23 L66 48 L57 46 L57 69 L43 69 L43 46 L34 48 Z" />
        </g>
      </svg>
      <div ref={tooltipRef} className="sv-nav-tooltip" />
    </div>
  );
}
