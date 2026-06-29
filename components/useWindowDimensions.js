import { useState, useEffect, useRef } from 'react';

function getWindowDimensions() {
  if (typeof window === 'undefined') return {
    width: null,
    height: null
  };
  const docEl = document.documentElement;
  const width = docEl?.clientWidth || window.innerWidth;
  const height = docEl?.clientHeight || window.innerHeight;
  return {
    width,
    height
  };
}

export default function useWindowDimensions() {
  const [windowDimensions, setWindowDimensions] = useState(getWindowDimensions());
  const timeoutRef = useRef(null);

  useEffect(() => {
    function handleResize() {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setWindowDimensions(getWindowDimensions());
      }, 100);
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return windowDimensions;
}
