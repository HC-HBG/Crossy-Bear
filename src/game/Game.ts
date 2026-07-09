import { Application, Container, Graphics } from "pixi.js";
import { GameSession, type SessionSnapshot, type Phase } from "../state";
import { COLORS, LANE_WIDTH } from "./constants";
import { buildLaneField, type LaneField } from "./Lanes";
import { Bear, preloadBearTextures } from "./Bear";
import { buildVehicle, randomVehicleKind } from "./Vehicles";
import { spawnCoinFountain, cameraPunchIn } from "./Celebration";
import { tween, easeOutQuad } from "./tween";

const HOP_MS = 220;
const DEATH_MS = 320;
const CASHOUT_MS = 420;
const TURBO_MS = 40;

export class Game {
  readonly app: Application;
  private session: GameSession;
  private world: Container;
  private laneField: LaneField | null = null;
  private bear: Bear;
  private cameraX = 0;
  private lastPhase: Phase = "IDLE";
  private lastStepsCompleted = 0;
  private animQueue: Promise<void> = Promise.resolve();
  private hitVehicleSeed = 0;

  private constructor(app: Application, session: GameSession, bearTextures: Awaited<ReturnType<typeof preloadBearTextures>>) {
    this.app = app;
    this.session = session;
    this.world = new Container();
    app.stage.addChild(this.world);
    this.bear = new Bear(app.ticker, bearTextures);
    this.world.addChild(this.bear.view);
    app.ticker.add(this.onTick);
    session.subscribe((snap) => this.handleSnapshot(snap));
  }

  static async create(canvasHost: HTMLElement, session: GameSession): Promise<Game> {
    const app = new Application();
    const [, bearTextures] = await Promise.all([
      app.init({
        resizeTo: canvasHost,
        backgroundColor: COLORS.indigo,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      }),
      preloadBearTextures(),
    ]);
    canvasHost.appendChild(app.canvas);
    return new Game(app, session, bearTextures);
  }

  /** Primary input: hop if the bear is at the kerb or mid-flight, otherwise start a new round. */
  onPrimaryInput(): void {
    const snap = this.session.snapshot();
    if (snap.phase === "ROUND_ACTIVE" || snap.phase === "STEP_WON") {
      void this.session.hop();
    } else if (this.session.canStart()) {
      void this.session.startRound();
    }
  }

  /** Available vertical room for the lane strip between the HUD header and footer. */
  private laneDepth(): number {
    return Math.max(220, Math.min(480, this.app.screen.height - 170));
  }

  private worldY(): number {
    return this.app.screen.height / 2;
  }

  private onTick = (): void => {
    const desiredCameraX = -(this.bear.view.x - this.app.screen.width * 0.35);
    const lerp = Math.min(1, this.app.ticker.deltaMS / 160);
    this.cameraX += (desiredCameraX - this.cameraX) * lerp;
    this.world.x = this.cameraX;
    this.world.y = this.worldY();
    this.cullOffscreenLanes();
  };

  /**
   * Ladders now run up to 40 lanes long. Only the handful near the camera
   * are ever visible, so skip rendering (and its draw calls) for the rest
   * — cheap to check, and keeps frame cost proportional to what's on
   * screen instead of the whole board.
   */
  private cullOffscreenLanes(): void {
    if (!this.laneField) return;
    const margin = LANE_WIDTH * 2;
    const viewLeft = -this.world.x - margin;
    const viewRight = -this.world.x + this.app.screen.width + margin;
    for (const lane of this.laneField.lanes) {
      const x = lane.container.x;
      lane.container.renderable = x + LANE_WIDTH / 2 >= viewLeft && x - LANE_WIDTH / 2 <= viewRight;
    }
  }

  private duration(base: number, snap: SessionSnapshot): number {
    return snap.turbo ? TURBO_MS : base;
  }

  private queue(fn: () => Promise<void>): void {
    this.animQueue = this.animQueue.then(fn);
  }

  private handleSnapshot(snap: SessionSnapshot): void {
    const isNewRound =
      snap.phase === "ROUND_ACTIVE" &&
      (this.lastPhase === "IDLE" || this.lastPhase === "DEAD" || this.lastPhase === "CASHED_OUT");

    if (isNewRound) {
      this.animQueue = Promise.resolve();
      this.startNewRound(snap);
    }

    if (snap.phase === "STEP_WON" && snap.stepsCompleted !== this.lastStepsCompleted) {
      this.lastStepsCompleted = snap.stepsCompleted;
      this.queue(() => this.animateSurvive(snap));
    }

    if (snap.phase === "DEAD" && this.lastPhase !== "DEAD") {
      this.queue(() => this.animateDeath(snap));
    }

    if (snap.phase === "CASHED_OUT" && this.lastPhase !== "CASHED_OUT") {
      this.queue(() => this.animateCashOut(snap));
    }

    this.lastPhase = snap.phase;
  }

  private startNewRound(snap: SessionSnapshot): void {
    this.laneField?.destroy();
    this.laneField = buildLaneField(snap.difficulty, this.app.ticker, this.laneDepth());
    this.world.addChildAt(this.laneField.container, 0);
    this.bear.reset(this.laneField.laneX(0));
    this.cameraX = -(this.bear.view.x - this.app.screen.width * 0.35);
    this.world.x = this.cameraX;
    this.world.y = this.worldY();
    this.lastStepsCompleted = 0;
  }

  private async animateSurvive(snap: SessionSnapshot): Promise<void> {
    if (!this.laneField) return;
    const stepNumber = snap.stepsCompleted;
    const targetX = this.laneField.laneX(stepNumber);
    await this.bear.hopTo(targetX, this.duration(HOP_MS, snap));
    const lane = this.laneField.lanes[stepNumber - 1];
    if (lane) lane.resolved = true;
  }

  private async animateDeath(snap: SessionSnapshot): Promise<void> {
    if (!this.laneField || !snap.lastOutcome) return;
    const outcome = snap.lastOutcome;
    const targetX = this.laneField.laneX(outcome.stepNumber);
    const dur = this.duration(HOP_MS, snap);
    await this.bear.hopTo(targetX, dur * 0.6);
    if (outcome.zone === "road") {
      // a vehicle visibly arrives and comically flattens the bear — never a dodge, just a reveal
      const vehicle = await this.spawnHitVehicleArrive(targetX, Math.max(90, dur * 0.5));
      await this.bear.dieFlatten(this.duration(DEATH_MS, snap));
      void this.driveVehicleOff(vehicle);
    } else {
      this.spawnSplashRipples(targetX);
      await this.bear.dieSplash(this.duration(DEATH_MS, snap));
    }
  }

  private async animateCashOut(snap: SessionSnapshot): Promise<void> {
    if (!this.laneField) return;
    const isBigWin = snap.lastOutcome?.isFinalStep === true;
    // lastCashOut isn't populated on the snapshot this handler actually reacts to (see
    // handleSnapshot's CASHED_OUT branch — it fires on the phase-flip emit, before cashOut()'s
    // async engine.cashOut() resolves and updates lastCashOut). lastOutcome.multiplier is the
    // just-survived step's cashable multiplier, which is exactly what the round cashes out at,
    // and it's already fresh at that point for both the voluntary and forced-final paths.
    const celebrateBig = (snap.lastOutcome?.multiplier ?? 0) >= 2;

    if (isBigWin) {
      const targetX = this.laneField.laneX(this.laneField.totalSteps + 1);
      await this.bear.hopTo(targetX, this.duration(HOP_MS, snap));
    }

    if (isBigWin && !snap.turbo) {
      const focal = this.bear.view.getGlobalPosition();
      spawnCoinFountain(this.app.stage, this.app.ticker, focal.x, focal.y - 50);
      await Promise.all([
        this.bear.fistPump(CASHOUT_MS, celebrateBig),
        cameraPunchIn(this.app.stage, this.app.ticker, focal),
      ]);
    } else {
      await this.bear.fistPump(this.duration(CASHOUT_MS, snap), celebrateBig);
    }
  }

  private async spawnHitVehicleArrive(targetX: number, arrivalMs: number): Promise<Container> {
    const vehicle = buildVehicle(randomVehicleKind(this.hitVehicleSeed++));
    vehicle.rotation = Math.PI / 2;
    const depth = this.laneDepth();
    const fromTop = Math.random() < 0.5;
    const startY = fromTop ? -depth / 2 - 70 : depth / 2 + 70;
    vehicle.x = targetX;
    vehicle.y = startY;
    this.world.addChild(vehicle);
    await tween(this.app.ticker, arrivalMs, (t) => {
      vehicle.y = startY * (1 - t);
    }, easeOutQuad);
    return vehicle;
  }

  private async driveVehicleOff(vehicle: Container): Promise<void> {
    const direction = Math.random() < 0.5 ? -1 : 1;
    await tween(this.app.ticker, 260, (t) => {
      vehicle.y = direction * t * 260;
      vehicle.alpha = 1 - t * 0.5;
    });
    vehicle.destroy();
  }

  private spawnSplashRipples(x: number): void {
    for (let i = 0; i < 3; i++) {
      const ring = new Graphics();
      ring.x = x;
      this.world.addChild(ring);
      const delayMs = i * 90;
      void (async () => {
        if (delayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        await tween(this.app.ticker, 480, (t) => {
          ring.clear();
          const r = 6 + t * 34;
          ring.circle(0, 0, r).stroke({ width: 3, color: 0xbfe0ff, alpha: 0.5 * (1 - t) });
        });
        ring.destroy();
      })();
    }
  }
}
