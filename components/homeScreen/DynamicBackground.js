import { useEffect, useRef, useState } from 'react';
import { asset } from '@/lib/basePath';

export default function DynamicBackground({ imageSrc, fadeMs = 1600 }) {

  const [activeLayer, setActiveLayer] = useState(0);
  const [layers, setLayers] = useState([imageSrc || null, null]);
  const lastSrcRef = useRef(imageSrc);

  useEffect(() => {
    if (!imageSrc || imageSrc === lastSrcRef.current) return;
    lastSrcRef.current = imageSrc;

    setLayers((prev) => {
      const next = [...prev];
      const target = activeLayer === 0 ? 1 : 0;
      next[target] = imageSrc;
      return next;
    });

    const id = requestAnimationFrame(() => {
      setActiveLayer((cur) => (cur === 0 ? 1 : 0));
    });
    return () => cancelAnimationFrame(id);
  }, [imageSrc]);

  return (
    <div className="wg-dynBg" aria-hidden="true">

      <div className="wg-dynBg__blurWrap">
        {layers.map((src, i) => (
          <div
            key={i}
            className={`wg-dynBg__layer ${activeLayer === i ? 'wg-dynBg__layer--active' : ''}`}
            style={{
              backgroundImage: src ? `url(${asset(src)})` : 'none',
              transitionDuration: `${fadeMs}ms`,
            }}
          />
        ))}
      </div>
      <div className="wg-dynBg__vignette" />
    </div>
  );
}
