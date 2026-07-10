import { Container, Graphics, Rectangle, Text, TextStyle, Ticker } from "pixi.js";
import { COLORS, LANE_WIDTH, laneCenterX } from "./constants";
import { DIFFICULTIES, buildMultiplierTable, zoneForStep, type Difficulty, type Zone } from "../engine/mathEngine";
import { buildVehicle, randomVehicleKind, vehicleLength, type VehicleKind } from "./Vehicles";
import { formatMultiplier } from "../format";
import { tween } from "./tween";

const KERB_WIDTH = 24;
const UPCOMING_WINDOW = 4;
const MIN_HIT_SIZE = 56;

export interface LaneView {
  stepNumber: number; // 1-based
  zone: Zone;
  container: Container;
  label: Container; // whichever of {badge, tick} is currently visible — Game.ts edge-fades this
  multiplier: number;
  resolved: boolean;
  logs: Graphics[]; // river lanes only; decorative ambient logs, empty for road lanes
}

export interface LaneField {
  container: Container;
  lanes: LaneView[];
  totalSteps: number;
  laneX: (stepNumber: number) => number; // 0 = start bank rest position
  /** active gates the next-lane highlight/interactivity — false before a round has actually started. */
  updateProgress: (stepsCompleted: number, active?: boolean) => void;
  /** Sinks (fades + drops) the river badge — the "log" — at the given lane. The bear "fell through" it on a river death. Restored on the next round's updateProgress(0). No-op for road lanes or lanes already sunk. */
  sinkLogAt: (stepNumber: number) => void;
  destroy: () => void;
}

interface Ambient {
  view: Container;
  speed: number;
  axis: "y" | "x";
  bound: number;
}

const badgeTextStyle = new TextStyle({
  fill: COLORS.white,
  fontSize: 15,
  fontWeight: "700",
  fontFamily: "system-ui, -apple-system, sans-serif",
});

const tickTextStyle = new TextStyle({
  fill: COLORS.badgeFill,
  fontSize: 16,
  fontWeight: "800",
  fontFamily: "system-ui, -apple-system, sans-serif",
});

const hopHintTextStyle = new TextStyle({
  fill: COLORS.gold,
  fontSize: 13,
  fontWeight: "700",
  fontFamily: "system-ui, -apple-system, sans-serif",
});

/** "Tap to hop" — floats above the first lane's badge only, before the first hop of a round. */
function buildHopHint(): Text {
  const t = new Text({ text: "Tap to hop", style: hopHintTextStyle });
  t.anchor.set(0.5, 1);
  t.y = -46;
  return t;
}

interface BadgeHandle {
  container: Container;
  ring: Graphics;
}

/** Hit area is always at least MIN_HIT_SIZE square, centered on the badge, regardless of its visual footprint. */
function applyHitArea(c: Container, visualW: number, visualH: number): void {
  const w = Math.max(MIN_HIT_SIZE, visualW);
  const h = Math.max(MIN_HIT_SIZE, visualH);
  c.hitArea = new Rectangle(-w / 2, -h / 2, w, h);
}

function buildRoadBadge(multiplier: number): BadgeHandle {
  const c = new Container();
  const text = new Text({ text: formatMultiplier(multiplier), style: badgeTextStyle });
  text.anchor.set(0.5);
  const r = Math.max(24, text.width / 2 + 10);
  const g = new Graphics();
  g.circle(0, 0, r).fill({ color: COLORS.badgeFill, alpha: 0.85 });
  g.circle(0, 0, r).stroke({ width: 1, color: COLORS.badgeRim });
  const ring = new Graphics();
  ring.circle(0, 0, r + 4).stroke({ width: 3, color: COLORS.gold });
  ring.visible = false;
  c.addChild(g, ring, text);
  applyHitArea(c, r * 2, r * 2);
  return { container: c, ring };
}

function buildRiverBadge(multiplier: number): BadgeHandle {
  const c = new Container();
  const text = new Text({ text: formatMultiplier(multiplier), style: badgeTextStyle });
  text.anchor.set(0.5);
  const w = Math.max(52, text.width + 20);
  const h = 30;
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, 5).fill(COLORS.woodBadge);
  g.roundRect(-w / 2, -h / 2, w, h, 5).stroke({ width: 2, color: COLORS.woodBadgeDark });
  g.rect(-w / 2 + 5, -2, w - 10, 2).fill({ color: COLORS.woodBadgeDark, alpha: 0.5 });
  const ring = new Graphics();
  ring.roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 7).stroke({ width: 3, color: COLORS.gold });
  ring.visible = false;
  c.addChild(g, ring, text);
  applyHitArea(c, w, h);
  return { container: c, ring };
}

function buildLadderTick(): Container {
  const c = new Container();
  const g = new Graphics();
  g.circle(0, 0, 15).fill(COLORS.gold);
  g.circle(0, 0, 15).stroke({ width: 2, color: COLORS.goldDark });
  const tick = new Text({ text: "✓", style: tickTextStyle });
  tick.anchor.set(0.5);
  tick.y = -1;
  c.addChild(g, tick);
  return c;
}

function buildLog(): Graphics {
  const w = 72;
  const h = 22;
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, 10).fill(0x6b4226);
  g.roundRect(-w / 2, -h / 2, w, 6, 8).fill(0x8a5a37);
  for (let gx = -w / 2 + 12; gx < w / 2 - 8; gx += 14) {
    g.rect(gx, -h / 2 + 7, 8, h - 9).fill({ color: 0x5a3820, alpha: 0.35 });
  }
  g.circle(-w / 2 + 8, 0, 6).fill(0x543319);
  g.circle(w / 2 - 8, 0, 6).fill(0x543319);
  return g;
}

function buildLilyPad(): Graphics {
  const r = 12 + Math.random() * 6;
  const g = new Graphics();
  g.circle(0, 0, r).fill(0x2e7d3c);
  g.circle(r * 0.3, -r * 0.1, r * 0.35).fill(COLORS.riverDeep);
  return g;
}

function buildStone(): Graphics {
  const r = 7 + Math.random() * 4;
  const g = new Graphics();
  g.circle(0, 0, r).fill(0x8a8a96);
  g.circle(-r * 0.25, -r * 0.25, r * 0.4).fill({ color: 0xb0b0ba, alpha: 0.7 });
  return g;
}

function buildSparkle(): Graphics {
  const s = 3 + Math.random() * 3;
  const g = new Graphics();
  g.moveTo(0, -s).lineTo(s, 0).lineTo(0, s).lineTo(-s, 0).closePath().fill({ color: COLORS.riverSparkle, alpha: 0.55 });
  return g;
}

function buildTree(big: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  const trunkW = big ? 8 : 5;
  const trunkH = big ? 14 : 9;
  const canopy = big ? 22 : 14;
  g.rect(-trunkW / 2, 0, trunkW, trunkH).fill(0x5a3820);
  g.circle(0, -canopy * 0.55, canopy).fill(COLORS.grassDark);
  g.circle(-canopy * 0.35, -canopy * 0.3, canopy * 0.6).fill({ color: 0x246b30, alpha: 0.8 });
  c.addChild(g);
  c.pivot.y = trunkH;
  return c;
}

function buildRock(): Graphics {
  const r = 6 + Math.random() * 5;
  const g = new Graphics();
  g.roundRect(-r, -r * 0.7, r * 2, r * 1.4, 4).fill(0x6f6f7c);
  g.roundRect(-r, -r * 0.7, r * 2, r * 0.5, 3).fill({ color: 0x86868f, alpha: 0.6 });
  return g;
}

function buildFlower(): Graphics {
  const colors = [0xf05a7a, 0xf0b429, 0xffffff];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const g = new Graphics();
  g.rect(-1, 0, 2, 6).fill(0x2e7d3c);
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    g.circle(Math.cos(a) * 3, Math.sin(a) * 3, 2.4).fill(color);
  }
  g.circle(0, 0, 1.8).fill(0xf5b41e);
  return g;
}

/** Grass margin: two-tone flecks, a seeded scatter of trees/rocks/flowers. Visual-only randomness — never touches outcome RNG. */
function buildGrassTexture(width: number, depth: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.rect(0, -depth / 2, width, depth).fill(COLORS.grass);
  const flecks = Math.floor((width * depth) / 700);
  for (let i = 0; i < flecks; i++) {
    const x = Math.random() * width;
    const y = -depth / 2 + Math.random() * depth;
    const dark = Math.random() < 0.5;
    g.rect(x, y, 3, 8).fill({ color: dark ? COLORS.grassDark : 0x58c46a, alpha: dark ? 0.5 : 0.35 });
  }
  c.addChild(g);

  const propCount = Math.max(3, Math.floor((width * depth) / 9000));
  for (let i = 0; i < propCount; i++) {
    const x = 14 + Math.random() * (width - 28);
    const y = -depth / 2 + 20 + Math.random() * (depth - 40);
    const roll = Math.random();
    let prop: Container | Graphics;
    if (roll < 0.28) prop = buildTree(Math.random() < 0.4);
    else if (roll < 0.5) prop = buildRock();
    else prop = buildFlower();
    prop.x = x;
    prop.y = y;
    c.addChild(prop);
  }
  return c;
}

function buildKerbStrip(depth: number): Graphics {
  const g = new Graphics();
  g.rect(-KERB_WIDTH / 2, -depth / 2, KERB_WIDTH, depth).fill(COLORS.kerb);
  for (let y = -depth / 2 + 10; y < depth / 2; y += 22) {
    g.rect(-KERB_WIDTH / 2, y, KERB_WIDTH, 3).fill({ color: COLORS.kerbJoint, alpha: 0.6 });
  }
  return g;
}

const FROTH_WIDTH = 12;

/** A lighter froth line, one tile wide, drawn where a river lane meets a kerb. Position it via .x — see call site. */
function buildFroth(depth: number): Graphics {
  const g = new Graphics();
  g.rect(0, -depth / 2, FROTH_WIDTH, depth).fill({ color: COLORS.riverFroth, alpha: 0.3 });
  return g;
}

function buildRoadTexture(depth: number): Graphics {
  const g = new Graphics();
  g.rect(-LANE_WIDTH / 2, -depth / 2, LANE_WIDTH, depth).fill(COLORS.road);
  return g;
}

/**
 * Dashed lane-boundary marking, drawn at a shared edge between two adjacent
 * road lanes (positioned via .x at the call site) — NOT down the lane's own
 * centre. Vehicles, the bear's hop target, and badges all sit at the lane
 * centre (see laneCenterX), so the open, markings-free middle of the lane is
 * the drivable/hoppable path; the dash marks where one lane ends and the
 * next begins, same as a real road.
 */
function buildLaneDivider(depth: number): Graphics {
  const g = new Graphics();
  const dashLen = 26;
  const gapLen = 18;
  const dashW = 4;
  for (let y = -depth / 2 + 10; y < depth / 2; y += dashLen + gapLen) {
    g.rect(-dashW / 2, y, dashW, dashLen).fill(COLORS.roadDivider);
  }
  return g;
}

function buildRiverTexture(depth: number): Graphics {
  const g = new Graphics();
  g.rect(-LANE_WIDTH / 2, -depth / 2, LANE_WIDTH, depth).fill(COLORS.river);
  g.rect(-LANE_WIDTH / 2, -depth / 2, LANE_WIDTH, depth).fill({ color: COLORS.riverDeep, alpha: 0.3 });
  for (let y = -depth / 2 + 14; y < depth / 2; y += 30) {
    g.rect(-LANE_WIDTH / 2, y, LANE_WIDTH, 3).fill({ color: COLORS.riverSparkle, alpha: 0.1 });
  }
  return g;
}

export function buildLaneField(
  difficulty: Difficulty,
  ticker: Ticker,
  laneDepth: number,
  viewportWidth = 0,
  onHopBadgeClick: () => void = () => {},
): LaneField {
  const def = DIFFICULTIES[difficulty];
  const table = buildMultiplierTable(def);
  const n = table.length;
  const container = new Container();
  const lanes: LaneView[] = [];
  const ambientEntries: Ambient[] = [];
  const LANE_DEPTH = laneDepth;

  // Wide enough that the grass margin always reaches screen x=0 given the
  // camera's bear-anchor fraction (Game.ts keeps the bear at ~35% from the
  // left), regardless of viewport width — otherwise a dead navy strip shows
  // to the left of the grass at the start of a round.
  const startBankWidth = Math.max(LANE_WIDTH * 1.5, viewportWidth * 0.45);
  const startBank = buildGrassTexture(startBankWidth, LANE_DEPTH);
  startBank.x = -startBankWidth;
  container.addChild(startBank);

  let vehicleSeed = 0;
  let prevZone: Zone | "grass" = "grass";

  for (let i = 0; i < n; i++) {
    const stepNumber = i + 1;
    const zone = zoneForStep(def, i);
    const laneContainer = new Container();
    laneContainer.x = laneCenterX(stepNumber);

    // Kerb (and river froth) are built now but added to laneContainer *after*
    // its own road/river texture below, so they render on top of it — and,
    // since laneContainer itself is added after the previous lane's, on top
    // of that lane's texture too, keeping the full strip visible astride
    // the boundary instead of half-hidden under whichever texture happens
    // to be added last.
    let kerbToAdd: Graphics | null = null;
    let frothToAdd: Graphics | null = null;
    let dividerToAdd: Graphics | null = null;
    if (zone !== prevZone) {
      kerbToAdd = buildKerbStrip(LANE_DEPTH);
      kerbToAdd.x = -LANE_WIDTH / 2;

      if (zone === "river") {
        frothToAdd = buildFroth(LANE_DEPTH);
        frothToAdd.x = -LANE_WIDTH / 2;
      } else if (prevZone === "river") {
        frothToAdd = buildFroth(LANE_DEPTH);
        frothToAdd.x = -LANE_WIDTH / 2 - FROTH_WIDTH;
      }
    } else if (zone === "road") {
      // Internal road-to-road boundary (not a zone transition, which already
      // gets a kerb) — mark it with a dashed line at the shared edge.
      dividerToAdd = buildLaneDivider(LANE_DEPTH);
      dividerToAdd.x = -LANE_WIDTH / 2;
    }
    prevZone = zone;

    const logsInLane: Graphics[] = [];

    if (zone === "road") {
      laneContainer.addChild(buildRoadTexture(LANE_DEPTH));

      // ALL traffic travels top -> bottom, every lane, no exceptions.
      // Vehicles in the same lane share one speed so their spacing (evenly
      // distributed across the full wrap cycle) never drifts and they can
      // never overlap, however large they're scaled.
      const count = 1 + (i % 2);
      const kinds: VehicleKind[] = [];
      for (let v = 0; v < count; v++) kinds.push(randomVehicleKind(vehicleSeed++));
      const maxLength = Math.max(...kinds.map(vehicleLength));
      const bound = LANE_DEPTH / 2 + maxLength; // fully clears the mask before it wraps
      const speed = 0.06 + Math.random() * 0.045;
      const period = (2 * bound) / count;
      for (let v = 0; v < count; v++) {
        const vehicle = buildVehicle(kinds[v]);
        vehicle.rotation = Math.PI / 2; // always facing down
        vehicle.y = -bound + v * period;
        laneContainer.addChild(vehicle);
        ambientEntries.push({ view: vehicle, speed, axis: "y", bound });
      }
    } else {
      laneContainer.addChild(buildRiverTexture(LANE_DEPTH));

      const sparkleCount = 2 + Math.floor(Math.random() * 2);
      for (let s = 0; s < sparkleCount; s++) {
        const sparkle = buildSparkle();
        sparkle.x = -LANE_WIDTH / 2 + Math.random() * LANE_WIDTH;
        sparkle.y = -LANE_DEPTH / 2 + Math.random() * LANE_DEPTH;
        laneContainer.addChild(sparkle);
        ambientEntries.push({ view: sparkle, speed: 0.01 + Math.random() * 0.015, axis: "y", bound: LANE_DEPTH / 2 + 10 });
      }

      // At least 2 logs visible per river lane at all times.
      const logCount = 2 + (i % 2 === 0 ? 1 : 0);
      for (let l = 0; l < logCount; l++) {
        const log = buildLog();
        log.x = -LANE_WIDTH / 2 + (l / logCount) * LANE_WIDTH + Math.random() * 20;
        log.y = -LANE_DEPTH / 2 + ((l + 0.5) / logCount) * LANE_DEPTH + (Math.random() - 0.5) * 30;
        laneContainer.addChild(log);
        ambientEntries.push({ view: log, speed: 0.02 + Math.random() * 0.018, axis: "x", bound: LANE_WIDTH / 2 + 60 });
        logsInLane.push(log);
      }

      if (Math.random() < 0.35) {
        const pad = buildLilyPad();
        pad.x = -LANE_WIDTH / 2 + 20 + Math.random() * (LANE_WIDTH - 40);
        pad.y = -LANE_DEPTH / 2 + Math.random() * LANE_DEPTH;
        laneContainer.addChild(pad);
        ambientEntries.push({ view: pad, speed: 0.012 + Math.random() * 0.01, axis: "y", bound: LANE_DEPTH / 2 + 20 });
      }
      if (Math.random() < 0.25) {
        const stone = buildStone();
        stone.x = -LANE_WIDTH / 2 + 20 + Math.random() * (LANE_WIDTH - 40);
        stone.y = -LANE_DEPTH / 2 + Math.random() * LANE_DEPTH;
        laneContainer.addChild(stone);
      }
    }

    if (kerbToAdd) laneContainer.addChild(kerbToAdd);
    if (frothToAdd) laneContainer.addChild(frothToAdd);
    if (dividerToAdd) laneContainer.addChild(dividerToAdd);

    const badgeSlot = new Container();
    badgeSlot.y = 0;
    laneContainer.addChild(badgeSlot);

    container.addChild(laneContainer);
    lanes.push({
      stepNumber,
      zone,
      container: laneContainer,
      label: badgeSlot,
      multiplier: table[i],
      resolved: false,
      logs: logsInLane,
    });
  }

  const farBankWidth = Math.max(LANE_WIDTH * 1.5, viewportWidth * 0.7);
  const farBank = buildGrassTexture(farBankWidth, LANE_DEPTH);
  farBank.x = n * LANE_WIDTH;
  container.addChild(farBank);

  // The single active (next-to-resolve) badge — pulses continuously and
  // pops further on hover. Reassigned by updateProgress() as the ladder
  // advances; hover state is tracked per-badge but only ever matters while
  // that badge is the active (eventMode "static") one.
  let activeBadge: Container | null = null;
  let hoveredBadge: Container | null = null;
  let pulseTime = 0;

  const onTick = (): void => {
    const dt = ticker.deltaMS;
    for (const entry of ambientEntries) {
      if (entry.axis === "y") {
        entry.view.y += entry.speed * dt;
        if (entry.view.y > entry.bound) entry.view.y = -entry.bound;
        if (entry.view.y < -entry.bound) entry.view.y = entry.bound;
      } else {
        entry.view.x += entry.speed * dt;
        if (entry.view.x > entry.bound) entry.view.x = -entry.bound;
      }
    }
    if (activeBadge) {
      pulseTime += dt;
      const base = activeBadge === hoveredBadge ? 1.1 : 1;
      const wobble = Math.sin(pulseTime / 260) * 0.06;
      activeBadge.scale.set(base + wobble);
    }
  };
  ticker.add(onTick);

  const badgeCache = new Map<LaneView, { upcoming: Container; ring: Graphics; tick: Container; hint: Text | null }>();
  // Lanes whose river badge has sunk (the bear died on that exact log) this
  // round. A fresh round (stepsCompleted === 0) restores every sunk badge —
  // the board persists, but the ladder itself resets each round.
  const sunkLanes = new Set<number>();
  /** active gates the next-lane highlight/interactivity — false before a round has actually started (e.g. the initial board-load call, or a difficulty switch while idle). */
  function updateProgress(stepsCompleted: number, active = false): void {
    if (stepsCompleted === 0 && sunkLanes.size > 0) {
      for (const stepNumber of sunkLanes) {
        const entry = badgeCache.get(lanes[stepNumber - 1]);
        if (entry) {
          entry.upcoming.y = 0;
          entry.upcoming.alpha = 1;
          entry.upcoming.scale.set(1);
        }
      }
      sunkLanes.clear();
    }
    const activeStepNumber = stepsCompleted + 1;
    activeBadge = null;
    for (const lane of lanes) {
      let entry = badgeCache.get(lane);
      if (!entry) {
        const built = lane.zone === "road" ? buildRoadBadge(lane.multiplier) : buildRiverBadge(lane.multiplier);
        // Bear's row, every zone — the badge is what the bear hops onto,
        // so it must sit exactly where the bear lands (see laneCenterX/laneX).
        built.container.y = 0;
        const tick = buildLadderTick();
        tick.y = 0;
        lane.label.addChild(built.container, tick);
        built.container.on("pointerdown", (e) => {
          // Stops this click from also reaching the stage's tap-anywhere
          // fallback — badge and board-tap are equivalent inputs, but a
          // single click must resolve exactly one step, not two.
          e.stopPropagation();
          onHopBadgeClick();
        });
        built.container.on("pointerover", () => {
          hoveredBadge = built.container;
        });
        built.container.on("pointerout", () => {
          if (hoveredBadge === built.container) hoveredBadge = null;
        });
        // Onboarding nudge, first lane only — points at the very first badge
        // a new player needs to tap.
        const hint = lane.stepNumber === 1 ? buildHopHint() : null;
        if (hint) lane.label.addChild(hint);
        entry = { upcoming: built.container, ring: built.ring, tick, hint };
        badgeCache.set(lane, entry);
      }
      const aheadBy = lane.stepNumber - stepsCompleted;
      lane.resolved = aheadBy <= 0;
      if (lane.zone === "river") {
        // The river badge IS the "log" the bear lands on — it must stay put
        // once revealed. Only sinkLogAt (a river death on that exact lane)
        // ever removes it.
        entry.tick.visible = false;
        entry.upcoming.visible = !sunkLanes.has(lane.stepNumber) && aheadBy <= UPCOMING_WINDOW;
      } else {
        entry.tick.visible = lane.resolved;
        entry.upcoming.visible = !lane.resolved && aheadBy <= UPCOMING_WINDOW;
      }

      // Only the next lane's badge is ever interactive, and only once a
      // round is actually active: gold ring + pulse, full brightness, and a
      // real hit target. Lanes beyond it (or every lane, before Start) are
      // dimmed and structurally non-interactive (eventMode "none" — Pixi
      // never dispatches pointer events to them, so clicking one is a no-op
      // at the badge level; a tap still resolves the *next* step, same as
      // tapping any other empty patch of board, via the board-wide input).
      const isActive = active && lane.stepNumber === activeStepNumber && entry.upcoming.visible;
      entry.ring.visible = isActive;
      entry.upcoming.alpha = isActive || lane.resolved ? 1 : 0.55;
      if (entry.hint) entry.hint.visible = isActive;
      if (isActive) {
        entry.upcoming.eventMode = "static";
        entry.upcoming.cursor = "pointer";
        activeBadge = entry.upcoming;
      } else {
        entry.upcoming.eventMode = "none";
        entry.upcoming.cursor = "default";
        if (entry.upcoming.scale.x !== 1 || entry.upcoming.scale.y !== 1) {
          // Reset a badge that just lost active status (e.g. right after a
          // hop) back to rest scale — the pulse only touches activeBadge,
          // so the previous one would otherwise stay stuck mid-wobble.
          entry.upcoming.scale.set(1);
        }
      }
    }
  }
  updateProgress(0);

  /** Sinks (fades + drops) the river badge the bear actually died on — that lane only, nothing else. */
  function sinkLogAt(stepNumber: number): void {
    const lane = lanes[stepNumber - 1];
    if (!lane || lane.zone !== "river" || sunkLanes.has(stepNumber)) return;
    sunkLanes.add(stepNumber);
    const entry = badgeCache.get(lane);
    if (!entry) return;
    const badge = entry.upcoming;
    const startY = badge.y;
    void tween(ticker, 420, (t) => {
      // A new round can reset sunkLanes while this tween is still in flight
      // (its own animation frames keep firing after that reset) — bail out
      // rather than clobbering the reset transform on this lane's badge.
      if (!sunkLanes.has(stepNumber)) return;
      badge.y = startY + t * 26;
      badge.alpha = 1 - t;
      badge.scale.set(1 - t * 0.5);
    }).then(() => {
      if (sunkLanes.has(stepNumber)) badge.visible = false;
    });
  }

  return {
    container,
    lanes,
    totalSteps: n,
    laneX: (stepNumber) => (stepNumber <= 0 ? -22 : laneCenterX(stepNumber)),
    updateProgress,
    sinkLogAt,
    destroy: () => {
      ticker.remove(onTick);
      container.destroy({ children: true });
    },
  };
}
