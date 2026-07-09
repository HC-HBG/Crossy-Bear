import { GameSession, MAX_BET, type SessionSnapshot } from "../state";
import { DIFFICULTIES, MathEngine, type Difficulty } from "../engine/mathEngine";
import { ToastHost } from "./toast";
import { PaytablePanel, logPaytablesToConsole } from "./paytable";

export interface HudCallbacks {
  onPrimaryInput: () => void;
}

const DIFFICULTY_HINTS: Record<Difficulty, string> = {
  easy: "Long ladder, gentle odds",
  medium: "Balanced risk and reward",
  hard: "Fewer steps, sharper odds",
  daredevil: "Short and brutal — huge ceiling",
};

export function buildHud(root: HTMLElement, session: GameSession, callbacks: HudCallbacks): void {
  root.innerHTML = `
    <div id="canvas-host"></div>
    <div id="hud">
      <div id="hud-header">
        <header id="hud-top">
          <div class="stat">
            <span class="stat-label">Balance</span>
            <strong id="balance">0.00</strong>
          </div>
          <div id="zone-status" class="zone-badge" hidden></div>
          <div class="stat stat-right">
            <span class="stat-label">Best Win</span>
            <strong id="bestWin">0.00</strong>
          </div>
        </header>

        <div id="toggles">
          <button id="turboBtn" class="icon-toggle" title="Turbo (T)">⚡ Turbo</button>
          <button id="muteBtn" class="icon-toggle" title="Mute (M)">🔊</button>
          <button id="paytableBtn" class="icon-toggle" title="Paytable">Paytable</button>
        </div>
      </div>

      <footer id="hud-bottom">
        <div id="bet-panel">
          <div id="difficultyPicker" class="difficulty-picker"></div>
          <div class="bet-row">
            <button id="betHalf" type="button">½</button>
            <div class="bet-input-wrap">
              <span>Bet</span>
              <input id="bet" type="number" min="0.1" max="${MAX_BET}" step="0.1" inputmode="decimal" />
            </div>
            <button id="betDouble" type="button">2x</button>
            <button id="betMax" type="button">Max</button>
          </div>
          <button id="startBtn" class="primary-btn">Start Game</button>
        </div>

        <div id="decision-panel" hidden>
          <div id="nextMultiplier"></div>
          <button id="cashOutBtn" class="cashout-btn">Cash Out</button>
        </div>
      </footer>
    </div>
  `;

  const canvasHost = document.getElementById("canvas-host") as HTMLElement;
  const hud = document.getElementById("hud") as HTMLElement;
  const toasts = new ToastHost(hud);
  const paytable = new PaytablePanel(root);

  const balanceEl = document.getElementById("balance")!;
  const bestWinEl = document.getElementById("bestWin")!;
  const zoneStatusEl = document.getElementById("zone-status")!;
  const betPanel = document.getElementById("bet-panel")!;
  const decisionPanel = document.getElementById("decision-panel")!;
  const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
  const cashOutBtn = document.getElementById("cashOutBtn") as HTMLButtonElement;
  const nextMultiplierEl = document.getElementById("nextMultiplier")!;
  const betInput = document.getElementById("bet") as HTMLInputElement;
  const turboBtn = document.getElementById("turboBtn") as HTMLButtonElement;
  const muteBtn = document.getElementById("muteBtn") as HTMLButtonElement;
  const paytableBtn = document.getElementById("paytableBtn") as HTMLButtonElement;
  const difficultyPicker = document.getElementById("difficultyPicker")!;

  const difficultyButtons: Partial<Record<Difficulty, HTMLButtonElement>> = {};
  for (const def of Object.values(DIFFICULTIES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "difficulty-btn";
    btn.innerHTML = `<span class="difficulty-name">${def.label}</span><span class="difficulty-hint">${DIFFICULTY_HINTS[def.id]}</span>`;
    btn.addEventListener("click", () => {
      session.setDifficulty(def.id);
      paytable.setDifficulty(def.id);
    });
    difficultyPicker.appendChild(btn);
    difficultyButtons[def.id] = btn;
  }

  function clampBet(value: number, balance: number): number {
    return Math.max(0.1, Math.min(Math.round(value * 100) / 100, balance, MAX_BET));
  }

  betInput.addEventListener("change", () => {
    session.setBet(Number(betInput.value) || 0.1);
  });
  document.getElementById("betHalf")!.addEventListener("click", () => {
    const snap = session.snapshot();
    session.setBet(clampBet(snap.bet / 2, snap.balance));
  });
  document.getElementById("betDouble")!.addEventListener("click", () => {
    const snap = session.snapshot();
    session.setBet(clampBet(snap.bet * 2, snap.balance));
  });
  document.getElementById("betMax")!.addEventListener("click", () => {
    const snap = session.snapshot();
    session.setBet(clampBet(MAX_BET, snap.balance));
  });

  startBtn.addEventListener("click", () => callbacks.onPrimaryInput());
  cashOutBtn.addEventListener("click", () => void session.cashOut());
  canvasHost.addEventListener("pointerdown", () => callbacks.onPrimaryInput());

  turboBtn.addEventListener("click", () => session.toggleTurbo());
  muteBtn.addEventListener("click", () => session.toggleMuted());
  paytableBtn.addEventListener("click", () => paytable.toggle());

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    switch (e.code) {
      case "Space":
        e.preventDefault();
        callbacks.onPrimaryInput();
        break;
      case "KeyC":
        void session.cashOut();
        break;
      case "KeyT":
        session.toggleTurbo();
        break;
      case "KeyM":
        session.toggleMuted();
        break;
    }
  });

  let lastZoneShown: string | null = null;
  let lastPhaseForToast: SessionSnapshot["phase"] = "IDLE";

  session.subscribe((snap) => {
    balanceEl.textContent = snap.balance.toFixed(2);
    bestWinEl.textContent = snap.bestWin.toFixed(2);

    const editable = snap.phase === "IDLE" || snap.phase === "DEAD" || snap.phase === "CASHED_OUT";
    const inRound = snap.phase === "STEP_WON" || snap.phase === "RESOLVING_STEP" || snap.phase === "ROUND_ACTIVE";

    betPanel.hidden = inRound;
    decisionPanel.hidden = !inRound;

    betInput.disabled = !editable;
    betInput.value = String(snap.bet);
    for (const [id, btn] of Object.entries(difficultyButtons)) {
      btn!.classList.toggle("active", id === snap.difficulty);
      btn!.disabled = !editable;
    }

    startBtn.disabled = !(editable && snap.bet > 0 && snap.bet <= snap.balance);
    startBtn.textContent = snap.phase === "DEAD" || snap.phase === "CASHED_OUT" ? "Play Again" : "Start Game";

    const canCashOut = snap.phase === "STEP_WON" && !!snap.lastOutcome;
    cashOutBtn.disabled = !canCashOut;
    if (canCashOut && snap.lastOutcome) {
      const amount = snap.lastOutcome.amount;
      cashOutBtn.textContent = `Cash Out ${amount.toFixed(2)}`;
      const weight = 1 + Math.min(0.55, Math.log10(Math.max(1, snap.lastOutcome.multiplier)) * 0.4);
      cashOutBtn.style.setProperty("--weight", String(weight));
      if (snap.lastOutcome.nextMultiplier !== null) {
        nextMultiplierEl.textContent = `${snap.lastOutcome.multiplier.toFixed(2)}x now → ${snap.lastOutcome.nextMultiplier.toFixed(2)}x next`;
      } else {
        nextMultiplierEl.textContent = "";
      }
    } else {
      cashOutBtn.textContent = "Cash Out";
      cashOutBtn.style.setProperty("--weight", "1");
      if (snap.phase === "ROUND_ACTIVE") {
        const firstMultiplier = MathEngine.tableFor(snap.difficulty)[0];
        nextMultiplierEl.textContent = `Tap to hop — ${firstMultiplier.toFixed(2)}x on step 1`;
      } else if (snap.phase !== "STEP_WON") {
        nextMultiplierEl.textContent = "";
      }
    }

    if (snap.lastOutcome && (snap.phase === "STEP_WON" || snap.phase === "DEAD")) {
      zoneStatusEl.hidden = false;
      zoneStatusEl.textContent = snap.lastOutcome.zone === "road" ? "ROAD" : "RIVER";
      zoneStatusEl.className = `zone-badge ${snap.lastOutcome.zone}`;
    } else {
      zoneStatusEl.hidden = true;
    }

    turboBtn.classList.toggle("active", snap.turbo);
    muteBtn.textContent = snap.muted ? "🔇" : "🔊";
    muteBtn.classList.toggle("active", snap.muted);

    // Subtle, non-modal prompts: once when the bear is parked at the kerb
    // waiting for the first tap, and once when its current lane flips from
    // road to river.
    const isFreshRound = lastPhaseForToast === "IDLE" || lastPhaseForToast === "DEAD" || lastPhaseForToast === "CASHED_OUT";
    if (snap.phase === "ROUND_ACTIVE" && isFreshRound) {
      lastZoneShown = null;
      toasts.show("Bear's at the kerb — tap to cross.");
    }
    if (snap.phase === "STEP_WON" && snap.lastOutcome) {
      const zone = snap.lastOutcome.zone;
      if (zone === "river" && lastZoneShown !== "river") {
        toasts.show("The road clears — riverbank ahead. Footing gets slippery.");
      }
      lastZoneShown = zone;
    }
    lastPhaseForToast = snap.phase;
  });

  logPaytablesToConsole();
  paytable.setDifficulty(session.snapshot().difficulty);
}
