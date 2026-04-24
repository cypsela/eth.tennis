import type { Glyph, LogLevel, LogSource, Reference } from "./types.js";

export function formatRef(ref: Reference): string {
  return `${ref.protocol}://${ref.value}`;
}

export function formatHop(from: Reference, to: Reference): string {
  return `${formatRef(from)} → ${formatRef(to)}`;
}

export interface LogEntry {
  t: number;
  source: LogSource;
  level: LogLevel;
  text: string;
  glyph?: Glyph;
}

const SOURCE_COLUMN_WIDTH = 10;

export function formatLine(
  entry: Pick<LogEntry, "t" | "source" | "text" | "glyph">,
): string {
  const ts = `[${entry.t.toFixed(3)}]`;
  const srcTag = `[${entry.source}]`;
  const srcPad = " ".repeat(
    Math.max(0, SOURCE_COLUMN_WIDTH - entry.source.length),
  );
  const glyphPart = entry.glyph ?? " ";
  return `${ts} ${srcTag}${srcPad}${glyphPart} ${entry.text}`;
}

export interface LoggerOpts {
  source: LogSource;
  startedAt: number;
  now?: () => number;
  sink: (entry: LogEntry) => void;
}

export interface Logger {
  info(text: string, glyph?: Glyph): void;
  warn(text: string, glyph?: Glyph): void;
  error(text: string, glyph?: Glyph): void;
  success(text: string, glyph?: Glyph): void;
}

export function makeLogger(opts: LoggerOpts): Logger {
  const now = opts.now ?? (() => Date.now());
  const emit = (level: LogLevel) => (text: string, glyph?: Glyph) => {
    const entry: LogEntry = {
      t: Number(((now() - opts.startedAt) / 1000).toFixed(3)),
      source: opts.source,
      level,
      text,
      ...(glyph !== undefined ? { glyph } : {}),
    };
    opts.sink(entry);
  };
  return {
    info: emit("info"),
    warn: emit("warn"),
    error: emit("error"),
    success: emit("success"),
  };
}
