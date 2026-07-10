import { Application, Container, Graphics } from "pixi.js";
import { GameSession, type SessionSnapshot, type Phase } from "../state";
import { COLORS, LANE_WIDTH } from "./constants";
import { buildLaneField, type LaneField } from "./Lanes";
import { Bear, preloadBearTextures } from "./Bear";
import { buildVehicle, randomVehicleKind } from "./Vehicles";
import { spawnCoinFountain, spawnConfettiBurst, cameraPunchIn } from "./Celebration";
import { tween, easeOutQuad } from "./tween";

const HOP_MS = 220;
const DEATH_MS = 320;
const CASHOUT_MS = 420;
const TURBO_MS = 40;
// Fraction of the viewport width where the bear sits horizontally, so more
// screen shows lanes ahead than behind (~5 lanes ahead at typical widths).
const CAMERA_ANCHOR = 0.35;

export class Game {
  readonly app: Application;
  private session: GameSession;
  private world: Container;
  private boardMask: Graphics;
  private laneField: LaneField | null = null;
  private laneFieldDifficulty: SessionSnapshot["difficulty"] | null = null;
  private bear: Bear;
  private cameraX = 0;
  private lastPhase: Phase = "IDLE";
  private lastDifficulty: SessionSnapshot["difficulty"] | null = null;
  private lastStepsCompleted = 0;
  private animQueue: Promise<void> = Promise.resolve();
  private hitVehicleSeed = 0;

  private constructor(app: Application, session: GameSession, bearTextures: Awaited<ReturnType<typeof preloadBearTextures>>) {
    this.app = app;
    this.session = session;
    this.world = new Container();
    app.stage.addChild(this.world);
    // Fixed in screen space (not a child of `world`) so it clips panned
    // content to the board's visible rectangle regardless of camera x —
    // vehicles/props can freely spawn/animate beyond its edges off-screen.
    this.boardMask = new Graphics();
    app.stage.addChild(this.boardMask);
    this.world.mask = this.boardMask;
    // Tap-anywhere-on-board input lives on the stage itself (not a parallel
    // DOM listener on canvasHost) so it and the active badge's own
    // pointerdown share one synchronous Pixi event dispatch: a click that
    // lands on the badge triggers only the badge's handler (which stops
    // propagation), everything else falls through to this stage-wide
    // fallback. A DOM listener firing independently of Pixi's own event
    // queue can't be synchronized against it, which previously let a single
    // click commit two steps (the DOM path resolving one hop fully before
    // Pixi's own dispatch fired the second).
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointerdown", () => this.onPrimaryInput());
    this.bear = new Bear(app.ticker, bearTextures);
    this.world.addChild(this.bear.view);
    // Board is visible immediately on load — never a blank/navy screen
    // waiting for Start — matching whatever difficulty is pre-selected.
    this.ensureLaneField(session.snapshot().difficulty);
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

  /**
   * Tapping the active (next-lane) badge is a dedicated hop trigger — unlike
   * onPrimaryInput, it never falls back to starting a round, since a badge
   * only ever renders once a round is already active. Routes through the
   * exact same session.hop() phase guard as every other input, so it's
   * always safe to fire alongside a board-wide tap on the same click.
   */
  private onHopBadgeClick(): void {
    void this.session.hop();
  }

  /**
   * The board's vertical band, measured from the actual rendered HUD bars
   * (not a fixed heuristic) so it fills edge to edge between them with no
   * dead navy margin above/below, at any viewport size or breakpoint.
   */
  private boardBounds(): { top: number; height: number } {
    const screenH = this.app.screen.height;
    const topBar = document.getElementById("hud-top");
    const bottomBar = document.getElementById("hud-bottom");
    const top = topBar ? topBar.getBoundingClientRect().bottom : 60;
    const bottom = bottomBar ? bottomBar.getBoundingClientRect().top : screenH - 120;
    const height = Math.max(160, bottom - top);
    return { top, height };
  }

  private laneDepth(): number {
    return this.boardBounds().height;
  }

  private worldY(): number {
    const { top, height } = this.boardBounds();
    return top + height / 2;
  }

  private onTick = (): void => {
    const desiredCameraX = -(this.bear.view.x - this.app.screen.width * CAMERA_ANCHOR);
    const lerp = Math.min(1, this.app.ticker.deltaMS / 160);
    this.cameraX += (desiredCameraX - this.cameraX) * lerp;
    this.world.x = this.cameraX;
    this.world.y = this.worldY();
    this.updateBoardMask();
    this.cullOffscreenLanes();
  };

  /** Clips `world` (lanes, vehicles, bear, ripples) to the board's fixed screen-space rectangle. */
  private updateBoardMask(): void {
    const depth = this.laneDepth();
    const top = this.worldY() - depth / 2;
    this.boardMask.clear();
    this.boardMask.rect(0, top, this.app.screen.width, depth).fill(0xffffff);
  }

  /**
   * Ladders now run up to 40 lanes long, but the bear only ever moves
   * forward, so "behind the camera" is naturally bounded by at most 40
   * lanes — cheap enough to always keep rendered (and it keeps logs/lane
   * decoration visible behind the bear, not just ahead of it). Only lanes
   * far ahead (not yet revealed) are worth culling for draw-call cost.
   *
   * Lane labels get a finer per-frame treatment on top of that coarse cull:
   * a label whose screen-space bounds aren't fully inside the viewport
   * fades out toward its overlapping edge, so the furthest visible lane's
   * label eases in as it scrolls into view instead of rendering a
   * mid-glyph clip at the screen edge.
   */
  private cullOffscreenLanes(): void {
    if (!this.laneField) return;
    const margin = LANE_WIDTH * 2;
    const viewRight = -this.world.x + this.app.screen.width + margin;
    const FADE_ZONE = 60;
    for (const lane of this.laneField.lanes) {
      const x = lane.container.x;
      const renderable = x - LANE_WIDTH / 2 <= viewRight;
      lane.container.renderable = renderable;
      if (!renderable) continue;

      const screenX = x + this.world.x;
      const halfWidth = lane.label.width / 2;
      const left = screenX - halfWidth;
      const right = screenX + halfWidth;
      let alpha = 1;
      if (right > this.app.screen.width) {
        alpha = Math.max(0, 1 - (right - this.app.screen.width) / FADE_ZONE);
      } else if (left < 0) {
        alpha = Math.max(0, 1 - -left / FADE_ZONE);
      }
      lane.label.alpha = alpha;
    }
  }

  private duration(base: number, snap: SessionSnapshot): number {
    return snap.turbo ? TURBO_MS : base;
  }

  private queue(fn: () => Promise<void>): void {
    this.animQueue = this.animQueue.then(fn);
  }

  private handleSnapshot(snap: SessionSnapshot): void {
    if (snap.difficulty !== this.lastDifficulty) {
      this.lastDifficulty = snap.difficulty;
      this.bear.setSkin(snap.difficulty === "daredevil" ? "daredevil" : "default");
      this.ensureLaneField(snap.difficulty);
    }

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

  /**
   * Builds the board once per difficulty and keeps reusing it — a fresh
   * round only resets the ladder's resolved/upcoming badges via
   * updateProgress(0), it doesn't tear down and rebuild the scene. That
   * keeps the environment on screen at all times (no blank load, no
   * re-randomized decorations popping between rounds) and is what makes
   * river logs stay put instead of jumping to new positions every round.
   */
  private ensureLaneField(difficulty: SessionSnapshot["difficulty"]): void {
    if (this.laneField && this.laneFieldDifficulty === difficulty) return;
    this.laneFieldDifficulty = difficulty;
    this.laneField?.destroy();
    this.laneField = buildLaneField(
      difficulty,
      this.app.ticker,
      this.laneDepth(),
      this.app.screen.width,
      () => this.onHopBadgeClick(),
    );
    this.world.addChildAt(this.laneField.container, 0);
    this.bear.reset(this.laneField.laneX(0));
    this.cameraX = -(this.bear.view.x - this.app.screen.width * CAMERA_ANCHOR);
    this.world.x = this.cameraX;
    this.world.y = this.worldY();
  }

  private startNewRound(snap: SessionSnapshot): void {
    this.ensureLaneField(snap.difficulty);
    const laneField = this.laneField;
    if (!laneField) return;
    laneField.updateProgress(0, true);
    this.bear.reset(laneField.laneX(0));
    this.cameraX = -(this.bear.view.x - this.app.screen.width * CAMERA_ANCHOR);
    this.world.x = this.cameraX;
    this.world.y = this.worldY();
    this.lastStepsCompleted = 0;
  }

  private async animateSurvive(snap: SessionSnapshot): Promise<void> {
    if (!this.laneField) return;
    const stepNumber = snap.stepsCompleted;
    const targetX = this.laneField.laneX(stepNumber);
    await this.bear.hopTo(targetX, this.duration(HOP_MS, snap));
    this.laneField.updateProgress(stepNumber, true);
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
      this.laneField.sinkLogAt(outcome.stepNumber);
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
    const multiplier = snap.lastOutcome?.multiplier ?? 0;
    const celebrateBig = multiplier >= 2;
    const confettiBig = multiplier >= 5;

    if (isBigWin) {
      const targetX = this.laneField.laneX(this.laneField.totalSteps + 1);
      await this.bear.hopTo(targetX, this.duration(HOP_MS, snap));
    }

    const focal = this.bear.view.getGlobalPosition();
    if (confettiBig && !snap.turbo) {
      spawnConfettiBurst(this.app.stage, this.app.ticker, focal.x, focal.y - 60);
    }

    if (isBigWin && !snap.turbo) {
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
    // Always facing down, always arriving from above — matches the ambient
    // lane traffic's top-to-bottom-only rule, no exceptions.
    vehicle.rotation = Math.PI / 2;
    const depth = this.laneDepth();
    const startY = -depth / 2 - 70;
    vehicle.x = targetX;
    vehicle.y = startY;
    this.world.addChild(vehicle);
    await tween(this.app.ticker, arrivalMs, (t) => {
      vehicle.y = startY * (1 - t);
    }, easeOutQuad);
    return vehicle;
  }

  private async driveVehicleOff(vehicle: Container): Promise<void> {
    // Continues downward after the hit, same direction it arrived from
    // (vehicle.y is ~0 at the start of this tween, where it hit the bear).
    await tween(this.app.ticker, 260, (t) => {
      vehicle.y = t * 260;
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
