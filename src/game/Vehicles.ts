import { BlurFilter, Container, Graphics } from "pixi.js";
import { COLORS, VEHICLE_COLORS, LANE_WIDTH } from "./constants";

export type VehicleKind = "car" | "taxi" | "truck" | "van" | "sports";

const KINDS: VehicleKind[] = ["car", "taxi", "truck", "van", "sports"];

// The two visually darkest of the 5 bright body colours (by perceived
// luminance) get a headlight cone — the brighter ones (taxi/white/purple)
// already read clearly against the road without one.
const CONE_KINDS: ReadonlySet<VehicleKind> = new Set(["car", "sports"]);

export function randomVehicleKind(seedIndex: number): VehicleKind {
  return KINDS[seedIndex % KINDS.length];
}

const WINDSHIELD = 0x262638;
const OUTLINE = COLORS.black;

interface Dims {
  w: number;
  h: number;
}

// Raw, unscaled body dimensions per kind — w = nose-to-tail length (the
// travel axis in this native horizontal-authored orientation), h = the
// vehicle's true on-screen body width once rotated for vertical travel.
// Single source of truth: drawBody() reads from here instead of inlining
// its own numbers, so buildVehicle()'s scale math can never drift from
// what's actually drawn.
const RAW_DIMS: Record<VehicleKind, Dims> = {
  car: { w: 54, h: 24 },
  taxi: { w: 56, h: 24 },
  truck: { w: 76, h: 28 },
  van: { w: 58, h: 27 },
  sports: { w: 52, h: 20 },
};

// Target on-screen body width (perpendicular to travel) once scaled —
// roughly 65% of the lane's width, per the mock's chunkier vehicles.
const TARGET_BODY_WIDTH = LANE_WIDTH * 0.65;

/** Uniform scale factor that brings this kind's body width to TARGET_BODY_WIDTH. */
export function vehicleScale(kind: VehicleKind): number {
  // Vector Graphics have no texel grid to snap to, so "nearest-neighbour"
  // crispness here just means avoiding a scale that blurs strokes across
  // fractional pixels — snapping to a coarse step keeps edges clean.
  return Math.round((TARGET_BODY_WIDTH / RAW_DIMS[kind].h) * 4) / 4;
}

/** This kind's full on-screen length (nose-to-tail) once scaled — used for lane-spacing math. */
export function vehicleLength(kind: VehicleKind): number {
  return RAW_DIMS[kind].w * vehicleScale(kind);
}

function glowDot(g: Graphics, x: number, y: number, color: number, big: boolean): void {
  if (big) {
    g.circle(x, y, 7).fill({ color, alpha: 0.15 });
    g.circle(x, y, 4).fill({ color, alpha: 0.32 });
  }
  g.circle(x, y, 2).fill({ color, alpha: 0.95 });
}

function headlightCone(g: Graphics, x: number, y: number): void {
  const length = 32;
  const spread = 11;
  g.moveTo(x, y)
    .lineTo(x + length, y - spread)
    .lineTo(x + length, y + spread)
    .closePath()
    .fill({ color: COLORS.headlight, alpha: 0.16 });
}

/** Chunky rounded-rect pixel silhouette with a dark outline, windshield block, and (for taxi) a roof light. */
function drawBody(g: Graphics, kind: VehicleKind): Dims {
  switch (kind) {
    case "car": {
      const { w, h } = RAW_DIMS.car;
      g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 8.5).fill(OUTLINE);
      g.roundRect(-w / 2, -h / 2, w, h, 7).fill(VEHICLE_COLORS.red);
      g.roundRect(-w * 0.04, -h / 2 + 3, w * 0.34, h - 6, 4).fill(WINDSHIELD);
      return { w, h };
    }
    case "taxi": {
      const { w, h } = RAW_DIMS.taxi;
      g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 8.5).fill(OUTLINE);
      g.roundRect(-w / 2, -h / 2, w, h, 7).fill(VEHICLE_COLORS.taxi);
      g.roundRect(-w * 0.04, -h / 2 + 3, w * 0.34, h - 6, 4).fill(WINDSHIELD);
      g.roundRect(-7, -h / 2 - 6, 14, 6, 2).fill(OUTLINE);
      g.roundRect(-5, -h / 2 - 5, 10, 4, 2).fill(COLORS.white);
      return { w, h };
    }
    case "truck": {
      const { w, h } = RAW_DIMS.truck;
      g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 6.5).fill(OUTLINE);
      g.roundRect(-w / 2, -h / 2, w * 0.6, h, 5).fill(VEHICLE_COLORS.white);
      g.roundRect(w * 0.12, -h / 2, w * 0.42, h, 5).fill(0xcfcfd8);
      g.roundRect(w * 0.3, -h / 2 + 4, w * 0.2, h - 8, 3).fill(WINDSHIELD);
      return { w, h };
    }
    case "van": {
      const { w, h } = RAW_DIMS.van;
      g.roundRect(-w / 2 - 1.5, -h / 2 - 1.5, w + 3, h + 3, 7.5).fill(OUTLINE);
      g.roundRect(-w / 2, -h / 2, w, h, 6).fill(VEHICLE_COLORS.purple);
      g.roundRect(w * 0.1, -h / 2 + 3, w * 0.3, h - 6, 4).fill(WINDSHIELD);
      return { w, h };
    }
    case "sports": {
      const { w, h } = RAW_DIMS.sports;
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
  if (CONE_KINDS.has(kind)) {
    headlightCone(shape, w / 2, -h / 2 + 4);
    headlightCone(shape, w / 2, h / 2 - 4);
  }
  // Headlights (warm glow) at the +w/2 end, taillights (small red, no glow) at the -w/2 end.
  glowDot(shape, w / 2 - 3, -h / 2 + 4, COLORS.headlight, true);
  glowDot(shape, w / 2 - 3, h / 2 - 4, COLORS.headlight, true);
  glowDot(shape, -w / 2 + 3, -h / 2 + 4, 0xff3b3b, false);
  glowDot(shape, -w / 2 + 3, h / 2 - 4, 0xff3b3b, false);
  return { body, w, h };
}

const reflectionBlur = new BlurFilter({ strength: 2, quality: 2 });

/**
 * A bright, chunky pixel vehicle, oriented for horizontal travel — local +x
 * is "front" (headlights). Lanes.ts/Game.ts always rotate the returned
 * container +90° so every vehicle, with no exceptions, travels top-to-bottom.
 * Scaled uniformly so its on-screen body width lands on TARGET_BODY_WIDTH.
 */
export function buildVehicle(kind: VehicleKind): Container {
  const root = new Container();
  // Wet-road reflection: a mirrored, blurred, low-alpha streak trailing
  // behind the vehicle along its direction of travel (local -x, which
  // rotation always maps to "up the lane" since travel is always down) —
  // not to the side, so it reads as a reflection in the vehicle's wake.
  const { body: reflection, w } = buildBody(kind);
  reflection.scale.x = -0.5;
  reflection.x = -w * 0.7;
  reflection.alpha = 0.12;
  reflection.filters = [reflectionBlur];
  root.addChild(reflection);
  const { body: main } = buildBody(kind);
  root.addChild(main);
  root.scale.set(vehicleScale(kind));
  return root;
}
