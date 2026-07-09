import { GameSession, resetPersistedProgress } from "./state";
import { Game } from "./game/Game";
import { buildHud } from "./ui/hud";
import { wireAudio } from "./audio/wireAudio";
import type { Rig } from "./engine/mathEngine";
import "./style.css";

function parseUrlParams(): { seed?: number; rig?: Rig; reset: boolean } {
  const params = new URLSearchParams(window.location.search);
  const seedRaw = params.get("seed");
  const rigRaw = params.get("rig");
  const seed = seedRaw !== null && seedRaw !== "" ? Number(seedRaw) : undefined;
  const rig: Rig = rigRaw === "win" || rigRaw === "lose" ? rigRaw : null;
  const reset = params.has("reset");
  return { seed: Number.isFinite(seed) ? seed : undefined, rig, reset };
}

async function bootstrap(): Promise<void> {
  const { seed, rig, reset } = parseUrlParams();
  if (reset) resetPersistedProgress();
  const session = new GameSession({ seed, rig });
  wireAudio(session);
  const root = document.getElementById("app")!;

  let game: Game | null = null;
  buildHud(root, session, {
    onPrimaryInput: () => game?.onPrimaryInput(),
  });

  const canvasHost = document.getElementById("canvas-host") as HTMLElement;
  game = await Game.create(canvasHost, session);
}

bootstrap();
