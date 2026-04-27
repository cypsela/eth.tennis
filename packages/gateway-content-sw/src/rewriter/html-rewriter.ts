import { addInlineScriptHash } from "./csp.js";

export interface RewriteOpts {
  pageShimSrc: string;
  pageShimHash: string;
}

export function rewriteHtmlForContentSw(
  response: Response,
  opts: RewriteOpts,
): Response {
  const ct = response.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("text/html")) return response;

  const shimTag = `<script>${opts.pageShimSrc}</script>`;
  const headers = new Headers(response.headers);

  const stream = response.body ?? new ReadableStream<Uint8Array>({
    start(c) {
      c.close();
    },
  });

  const transformed = stream.pipeThrough(
    makeRewriteStream(shimTag, opts.pageShimHash),
  );
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function makeRewriteStream(
  shimTag: string,
  hash: string,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffered = "";
  let injected = false;
  return new TransformStream({
    transform(chunk, controller) {
      buffered += decoder.decode(chunk, { stream: true });
      if (!injected) {
        const out = tryInject(buffered, shimTag, hash);
        if (out) {
          controller.enqueue(encoder.encode(out.text));
          buffered = out.tail;
          injected = true;
        }
        return;
      }
      controller.enqueue(encoder.encode(buffered));
      buffered = "";
    },
    flush(controller) {
      if (!injected) {
        const out = tryInject(buffered, shimTag, hash)
          ?? { text: buffered, tail: "" };
        controller.enqueue(encoder.encode(out.text + out.tail));
      } else if (buffered.length) {
        controller.enqueue(encoder.encode(buffered));
      }
    },
  });
}

function tryInject(
  buf: string,
  shimTag: string,
  hash: string,
): { text: string; tail: string; } | null {
  const updated = updateCspMeta(buf, hash);
  const headIdx = updated.indexOf("<head>");
  if (headIdx !== -1) {
    const cut = headIdx + "<head>".length;
    return { text: updated.slice(0, cut) + shimTag, tail: updated.slice(cut) };
  }
  const scriptIdx = updated.indexOf("<script");
  if (scriptIdx !== -1) {
    return {
      text: updated.slice(0, scriptIdx) + shimTag,
      tail: updated.slice(scriptIdx),
    };
  }
  return null;
}

function updateCspMeta(buf: string, hash: string): string {
  return buf.replace(
    /(<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]+content=["'])([^"']+)(["'])/i,
    (_m, pre, content, post) =>
      `${pre}${addInlineScriptHash(content, hash)}${post}`,
  );
}
