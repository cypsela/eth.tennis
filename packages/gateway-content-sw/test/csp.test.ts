import { describe, expect, test } from "vitest";
import { addInlineScriptHash } from "../src/rewriter/csp.js";

describe("CSP addInlineScriptHash", () => {
  test("inserts script-src directive when none exists", () => {
    const out = addInlineScriptHash("default-src 'self'", "abc123");
    expect(out).toContain("default-src 'self'");
    expect(out).toContain("script-src");
    expect(out).toContain("'sha256-abc123'");
  });

  test("appends hash to existing script-src", () => {
    const out = addInlineScriptHash(
      "default-src 'self'; script-src 'self' https://cdn.example",
      "abc123",
    );
    expect(out).toContain(
      "script-src 'self' https://cdn.example 'sha256-abc123'",
    );
  });

  test("does not duplicate if hash already present", () => {
    const policy = "script-src 'self' 'sha256-abc123'";
    expect(addInlineScriptHash(policy, "abc123")).toBe(policy);
  });

  test("normalizes whitespace and trailing semicolon", () => {
    const out = addInlineScriptHash("  default-src 'self' ; ", "abc");
    expect(out).toContain("script-src 'sha256-abc'");
  });
});
