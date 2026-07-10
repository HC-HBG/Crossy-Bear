import { DIFFICULTIES, MathEngine, zoneForStep, type Difficulty } from "../engine/mathEngine";
import { formatMultiplier } from "../format";

/** Prints every difficulty's multiplier ladder to the console for quick verification. */
export function logPaytablesToConsole(): void {
  for (const def of Object.values(DIFFICULTIES)) {
    const table = MathEngine.tableFor(def.id);
    const rows = table.map((multiplier, i) => ({
      step: i + 1,
      zone: zoneForStep(def, i),
      multiplier: `${multiplier.toFixed(2)}x`,
    }));
    console.log(`Paytable — ${def.label}`);
    console.table(rows);
  }
}

export class PaytablePanel {
  readonly el: HTMLElement;
  private tableBody: HTMLElement;
  private tabs: Record<Difficulty, HTMLButtonElement> = {} as Record<Difficulty, HTMLButtonElement>;
  private active: Difficulty = "medium";
  private open = false;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "paytable-panel";
    this.el.hidden = true;

    const header = document.createElement("div");
    header.className = "paytable-header";
    header.innerHTML = `<span>Paytable</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "icon-toggle";
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Close paytable");
    closeBtn.addEventListener("click", () => this.hide());
    header.appendChild(closeBtn);
    this.el.appendChild(header);

    const tabRow = document.createElement("div");
    tabRow.className = "paytable-tabs";
    for (const def of Object.values(DIFFICULTIES)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = def.label;
      btn.addEventListener("click", () => this.setDifficulty(def.id));
      tabRow.appendChild(btn);
      this.tabs[def.id] = btn;
    }
    this.el.appendChild(tabRow);

    this.tableBody = document.createElement("div");
    this.tableBody.className = "paytable-body";
    this.el.appendChild(this.tableBody);

    host.appendChild(this.el);
    this.render();
  }

  setDifficulty(difficulty: Difficulty): void {
    this.active = difficulty;
    this.render();
  }

  toggle(): void {
    this.open ? this.hide() : this.show();
  }

  show(): void {
    this.open = true;
    this.el.hidden = false;
  }

  hide(): void {
    this.open = false;
    this.el.hidden = true;
  }

  private render(): void {
    for (const [id, btn] of Object.entries(this.tabs)) {
      btn.classList.toggle("active", id === this.active);
    }
    const def = DIFFICULTIES[this.active];
    const table = MathEngine.tableFor(this.active);
    this.tableBody.innerHTML = table
      .map((multiplier, i) => {
        const zone = zoneForStep(def, i);
        return `<div class="paytable-row ${zone}"><span>${i + 1}</span><span>${zone}</span><span>${formatMultiplier(multiplier)}</span></div>`;
      })
      .join("");
  }
}
