/**
 * Animated Value Component
 *
 * Smoothly animates number changes with customizable duration and easing.
 */

'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { animations } from '../design-tokens';

interface AnimatedValueProps {
  value: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
}

export function AnimatedValue({
  value,
  duration = animations.duration.normal,
  format = (v) => Math.round(v).toLocaleString(),
  className = '',
}: AnimatedValueProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const rafRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | undefined>(undefined);
  const startValueRef = useRef(value);

  const runAnimation = useEffectEvent(() => {
    startValueRef.current = displayValue;
    startTimeRef.current = performance.now();

    const animate = (currentTime: number) => {
      if (!startTimeRef.current) return;

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easedProgress = 1 - (1 - progress) ** 3;

      const newValue = startValueRef.current + (value - startValueRef.current) * easedProgress;
      setDisplayValue(newValue);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  });

  useEffect(() => {
    const cleanup = runAnimation();
    return () => {
      if (typeof cleanup === 'function') cleanup();
    };
  }, [value, duration]);

  return <span className={className}>{format(displayValue)}</span>;
}
