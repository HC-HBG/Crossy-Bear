import { GameSession } from "./state";
import { Game } from "./game/Game";
import { DIFFICULTIES, type Difficulty, type Rig } from "./engine/mathEngine";
import "./style.css";

function parseUrlParams(): { seed?: number; rig?: Rig } {
  const params = new URLSearchParams(window.location.search);
  const seedRaw = params.get("seed");
  const rigRaw = params.get("rig");
  const seed = seedRaw !== null && seedRaw !== "" ? Number(seedRaw) : undefined;
  const rig: Rig = rigRaw === "win" || rigRaw === "lose" ? rigRaw : null;
  return { seed: Number.isFinite(seed) ? seed : undefined, rig };
}

async function bootstrap(): Promise<void> {
  const { seed, rig } = parseUrlParams();
  const session = new GameSession({ seed, rig });

  const root = document.getElementById("app")!;
  root.innerHTML = `
    <div id="canvas-host"></div>
    <div id="hud">
      <div id="hud-top">
        <div class="stat">Balance <strong id="balance">0.00</strong></div>
        <div class="stat">Best Win <strong id="bestWin">0.00</strong></div>
      </div>
      <div id="hud-bottom">
        <select id="difficulty"></select>
        <input id="bet" type="number" min="0.1" step="0.1" />
        <button id="startBtn">Start Game</button>
        <button id="cashOutBtn">Cash Out</button>
      </div>
    </div>
  `;

  const canvasHost = document.getElementById("canvas-host")!;
  const game = await Game.create(canvasHost, session);

  const difficultySelect = document.getElementById("difficulty") as HTMLSelectElement;
  for (const d of Object.values(DIFFICULTIES)) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = d.label;
    difficultySelect.appendChild(opt);
  }
  difficultySelect.value = session.snapshot().difficulty;
  difficultySelect.addEventListener("change", () => {
    session.setDifficulty(difficultySelect.value as Difficulty);
  });

  const betInput = document.getElementById("bet") as HTMLInputElement;
  betInput.value = String(session.snapshot().bet);
  betInput.addEventListener("change", () => {
    session.setBet(Number(betInput.value) || 0);
  });

  const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
  startBtn.addEventListener("click", () => game.onPrimaryInput());

  const cashOutBtn = document.getElementById("cashOutBtn") as HTMLButtonElement;
  cashOutBtn.addEventListener("click", () => void session.cashOut());

  const balanceEl = document.getElementById("balance")!;
  const bestWinEl = document.getElementById("bestWin")!;

  session.subscribe((snap) => {
    balanceEl.textContent = snap.balance.toFixed(2);
    bestWinEl.textContent = snap.bestWin.toFixed(2);
    const editable = snap.phase === "IDLE" || snap.phase === "DEAD" || snap.phase === "CASHED_OUT";
    difficultySelect.disabled = !editable;
    betInput.disabled = !editable;
    startBtn.disabled = !(editable && snap.bet > 0 && snap.bet <= snap.balance);
    startBtn.textContent = snap.phase === "DEAD" || snap.phase === "CASHED_OUT" ? "Play Again" : "Start Game";
    cashOutBtn.disabled = snap.phase !== "STEP_WON";
    cashOutBtn.textContent =
      snap.phase === "STEP_WON" && snap.lastOutcome ? `Cash Out ${snap.lastOutcome.amount.toFixed(2)}` : "Cash Out";
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      game.onPrimaryInput();
    } else if (e.code === "KeyC") {
      void session.cashOut();
    } else if (e.code === "KeyT") {
      session.toggleTurbo();
    } else if (e.code === "KeyM") {
      session.toggleMuted();
    }
  });

  canvasHost.addEventListener("pointerdown", () => game.onPrimaryInput());
}

bootstrap();
