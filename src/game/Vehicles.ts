import { Container, Graphics } from "pixi.js";
import { COLORS, VEHICLE_COLORS } from "./constants";

export type VehicleKind = "car" | "taxi" | "truck" | "van" | "sports";

const KINDS: VehicleKind[] = ["car", "taxi", "truck", "van", "sports"];

export function randomVehicleKind(seedIndex: number): VehicleKind {
  return KINDS[seedIndex % KINDS.length];
}

const WINDSHIELD = 0x262638;
const OUTLINE = COLORS.black;

interface Dims {
  w: number;
  h: number;
}

function glowDot(g: Graphics, x: number, y: number, color: number, big: boolean): void {
  if (big) {
    g.circle(x, y, 7).fill({ color, alpha: 0.15 });
    g.circle(x, y, 4).fill({ color, alpha: 0.32 });
  }
  g.circle(x, y, 2).fill({ color, alpha: 0.95 });
}

/** Chunky rounded-rect pixel silhouette with a dark outline, windshield block, and (for taxi) a roof light. */
function drawBody(g: Graphics, kind: VehicleKind): Dims {
  switch (kind) {
    case "car": {
      const w = 54;
      const h = 24;
      g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 8.5).fill(OUTLINE);
      g.roundRect(-w / 2, -h / 2, w, h, 7).fill(VEHICLE_COLORS.red);
      g.roundRect(-w * 0.04, -h / 2 + 3, w * 0.34, h - 6, 4).fill(WINDSHIELD);
      return { w, h };
    }
    case "taxi": {
      const w = 56;
      const h = 24;
      g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 8.5).fill(OUTLINE);
      g.roundRect(-w / 2, -h / 2, w, h, 7).fill(VEHICLE_COLORS.taxi);
      g.roundRect(-w * 0.04, -h / 2 + 3, w * 0.34, h - 6, 4).fill(WINDSHIELD);
      g.roundRect(-7, -h / 2 - 6, 14, 6, 2).fill(OUTLINE);
      g.roundRect(-5, -h / 2 - 5, 10, 4, 2).fill(COLORS.white);
      return { w, h };
    }
    case "truck": {
      const w = 76;
      const h = 28;
      g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 6.5).fill(OUTLINE);
      g.roundRect(-w / 2, -h / 2, w * 0.6, h, 5).fill(VEHICLE_COLORS.white);
      g.roundRect(w * 0.12, -h / 2, w * 0.42, h, 5).fill(0xcfcfd8);
      g.roundRect(w * 0.3, -h / 2 + 4, w * 0.2, h - 8, 3).fill(WINDSHIELD);
      return { w, h };
    }
    case "van": {
      const w = 58;
      const h = 27;
      g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 7.5).fill(OUTLINE);
      g.roundRect(-w / 2, -h / 2, w, h, 6).fill(VEHICLE_COLORS.purple);
      g.roundRect(w * 0.1, -h / 2 + 3, w * 0.3, h - 6, 4).fill(WINDSHIELD);
      return { w, h };
    }
    case "sports": {
      const w = 52;
      const h = 20;
      g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 9).fill(OUTLINE);
      g.roundRect(-w / 2, -h / 2, w, h, 7).fill(VEHICLE_COLORS.blue);
      g.roundRect(w * 0.02, -h / 2 + 2.5, w * 0.32, h - 5, 4).fill(WINDSHIELD);
      return { w, h };
    }
  }
}

function buildBody(kind: VehicleKind): { body: Container; w: number; h: number } {
  const body = new Container();
  const shape = new Graphics();
  const { w, h } = drawBody(shape, kind);
  body.addChild(shape);
  // Headlights (warm glow) at the +w/2 end, taillights (small red, no glow) at the -w/2 end.
  glowDot(shape, w / 2 - 3, -h / 2 + 4, COLORS.headlight, true);
  glowDot(shape, w / 2 - 3, h / 2 - 4, COLORS.headlight, true);
  glowDot(shape, -w / 2 + 3, -h / 2 + 4, 0xff3b3b, false);
  glowDot(shape, -w / 2 + 3, h / 2 - 4, 0xff3b3b, false);
  return { body, w, h };
}

/** A bright, chunky pixel vehicle, oriented for horizontal travel (Game/Lanes rotate it for road lanes). */
export function buildVehicle(kind: VehicleKind): Container {
  const root = new Container();
  const { body: main } = buildBody(kind);
  root.addChild(main);
  return root;
}
