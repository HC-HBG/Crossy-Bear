import { Container, Graphics, Text, TextStyle, Ticker } from "pixi.js";
import { COLORS, LANE_WIDTH } from "./constants";
import { DIFFICULTIES, buildMultiplierTable, zoneForStep, type Difficulty, type Zone } from "../engine/mathEngine";

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
  view: Graphics;
  speed: number;
  axis: "y" | "x";
  bound: number;
}

function buildVehicle(): Graphics {
  const w = 46 + Math.random() * 20;
  const h = 26;
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, 6).fill(COLORS.black);
  g.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 4).fill(0x2f2f4a);
  g.circle(-w / 2 + 6, -h / 2 - 2, 4).fill(COLORS.headlight);
  g.circle(w / 2 - 6, -h / 2 - 2, 4).fill(COLORS.headlight);
  return g;
}

function buildLog(): Graphics {
  const w = 70;
  const h = 22;
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, 10).fill(0x6b4226);
  g.roundRect(-w / 2, -h / 2, w, 6, 8).fill(0x8a5a37);
  return g;
}

export function buildLaneField(difficulty: Difficulty, ticker: Ticker, laneDepth: number): LaneField {
  const def = DIFFICULTIES[difficulty];
  const table = buildMultiplierTable(def);
  const n = table.length;
  const container = new Container();
  const lanes: LaneView[] = [];
  const ambientEntries: Array<{ view: Container } & Ambient> = [];
  const LANE_DEPTH = laneDepth;

  const startBank = new Graphics();
  startBank.rect(-LANE_WIDTH * 1.5, -LANE_DEPTH / 2, LANE_WIDTH * 1.5, LANE_DEPTH).fill(COLORS.grass);
  container.addChild(startBank);

  const labelStyle = new TextStyle({
    fill: COLORS.white,
    fontSize: 22,
    fontWeight: "700",
    fontFamily: "system-ui, -apple-system, sans-serif",
    dropShadow: { color: COLORS.black, alpha: 0.6, distance: 2, blur: 2 },
  });

  for (let i = 0; i < n; i++) {
    const stepNumber = i + 1;
    const zone = zoneForStep(def, i);
    const centerX = (stepNumber - 0.5) * LANE_WIDTH;
    const laneContainer = new Container();
    laneContainer.x = centerX;

    const bg = new Graphics();
    bg.rect(-LANE_WIDTH / 2, -LANE_DEPTH / 2, LANE_WIDTH, LANE_DEPTH).fill(
      zone === "road" ? COLORS.road : COLORS.river,
    );
    laneContainer.addChild(bg);

    if (zone === "road") {
      // lane divider markings
      const marks = new Graphics();
      for (let y = -LANE_DEPTH / 2 + 20; y < LANE_DEPTH / 2; y += 46) {
        marks.rect(-3, y, 6, 24).fill(0x3a3a56);
      }
      laneContainer.addChild(marks);

      const count = 1 + (i % 2);
      for (let v = 0; v < count; v++) {
        const vehicle = buildVehicle();
        vehicle.rotation = Math.PI / 2;
        vehicle.y = -LANE_DEPTH / 2 + Math.random() * LANE_DEPTH;
        const speed = (0.04 + Math.random() * 0.05) * (v % 2 === 0 ? 1 : -1);
        laneContainer.addChild(vehicle);
        ambientEntries.push({ view: vehicle, speed, axis: "y", bound: LANE_DEPTH / 2 + 40 });
      }
    } else {
      const waterLine = new Graphics();
      waterLine.rect(-LANE_WIDTH / 2, -LANE_DEPTH / 2, LANE_WIDTH, LANE_DEPTH).fill({
        color: COLORS.riverDeep,
        alpha: 0.35,
      });
      laneContainer.addChild(waterLine);

      const log = buildLog();
      log.x = -LANE_WIDTH / 2 - 40 + Math.random() * 40;
      log.y = -LANE_DEPTH / 2 + Math.random() * LANE_DEPTH;
      laneContainer.addChild(log);
      ambientEntries.push({ view: log, speed: 0.025 + Math.random() * 0.02, axis: "x", bound: LANE_WIDTH / 2 + 60 });
    }

    const label = new Text({ text: `${table[i].toFixed(2)}x`, style: labelStyle });
    label.anchor.set(0.5);
    label.y = -LANE_DEPTH / 2 + 34;
    laneContainer.addChild(label);

    container.addChild(laneContainer);
    lanes.push({ stepNumber, zone, container: laneContainer, label, multiplier: table[i], resolved: false });
  }

  const farBank = new Graphics();
  farBank.rect(n * LANE_WIDTH, -LANE_DEPTH / 2, LANE_WIDTH * 1.5, LANE_DEPTH).fill(COLORS.grass);
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
