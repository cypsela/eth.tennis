import type { BrowserContext, ConsoleMessage, Page } from "@playwright/test";

export async function stopGatewaySw(
  context: BrowserContext,
  cdpHostPage: Page,
): Promise<void> {
  const [worker] = context.serviceWorkers();
  if (!worker) return;
  const cdp = await context.newCDPSession(cdpHostPage);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await cdp.detach();
}

export function waitForGatewaySwLog(
  context: BrowserContext,
  pattern: RegExp,
): Promise<string> {
  return new Promise((resolve) => {
    const handler = (msg: ConsoleMessage): void => {
      if (!msg.worker()) return;
      const text = msg.text();
      if (pattern.test(text)) {
        context.off("console", handler);
        resolve(text);
      }
    };
    context.on("console", handler);
  });
}
