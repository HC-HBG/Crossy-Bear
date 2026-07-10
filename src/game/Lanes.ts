import { Container, Graphics, Text, TextStyle, Ticker } from "pixi.js";
import { COLORS, LANE_WIDTH } from "./constants";
import { DIFFICULTIES, buildMultiplierTable, zoneForStep, type Difficulty, type Zone } from "../engine/mathEngine";
import { buildVehicle, randomVehicleKind } from "./Vehicles";
import { formatMultiplier } from "../format";

export interface LaneView {
  stepNumber: number; // 1-based
  zone: Zone;
  container: Container;
  label: Text;
  multiplier: number;
  resolved: boolean;
}

export interface LaneField {
  container: Container;
  lanes: LaneView[];
  totalSteps: number;
  laneX: (stepNumber: number) => number; // 0 = start bank rest position
  destroy: () => void;
}

interface Ambient {
  view: Container;
  speed: number;
  axis: "y" | "x";
  bound: number;
}

function buildLog(): Graphics {
  const w = 72;
  const h = 22;
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, 10).fill(0x6b4226);
  g.roundRect(-w / 2, -h / 2, w, 6, 8).fill(0x8a5a37);
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

function buildGrassTexture(width: number, depth: number): Graphics {
  const g = new Graphics();
  g.rect(0, -depth / 2, width, depth).fill(COLORS.grass);
  const blades = Math.floor((width * depth) / 900);
  for (let i = 0; i < blades; i++) {
    const x = Math.random() * width;
    const y = -depth / 2 + Math.random() * depth;
    g.rect(x, y, 3, 8).fill({ color: COLORS.grassDark, alpha: 0.5 });
  }
  return g;
}

function buildRoadTexture(depth: number): Graphics {
  const g = new Graphics();
  g.rect(-LANE_WIDTH / 2, -depth / 2, LANE_WIDTH, depth).fill(COLORS.road);
  for (let y = -depth / 2 + 20; y < depth / 2; y += 46) {
    g.rect(-3, y, 6, 24).fill(0x3a3a56);
  }
  return g;
}

function buildRiverTexture(depth: number): Graphics {
  const g = new Graphics();
  g.rect(-LANE_WIDTH / 2, -depth / 2, LANE_WIDTH, depth).fill(COLORS.river);
  g.rect(-LANE_WIDTH / 2, -depth / 2, LANE_WIDTH, depth).fill({ color: COLORS.riverDeep, alpha: 0.35 });
  for (let y = -depth / 2 + 14; y < depth / 2; y += 34) {
    g.rect(-LANE_WIDTH / 2, y, LANE_WIDTH, 3).fill({ color: 0x8fd0ff, alpha: 0.08 });
  }
  return g;
}

export function buildLaneField(difficulty: Difficulty, ticker: Ticker, laneDepth: number): LaneField {
  const def = DIFFICULTIES[difficulty];
  const table = buildMultiplierTable(def);
  const n = table.length;
  const container = new Container();
  const lanes: LaneView[] = [];
  const ambientEntries: Ambient[] = [];
  const LANE_DEPTH = laneDepth;

  const startBank = buildGrassTexture(LANE_WIDTH * 1.5, LANE_DEPTH);
  startBank.x = -LANE_WIDTH * 1.5;
  container.addChild(startBank);

  const labelStyle = new TextStyle({
    fill: COLORS.white,
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "system-ui, -apple-system, sans-serif",
    dropShadow: { color: COLORS.black, alpha: 0.6, distance: 2, blur: 2 },
  });

  let vehicleSeed = 0;

  for (let i = 0; i < n; i++) {
    const stepNumber = i + 1;
    const zone = zoneForStep(def, i);
    const centerX = (stepNumber - 0.5) * LANE_WIDTH;
    const laneContainer = new Container();
    laneContainer.x = centerX;

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

      const log = buildLog();
      log.x = -LANE_WIDTH / 2 - 40 + Math.random() * 40;
      log.y = -LANE_DEPTH / 2 + Math.random() * LANE_DEPTH;
      laneContainer.addChild(log);
      ambientEntries.push({ view: log, speed: 0.025 + Math.random() * 0.02, axis: "x", bound: LANE_WIDTH / 2 + 60 });

      if (Math.random() < 0.4) {
        const pad = buildLilyPad();
        pad.x = -LANE_WIDTH / 2 + 20 + Math.random() * (LANE_WIDTH - 40);
        pad.y = -LANE_DEPTH / 2 + Math.random() * LANE_DEPTH;
        laneContainer.addChild(pad);
        ambientEntries.push({ view: pad, speed: 0.012 + Math.random() * 0.01, axis: "y", bound: LANE_DEPTH / 2 + 20 });
      }
    }

    const label = new Text({ text: formatMultiplier(table[i]), style: labelStyle });
    label.anchor.set(0.5);
    label.y = -LANE_DEPTH / 2 + 34;
    laneContainer.addChild(label);

    container.addChild(laneContainer);
    lanes.push({ stepNumber, zone, container: laneContainer, label, multiplier: table[i], resolved: false });
  }

  const farBank = buildGrassTexture(LANE_WIDTH * 1.5, LANE_DEPTH);
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

  return {
    container,
    lanes,
    totalSteps: n,
    laneX: (stepNumber) => (stepNumber <= 0 ? -LANE_WIDTH * 0.6 : (stepNumber - 0.5) * LANE_WIDTH),
    destroy: () => {
      ticker.remove(onTick);
      container.destroy({ children: true });
    },
  };
}
