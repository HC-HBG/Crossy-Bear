import { MathEngine, type Difficulty, type StepOutcome, type CashOutResult, type Rig } from "./engine/mathEngine";

/**
 * Explicit round/session state machine. IDLE -> ROUND_ACTIVE -> RESOLVING_STEP
 * -> STEP_WON | DEAD | CASHED_OUT, then back to IDLE/DEAD/CASHED_OUT loop.
 * Every mutating method checks the current phase synchronously before doing
 * anything async, so a second input arriving while a step is already
 * resolving is a no-op — first input wins.
 */
export type Phase = "IDLE" | "ROUND_ACTIVE" | "RESOLVING_STEP" | "STEP_WON" | "DEAD" | "CASHED_OUT";

export interface SessionSnapshot {
  phase: Phase;
  balance: number;
  bestWin: number;
  bet: number;
  difficulty: Difficulty;
  lastOutcome: StepOutcome | null;
  lastCashOut: CashOutResult | null;
  stepsCompleted: number;
  totalSteps: number;
  turbo: boolean;
  muted: boolean;
}

type Listener = (snap: SessionSnapshot) => void;

const BALANCE_KEY = "crossyBear.balance";
const BEST_WIN_KEY = "crossyBear.bestWin";
const DEFAULT_BALANCE = 1000;

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage may be unavailable (private mode) — demo-only persistence, safe to ignore.
    // NOTE: production would need a real account/wallet backend, not localStorage.
  }
}

export class GameSession {
  private phase: Phase = "IDLE";
  private engine: MathEngine | null = null;
  private balance: number;
  private bestWin: number;
  private bet = 10;
  private difficulty: Difficulty = "medium";
  private lastOutcome: StepOutcome | null = null;
  private lastCashOut: CashOutResult | null = null;
  private stepsCompleted = 0;
  private totalSteps = 0;
  private turbo = false;
  private muted = false;
  private listeners = new Set<Listener>();
  private readonly rig: Rig;
  private readonly seed?: number;

  constructor(opts: { rig?: Rig; seed?: number } = {}) {
    this.rig = opts.rig ?? null;
    this.seed = opts.seed;
    this.balance = readNumber(BALANCE_KEY, DEFAULT_BALANCE);
    this.bestWin = readNumber(BEST_WIN_KEY, 0);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }

  snapshot(): SessionSnapshot {
    return {
      phase: this.phase,
      balance: this.balance,
      bestWin: this.bestWin,
      bet: this.bet,
      difficulty: this.difficulty,
      lastOutcome: this.lastOutcome,
      lastCashOut: this.lastCashOut,
      stepsCompleted: this.stepsCompleted,
      totalSteps: this.totalSteps,
      turbo: this.turbo,
      muted: this.muted,
    };
  }

  private isEditable(): boolean {
    return this.phase === "IDLE" || this.phase === "DEAD" || this.phase === "CASHED_OUT";
  }

  setBet(bet: number): void {
    if (!this.isEditable()) return;
    this.bet = Math.max(0.1, Math.round(bet * 100) / 100);
    this.emit();
  }

  setDifficulty(difficulty: Difficulty): void {
    if (!this.isEditable()) return;
    this.difficulty = difficulty;
    this.emit();
  }

  setTurbo(turbo: boolean): void {
    this.turbo = turbo;
    this.emit();
  }

  toggleTurbo(): void {
    this.setTurbo(!this.turbo);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.emit();
  }

  toggleMuted(): void {
    this.setMuted(!this.muted);
  }

  canStart(): boolean {
    return this.isEditable() && this.bet > 0 && this.bet <= this.balance;
  }

  async startRound(): Promise<void> {
    if (!this.canStart()) return;
    this.phase = "ROUND_ACTIVE";
    this.balance = Math.round((this.balance - this.bet) * 100) / 100;
    writeNumber(BALANCE_KEY, this.balance);
    this.lastCashOut = null;
    this.lastOutcome = null;
    this.stepsCompleted = 0;
    this.engine = new MathEngine({ seed: this.seed, rig: this.rig });
    this.phase = "RESOLVING_STEP";
    this.emit();
    const outcome = await this.engine.startRound(this.bet, this.difficulty);
    this.applyOutcome(outcome);
  }

  async hop(): Promise<void> {
    if (this.phase !== "STEP_WON" || !this.engine) return;
    const engine = this.engine;
    this.phase = "RESOLVING_STEP";
    this.emit();
    const outcome = await engine.step();
    this.applyOutcome(outcome);
  }

  async cashOut(): Promise<void> {
    if (this.phase !== "STEP_WON" || !this.engine) return;
    const engine = this.engine;
    this.phase = "CASHED_OUT";
    this.emit();
    const result = await engine.cashOut();
    this.settleWin(result.amount);
    this.lastCashOut = result;
    this.emit();
  }

  private settleWin(amount: number): void {
    this.balance = Math.round((this.balance + amount) * 100) / 100;
    if (amount > this.bestWin) {
      this.bestWin = amount;
      writeNumber(BEST_WIN_KEY, this.bestWin);
    }
    writeNumber(BALANCE_KEY, this.balance);
  }

  private applyOutcome(outcome: StepOutcome): void {
    this.lastOutcome = outcome;
    this.totalSteps = outcome.totalSteps;

    if (!outcome.survived) {
      this.phase = "DEAD";
      this.emit();
      return;
    }

    this.stepsCompleted = outcome.stepNumber;

    if (outcome.isFinalStep) {
      this.phase = "CASHED_OUT";
      this.settleWin(outcome.amount);
      this.lastCashOut = { multiplier: outcome.multiplier, amount: outcome.amount, stepNumber: outcome.stepNumber };
      this.emit();
      return;
    }

    this.phase = "STEP_WON";
    this.emit();
  }
}
