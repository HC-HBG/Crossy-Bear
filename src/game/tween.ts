import { Ticker } from "pixi.js";

export type Easing = (t: number) => number;

export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t);
export const easeOutBack: Easing = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const linear: Easing = (t) => t;

/**
 * Runs a callback with progress 0..1 over durationMs using the shared Pixi
 * ticker, honoring prefers-reduced-motion by resolving instantly at
 * progress=1. Returns a promise that resolves when the tween completes.
 */
export function tween(
  ticker: Ticker,
  durationMs: number,
  onUpdate: (progress: number) => void,
  easing: Easing = easeOutQuad,
): Promise<void> {
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion || durationMs <= 0) {
    onUpdate(1);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let elapsed = 0;
    const step = () => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / durationMs);
      onUpdate(easing(t));
      if (t >= 1) {
        ticker.remove(step);
        resolve();
      }
    };
    ticker.add(step);
  });
}
