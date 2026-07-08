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
  /** Total number of lanes in the ladder. */
  steps: number;
  /** Daredevil-only: a special-cased survival probability for step 1, outside the linear decay. */
  firstStepP?: number;
  /** Survival probability at the start of the linear-decay schedule (step 1, or step 2 when firstStepP is set). */
  decayStartP: number;
  /**
   * Calibration target: the approximate final-step multiplier the decay
   * schedule's end probability is solved for. The end probability itself is
   * not stored — it's derived at runtime by calibrateEndProb() so the
   * schedule is always internally consistent with RTP and the step count.
   */
  targetCeiling: number;
}

/** Target return-to-player used to derive the multiplier ladder. */
export const RTP = 0.96;

/** Lanes per alternating road/river zone block (all difficulties' step counts are multiples of this). */
export const ZONE_BLOCK_SIZE = 5;

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { id: "easy", label: "Easy", steps: 40, decayStartP: 0.93, targetCeiling: 1000 },
  medium: { id: "medium", label: "Medium", steps: 30, decayStartP: 0.875, targetCeiling: 2500 },
  hard: { id: "hard", label: "Hard", steps: 20, decayStartP: 0.78, targetCeiling: 10000 },
  daredevil: {
    id: "daredevil",
    label: "Daredevil",
    steps: 10,
    firstStepP: 0.48,
    decayStartP: 0.4,
    targetCeiling: 50000,
  },
};

export function totalSteps(def: DifficultyDef): number {
  return def.steps;
}

/**
 * Zone for a given 0-based step index — alternates in ZONE_BLOCK_SIZE-lane
 * bands, starting with road. Takes a DifficultyDef (unused today) so a
 * future difficulty could define its own zone pattern without changing the
 * call sites.
 */
export function zoneForStep(_def: DifficultyDef, stepIndex: number): Zone {
  const block = Math.floor(stepIndex / ZONE_BLOCK_SIZE);
  return block % 2 === 0 ? "road" : "river";
}

function linearDecayProduct(startP: number, endP: number, steps: number): number {
  let product = 1;
  for (let i = 0; i < steps; i++) {
    const p = steps === 1 ? endP : startP + (endP - startP) * (i / (steps - 1));
    product *= p;
  }
  return product;
}

/**
 * Solves for the survival probability at the end of the linear-decay
 * schedule such that the final-step multiplier lands on `targetCeiling`,
 * holding the start probability, step count, and any fixed extra factor
 * (Daredevil's special-cased first step) constant. The cumulative survival
 * product — and so the resulting ceiling — is strictly monotonic in the end
 * probability, so bisection converges quickly and deterministically.
 */
function calibrateEndProb(startP: number, steps: number, targetCeiling: number, extraFactor = 1): number {
  let lo = 0.0001;
  let hi = startP;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const cumP = extraFactor * linearDecayProduct(startP, mid, steps);
    const ceiling = RTP / cumP;
    if (ceiling > targetCeiling) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const scheduleCache = new Map<Difficulty, number[]>();

/** Full per-step survival-probability schedule for a difficulty. Memoized — calibration is a search, not O(1). */
function survivalSchedule(def: DifficultyDef): number[] {
  const cached = scheduleCache.get(def.id);
  if (cached) return cached;

  const decaySteps = def.firstStepP !== undefined ? def.steps - 1 : def.steps;
  const endP = calibrateEndProb(def.decayStartP, decaySteps, def.targetCeiling, def.firstStepP ?? 1);

  const schedule: number[] = [];
  if (def.firstStepP !== undefined) schedule.push(def.firstStepP);
  for (let i = 0; i < decaySteps; i++) {
    const p = decaySteps === 1 ? endP : def.decayStartP + (endP - def.decayStartP) * (i / (decaySteps - 1));
    schedule.push(p);
  }

  scheduleCache.set(def.id, schedule);
  return schedule;
}

/** Per-step survival probability for a given 0-based step index. */
export function survivalProbForStep(def: DifficultyDef, stepIndex: number): number {
  return survivalSchedule(def)[stepIndex];
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

  /** Locks in the bet and difficulty and arms the round. Resolves no step — the bear waits at the kerb. */
  async startRound(bet: number, difficulty: Difficulty): Promise<void> {
    if (bet <= 0) throw new Error("bet must be positive");
    this.def = DIFFICULTIES[difficulty];
    this.table = buildMultiplierTable(this.def);
    this.bet = bet;
    this.stepIndex = 0;
    this.status = "active";
  }

  /** Advances one lane — the first call resolves step 1. Throws if the round is not active. */
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
