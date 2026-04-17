import { expect, test } from "vitest";
import { BOOTSTRAP_VERSION } from "../src/bootstrap.ts";

test("bootstrap exports VERSION", () => {
  expect(BOOTSTRAP_VERSION).toBe("0.0.0");
});
