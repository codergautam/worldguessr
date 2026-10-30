// A flag as cloth: the image cut into vertical strips that ripple on a
// staggered delay, each with a flat shade in step, so the flag waves like a
// real one. Transform/opacity only, and finite: one pass when the flag
// arrives (`delay`), another whenever `waveKey` changes. The <img> stays in
// the layout to size the box (contain fit in any frame); the strips are laid
// over its exact rect. A plain image under reduced motion.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

// `onAspect(width / height)` reports the flag's own shape once it is known,
// so the card can size its frame to the flag (no empty bands).
export default function ClothFlag({ src, alt, className = '', waveKey = 0, delay = 0, onAspect }) {
  const imgRef = useRef(null);
  const [rect, setRect] = useState(null); // { x, y, w, h } of the image inside its box
  const [motion, setMotion] = useState(true);
  const onAspectRef = useRef(onAspect);
  onAspectRef.current = onAspect;

  useEffect(() => {
    setMotion(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img) return undefined;
    const measure = () => {
      if (img.complete && img.naturalWidth) onAspectRef.current?.(img.naturalWidth / img.naturalHeight);
      if (!img.complete || !img.naturalWidth || !img.offsetWidth) return;
      const next = { x: img.offsetLeft, y: img.offsetTop, w: img.offsetWidth, h: img.offsetHeight };
      setRect((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next));
    };
    measure();
    img.addEventListener('load', measure);
    // Committed in the same frame the image resized, or the strips trail it.
    const ro = new ResizeObserver(() => flushSync(measure));
    ro.observe(img);
    // The box can resize along one axis without the image changing size,
    // which moves the centred image: watch the box too.
    if (img.parentElement) ro.observe(img.parentElement);
    return () => { img.removeEventListener('load', measure); ro.disconnect(); };
  }, [src]);

  const cloth = motion && rect && rect.w > 0;
  const n = cloth ? Math.max(10, Math.min(24, Math.round(rect.w / 18))) : 0;
  const stripW = cloth ? rect.w / n : 0;

  return (
    <>
      <img
        ref={imgRef}
        className={`${className}${cloth ? ' quizCloth__base' : ''}`}
        src={src}
        alt={alt}
        draggable={false}
      />
      {cloth && (
        // The shadow stays still under the moving strips.
        <div className="quizCloth__plate" aria-hidden style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
      )}
      {cloth && (
        <div
          key={`${src}:${waveKey}`}
          className="quizCloth"
          aria-hidden
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, '--flag': `url("${src}")`, '--d': `${delay}ms` }}
        >
          {Array.from({ length: n }, (_, i) => (
            <span
              key={i}
              className="quizCloth__strip"
              style={{
                width: Math.ceil(stripW) + 1,
                left: Math.floor(i * stripW),
                '--i': i,
                // The hoist (left edge) barely moves; the fly end swings most.
                '--a': (0.2 + 0.8 * i / (n - 1)).toFixed(3),
                '--bw': `${rect.w}px`,
                '--bh': `${rect.h}px`,
                '--bx': `${-Math.floor(i * stripW)}px`,
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
