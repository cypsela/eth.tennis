import { formatLine, type LogEntry } from "@cypsela/gateway-sw-core";

export class Terminal {
  private spinnerEl: HTMLElement | null = null;

  constructor(private readonly host: HTMLElement) {}

  append(entry: LogEntry): void {
    const line = document.createElement("div");
    line.className = `line level-${entry.level} source-${entry.source}`;
    line.textContent = formatLine(entry);
    this.host.appendChild(line);
    this.host.scrollTop = this.host.scrollHeight;

    const consoleFn = entry.level === "error"
      ? console.error
      : entry.level === "warn"
      ? console.warn
      : console.info;
    consoleFn.call(console, formatLine(entry));
  }

  renderAll(entries: readonly LogEntry[]): void {
    for (const e of entries) this.append(e);
  }

  clear(): void {
    this.host.textContent = "";
    this.spinnerEl = null;
  }

  showSpinner(): void {
    if (this.spinnerEl) return;
    const el = document.createElement("div");
    el.className = "line spinner";
    el.setAttribute("role", "status");
    el.setAttribute("aria-label", "working");
    this.host.appendChild(el);
    this.host.scrollTop = this.host.scrollHeight;
    this.spinnerEl = el;
  }

  hideSpinner(): void {
    this.spinnerEl?.remove();
    this.spinnerEl = null;
  }
}
