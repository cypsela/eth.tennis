import type { ExtendableEventListener } from "./dispatcher.ts";

async function fireExtendable(
  type: "install" | "activate",
  listeners: ExtendableEventListener[],
): Promise<void> {
  if (listeners.length === 0) return;
  const promises: Promise<unknown>[] = [];
  const event = {
    type,
    waitUntil(p: Promise<unknown>) {
      promises.push(Promise.resolve(p));
    },
  } as unknown as ExtendableEvent;
  for (const fn of listeners) {
    fn(event);
  }
  await Promise.all(promises);
}

export const fireInstall = (l: ExtendableEventListener[]) =>
  fireExtendable("install", l);

export const fireActivate = (l: ExtendableEventListener[]) =>
  fireExtendable("activate", l);
