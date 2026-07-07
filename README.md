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
  Per-step survival probability `p` and step counts are fixed per difficulty:

  | Difficulty | Steps (road + river) | Road `p` | River `p` | Ceiling |
  |---|---|---|---|---|
  | Easy | 20 (14 + 6) | 0.96 | 0.94 | ~2.46x |
  | Medium | 14 (9 + 5) | 0.875 | 0.85 | ~7.20x |
  | Hard | 10 (6 + 4) | 0.79 | 0.74 | ~13.17x |
  | Daredevil | 8 (4 + 4) | 0.48 | 0.42 | ~581.18x |

- The multiplier after surviving `n` steps is
  `RTP / (p₁ × p₂ × … × pₙ)`, rounded to 2 decimals, with `RTP = 0.96`. The
  full ladder is generated at startup for every difficulty, rendered in the
  in-game Paytable panel, and also `console.table`'d for quick verification.
- Randomness uses a seedable **mulberry32** PRNG so a given `?seed=` always
  replays the same round.
- **Starting a round commits the first step immediately** — there is no dead
  click. Reaching the final lane (the far bank) is a **forced cash-out** at
  the top multiplier, with the demo's one signature celebration (coin
  fountain + camera punch-in).

### Verifying the math: `npm run simulate`

`src/engine/simulate.ts` runs a headless Monte Carlo self-test: 1,000,000
rounds per difficulty with a naive "always continue" strategy, reporting the
realised RTP at every possible cash-out step. Every step, on every
difficulty, converges on ~96% — proving the ladder pays out correctly
regardless of when a player would choose to stop.

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

`STEP_WON` loops back to `RESOLVING_STEP` on the next hop, or resolves to
`CASHED_OUT` on cash-out. `DEAD` and `CASHED_OUT` both return to a fresh
`ROUND_ACTIVE` on the next Start/Play Again. Every mutating method
(`hop()`, `cashOut()`) checks the current phase **synchronously**, before
any `await`, so a near-simultaneous hop + cash-out race resolves
first-input-wins — the loser is a no-op.

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
  always visible alongside it (e.g. "1.10x now → 1.25x next"). ✅
- No timing/skill influence on outcomes; `?rig=win` / `?rig=lose` reliably
  demo both outcomes. ✅
- No "score"/"skill" language anywhere in the UI (grep-verified). ✅
- 5+ animated vehicles plus river motion; portrait and landscape both
  usable (screenshot-verified at 390×844 and 844×390). ✅
- No console errors under normal play or rapid button-mashing; the state
  machine never enters an illegal state (both Start and Cash Out enabled at
  once) under a scripted mash test. ✅
