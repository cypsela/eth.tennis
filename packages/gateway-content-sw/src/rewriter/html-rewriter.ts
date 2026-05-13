export interface RewriteOpts {
  pageShimSrc: string;
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

  const transformed = stream.pipeThrough(makeRewriteStream(shimTag));
  return new Response(transformed, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function makeRewriteStream(
  shimTag: string,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffered = "";
  let injected = false;
  return new TransformStream({
    transform(chunk, controller) {
      buffered += decoder.decode(chunk, { stream: true });
      if (!injected) {
        const out = tryInject(buffered, shimTag);
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
        const out = tryInject(buffered, shimTag)
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
): { text: string; tail: string; } | null {
  const headIdx = buf.indexOf("<head>");
  if (headIdx !== -1) {
    const cut = headIdx + "<head>".length;
    return { text: buf.slice(0, cut) + shimTag, tail: buf.slice(cut) };
  }
  const scriptIdx = buf.indexOf("<script");
  if (scriptIdx !== -1) {
    return {
      text: buf.slice(0, scriptIdx) + shimTag,
      tail: buf.slice(scriptIdx),
    };
  }
  return null;
}
