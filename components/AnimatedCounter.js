import { useState, useEffect, useRef } from 'react';

export default function AnimatedCounter({ 
  value, 
  duration = 800, 
  className = '',
  showIncrement = true,
  incrementColor = '#22c55e',
  formatNumber = true 
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const [incrementAmount, setIncrementAmount] = useState(0);
  const [showIncrementText, setShowIncrementText] = useState(false);
  const previousValue = useRef(value);
  const animationRef = useRef();
  const incrementTimeoutRef = useRef();

  useEffect(() => {
    const startValue = previousValue.current;
    const endValue = value;
    const difference = endValue - startValue;

    // Only animate if there's a change and it's positive (increment)
    if (difference <= 0) {
      setDisplayValue(value);
      previousValue.current = value;
      return;
    }

    // Show increment animation
    if (showIncrement && difference > 0) {
      setIncrementAmount(difference);
      setShowIncrementText(true);
      
      // Hide increment text after animation
      incrementTimeoutRef.current = setTimeout(() => {
        setShowIncrementText(false);
      }, duration + 200);
    }

    setIsAnimating(true);
    
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function - ease out cubic for smooth deceleration
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = startValue + (difference * easeOutCubic);
      setDisplayValue(Math.round(currentValue));
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setIsAnimating(false);
        previousValue.current = endValue;
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (incrementTimeoutRef.current) {
        clearTimeout(incrementTimeoutRef.current);
      }
    };
  }, [value, duration, showIncrement]);

  const formattedValue = formatNumber && displayValue >= 1000 
    ? displayValue.toLocaleString() 
    : displayValue;

  return (
    <span className={`animated-counter ${className} ${isAnimating ? 'animating' : ''}`}>
      <span className="counter-value">{formattedValue}</span>
      {showIncrement && showIncrementText && incrementAmount > 0 && (
        <span 
          className="increment-indicator"
          style={{ 
            color: incrementColor,
            animation: `pointIncrement ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) forwards`
          }}
        >
          +{formatNumber && incrementAmount >= 1000 ? incrementAmount.toLocaleString() : incrementAmount}
        </span>
      )}
    </span>
  );
}