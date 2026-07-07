/** Lightweight non-blocking toast queue for subtle prompts (zone transitions, etc). */
export class ToastHost {
  private el: HTMLElement;

  constructor(host: HTMLElement) {
    this.el = document.createElement("div");
    this.el.id = "toast-host";
    host.appendChild(this.el);
  }

  show(text: string, durationMs = 2200): void {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = text;
    this.el.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast-visible"));
    window.setTimeout(() => {
      toast.classList.remove("toast-visible");
      window.setTimeout(() => toast.remove(), 300);
    }, durationMs);
  }
}
