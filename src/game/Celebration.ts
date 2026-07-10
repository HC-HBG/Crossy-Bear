import { Container, Graphics, Ticker } from "pixi.js";
import { COLORS } from "./constants";
import { tween, easeOutQuad } from "./tween";

/**
 * The one signature flourish: a coin fountain burst. Spawned in stage
 * (screen) space at a global point so it's unaffected by camera panning.
 */
export function spawnCoinFountain(stage: Container, ticker: Ticker, x: number, y: number): void {
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const coinCount = reduceMotion ? 0 : 26;
  const particles: Array<{ g: Graphics; vx: number; vy: number }> = [];
  for (let i = 0; i < coinCount; i++) {
    const g = new Graphics();
    const r = 4 + Math.random() * 3;
    g.circle(0, 0, r).fill(COLORS.gold);
    g.circle(0, 0, r * 0.5).fill({ color: 0xffe9a8, alpha: 0.9 });
    g.x = x;
    g.y = y;
    stage.addChild(g);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
    const speed = 2.2 + Math.random() * 2.4;
    particles.push({ g, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed });
  }
  if (particles.length === 0) return;

  let elapsed = 0;
  const gravity = 0.012;
  const durationMs = 1100;
  const step = (): void => {
    elapsed += ticker.deltaMS;
    for (const p of particles) {
      p.vy += gravity * ticker.deltaMS;
      p.g.x += p.vx * ticker.deltaMS * 0.06;
      p.g.y += p.vy * ticker.deltaMS * 0.06;
      p.g.alpha = Math.max(0, 1 - elapsed / durationMs);
    }
    if (elapsed >= durationMs) {
      ticker.remove(step);
      for (const p of particles) p.g.destroy();
    }
  };
  ticker.add(step);
}

const CONFETTI_COLORS = [0xf5b41e, 0xff6b6b, 0x4dd0e1, 0x81c784, 0xba68c8, 0xffffff];

/**
 * A wide, multi-color confetti burst around a point — reserved for the
 * biggest wins, on top of whatever coin fountain / camera punch-in already
 * plays. Pieces flutter (a light sideways sway) rather than falling straight,
 * which is what reads as confetti instead of more coins.
 */
export function spawnConfettiBurst(stage: Container, ticker: Ticker, x: number, y: number): void {
  const reduceMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const pieceCount = reduceMotion ? 0 : 36;
  const particles: Array<{
    g: Graphics;
    vx: number;
    vy: number;
    spin: number;
    sway: number;
    swayPhase: number;
  }> = [];
  for (let i = 0; i < pieceCount; i++) {
    const g = new Graphics();
    const w = 4 + Math.random() * 3;
    const h = 6 + Math.random() * 4;
    g.rect(-w / 2, -h / 2, w, h).fill(CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]);
    g.x = x;
    g.y = y;
    g.rotation = Math.random() * Math.PI * 2;
    stage.addChild(g);
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
    const speed = 2.4 + Math.random() * 3;
    particles.push({
      g,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      spin: (Math.random() - 0.5) * 0.3,
      sway: 0.6 + Math.random() * 0.8,
      swayPhase: Math.random() * Math.PI * 2,
    });
  }
  if (particles.length === 0) return;

  let elapsed = 0;
  const gravity = 0.01;
  const durationMs = 1400;
  const step = (): void => {
    elapsed += ticker.deltaMS;
    for (const p of particles) {
      p.vy += gravity * ticker.deltaMS;
      p.g.x += (p.vx + Math.sin(elapsed * 0.006 + p.swayPhase) * p.sway) * ticker.deltaMS * 0.06;
      p.g.y += p.vy * ticker.deltaMS * 0.06;
      p.g.rotation += p.spin * ticker.deltaMS * 0.06;
      p.g.alpha = Math.max(0, 1 - elapsed / durationMs);
    }
    if (elapsed >= durationMs) {
      ticker.remove(step);
      for (const p of particles) p.g.destroy();
    }
  };
  ticker.add(step);
}

/** Temporary zoom toward a fixed screen-space focal point (e.g. the bear). */
export async function cameraPunchIn(
  stage: Container,
  ticker: Ticker,
  focal: { x: number; y: number },
): Promise<void> {
  const prevScale = stage.scale.x;
  const prevPivot = { x: stage.pivot.x, y: stage.pivot.y };
  const prevPos = { x: stage.x, y: stage.y };

  stage.pivot.set(focal.x, focal.y);
  stage.position.set(focal.x, focal.y);

  await tween(ticker, 200, (t) => {
    const s = 1 + t * 0.1;
    stage.scale.set(s, s);
  }, easeOutQuad);
  await tween(ticker, 500, (t) => {
    const s = 1.1 - t * 0.1;
    stage.scale.set(s, s);
  }, easeOutQuad);

  stage.scale.set(prevScale, prevScale);
  stage.pivot.set(prevPivot.x, prevPivot.y);
  stage.position.set(prevPos.x, prevPos.y);
}
