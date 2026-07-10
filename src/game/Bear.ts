import { Assets, Container, Sprite, Texture, Ticker } from "pixi.js";
import { tween, easeOutBack, easeOutQuad } from "./tween";

import idleUrl from "../assets/bear/idle.png";
import hopUrl from "../assets/bear/hop.png";
import flatUrl from "../assets/bear/flat.png";
import celebrateUrl from "../assets/bear/celebrate.png";
import ddIdleUrl from "../assets/bear/daredevil/idle.png";
import ddHopUrl from "../assets/bear/daredevil/hop.png";
import ddFlatUrl from "../assets/bear/daredevil/flat.png";
import ddCelebrateUrl from "../assets/bear/daredevil/celebrate.png";

type Pose = "idle" | "hop" | "flat" | "celebrate";
export type Skin = "default" | "daredevil";

const POSE_URLS: Record<Skin, Record<Pose, string>> = {
  default: {
    idle: idleUrl,
    hop: hopUrl,
    flat: flatUrl,
    celebrate: celebrateUrl,
  },
  daredevil: {
    idle: ddIdleUrl,
    hop: ddHopUrl,
    flat: ddFlatUrl,
    celebrate: ddCelebrateUrl,
  },
};

// idle/hop are natively 320px tall; this scale gives the bear a consistent
// ~92px on-screen height across all four sprite poses. The daredevil skin
// is a separate art batch, calibrated (see the asset-processing history)
// to the same ear-span-in-final-texture target as the default skin's
// idle.png, so this one constant applies uniformly to both skins.
const SPRITE_SCALE = 92 / 320;

type PoseTextures = Record<Pose, Texture>;
type SkinTextures = Record<Skin, PoseTextures>;

let texturesPromise: Promise<SkinTextures> | null = null;

/** Preloads and caches both skins' sprite textures. Call once before creating a Bear. */
export function preloadBearTextures(): Promise<SkinTextures> {
  texturesPromise ??= (async () => {
    const skinPairs = await Promise.all(
      (Object.entries(POSE_URLS) as [Skin, Record<Pose, string>][]).map(async ([skin, urls]) => {
        const posePairs = await Promise.all(
          (Object.entries(urls) as [Pose, string][]).map(
            async ([pose, url]) => [pose, await Assets.load<Texture>(url)] as const,
          ),
        );
        return [skin, Object.fromEntries(posePairs) as PoseTextures] as const;
      }),
    );
    return Object.fromEntries(skinPairs) as SkinTextures;
  })();
  return texturesPromise;
}

export class Bear {
  readonly view: Container;
  private sprite: Sprite;
  private skins: SkinTextures;
  private skin: Skin = "default";
  private currentPose: Pose = "idle";
  private ticker: Ticker;
  private idleTime = 0;
  private idleEnabled = true;

  constructor(ticker: Ticker, skins: SkinTextures) {
    this.ticker = ticker;
    this.skins = skins;
    this.view = new Container();
    this.sprite = new Sprite(skins.default.idle);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(SPRITE_SCALE);
    this.view.addChild(this.sprite);
    this.ticker.add(this.onTick);
  }

  destroy(): void {
    this.ticker.remove(this.onTick);
    this.view.destroy({ children: true });
  }

  private onTick = (): void => {
    if (!this.idleEnabled) return;
    this.idleTime += this.ticker.deltaMS;
    const bob = Math.sin(this.idleTime / 260) * 3;
    this.sprite.y = bob;
  };

  private setPose(pose: Pose): void {
    this.currentPose = pose;
    this.sprite.texture = this.skins[this.skin][pose];
  }

  /** Swaps the active sprite set (e.g. the Daredevil theme) without disturbing pose/animation state. */
  setSkin(skin: Skin): void {
    if (this.skin === skin) return;
    this.skin = skin;
    this.sprite.texture = this.skins[this.skin][this.currentPose];
  }

  reset(x: number): void {
    this.view.x = x;
    this.view.scale.set(1, 1);
    this.view.alpha = 1;
    this.view.rotation = 0;
    this.sprite.y = 0;
    this.idleEnabled = true;
    this.setPose("idle");
  }

  async hopTo(targetX: number, durationMs: number): Promise<void> {
    this.idleEnabled = false;
    this.setPose("hop");
    const startX = this.view.x;
    const dx = targetX - startX;
    await tween(
      this.ticker,
      durationMs,
      (t) => {
        this.view.x = startX + dx * t;
        // subtle secondary motion layered on top of the hop pose's own baked-in leap
        const arc = Math.sin(Math.PI * t);
        this.view.scale.set(1 - arc * 0.08, 1 + arc * 0.1);
        this.sprite.y = -arc * 14;
      },
      easeOutQuad,
    );
    this.view.scale.set(1, 1);
    this.sprite.y = 0;
    this.setPose("idle");
    this.idleEnabled = true;
  }

  async dieFlatten(durationMs: number): Promise<void> {
    this.idleEnabled = false;
    this.setPose("flat");
    await tween(this.ticker, durationMs, (t) => {
      const impact = Math.sin(Math.PI * t) * (1 - t * 0.3);
      this.view.scale.set(1 + impact * 0.25, 1 - impact * 0.15);
    });
    this.view.scale.set(1, 1);
  }

  async dieSplash(durationMs: number): Promise<void> {
    this.idleEnabled = false;
    await tween(this.ticker, durationMs, (t) => {
      this.sprite.y = t * 40;
      this.view.scale.set(1 - t * 0.3, 1 - t * 0.3);
      this.view.alpha = 1 - t;
    });
  }

  /** Cash-out flourish. celebrateBig swaps to the celebrate pose (reserved for >=2x cash-outs). */
  async fistPump(durationMs: number, celebrateBig: boolean): Promise<void> {
    this.idleEnabled = false;
    if (celebrateBig) this.setPose("celebrate");
    await tween(
      this.ticker,
      durationMs,
      (t) => {
        const bounce = Math.sin(Math.PI * t);
        this.view.scale.set(1 - bounce * 0.1, 1 + bounce * 0.22);
        this.sprite.y = -bounce * 20;
      },
      easeOutBack,
    );
    this.view.scale.set(1, 1);
    this.sprite.y = 0;
    if (celebrateBig) this.setPose("idle");
    this.idleEnabled = true;
  }
}
