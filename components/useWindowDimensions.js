import { useState, useEffect, useRef } from 'react';

function getWindowDimensions() {
  if(typeof window === 'undefined') return {
    width: null,
    height: null
  }
  const { innerWidth: width, innerHeight: height } = window;
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
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return windowDimensions;
}
