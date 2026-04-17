import { expect, test } from "vitest";
import { VERSION } from "../src/index.js";

test("package exports VERSION", () => {
  expect(VERSION).toBe("0.0.0");
});
