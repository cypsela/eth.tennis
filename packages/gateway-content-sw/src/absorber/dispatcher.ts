export type FetchListener = (event: FetchEvent) => void;
export type ExtendableEventListener = (event: ExtendableEvent) => void;
export type MessageListener = (event: ExtendableMessageEvent) => void;

export interface CapturedListeners {
  fetch: FetchListener[];
  install: ExtendableEventListener[];
  activate: ExtendableEventListener[];
  message: MessageListener[];
}

export interface Dispatcher {
  /** Replace the active listener registry. */
  register(listeners: CapturedListeners): void;
  /** Drop all listeners. */
  clear(): void;
  /**
   * Synchronously offer the event to absorbed listeners.
   * @returns true if any listener called respondWith; false otherwise.
   */
  handle(event: FetchEvent): boolean;
}

export function createDispatcher(): Dispatcher {
  let listeners: CapturedListeners = {
    fetch: [],
    install: [],
    activate: [],
    message: [],
  };

  return {
    register(next) {
      listeners = next;
    },
    clear() {
      listeners = { fetch: [], install: [], activate: [], message: [] };
    },
    handle(event) {
      for (const fn of listeners.fetch) {
        let responded = false;
        const originalDesc =
          Object.getOwnPropertyDescriptor(event, "respondWith")
            ?? Object.getOwnPropertyDescriptor(
              Object.getPrototypeOf(event),
              "respondWith",
            );
        const originalCall = event.respondWith.bind(event);
        Object.defineProperty(event, "respondWith", {
          configurable: true,
          writable: true,
          value: (r: Response | Promise<Response>) => {
            responded = true;
            return originalCall(r);
          },
        });
        try {
          fn(event);
        } catch {
          // sync throw → fall through
        } finally {
          if (originalDesc) {
            Object.defineProperty(event, "respondWith", originalDesc);
          } else {
            delete (event as { respondWith?: unknown; }).respondWith;
          }
        }
        if (responded) return true;
      }
      return false;
    },
  };
}
