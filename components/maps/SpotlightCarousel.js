import React, { useEffect, useState, useCallback, useRef, memo } from 'react';
import { FaStar, FaPlay, FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import config from '@/clientConfig';
import nameFromCode from '../utils/nameFromCode';
import { mapColor } from './mapBanner';

const embedKey = 'AIzaSyA2fHNuyc768n9ZJLTrfbkWLNK3sLOK-iQ';

function buildEmbedUrl(loc) {
  if (!loc || !Number.isFinite(loc.lat)) return null;

  const lng = Number.isFinite(loc.long) ? loc.long : loc.lng;
  if (!Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/embed/v1/streetview?key=${embedKey}&location=${loc.lat},${lng}&fov=80`;
}

const locationCache = new Map();

function fetchFirstLocation(slug) {
  if (!slug) return Promise.resolve(null);
  if (locationCache.has(slug)) return Promise.resolve(locationCache.get(slug));
  const apiUrl = (typeof window !== 'undefined' && window.cConfig?.apiUrl) || config()?.apiUrl;
  if (!apiUrl) return Promise.resolve(null);
  return fetch(`${apiUrl}/api/map/publicData?slug=${slug}`)
    .then((r) => r.ok ? r.json() : null)
    .then((d) => {
      const list = d?.mapData?.data || [];
      const loc = list[Math.floor(Math.random() * Math.max(1, list.length))] || list[0] || null;
      locationCache.set(slug, loc);
      return loc;
    })
    .catch(() => { locationCache.set(slug, null); return null; });
}

function SpotlightCarousel({ maps, onPlay, lang = 'en', intervalMs = 6000 }) {
  const [idx, setIdx] = useState(0);

  const [paused, setPaused] = useState(false);

  const [embedUrls, setEmbedUrls] = useState({});

  useEffect(() => {
    if (!maps || maps.length === 0) return;
    if (idx >= maps.length) setIdx(0);
  }, [maps, idx]);

  useEffect(() => {
    if (paused || !maps || maps.length < 2) return undefined;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % maps.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [paused, maps, intervalMs]);

  const requestedRef = useRef(new Set());
  useEffect(() => {
    if (!maps || maps.length === 0) return;
    const want = [];
    for (let i = 0; i < Math.min(3, maps.length); i++) {
      const m = maps[(idx + i) % maps.length];
      if (m?.slug && !requestedRef.current.has(m.slug)) {
        requestedRef.current.add(m.slug);
        want.push(m);
      }
    }
    want.forEach((m) => {
      fetchFirstLocation(m.slug).then((loc) => {
        const url = buildEmbedUrl(loc);
        setEmbedUrls((prev) => (prev[m.slug] === url ? prev : { ...prev, [m.slug]: url }));
      });
    });
  }, [maps, idx]);

  const go = useCallback((delta) => {
    if (!maps || maps.length === 0) return;
    setPaused(true);
    setIdx((i) => ((i + delta) % maps.length + maps.length) % maps.length);
  }, [maps]);

  if (!maps || maps.length === 0) return null;
  const current = maps[idx];
  if (!current) return null;

  const displayName = current.countryMap ? nameFromCode(current.countryMap, lang) : current.name;
  const desc = current.description_short
    || (current.created_by_name ? `by ${current.created_by_name}` : '');
  const { accent, accentDim } = mapColor(current);

  const preloadKeys = [];
  for (let i = 0; i < Math.min(3, maps.length); i++) {
    const m = maps[(idx + i) % maps.length];
    if (m?.slug) preloadKeys.push(m.slug);
  }

  return (
    <div
      className="wg-maps__spotlight"
      style={{ background: `linear-gradient(135deg, ${accentDim} 0%, #0a0e1a 100%)` }}
      onClick={(e) => {
        if (e.target.closest('.wg-maps__spotlightArrow, .wg-maps__spotlightDot, .wg-maps__spotlightPlay')) return;
        onPlay?.(current);
      }}
      role="region"
      aria-label="Featured map"
    >

      {preloadKeys.map((slug, i) => {
        const url = embedUrls[slug];
        if (!url) return null;
        const isActive = i === 0;
        return (
          <iframe
            key={slug}
            title={`Spotlight preview ${slug}`}
            src={url}
            className="wg-maps__spotlightFrame"
            style={{
              opacity: isActive ? 1 : 0,
              visibility: isActive ? 'visible' : 'hidden',
              pointerEvents: 'none',
              zIndex: isActive ? 0 : -1,
            }}
            referrerPolicy="no-referrer-when-downgrade"
            loading="eager"
            allow=""
            aria-hidden={!isActive}
            tabIndex={-1}
          />
        );
      })}

      <div className="wg-maps__spotlightShade" aria-hidden="true" />

      <div className="wg-maps__spotlightContent">
        <span className="wg-maps__spotlightLabel">
          <FaStar aria-hidden="true" /> Featured map
        </span>
        <h3 className="wg-maps__spotlightName" style={{ color: accent, filter: 'brightness(1.15)' }}>
          {displayName}
        </h3>
        {desc && <p className="wg-maps__spotlightDesc">{desc}</p>}
        <button
          type="button"
          className="wg-maps__spotlightPlay"
          onClick={(e) => { e.stopPropagation(); onPlay?.(current); }}
        >
          <FaPlay aria-hidden="true" />
          <span>Play this map</span>
        </button>
      </div>

      {maps.length > 1 && (
        <>
          <button
            type="button"
            className="wg-maps__spotlightArrow wg-maps__spotlightArrow--prev"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            aria-label="Previous map"
          >
            <FaChevronLeft />
          </button>
          <button
            type="button"
            className="wg-maps__spotlightArrow wg-maps__spotlightArrow--next"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            aria-label="Next map"
          >
            <FaChevronRight />
          </button>
          <div className="wg-maps__spotlightDots" aria-hidden="true">
            {maps.map((m, i) => (
              <button
                key={m.id || m.slug || i}
                type="button"
                className={`wg-maps__spotlightDot ${i === idx ? 'wg-maps__spotlightDot--on' : ''}`}
                onClick={(e) => { e.stopPropagation(); setPaused(true); setIdx(i); }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(SpotlightCarousel);
