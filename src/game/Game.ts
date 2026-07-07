import { Application, Container } from "pixi.js";
import { GameSession, type SessionSnapshot, type Phase } from "../state";
import { COLORS } from "./constants";
import { buildLaneField, type LaneField } from "./Lanes";
import { Bear } from "./Bear";

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

  private constructor(app: Application, session: GameSession) {
    this.app = app;
    this.session = session;
    this.world = new Container();
    app.stage.addChild(this.world);
    this.bear = new Bear(app.ticker);
    this.world.addChild(this.bear.view);
    app.ticker.add(this.onTick);
    session.subscribe((snap) => this.handleSnapshot(snap));
  }

  static async create(canvasHost: HTMLElement, session: GameSession): Promise<Game> {
    const app = new Application();
    await app.init({
      resizeTo: canvasHost,
      backgroundColor: COLORS.indigo,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    canvasHost.appendChild(app.canvas);
    return new Game(app, session);
  }

  /** Primary input: hop if a round is mid-flight, otherwise start a new round. */
  onPrimaryInput(): void {
    const snap = this.session.snapshot();
    if (snap.phase === "STEP_WON") {
      void this.session.hop();
    } else if (this.session.canStart()) {
      void this.session.startRound();
    }
  }

  private onTick = (): void => {
    const desiredCameraX = -(this.bear.view.x - this.app.screen.width * 0.35);
    const lerp = Math.min(1, this.app.ticker.deltaMS / 160);
    this.cameraX += (desiredCameraX - this.cameraX) * lerp;
    this.world.x = this.cameraX;
    this.world.y = this.app.screen.height * 0.58;
  };

  private duration(base: number, snap: SessionSnapshot): number {
    return snap.turbo ? TURBO_MS : base;
  }

  private queue(fn: () => Promise<void>): void {
    this.animQueue = this.animQueue.then(fn);
  }

  private handleSnapshot(snap: SessionSnapshot): void {
    const isNewRound =
      snap.phase === "RESOLVING_STEP" &&
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
    this.laneField = buildLaneField(snap.difficulty, this.app.ticker);
    this.world.addChildAt(this.laneField.container, 0);
    this.bear.reset(this.laneField.laneX(0));
    this.cameraX = -(this.bear.view.x - this.app.screen.width * 0.35);
    this.world.x = this.cameraX;
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
    await this.bear.hopTo(targetX, this.duration(HOP_MS, snap) * 0.6);
    if (outcome.zone === "road") {
      await this.bear.dieFlatten(this.duration(DEATH_MS, snap));
    } else {
      await this.bear.dieSplash(this.duration(DEATH_MS, snap));
    }
  }

  private async animateCashOut(snap: SessionSnapshot): Promise<void> {
    if (!this.laneField) return;
    if (snap.lastOutcome?.isFinalStep) {
      const targetX = this.laneField.laneX(this.laneField.totalSteps + 1);
      await this.bear.hopTo(targetX, this.duration(HOP_MS, snap));
    }
    await this.bear.fistPump(this.duration(CASHOUT_MS, snap));
  }
}
