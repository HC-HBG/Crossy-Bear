/**
 * Isolated math/outcome engine for Crossy Bear.
 *
 * This module owns all randomness, probability, and payout math. It has no
 * dependency on Pixi or the DOM so it can later be swapped for a real RGS
 * (Remote Game Server) client without touching any rendering code. The rest
 * of the client must treat this module as a black box: call startRound(),
 * step(), cashOut(), and read the returned results — never reach into
 * private state.
 */

export type Difficulty = "easy" | "medium" | "hard" | "daredevil";
export type Zone = "road" | "river";
export type Rig = "win" | "lose" | null;

export interface DifficultyDef {
  id: Difficulty;
  label: string;
  roadSteps: number;
  riverSteps: number;
  roadP: number;
  riverP: number;
}

/** Target return-to-player used to derive the multiplier ladder. */
export const RTP = 0.96;

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { id: "easy", label: "Easy", roadSteps: 14, riverSteps: 6, roadP: 0.96, riverP: 0.94 },
  medium: { id: "medium", label: "Medium", roadSteps: 9, riverSteps: 5, roadP: 0.875, riverP: 0.85 },
  hard: { id: "hard", label: "Hard", roadSteps: 6, riverSteps: 4, roadP: 0.79, riverP: 0.74 },
  daredevil: { id: "daredevil", label: "Daredevil", roadSteps: 4, riverSteps: 4, roadP: 0.48, riverP: 0.42 },
};

export function totalSteps(def: DifficultyDef): number {
  return def.roadSteps + def.riverSteps;
}

/** Zone for a given 0-based step index. */
export function zoneForStep(def: DifficultyDef, stepIndex: number): Zone {
  return stepIndex < def.roadSteps ? "road" : "river";
}

/** Per-step survival probability for a given 0-based step index. */
export function survivalProbForStep(def: DifficultyDef, stepIndex: number): number {
  return zoneForStep(def, stepIndex) === "road" ? def.roadP : def.riverP;
}

/**
 * Multiplier ladder: table[i] is the payout multiplier after surviving i+1
 * steps, i.e. multiplier = RTP / (p1 * p2 * ... * p(i+1)), rounded to 2dp.
 */
export function buildMultiplierTable(def: DifficultyDef): number[] {
  const n = totalSteps(def);
  const table: number[] = [];
  let cumulativeP = 1;
  for (let i = 0; i < n; i++) {
    cumulativeP *= survivalProbForStep(def, i);
    table.push(Math.round((RTP / cumulativeP) * 100) / 100);
  }
  return table;
}

/** Seedable PRNG (mulberry32). Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export interface StepOutcome {
  stepNumber: number; // 1-based
  zone: Zone;
  survived: boolean;
  multiplier: number; // current cashable multiplier (0 if dead)
  amount: number; // bet * multiplier
  nextMultiplier: number | null; // null if dead, or if this step was final
  isFinalStep: boolean; // true if this survived step reached the far bank (forced cash-out)
  totalSteps: number;
}

export interface CashOutResult {
  multiplier: number;
  amount: number;
  stepNumber: number;
}

type RoundStatus = "idle" | "active" | "dead" | "cashed";

export class MathEngine {
  private rng: () => number;
  private rig: Rig;
  private def: DifficultyDef | null = null;
  private table: number[] = [];
  private bet = 0;
  private stepIndex = 0; // steps survived so far (0-based count)
  private status: RoundStatus = "idle";
  readonly seed: number;

  constructor(opts: { seed?: number; rig?: Rig } = {}) {
    this.seed = opts.seed ?? randomSeed();
    this.rng = mulberry32(this.seed);
    this.rig = opts.rig ?? null;
  }

  /** Returns the full multiplier ladder for a difficulty (also used to render the paytable). */
  static tableFor(difficulty: Difficulty): number[] {
    return buildMultiplierTable(DIFFICULTIES[difficulty]);
  }

  /** Starts a round and immediately resolves the first step — no dead click. */
  async startRound(bet: number, difficulty: Difficulty): Promise<StepOutcome> {
    if (bet <= 0) throw new Error("bet must be positive");
    this.def = DIFFICULTIES[difficulty];
    this.table = buildMultiplierTable(this.def);
    this.bet = bet;
    this.stepIndex = 0;
    this.status = "active";
    return this.resolveStep();
  }

  /** Advances one lane. Throws if the round is not active. */
  async step(): Promise<StepOutcome> {
    if (this.status !== "active") throw new Error("round is not active");
    return this.resolveStep();
  }

  /** Cashes out at the current ladder value. Throws if the round is not active. */
  async cashOut(): Promise<CashOutResult> {
    if (this.status !== "active") throw new Error("round is not active");
    this.status = "cashed";
    const multiplier = this.stepIndex === 0 ? 1 : this.table[this.stepIndex - 1];
    return {
      multiplier,
      amount: Math.round(this.bet * multiplier * 100) / 100,
      stepNumber: this.stepIndex,
    };
  }

  private resolveStep(): StepOutcome {
    const def = this.def!;
    const n = totalSteps(def);
    const idx = this.stepIndex; // 0-based index of the step being resolved
    const zone = zoneForStep(def, idx);
    const p = survivalProbForStep(def, idx);

    let survived: boolean;
    if (this.rig === "win") survived = true;
    else if (this.rig === "lose") survived = false;
    else survived = this.rng() < p;

    if (!survived) {
      this.status = "dead";
      return {
        stepNumber: idx + 1,
        zone,
        survived: false,
        multiplier: 0,
        amount: 0,
        nextMultiplier: null,
        isFinalStep: false,
        totalSteps: n,
      };
    }

    this.stepIndex = idx + 1;
    const multiplier = this.table[idx];
    const isFinalStep = this.stepIndex >= n;
    if (isFinalStep) this.status = "cashed";

    return {
      stepNumber: idx + 1,
      zone,
      survived: true,
      multiplier,
      amount: Math.round(this.bet * multiplier * 100) / 100,
      nextMultiplier: isFinalStep ? null : this.table[this.stepIndex],
      isFinalStep,
      totalSteps: n,
    };
  }
}
