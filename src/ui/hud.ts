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

const DIFFICULTY_ORDER = Object.values(DIFFICULTIES).map((def) => def.id);

const COIN_ICON_DEFS = `
  <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <symbol id="coin-icon-def" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" fill="#f5b41e" stroke="#b8860b" stroke-width="2"/>
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="#b8860b" stroke-width="1.4" opacity="0.65"/>
    </symbol>
  </svg>
`;

function coinIcon(extraClass = ""): string {
  return `<svg class="coin-icon ${extraClass}" aria-hidden="true" focusable="false"><use href="#coin-icon-def"/></svg>`;
}

export function buildHud(root: HTMLElement, session: GameSession, callbacks: HudCallbacks): void {
  root.innerHTML = `
    ${COIN_ICON_DEFS}
    <div id="canvas-host"></div>
    <div id="hud">
      <header id="hud-top">
        <div id="logo" aria-label="Crossy Bear">
          <span class="logo-line logo-crossy">Crossy</span>
          <span class="logo-line logo-bear">Bear</span>
        </div>

        <div id="best-win-stat" class="stat-block">
          <span class="stat-label">Best Win</span>
          <strong id="bestWin" class="js-best-win">0.00</strong>
        </div>

        <div id="top-right">
          <div class="balance-chip">
            ${coinIcon()}
            <strong id="balance">0.00</strong>
          </div>
          <button
            id="menuBtn"
            class="icon-card-btn"
            type="button"
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded="false"
            aria-controls="menu-drawer"
          >
            <svg viewBox="0 0 24 24" class="hamburger-icon" aria-hidden="true" focusable="false">
              <rect x="3" y="5" width="18" height="2.6" rx="1"></rect>
              <rect x="3" y="10.7" width="18" height="2.6" rx="1"></rect>
              <rect x="3" y="16.4" width="18" height="2.6" rx="1"></rect>
            </svg>
          </button>
        </div>
      </header>

      <div id="zone-status" class="zone-badge" hidden></div>

      <footer id="hud-bottom">
        <div id="bet-group" class="hud-group">
          <span class="group-label">Bet Amount</span>
          <div class="bet-controls">
            <div class="bet-input-wrap">
              ${coinIcon("coin-icon-small")}
              <input
                id="bet"
                type="number"
                min="0.1"
                max="${MAX_BET}"
                step="0.1"
                inputmode="decimal"
                aria-label="Bet amount"
              />
            </div>
            <button id="betHalf" class="chip-btn" type="button" aria-label="Halve bet">½</button>
            <button id="betDouble" class="chip-btn" type="button" aria-label="Double bet">2X</button>
            <button id="betMax" class="chip-btn" type="button" aria-label="Max bet">MAX</button>
          </div>
        </div>

        <div class="hud-divider" aria-hidden="true"></div>

        <div id="difficulty-group" class="hud-group">
          <span class="group-label" id="difficulty-label">Difficulty</span>
          <div
            id="difficultyPicker"
            class="difficulty-picker"
            role="radiogroup"
            aria-labelledby="difficulty-label"
          ></div>
        </div>

        <div class="hud-divider" aria-hidden="true"></div>

        <div id="action-group" class="hud-group action-group">
          <div id="nextMultiplier" class="next-multiplier" aria-live="polite"></div>
          <div id="action-slot" class="action-slot">
            <button id="startBtn" class="primary-btn" type="button">Start Game</button>
            <button id="cashOutBtn" class="primary-btn cashout-btn" type="button" hidden>Cash Out</button>
          </div>
        </div>
      </footer>
    </div>

    <div id="menu-drawer" hidden>
      <div id="drawer-backdrop"></div>
      <div id="drawer-panel" role="dialog" aria-modal="true" aria-label="Menu">
        <header class="drawer-header">
          <span>Menu</span>
          <button id="drawerCloseBtn" class="icon-card-btn" type="button" aria-label="Close menu">✕</button>
        </header>

        <div id="drawer-best-win" class="drawer-stat">
          <span class="stat-label">Best Win</span>
          <strong id="bestWinDrawer" class="js-best-win">0.00</strong>
        </div>

        <section class="drawer-section">
          <h3>How to Play</h3>
          <p>
            Tap to hop lane by lane. Cash out any time, or ride the ladder to
            the far bank for the top multiplier. Timing never matters —
            every step is a reveal, not a reflex test.
          </p>
        </section>

        <div class="drawer-actions">
          <button id="paytableBtn" class="drawer-btn" type="button">Paytable</button>
          <button id="turboBtn" class="drawer-btn toggle-btn" type="button" aria-pressed="false">
            <span>Turbo</span><span class="toggle-state">Off</span>
          </button>
          <button id="muteBtn" class="drawer-btn toggle-btn" type="button" aria-pressed="false">
            <span>Sound</span><span class="toggle-state">On</span>
          </button>
        </div>
      </div>
    </div>
  `;

  const canvasHost = document.getElementById("canvas-host") as HTMLElement;
  const hud = document.getElementById("hud") as HTMLElement;
  const toasts = new ToastHost(hud);
  const paytable = new PaytablePanel(root);

  const balanceEl = document.getElementById("balance")!;
  const bestWinEls = Array.from(document.querySelectorAll<HTMLElement>(".js-best-win"));
  const zoneStatusEl = document.getElementById("zone-status")!;
  const startBtn = document.getElementById("startBtn") as HTMLButtonElement;
  const cashOutBtn = document.getElementById("cashOutBtn") as HTMLButtonElement;
  const nextMultiplierEl = document.getElementById("nextMultiplier")!;
  const betInput = document.getElementById("bet") as HTMLInputElement;
  const betHalfBtn = document.getElementById("betHalf") as HTMLButtonElement;
  const betDoubleBtn = document.getElementById("betDouble") as HTMLButtonElement;
  const betMaxBtn = document.getElementById("betMax") as HTMLButtonElement;
  const turboBtn = document.getElementById("turboBtn") as HTMLButtonElement;
  const muteBtn = document.getElementById("muteBtn") as HTMLButtonElement;
  const paytableBtn = document.getElementById("paytableBtn") as HTMLButtonElement;
  const difficultyPicker = document.getElementById("difficultyPicker")!;
  const menuBtn = document.getElementById("menuBtn") as HTMLButtonElement;
  const menuDrawer = document.getElementById("menu-drawer") as HTMLElement;
  const drawerBackdrop = document.getElementById("drawer-backdrop")!;
  const drawerCloseBtn = document.getElementById("drawerCloseBtn") as HTMLButtonElement;

  const difficultyButtons: Partial<Record<Difficulty, HTMLButtonElement>> = {};
  for (const def of Object.values(DIFFICULTIES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "difficulty-btn";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.title = DIFFICULTY_HINTS[def.id];
    btn.tabIndex = -1;
    btn.innerHTML = `<span class="difficulty-name">${def.label}</span><span class="sr-only">${DIFFICULTY_HINTS[def.id]}</span>`;
    btn.addEventListener("click", () => {
      session.setDifficulty(def.id);
      paytable.setDifficulty(def.id);
    });
    difficultyPicker.appendChild(btn);
    difficultyButtons[def.id] = btn;
  }

  difficultyPicker.addEventListener("keydown", (e) => {
    const navKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!navKeys.includes(e.key)) return;
    e.preventDefault();
    const snap = session.snapshot();
    const editable = snap.phase === "IDLE" || snap.phase === "DEAD" || snap.phase === "CASHED_OUT";
    if (!editable) return;
    const currentIndex = DIFFICULTY_ORDER.indexOf(snap.difficulty);
    let nextIndex = currentIndex;
    if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = DIFFICULTY_ORDER.length - 1;
    else {
      const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      nextIndex = (currentIndex + dir + DIFFICULTY_ORDER.length) % DIFFICULTY_ORDER.length;
    }
    const nextId = DIFFICULTY_ORDER[nextIndex];
    session.setDifficulty(nextId);
    paytable.setDifficulty(nextId);
    difficultyButtons[nextId]?.focus();
  });

  function clampBet(value: number, balance: number): number {
    return Math.max(0.1, Math.min(Math.round(value * 100) / 100, balance, MAX_BET));
  }

  betInput.addEventListener("change", () => {
    session.setBet(Number(betInput.value) || 0.1);
  });
  betHalfBtn.addEventListener("click", () => {
    const snap = session.snapshot();
    session.setBet(clampBet(snap.bet / 2, snap.balance));
  });
  betDoubleBtn.addEventListener("click", () => {
    const snap = session.snapshot();
    session.setBet(clampBet(snap.bet * 2, snap.balance));
  });
  betMaxBtn.addEventListener("click", () => {
    const snap = session.snapshot();
    session.setBet(clampBet(MAX_BET, snap.balance));
  });

  startBtn.addEventListener("click", () => callbacks.onPrimaryInput());
  cashOutBtn.addEventListener("click", () => void session.cashOut());
  canvasHost.addEventListener("pointerdown", () => callbacks.onPrimaryInput());

  turboBtn.addEventListener("click", () => session.toggleTurbo());
  muteBtn.addEventListener("click", () => session.toggleMuted());
  paytableBtn.addEventListener("click", () => paytable.toggle());

  function openMenu(): void {
    menuDrawer.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
    drawerCloseBtn.focus();
  }
  function closeMenu(): void {
    menuDrawer.hidden = true;
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.focus();
  }
  menuBtn.addEventListener("click", () => (menuDrawer.hidden ? openMenu() : closeMenu()));
  drawerCloseBtn.addEventListener("click", closeMenu);
  drawerBackdrop.addEventListener("click", closeMenu);

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Escape" && !menuDrawer.hidden) {
      closeMenu();
      return;
    }
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
    for (const el of bestWinEls) el.textContent = snap.bestWin.toFixed(2);

    const editable = snap.phase === "IDLE" || snap.phase === "DEAD" || snap.phase === "CASHED_OUT";
    const inRound = snap.phase === "STEP_WON" || snap.phase === "RESOLVING_STEP" || snap.phase === "ROUND_ACTIVE";

    betInput.disabled = !editable;
    betInput.value = String(snap.bet);
    betHalfBtn.disabled = !editable;
    betDoubleBtn.disabled = !editable;
    betMaxBtn.disabled = !editable;

    for (const [id, btn] of Object.entries(difficultyButtons)) {
      const isActive = id === snap.difficulty;
      btn!.classList.toggle("active", isActive);
      btn!.disabled = !editable;
      btn!.setAttribute("aria-checked", String(isActive));
      btn!.tabIndex = isActive ? 0 : -1;
    }

    startBtn.disabled = !(editable && snap.bet > 0 && snap.bet <= snap.balance);
    startBtn.textContent = snap.phase === "DEAD" || snap.phase === "CASHED_OUT" ? "Play Again" : "Start Game";
    startBtn.hidden = inRound;

    const canCashOut = snap.phase === "STEP_WON" && !!snap.lastOutcome;
    cashOutBtn.hidden = !inRound;
    cashOutBtn.disabled = !canCashOut;
    if (canCashOut && snap.lastOutcome) {
      const amount = snap.lastOutcome.amount;
      cashOutBtn.textContent = `Cash Out ${amount.toFixed(2)}`;
      const weight = 1 + Math.min(0.55, Math.log10(Math.max(1, snap.lastOutcome.multiplier)) * 0.4);
      cashOutBtn.style.setProperty("--weight", String(weight));
      if (snap.lastOutcome.nextMultiplier !== null) {
        nextMultiplierEl.textContent = `Next: ${snap.lastOutcome.multiplier.toFixed(2)}x → ${snap.lastOutcome.nextMultiplier.toFixed(2)}x`;
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
    turboBtn.setAttribute("aria-pressed", String(snap.turbo));
    turboBtn.querySelector(".toggle-state")!.textContent = snap.turbo ? "On" : "Off";

    muteBtn.classList.toggle("active", snap.muted);
    muteBtn.setAttribute("aria-pressed", String(snap.muted));
    muteBtn.querySelector(".toggle-state")!.textContent = snap.muted ? "Off" : "On";

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
