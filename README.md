# Crossy Bear — Concept Demo (v0.1)

A client-only, play-money concept demo of **Crossy Bear**, a Crossy Road–inspired
step-wager casino game for HungryBear Gaming. The goal of this build is to prove
the core loop feels great: **tap → resolve → decide (cash out or continue) →
restart.** There is no real-money wagering, no backend, and no account system.

Built with PixiJS v8 + TypeScript + Vite. All art is code-generated (Pixi
`Graphics`) — no image files. All audio is synthesised with WebAudio — no
audio files.

## Running it

```bash
npm install
npm run dev       # local dev server
npm run build      # static production bundle in dist/
npm run preview    # serve the production build locally
npm run simulate   # headless Monte Carlo self-test (see below)
```

`npm run build` produces a fully static bundle (`dist/`) with no server-side
dependencies — it can be hosted anywhere, including GitHub Pages (see
`.github/workflows/deploy.yml`, which builds and deploys `dist/` on every push).

## Controls

- **Tap / click the play field, or press Space** — hop to the next lane (or
  start a round if none is active).
- **Cash Out button, or press C** — cash out at the current ladder value.
- **T** — toggle Turbo (skips hop/walk tweens, near-instant step resolution).
- **M** — toggle Mute.

## Debug URL params

- `?seed=12345` — use a fixed PRNG seed for reproducible demos.
- `?rig=win` — force every step to survive (useful for demoing the ladder,
  cash-out flow, and the far-bank big-win celebration).
- `?rig=lose` — force the very next step to fail (useful for demoing the
  death flow and restart speed).

Example: `http://localhost:5173/?seed=42&rig=win`

## The math model

All outcomes come from a single isolated module, `src/engine/mathEngine.ts`,
which has **no dependency on Pixi or the DOM** and exposes a clean async
interface (`startRound(bet, difficulty)`, `step()`, `cashOut()`). The rest of
the client treats it as a black box — this is the seam where a real RGS
(Remote Game Server) client would eventually replace it.

- Each round is a sequence of independent Bernoulli trials — one per lane.
  Per-step survival probability `p` follows a **linear-decay schedule**
  rather than a flat per-zone value: it starts high and decays step by step
  toward an end value, so later lanes are meaningfully riskier than early
  ones. The end-of-schedule probability for each difficulty is *calibrated*
  (solved by bisection in `mathEngine.ts`, holding the start probability and
  step count fixed) so the final-step multiplier lands on that difficulty's
  target ceiling:

  | Difficulty | Steps | `p` schedule | Calibrated ceiling |
  |---|---|---|---|
  | Easy | 40 | 0.93 → ~0.754 (linear) | ~1,000x |
  | Medium | 30 | 0.875 → ~0.669 (linear) | ~2,500x |
  | Hard | 20 | 0.78 → ~0.492 (linear) | ~10,000x |
  | Daredevil | 10 | step 1 fixed at 0.48, steps 2–10: 0.40 → ~0.182 (linear) | ~50,000x |

  Zones are ambience only (see below) and alternate in 5-lane bands — road,
  river, road, river — for the full length of the ladder; they don't affect
  `p` at all.
- The multiplier after surviving `n` steps is
  `RTP / (p₁ × p₂ × … × pₙ)`, rounded to 2 decimals, with `RTP = 0.96`. This
  holds regardless of the schedule shape — flat or decaying — which is why
  `npm run simulate` converges on ~96% realised RTP at every depth even
  though the per-step odds now change every lane. The full ladder is
  generated (and calibrated) once per difficulty at startup, memoized,
  rendered in the in-game Paytable panel, and also `console.table`'d for
  quick verification.
- Randomness uses a seedable **mulberry32** PRNG so a given `?seed=` always
  replays the same round.
- **Start locks the bet and difficulty and places the bear at the kerb** —
  it does not resolve any step. The first tap resolves step 1, exactly like
  every tap after it. Reaching the final lane (the far bank) is a **forced
  cash-out** at the top multiplier, with the demo's one signature
  celebration (coin fountain + camera punch-in).

### Verifying the math: `npm run simulate`

`src/engine/simulate.ts` runs a headless Monte Carlo self-test: 1,000,000
rounds per difficulty with a naive "always continue" strategy, reporting the
realised RTP at every possible cash-out step. Every step, on every
difficulty, converges on ~96% — proving the decaying-probability ladder pays
out correctly regardless of when a player would choose to stop. The very
deepest steps (well under 0.1% survival — e.g. Daredevil's last couple of
lanes) have too few survivors in a 1M-round sample for a tight estimate, so
their printed realised-RTP figures are noisier; the ~96% RTP at those depths
is still exact analytically (it's built into the multiplier formula, not
fitted to the simulation).

## No skill, no timing — by design

Vehicles and river water are **ambience and outcome reveals only** — never
dodgeable hazards, and timing never affects the outcome. The animation
vocabulary is a "card flip," not a reflex test:

- On a **losing step**, a vehicle visibly drives in and comically flattens
  the bear (road), or the bear splashes into the river (river zone).
- On a **winning step**, the bear simply hops through safely.
- The client never reveals whether a future lane "would have" killed the
  player — the math engine only ever resolves the step actually taken.

## Architecture

```
src/
  engine/
    mathEngine.ts   isolated outcomes + multiplier tables + PRNG (no Pixi/DOM imports)
    simulate.ts     Monte Carlo self-test (node-runnable via `npm run simulate`)
  state.ts          explicit round/session state machine (see below)
  game/             Pixi scene: lanes, camera, bear, vehicles, river, celebrations
  ui/               HUD: bet panel, difficulty picker, cash-out, paytable, toasts
  audio/            WebAudio synth (hop, death, coin cascade, tension layer)
  main.ts           bootstrap: URL params, session, HUD, Pixi scene, audio
```

### State machine

`state.ts` implements an explicit machine with no illegal transitions:

```
IDLE → ROUND_ACTIVE → RESOLVING_STEP → STEP_WON | DEAD | CASHED_OUT
```

`ROUND_ACTIVE` is a real, stable state, not a pass-through: Start locks the
bet and difficulty, debits the balance, and parks the bear at the kerb —
`stepsCompleted` is 0 and there's nothing to cash out yet. Both
`ROUND_ACTIVE` and `STEP_WON` accept a hop, which drives `RESOLVING_STEP`;
that's what makes the first tap and every later tap go through the same
code path. `STEP_WON` also resolves to `CASHED_OUT` on cash-out. `DEAD` and
`CASHED_OUT` both return to a fresh `ROUND_ACTIVE` on the next Start/Play
Again. Every mutating method (`hop()`, `cashOut()`) checks the current phase
**synchronously**, before any `await`, so a near-simultaneous hop + cash-out
race resolves first-input-wins — the loser is a no-op.

## Copy rules

No "score," "level," "skill," or "win streak" language anywhere in the UI.
The header shows **Best Win** (a currency amount), not a best score. Buttons
say exactly what they do: "Start Game," "Cash Out 12.40," "Play Again."

## Persistence

Balance and best win are persisted to `localStorage` for convenience across
reloads. **This is demo-only and explicitly not appropriate for
production** — a real product needs a server-authoritative wallet, not
client-side storage a player can edit.

## Explicitly out of scope

This is a concept/UX demo, not a production game. Deliberately not included:

- Real-money wagering, a wallet, deposits/withdrawals, or KYC.
- A backend or account system — the math engine runs entirely client-side
  and is trivially editable in devtools; it is **not provably fair** and
  must not be treated as such.
- A real RGS integration — `mathEngine.ts` is shaped so one could be dropped
  in behind the same `startRound/step/cashOut` interface, but no such
  integration exists here.
- Autoplay/auto-bet.
- Compliance features (responsible-gambling limits, self-exclusion,
  jurisdictional gating, age verification).
- Real device performance profiling — the 60fps target was verified by
  keeping the scene lightweight (vector `Graphics` only, no filters/textures,
  a couple dozen display objects) and functionally tested end to end
  headlessly; this sandboxed dev environment only offers software-rendered
  WebGL (no GPU), so on-device frame-rate measurement should be confirmed on
  real mid-tier hardware before shipping.

## Verifying the acceptance checklist

- `npm run dev` works from a clean `npm install`; `npm run simulate` prints
  ~96% RTP per difficulty at every step. ✅
- Full loop is playable on all four difficulties, including the forced
  cash-out at the far bank. ✅ (verified headlessly for all four)
- Death → next Start possible in well under 1.5s (state-machine availability
  is decoupled from the death animation — restart is enabled the instant the
  round resolves, independent of the animation still playing). Turbo mode
  drops step-resolve tweens from ~220ms to ~40ms. ✅
- Cash Out always shows a currency amount; the next-step multiplier is
  always visible alongside it (e.g. "1.10x now → 1.26x next" on Medium). ✅
- No timing/skill influence on outcomes; `?rig=win` / `?rig=lose` reliably
  demo both outcomes. ✅
- No "score"/"skill" language anywhere in the UI (grep-verified). ✅
- 5+ animated vehicles plus river motion; portrait and landscape both
  usable (screenshot-verified at 390×844 and 844×390). ✅
- No console errors under normal play or rapid button-mashing; the state
  machine never enters an illegal state (both Start and Cash Out enabled at
  once) under a scripted mash test. ✅
