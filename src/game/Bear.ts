import { Container, Graphics, Ticker } from "pixi.js";
import { COLORS } from "./constants";
import { tween, easeOutBack, easeOutQuad } from "./tween";

const BEAR_WIDTH = 64;
const BEAR_HEIGHT = 72;

export class Bear {
  readonly view: Container;
  private body: Graphics;
  private arm: Graphics;
  private ticker: Ticker;
  private idleTime = 0;
  private idleEnabled = true;

  constructor(ticker: Ticker) {
    this.ticker = ticker;
    this.view = new Container();
    this.body = new Graphics();
    this.drawIdle();
    this.view.addChild(this.body);

    this.arm = new Graphics();
    this.arm.roundRect(-7, -20, 14, 20, 7).fill(COLORS.bear);
    this.arm.circle(0, -20, 8).fill(COLORS.bear);
    this.arm.x = BEAR_WIDTH / 2 - 10;
    this.arm.y = -BEAR_HEIGHT + 24;
    this.arm.alpha = 0;
    this.view.addChild(this.arm);

    this.ticker.add(this.onTick);
  }

  destroy(): void {
    this.ticker.remove(this.onTick);
    this.view.destroy({ children: true });
  }

  private onTick = (): void => {
    if (!this.idleEnabled) return;
    this.idleTime += this.ticker.deltaMS;
    const bob = Math.sin(this.idleTime / 260) * 3;
    this.body.y = bob;
  };

  private drawIdle(): void {
    const g = this.body;
    g.clear();
    // chunky rounded-rect construction: body, head, ears, muzzle
    g.roundRect(-BEAR_WIDTH / 2, -BEAR_HEIGHT + 14, BEAR_WIDTH, BEAR_HEIGHT - 14, 16).fill(COLORS.bear);
    g.roundRect(-BEAR_WIDTH / 2 + 8, -BEAR_HEIGHT - 6, BEAR_WIDTH - 16, 34, 14).fill(COLORS.bear);
    g.circle(-BEAR_WIDTH / 2 + 6, -BEAR_HEIGHT + 2, 10).fill(COLORS.bear);
    g.circle(BEAR_WIDTH / 2 - 6, -BEAR_HEIGHT + 2, 10).fill(COLORS.bear);
    g.roundRect(-10, -BEAR_HEIGHT + 16, 20, 14, 7).fill(COLORS.bearDark);
    g.circle(-8, -BEAR_HEIGHT + 6, 3).fill(COLORS.black);
    g.circle(8, -BEAR_HEIGHT + 6, 3).fill(COLORS.black);
    g.circle(0, -BEAR_HEIGHT + 20, 3).fill(COLORS.black);
  }

  reset(x: number): void {
    this.view.x = x;
    this.view.scale.set(1, 1);
    this.view.alpha = 1;
    this.view.rotation = 0;
    this.body.y = 0;
    this.arm.alpha = 0;
    this.arm.y = -BEAR_HEIGHT + 24;
    this.idleEnabled = true;
    this.drawIdle();
  }

  async hopTo(targetX: number, durationMs: number): Promise<void> {
    this.idleEnabled = false;
    const startX = this.view.x;
    const dx = targetX - startX;
    await tween(
      this.ticker,
      durationMs,
      (t) => {
        this.view.x = startX + dx * t;
        // squash-and-stretch hop arc
        const arc = Math.sin(Math.PI * t);
        this.view.scale.set(1 - arc * 0.12, 1 + arc * 0.16);
        this.body.y = -arc * 26;
      },
      easeOutQuad,
    );
    this.view.scale.set(1, 1);
    this.body.y = 0;
    this.idleEnabled = true;
  }

  async dieFlatten(durationMs: number): Promise<void> {
    this.idleEnabled = false;
    await tween(this.ticker, durationMs, (t) => {
      this.view.scale.set(1 + t * 0.6, 1 - t * 0.82);
      this.body.y = t * 18;
    });
  }

  async dieSplash(durationMs: number): Promise<void> {
    this.idleEnabled = false;
    await tween(this.ticker, durationMs, (t) => {
      this.body.y = t * 40;
      this.view.scale.set(1 - t * 0.3, 1 - t * 0.3);
      this.view.alpha = 1 - t;
    });
  }

  async fistPump(durationMs: number): Promise<void> {
    this.idleEnabled = false;
    await tween(
      this.ticker,
      durationMs,
      (t) => {
        const bounce = Math.sin(Math.PI * t);
        this.view.scale.set(1 - bounce * 0.1, 1 + bounce * 0.22);
        this.body.y = -bounce * 20;
        this.arm.alpha = Math.min(1, bounce * 1.6);
        this.arm.y = -BEAR_HEIGHT + 24 - bounce * 22;
      },
      easeOutBack,
    );
    this.view.scale.set(1, 1);
    this.body.y = 0;
    this.arm.alpha = 0;
    this.idleEnabled = true;
  }
}
