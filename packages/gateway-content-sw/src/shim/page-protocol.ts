import type {
  AbsorbAck,
  AbsorbFail,
  AbsorbRequest,
} from "../protocol/messages.js";

export function postAbsorb(
  controller: ServiceWorker,
  swUrl: string,
): Promise<AbsorbAck | AbsorbFail> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => {
      const data = e.data as AbsorbAck | AbsorbFail;
      if (data?.type === "absorb-ack") resolve(data);
      else if (data?.type === "absorb-fail") resolve(data);
      else {
        reject(new Error(`unexpected absorb reply: ${JSON.stringify(data)}`));
      }
    };
    const req: AbsorbRequest = { type: "absorb", swUrl };
    controller.postMessage(req, [channel.port2]);
  });
}
