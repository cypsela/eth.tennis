import type { ErrorClass, Reference } from "./types.js";

export abstract class GatewayError extends Error {
  abstract readonly errorClass: ErrorClass;
  constructor(public readonly ensName: string, message?: string) {
    super(message ?? ensName);
    this.name = new.target.name;
  }
}

export class ContenthashNotFound extends GatewayError {
  readonly errorClass = "contenthash-not-found" as const;
}

export class UnsupportedProtocol extends GatewayError {
  readonly errorClass = "unsupported-protocol" as const;
  constructor(ensName: string, public readonly protocol: string) {
    super(ensName, `unsupported protocol: ${protocol}`);
  }
}

export class IpnsRecordNotFound extends GatewayError {
  readonly errorClass = "ipns-record-not-found" as const;
  constructor(
    ensName: string,
    public readonly ipnsName: string,
    cause?: unknown,
  ) {
    super(ensName, `ipns record not found: ${ipnsName}`);
    if (cause !== undefined) {
      (this as { cause?: unknown; }).cause = cause;
    }
  }
}

export class IpnsRecordUnverifiable extends GatewayError {
  readonly errorClass = "ipns-record-unverifiable" as const;
  constructor(
    ensName: string,
    public readonly ipnsName: string,
    cause?: unknown,
  ) {
    super(ensName, `ipns record unverifiable: ${ipnsName}`);
    if (cause !== undefined) {
      (this as { cause?: unknown; }).cause = cause;
    }
  }
}

export class EnsResolveFailed extends GatewayError {
  readonly errorClass = "ens-resolve-failed" as const;
  constructor(ensName: string, cause?: unknown) {
    super(ensName, "could not resolve ens name");
    if (cause !== undefined) {
      (this as { cause?: unknown; }).cause = cause;
    }
  }
}

export class NoHandler extends GatewayError {
  readonly errorClass = "no-handler" as const;
  constructor(public readonly ref: Reference) {
    super(
      ref.value,
      `no handler registered for ${ref.protocol}://${ref.value}`,
    );
  }
}

export class ResolutionLoop extends GatewayError {
  readonly errorClass = "resolution-loop" as const;
  constructor(
    public readonly start: Reference,
    public readonly maxHops: number,
  ) {
    super(
      start.value,
      `resolution exceeded ${maxHops} hops starting from `
        + `${start.protocol}://${start.value}`,
    );
  }
}

export class IpnsResolveFailed extends GatewayError {
  readonly errorClass = "ipns-resolve-failed" as const;
  constructor(
    ensName: string,
    public readonly ipnsName: string,
    cause?: unknown,
  ) {
    const causeMsg = cause instanceof Error
      ? cause.message
      : cause != null
      ? String(cause)
      : "";
    super(
      ensName,
      causeMsg
        ? `ipns resolve failed (${ipnsName}): ${causeMsg}`
        : `ipns resolve failed: ${ipnsName}`,
    );
    if (cause !== undefined) {
      (this as { cause?: unknown; }).cause = cause;
    }
  }
}

export class ContentUnreachable extends GatewayError {
  readonly errorClass = "content-unreachable" as const;
  constructor(ensName: string, cause?: unknown) {
    const causeMsg = cause instanceof Error
      ? cause.message
      : cause != null
      ? String(cause)
      : "";
    super(
      ensName,
      causeMsg ? `content unreachable: ${causeMsg}` : "content unreachable",
    );
    if (cause !== undefined) {
      (this as { cause?: unknown; }).cause = cause;
    }
  }
}

export class UnknownError extends GatewayError {
  readonly errorClass = "unknown-error" as const;
  constructor(ensName: string, cause?: unknown) {
    const causeMsg = cause instanceof Error
      ? cause.message
      : cause != null
      ? String(cause)
      : "";
    super(ensName, causeMsg ? `unknown error: ${causeMsg}` : "unknown error");
    if (cause !== undefined) {
      (this as { cause?: unknown; }).cause = cause;
    }
  }
}
