import { Container, Graphics, Text, TextStyle, Ticker } from "pixi.js";
import { COLORS, LANE_WIDTH } from "./constants";
import { DIFFICULTIES, buildMultiplierTable, zoneForStep, type Difficulty, type Zone } from "../engine/mathEngine";
import { buildVehicle, randomVehicleKind } from "./Vehicles";
import { formatMultiplier } from "../format";

const KERB_WIDTH = 24;
const UPCOMING_WINDOW = 4;

export interface LaneView {
  stepNumber: number; // 1-based
  zone: Zone;
  container: Container;
  label: Container; // whichever of {badge, tick} is currently visible — Game.ts edge-fades this
  multiplier: number;
  resolved: boolean;
}

export interface LaneField {
  container: Container;
  lanes: LaneView[];
  totalSteps: number;
  laneX: (stepNumber: number) => number; // 0 = start bank rest position
  updateProgress: (stepsCompleted: number) => void;
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

function buildRoadBadge(multiplier: number): Container {
  const c = new Container();
  const text = new Text({ text: formatMultiplier(multiplier), style: badgeTextStyle });
  text.anchor.set(0.5);
  const r = Math.max(24, text.width / 2 + 10);
  const g = new Graphics();
  g.circle(0, 0, r).fill({ color: COLORS.badgeFill, alpha: 0.85 });
  g.circle(0, 0, r).stroke({ width: 1, color: COLORS.badgeRim });
  c.addChild(g, text);
  return c;
}

function buildRiverBadge(multiplier: number): Container {
  const c = new Container();
  const text = new Text({ text: formatMultiplier(multiplier), style: badgeTextStyle });
  text.anchor.set(0.5);
  const w = Math.max(52, text.width + 20);
  const h = 30;
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, 5).fill(COLORS.woodBadge);
  g.roundRect(-w / 2, -h / 2, w, h, 5).stroke({ width: 2, color: COLORS.woodBadgeDark });
  g.rect(-w / 2 + 5, -2, w - 10, 2).fill({ color: COLORS.woodBadgeDark, alpha: 0.5 });
  c.addChild(g, text);
  return c;
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

function buildRoadTexture(depth: number): Graphics {
  const g = new Graphics();
  g.rect(-LANE_WIDTH / 2, -depth / 2, LANE_WIDTH, depth).fill(COLORS.road);
  for (let y = -depth / 2 + 16; y < depth / 2; y += 44) {
    g.rect(-4, y, 8, 26).fill(COLORS.roadDivider);
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

export function buildLaneField(difficulty: Difficulty, ticker: Ticker, laneDepth: number, viewportWidth = 0): LaneField {
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
    const centerX = (stepNumber - 0.5) * LANE_WIDTH;
    const laneContainer = new Container();
    laneContainer.x = centerX;

    if (zone !== prevZone) {
      const kerb = buildKerbStrip(LANE_DEPTH);
      kerb.x = -LANE_WIDTH / 2;
      laneContainer.addChild(kerb);
    }
    prevZone = zone;

    if (zone === "road") {
      laneContainer.addChild(buildRoadTexture(LANE_DEPTH));

      const count = 1 + (i % 2);
      for (let v = 0; v < count; v++) {
        const vehicle = buildVehicle(randomVehicleKind(vehicleSeed++));
        vehicle.rotation = Math.PI / 2;
        vehicle.y = -LANE_DEPTH / 2 + Math.random() * LANE_DEPTH;
        const speed = (0.04 + Math.random() * 0.05) * (v % 2 === 0 ? 1 : -1);
        laneContainer.addChild(vehicle);
        ambientEntries.push({ view: vehicle, speed, axis: "y", bound: LANE_DEPTH / 2 + 40 });
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

    const badgeSlot = new Container();
    badgeSlot.y = 0;
    laneContainer.addChild(badgeSlot);

    container.addChild(laneContainer);
    lanes.push({ stepNumber, zone, container: laneContainer, label: badgeSlot, multiplier: table[i], resolved: false });
  }

  const farBankWidth = Math.max(LANE_WIDTH * 1.5, viewportWidth * 0.7);
  const farBank = buildGrassTexture(farBankWidth, LANE_DEPTH);
  farBank.x = n * LANE_WIDTH;
  container.addChild(farBank);

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
  };
  ticker.add(onTick);

  const badgeCache = new Map<LaneView, { upcoming: Container; tick: Container }>();
  function updateProgress(stepsCompleted: number): void {
    for (const lane of lanes) {
      let entry = badgeCache.get(lane);
      if (!entry) {
        const upcoming = lane.zone === "road" ? buildRoadBadge(lane.multiplier) : buildRiverBadge(lane.multiplier);
        upcoming.y = lane.zone === "road" ? -LANE_DEPTH / 2 + 34 : 0;
        const tick = buildLadderTick();
        tick.y = -LANE_DEPTH / 2 + 34;
        lane.label.addChild(upcoming, tick);
        entry = { upcoming, tick };
        badgeCache.set(lane, entry);
      }
      const aheadBy = lane.stepNumber - stepsCompleted;
      lane.resolved = aheadBy <= 0;
      entry.tick.visible = lane.resolved;
      entry.upcoming.visible = !lane.resolved && aheadBy <= UPCOMING_WINDOW;
    }
  }
  updateProgress(0);

  return {
    container,
    lanes,
    totalSteps: n,
    laneX: (stepNumber) => (stepNumber <= 0 ? -22 : (stepNumber - 0.5) * LANE_WIDTH),
    updateProgress,
    destroy: () => {
      ticker.remove(onTick);
      container.destroy({ children: true });
    },
  };
}
