/**
 * Headless Monte Carlo self-test for the math engine. Run with `npm run
 * simulate`. Simulates a naive "always continue" strategy (i.e. never cash
 * out early) across N rounds per difficulty and reports the realised RTP at
 * every possible cash-out step. Each step's realised RTP should converge on
 * ~96% (the configured RTP constant), proving the multiplier ladder pays out
 * correctly regardless of when the player would choose to stop.
 */
import { DIFFICULTIES, MathEngine, buildMultiplierTable, totalSteps, zoneForStep, type Difficulty } from "./mathEngine.js";

const ROUNDS = 1_000_000;
const BET = 1;

async function simulateDifficulty(difficulty: Difficulty): Promise<void> {
  const def = DIFFICULTIES[difficulty];
  const table = buildMultiplierTable(def);
  const n = totalSteps(def);
  const surviveCount = new Array(n).fill(0);

  for (let r = 0; r < ROUNDS; r++) {
    const engine = new MathEngine();
    await engine.startRound(BET, difficulty);
    // "always continue": keep stepping until death or the forced final cash-out
    for (let idx = 0; idx < n; idx++) {
      const outcome = await engine.step();
      if (!outcome.survived) break;
      surviveCount[idx] = surviveCount[idx] + 1;
      if (outcome.isFinalStep) break;
    }
  }

  console.log(`\n=== ${def.label} — ${n} steps ===`);
  const rows = table.map((multiplier, i) => {
    const survivedFraction = surviveCount[i] / ROUNDS;
    const realizedRTP = survivedFraction * multiplier;
    return {
      step: i + 1,
      zone: zoneForStep(def, i),
      multiplier: multiplier.toFixed(2) + "x",
      survivedRate: (survivedFraction * 100).toFixed(4) + "%",
      realisedRTP: (realizedRTP * 100).toFixed(2) + "%",
    };
  });
  console.table(rows);
}

async function main(): Promise<void> {
  const difficulties: Difficulty[] = ["easy", "medium", "hard", "daredevil"];
  console.log(`Running Monte Carlo self-test: ${ROUNDS.toLocaleString()} rounds per difficulty...`);
  const started = Date.now();
  for (const difficulty of difficulties) {
    await simulateDifficulty(difficulty);
  }
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
}

main();
