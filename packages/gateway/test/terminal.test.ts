import type { LogEntry } from "@cypsela/gateway-sw-core";
import { describe, expect, test } from "vitest";
import { Terminal } from "../src/terminal.ts";

describe("Terminal", () => {
  test("appends one <div class='line'> per entry", () => {
    document.body.innerHTML = "<main id=\"terminal\"></main>";
    const host = document.getElementById("terminal")!;
    const term = new Terminal(host);
    const entry: LogEntry = {
      t: 0.123,
      source: "sw",
      level: "success",
      text: "ok",
      glyph: "✓",
    };
    term.append(entry);
    expect(host.querySelectorAll(".line")).toHaveLength(1);
    const line = host.querySelector(".line")!;
    expect(line.textContent).toContain("[0.123]");
    expect(line.textContent).toContain("[sw]");
    expect(line.textContent).toContain("✓");
    expect(line.classList.contains("level-success")).toBe(true);
  });

  test("marks error lines bold via class", () => {
    document.body.innerHTML = "<main id=\"terminal\"></main>";
    const host = document.getElementById("terminal")!;
    const term = new Terminal(host);
    term.append({
      t: 0,
      source: "bootstrap",
      level: "error",
      text: "boom",
      glyph: "✗",
    });
    const line = host.querySelector(".line")!;
    expect(line.classList.contains("level-error")).toBe(true);
  });
});
