/* Service worker only. Never expose an unrestricted network proxy to the page. */
(() => {
  "use strict";
  let active = 0;
  const waiters = [];
  const budgets = new Map();
  const safeURL = raw => {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || /(?:token|secret|key|auth|signature|password)=/i.test(url.search)) throw new Error("Unsafe image URL");
    return url;
  };
  const pattern = origin => { const url = new URL(origin); return `${url.protocol}//${url.hostname}/*`; };
  globalThis.SwarmNativeAssets = {
    async read(msg, sender) {
      if (!sender.tab || sender.frameId !== 0 || sender.id !== chrome.runtime.id) return { error: "Image read unavailable" };
      if (active >= 4) {
        if (waiters.length >= 16) return { error: "Image read queue is full" };
        await new Promise(resolve => waiters.push(resolve));
      }
      active++;
      try {
        let url = safeURL(msg.url);
        const [check] = await chrome.scripting.executeScript({ target: { tabId: sender.tab.id }, func: (raw, runId) => globalThis.SwarmExport?.assetRunId === runId && !!globalThis.SwarmExport?.assetRequests?.has(raw), args: [url.href, msg.runId] });
        if (!check?.result) return { error: "Image was not requested by the active capture" };
        const pageOrigin = new URL(sender.url).origin;
        const key = `${sender.tab.id}:${sender.documentId}:${msg.runId}`;
        if (!budgets.has(key)) budgets.set(key, 0);
        if (budgets.size > 64) budgets.delete(budgets.keys().next().value);
        if (budgets.get(key) >= 32 * 1024 * 1024) return { error: "Image size limit" };
        let response;
        for (let redirects = 0; redirects <= 5; redirects++) {
          if (url.origin !== pageOrigin && !await chrome.permissions.contains({ origins: [pattern(url.origin)] })) return { error: "Image host access required", missingOrigin: url.origin };
          response = await fetch(url.href, { credentials: "omit", referrerPolicy: "no-referrer", redirect: "manual", signal: AbortSignal.timeout(6000) });
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location"); await response.body?.cancel();
            if (!location || redirects === 5) throw new Error("Image redirect limit");
            url = safeURL(new URL(location, url).href); continue;
          }
          break;
        }
        if (!response?.ok || !response.body) throw new Error("Image response unavailable");
        const reader = response.body.getReader(), chunks = []; let length = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read(); if (done) break;
            length += value.length; budgets.set(key, budgets.get(key) + value.length);
            if (length > 8 * 1024 * 1024 || budgets.get(key) > 32 * 1024 * 1024) throw new Error("Image size limit");
            chunks.push(value);
          }
        } finally { await reader.cancel(); }
        const bytes = new Uint8Array(length); let at = 0;
        for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
        const mime = globalThis.SwarmExport.imageMime(bytes);
        if (!mime) throw new Error("Response is not a supported image");
        return { data: globalThis.SwarmExport.dataURL(bytes, mime) };
      } catch { return { error: "Image could not be read safely" }; }
      finally { active--; waiters.shift()?.(); }
    },
    async allow(msg, sender) {
      if (!sender.tab || sender.frameId !== 0 || sender.id !== chrome.runtime.id || !Array.isArray(msg.origins) || !msg.origins.length || msg.origins.length > 32) return { granted: false };
      try {
        const origins = [...new Set(msg.origins.map(origin => { const url = safeURL(origin); if (url.origin !== origin) throw new Error("Invalid origin"); return pattern(origin); }))];
        // Called only by the trusted extension UI's explicit permission button. Chrome
        // enforces its own user gesture and displays the exact requested host grants.
        return { granted: await chrome.permissions.request({ origins }) };
      } catch { return { granted: false }; }
    },
  };
})();
