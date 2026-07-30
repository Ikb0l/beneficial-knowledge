import { useState, useEffect, useRef, useCallback } from 'react';

interface UseCountUpOptions {
  start?: number;
  end: number;
  duration?: number;
  delay?: number;
  easing?: 'linear' | 'easeOut' | 'easeIn' | 'easeInOut';
  formatter?: (value: number) => string;
  onComplete?: () => void;
}

const easingFunctions = {
  linear: (t: number) => t,
  easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
  easeIn: (t: number) => Math.pow(t, 3),
  easeInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

const DEFAULT_FORMATTER = (value: number) => Math.round(value).toLocaleString();

export function useCountUp({
  start = 0,
  end,
  duration = 1000,
  delay = 0,
  easing = 'easeOut',
  formatter = DEFAULT_FORMATTER,
  onComplete,
}: UseCountUpOptions) {
  const [value, setValue] = useState(start);
  const [displayValue, setDisplayValue] = useState(formatter(start));
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);
  const delayTimeoutRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const animate = useCallback(function animateFrame(timestamp: number) {
    if (startTimeRef.current === null) {
      startTimeRef.current = timestamp;
    }

    const elapsed = timestamp - startTimeRef.current;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easingFunctions[easing](progress);
    const currentValue = start + (end - start) * easedProgress;

    setValue(currentValue);
    setDisplayValue(formatter(currentValue));

    if (progress < 1) {
      animationRef.current = requestAnimationFrame(animateFrame);
    } else {
      setValue(end);
      setDisplayValue(formatter(end));
      setIsAnimating(false);
      onComplete?.();
    }
  }, [duration, easing, end, formatter, onComplete, start]);

  const startAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
    }

    startTimeRef.current = null;
    setIsAnimating(true);

    if (delay > 0) {
      delayTimeoutRef.current = window.setTimeout(() => {
        animationRef.current = requestAnimationFrame(animate);
      }, delay);
    } else {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [animate, delay]);

  const reset = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (delayTimeoutRef.current) {
      clearTimeout(delayTimeoutRef.current);
    }
    setValue(start);
    setDisplayValue(formatter(start));
    setIsAnimating(false);
    startTimeRef.current = null;
  }, [start, formatter]);

  useEffect(() => {
    startAnimation();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (delayTimeoutRef.current) {
        clearTimeout(delayTimeoutRef.current);
      }
    };
  }, [startAnimation]); // Restart when inputs change (end is captured by startAnimation)

  return {
    value,
    displayValue,
    isAnimating,
    reset,
    restart: startAnimation,
  };
}

// Simplified hook for basic number count-up
export function useSimpleCountUp(end: number, duration = 1000) {
  return useCountUp({ end, duration });
}

export default useCountUp;
