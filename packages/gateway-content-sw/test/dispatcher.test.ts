import { describe, expect, test } from "vitest";
import { createDispatcher } from "../src/absorber/dispatcher.js";
import { makeMockFetchEvent } from "./helpers/mock-sw-scope.js";

describe("dispatcher", () => {
  test("returns false when registry is empty", () => {
    const d = createDispatcher();
    const ev = makeMockFetchEvent(new Request("https://x/"));
    expect(d.handle(ev)).toBe(false);
    expect(ev.respondWith).not.toHaveBeenCalled();
  });

  test("returns true when a listener calls respondWith", () => {
    const d = createDispatcher();
    d.register({
      fetch: [(e) => e.respondWith(new Response("absorbed"))],
      install: [],
      activate: [],
      message: [],
    });
    const ev = makeMockFetchEvent(new Request("https://x/"));
    expect(d.handle(ev)).toBe(true);
    expect(ev.respondWith).toHaveBeenCalledTimes(1);
  });

  test("falls through when listener throws synchronously", () => {
    const d = createDispatcher();
    d.register({
      fetch: [() => {
        throw new Error("boom");
      }],
      install: [],
      activate: [],
      message: [],
    });
    const ev = makeMockFetchEvent(new Request("https://x/"));
    expect(d.handle(ev)).toBe(false);
    expect(ev.respondWith).not.toHaveBeenCalled();
  });

  test("falls through when listener does not call respondWith", () => {
    const d = createDispatcher();
    d.register({
      fetch: [() => {/* no-op */}],
      install: [],
      activate: [],
      message: [],
    });
    const ev = makeMockFetchEvent(new Request("https://x/"));
    expect(d.handle(ev)).toBe(false);
  });

  test("clear() drops listeners", () => {
    const d = createDispatcher();
    d.register({
      fetch: [(e) => e.respondWith(new Response("a"))],
      install: [],
      activate: [],
      message: [],
    });
    d.clear();
    const ev = makeMockFetchEvent(new Request("https://x/"));
    expect(d.handle(ev)).toBe(false);
  });
});
