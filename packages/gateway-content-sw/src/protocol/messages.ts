/** Page → SW: absorb the SW at the given URL. */
export type AbsorbRequest = { type: "absorb"; swUrl: string; };

/** SW → page: absorption succeeded. */
export type AbsorbAck = { type: "absorb-ack"; swUrl: string; };

/** SW → page: absorption failed at some phase. */
export type AbsorbFail = {
  type: "absorb-fail";
  swUrl: string;
  reason: AbsorbFailReason;
};

export type AbsorbFailReason =
  | "fetch-failed"
  | "eval-failed"
  | "install-failed"
  | "activate-failed"
  | "unsupported";

export type ContentSwMessage = AbsorbRequest | AbsorbAck | AbsorbFail;

function hasType<T extends string>(
  m: unknown,
  t: T,
): m is { type: T; } & Record<string, unknown> {
  return typeof m === "object"
    && m !== null
    && (m as { type?: unknown; }).type === t;
}

export function isAbsorbRequest(m: unknown): m is AbsorbRequest {
  return hasType(m, "absorb") && typeof (m as AbsorbRequest).swUrl === "string";
}

export function isAbsorbAck(m: unknown): m is AbsorbAck {
  return hasType(m, "absorb-ack") && typeof (m as AbsorbAck).swUrl === "string";
}

export function isAbsorbFail(m: unknown): m is AbsorbFail {
  return hasType(m, "absorb-fail")
    && typeof (m as AbsorbFail).swUrl === "string"
    && typeof (m as AbsorbFail).reason === "string";
}
