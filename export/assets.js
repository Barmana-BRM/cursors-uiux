/* Image identification and an optional, origin-scoped native Chrome read path. */
(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  E.assetRequests ||= new Set();
  E.blockedImageOrigins ||= new Set();
  E.imageMime = bytes => {
    const b = bytes, text = new TextDecoder().decode(b.subarray(0, 512));
    if (b[0] === 137 && text.slice(1, 4) === "PNG") return "image/png";
    if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
    if (/^GIF8[79]a/.test(text)) return "image/gif";
    if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return "image/webp";
    if (text.slice(4, 8) === "ftyp" && /avif|avis/.test(text.slice(8, 40))) return "image/avif";
    if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)) return "image/svg+xml";
    return "";
  };
  E.nativeImage = async (url, signal) => {
    signal?.throwIfAborted();
    // A displayed, origin-clean image is already authorized by the browser. Read
    // its pixels without repeating an authenticated/hotlink-protected request.
    for (const image of document.images) {
      if ((image.currentSrc || image.src) !== url || !image.complete || !image.naturalWidth || image.closest('[data-swarm-private],[data-private],[data-sensitive]')) continue;
      if (image.naturalWidth * image.naturalHeight > 16000000) continue;
      try {
        const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        canvas.getContext("2d").drawImage(image, 0, 0);
        return E.decodeData(canvas.toDataURL("image/png"));
      } catch { /* Cross-origin pixels remain protected; use an explicit host grant. */ }
    }
    if (!globalThis.chrome?.runtime?.id) throw new Error("CORS denied; native extension image access is unavailable");
    E.assetRequests.add(url);
    const result = await chrome.runtime.sendMessage({ type: "swarm:asset-read", url, runId: E.assetRunId });
    signal?.throwIfAborted();
    if (result?.missingOrigin) E.blockedImageOrigins.add(result.missingOrigin);
    if (!result?.data) throw new Error(result?.missingOrigin ? "Image host permission required; use Allow image downloads and capture again" : "Native image read failed or access was denied");
    return E.decodeData(result.data);
  };
  E.allowImages = async () => {
    const origins = [...E.blockedImageOrigins].slice(0, 32);
    if (!origins.length) return false;
    const result = await chrome.runtime.sendMessage({ type: "swarm:asset-permission", origins });
    if (!result?.granted) throw new Error("Image host permission was not granted");
    for (const origin of origins) E.blockedImageOrigins.delete(origin);
    return true;
  };
})();
