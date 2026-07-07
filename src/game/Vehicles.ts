import { Container, Graphics } from "pixi.js";
import { COLORS } from "./constants";

export type VehicleKind = "car" | "taxi" | "truck" | "van" | "sports";

const KINDS: VehicleKind[] = ["car", "taxi", "truck", "van", "sports"];

export function randomVehicleKind(seedIndex: number): VehicleKind {
  return KINDS[seedIndex % KINDS.length];
}

function glowDot(g: Graphics, x: number, y: number, color: number): void {
  g.circle(x, y, 7).fill({ color, alpha: 0.12 });
  g.circle(x, y, 4).fill({ color, alpha: 0.28 });
  g.circle(x, y, 1.8).fill({ color, alpha: 0.95 });
}

function drawSilhouette(g: Graphics, kind: VehicleKind): { w: number; h: number } {
  switch (kind) {
    case "car": {
      const w = 50;
      const h = 22;
      g.roundRect(-w / 2, -h / 2, w, h, 7).fill(COLORS.black);
      g.roundRect(-w * 0.12, -h / 2 - 8, w * 0.42, 10, 5).fill(0x1c1c30);
      return { w, h };
    }
    case "taxi": {
      const w = 52;
      const h = 22;
      g.roundRect(-w / 2, -h / 2, w, h, 7).fill(0x2a2210);
      g.roundRect(-w * 0.1, -h / 2 - 8, w * 0.4, 10, 5).fill(0x2a2210);
      g.roundRect(-6, -h / 2 - 12, 12, 5, 2).fill(COLORS.gold);
      return { w, h };
    }
    case "truck": {
      const w = 68;
      const h = 26;
      g.roundRect(-w / 2, -h / 2, w * 0.62, h, 4).fill(0x191927);
      g.roundRect(w * 0.12, -h / 2 - 2, w * 0.38, h + 4, 5).fill(COLORS.black);
      return { w, h };
    }
    case "van": {
      const w = 56;
      const h = 28;
      g.roundRect(-w / 2, -h / 2, w, h, 6).fill(0x20202e);
      return { w, h };
    }
    case "sports": {
      const w = 48;
      const h = 18;
      g.moveTo(-w / 2, h / 2)
        .lineTo(-w / 2 + 6, -h / 2)
        .lineTo(w / 2 - 10, -h / 2)
        .lineTo(w / 2, h / 2)
        .closePath()
        .fill(0x3a0f14);
      return { w, h };
    }
  }
}

function buildBody(kind: VehicleKind): { body: Container; w: number; h: number } {
  const body = new Container();
  const shape = new Graphics();
  const { w, h } = drawSilhouette(shape, kind);
  body.addChild(shape);
  glowDot(shape, w / 2 - 4, -h / 2 + 4, COLORS.headlight);
  glowDot(shape, w / 2 - 4, h / 2 - 4, COLORS.headlight);
  shape.circle(-w / 2 + 3, -h / 2 + 4, 1.6).fill({ color: 0xff3b3b, alpha: 0.9 });
  shape.circle(-w / 2 + 3, h / 2 - 4, 1.6).fill({ color: 0xff3b3b, alpha: 0.9 });
  return { body, w, h };
}

/** A vehicle with headlight glow + a soft low-alpha reflection, oriented for horizontal travel. */
export function buildVehicle(kind: VehicleKind): Container {
  const root = new Container();
  const { body: main } = buildBody(kind);
  const { body: reflection, h } = buildBody(kind);
  reflection.scale.y = -0.55;
  reflection.y = h * 0.95;
  reflection.alpha = 0.16;
  root.addChild(reflection);
  root.addChild(main);
  return root;
}
