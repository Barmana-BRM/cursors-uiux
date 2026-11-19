/* Convert the animation blueprint to a detached, inert, versioned design snapshot. */
(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  const PRIVATE = '[data-swarm-private],[data-private],[data-sensitive],[contenteditable],input,textarea,select';
  const DROP = new Set(["script", "style", "link", "meta", "base", "iframe", "object", "embed", "audio", "source", "track", "template", "noscript", "foreignobject", "animate", "animatetransform", "animatemotion", "set"]);
  const SVG_TAGS = new Set("svg g defs symbol use path rect circle ellipse line polyline polygon text tspan lineargradient radialgradient stop clippath mask filter feblend fecolormatrix fecomponenttransfer fecomposite feconvolvematrix fediffuselighting fedisplacementmap fedistantlight fedropshadow feflood fefunca fefuncb fefuncg fefuncr fegaussianblur feimage femerge femergenode femorphology feoffset fepointlight fespecularlighting fespotlight fetile feturbulence".split(" "));
  const ATTRS = new Set("viewBox d x y x1 y1 x2 y2 cx cy r rx ry width height points fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-opacity opacity transform xmlns preserveAspectRatio offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod clip-path clip-rule mask id filter result in in2 stdDeviation dx dy flood-color flood-opacity color-interpolation-filters".toLowerCase().split(" "));
  const SAFE_STYLE = /^(?:background(?:-[a-z-]+)?|border(?:-[a-z-]+)?|padding(?:-[a-z-]+)?|margin(?:-[a-z-]+)?|font(?:-[a-z-]+)?|text(?:-[a-z-]+)?|white-space(?:-[a-z-]+)?|word(?:-[a-z-]+)?|letter-spacing|line-height|color|display|box-sizing|width|height|min-width|min-height|max-width|max-height|position|top|right|bottom|left|inset|float|clear|vertical-align|opacity|overflow(?:-[xy])?|overflow-wrap|visibility|transform(?:-origin)?|filter|backdrop-filter|clip-path|mix-blend-mode|direction|unicode-bidi|writing-mode|hyphens|tab-size|flex(?:-[a-z-]+)?|align-[a-z-]+|justify-[a-z-]+|gap|row-gap|column-gap|grid-[a-z-]+|object-fit|object-position|fill(?:-[a-z-]+)?|stroke(?:-[a-z-]+)?|stop-[a-z-]+|text-anchor|dominant-baseline|list-style-(?:type|position)|-webkit-(?:text-[a-z-]+|font-smoothing|background-clip|line-clamp|box-orient|mask-[a-z-]+))$/;
  const redact = value => String(value).replace(/\b(?:Bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+|(?:sk|ghp|github_pat)[_-][\w-]{12,}|(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization|session(?:id)?|client[_-]?secret|secret)\s*[:=]\s*[^\s,;]+)/gi, "[REDACTED]");
  E.redact = redact;
  E.cleanStyle = css => {
    const el = document.createElement("div");
    el.style.cssText = css || "";
    const out = {};
    for (const p of el.style) {
      const value = el.style.getPropertyValue(p);
      if (SAFE_STYLE.test(p) && !/expression\s*\(|javascript\s*:|@import/i.test(value)) out[p] = value;
    }
    return out;
  };
  E.capture = async (model, env, signal, options = {}) => {
    E.assetRunId = crypto.randomUUID();
    E.assetRequests?.clear();
    const g = env.geom(), warnings = [], assets = [], groups = [], layers = [], owners = new Map();
    const warn = (code, layerId, reason) => warnings.push({ code, layerId: layerId || null, reason });
    let cloneCount = 0;
    const mediaTags = new Set(["canvas", "video", "iframe", "embed", "object"]), seenMedia = new Set();
    const mediaElements = new Set(document.querySelectorAll("canvas,video,iframe,embed,object"));
    const tree = node => {
      if (++cloneCount > 50000) throw new Error("Export exceeds the 50,000 content-node limit");
      if (node.nodeType === 3) return { text: redact(node.data) };
      if (node.nodeType !== 1) return null;
      const tag = node.localName.toLowerCase();
      if (DROP.has(tag) || node.matches(PRIVATE)) return null;
      const svg = node.namespaceURI === "http://www.w3.org/2000/svg";
      const out = { tag: svg && SVG_TAGS.has(tag) ? node.localName : tag === "img" ? "img" : tag === "br" ? "br" : "span", attrs: {}, style: E.cleanStyle(node.getAttribute("style")), children: [] };
      for (const attr of node.attributes) {
        const key = attr.name.toLowerCase();
        if (svg && ATTRS.has(key) && !/[<>]/.test(attr.value)) out.attrs[attr.name] = attr.value;
        if ((key === "href" || key === "xlink:href") && svg && attr.value.startsWith("#")) out.attrs.href = attr.value;
      }
      if (tag === "img") out.attrs.src = node.getAttribute("src") || "";
      if (tag === "video") {
        out.tag = "img";
        out.attrs.src = node.getAttribute("poster") || "";
        warn("VIDEO_POSTER", null, "Video is a frozen poster; playback is not exported.");
      }
      for (const child of node.childNodes) { const v = tree(child); if (v) out.children.push(v); }
      return out;
    };
    const visit = (node, parentId, path, inheritedPrivate) => {
      const el = node.el, cs = getComputedStyle(el);
      if (mediaTags.has(node.tag)) seenMedia.add(el);
      if (el.shadowRoot) for (const media of el.shadowRoot.querySelectorAll("canvas,video,iframe,embed,object")) mediaElements.add(media);
      const privateNode = inheritedPrivate || !!el.closest(PRIVATE) || /password|token|secret|credential/i.test(el.getAttribute("autocomplete") || "");
      const id = `g-${path}`;
      const group = { id, parentId, name: node.tag, tag: node.tag, frame: { ...node.box }, layerIds: [], children: [], source: {
        position: cs.position, float: cs.cssFloat, zIndex: cs.zIndex, transform: cs.transform,
        direction: cs.direction, overflowX: cs.overflowX, overflowY: cs.overflowY,
        scrollX: el.scrollLeft, scrollY: el.scrollTop,
      } };
      groups.push(group);
      if (!privateNode && node.tag === "canvas" && node.start === node.end && el.width && el.height) warn("CANVAS_UNAVAILABLE", null, "Canvas was not readable by the upstream blueprint (CORS-tainted, empty or unsupported context).");
      for (let i = node.start; i < node.end; i++) owners.set(i, { group, privateNode, element: el });
      node.kids.forEach((kid, index) => { group.children.push(`g-${path}-${index}`); visit(kid, id, `${path}-${index}`, privateNode); });
    };
    (model.roots || []).forEach((node, i) => visit(node, null, String(i), false));
    // Inline media can be absorbed into a text-run clone instead of getting a source
    // group. Report unreadable originals too, including those the blueprint dropped.
    for (const media of mediaElements) {
      if (options.scope && !E.within(options.scope, media)) continue;
      const host = media.getRootNode().host;
      if (seenMedia.has(media) || media.closest(PRIVATE) || host?.closest(PRIVATE) || !media.getBoundingClientRect().width || getComputedStyle(media).display === "none") continue;
      if (media.localName === "canvas") {
        try { media.toDataURL("image/png"); }
        catch { warn("CANVAS_UNAVAILABLE", null, "An inline canvas is CORS-tainted or unreadable; the blueprint contains only a placeholder."); }
      } else if (media.localName !== "video") warn("MEDIA_OMITTED", null, "An inline embedded document was excluded from the blueprint/export.");
    }
    const ordinals = new Map();
    for (const it of model.items) {
      if (options.itemIds && !options.itemIds.has(it.id)) continue;
      const owner = owners.get(it.id);
      if (owner?.privateNode) { warn("PRIVATE_REDACTED", null, "A private region or form control was omitted."); continue; }
      const parentId = owner?.group.id || null;
      const ordinal = ordinals.get(parentId) || 0; ordinals.set(parentId, ordinal + 1);
      const id = `l-${parentId || "root"}-${ordinal}`;
      const layer = { id, parentId, name: `${it.kind} ${layers.length + 1}`, type: it.kind,
        frame: { x: it.x, y: it.y, w: it.w, h: it.h }, plane: it.layer,
        order: it.key, opacity: it.op ?? 1, blend: it.blend || "normal", clip: it.clip ? { ...it.clip } : null,
        style: {}, content: null, text: "", points: [], stroke: "", strokeWidth: 0, dash: "" };
      if (it.kind === "rect") layer.style = E.cleanStyle(it.css);
      if (it.kind === "text") {
        layer.content = tree(it.full);
        const read = n => n ? n.text ?? (n.children || []).map(read).join("") : "";
        layer.text = read(layer.content);
        layer.style = { ...layer.content?.style };
        layer.name = layer.text.trim().slice(0, 48) || layer.name;
      }
      if (it.kind === "image") {
        layer.content = tree(it.media);
        layer.style = { ...E.cleanStyle(it.frame), "border-radius": it.radius, "box-shadow": it.shadow || "none", "background-color": it.bg || "transparent", overflow: "hidden" };
        const sourceTag = owner?.group.tag;
        if (["iframe", "embed", "object"].includes(sourceTag)) {
          // The upstream screenshot can contain private embedded pixels. Only an independently
          // readable canvas is exportable; embedded documents require explicit separate capture.
          layer.content = null;
          warn("MEDIA_OMITTED", id, `${sourceTag}: embedded/canvas pixels omitted to protect inaccessible private content.`);
        }
        if (sourceTag === "canvas") {
          try {
            const canvas = owner.element;
            if (canvas.width * canvas.height > 16000000) throw new Error("Canvas size limit");
            const src = canvas.toDataURL("image/png");
            if (src === "data:,") throw new Error("Empty canvas");
            layer.content = { tag: "img", attrs: { src }, style: {}, children: [] };
          } catch { layer.content = null; warn("CANVAS_UNAVAILABLE", id, "Canvas is tainted, empty, WebGL-only or exceeds the 16-megapixel limit."); }
        }
      }
      if (it.kind === "line") {
        layer.points = it.pts.map(p => ({ x: p.x, y: p.y })); layer.stroke = it.stroke;
        layer.strokeWidth = it.sw; layer.dash = it.dash || "";
      }
      it.exportId = id;
      owner?.group.layerIds.push(id); layers.push(layer);
    }
    const background = E.cleanStyle(`background-color:${env.pageBg.color};background-image:${env.pageBg.image};background-size:${env.pageBg.size};background-position:${env.pageBg.position};background-repeat:${env.pageBg.repeat};`);
    const design = { format: "swarm-design", version: "1.0.0", capturedAt: new Date().toISOString(),
      viewport: { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio, direction: getComputedStyle(document.documentElement).direction,
        isRoot: env.isRoot, ...g }, page: { width: model.docW, height: model.docH, background },
      groups, layers, assets, fonts: [], warnings,
      limitations: ["Static visual snapshot; no original site behavior or responsive inference.", "Fixed/sticky and nested scroll regions describe the captured viewport.", "Private regions, editable content and all form values are omitted.", "Arbitrary sensitive prose or pixels cannot be identified automatically: mark private regions with data-swarm-private."] };
    if (model.items.length >= 4000 || env.scrollHeight() > 40000) warn("CAPTURE_LIMIT", null, "Blueprint reached the upstream 4,000-layer or 40,000px capture limit.");
    // Read public resources locally; a native image fallback requires activeTab or
    // an explicitly granted optional image-host permission. No cookies or uploads.
    let total = 0;
    const pending = new Map();
    const resource = (raw, kind, layerId) => {
      if (!raw) return Promise.resolve("");
      if (raw.startsWith("#")) return Promise.resolve(raw);
      if (pending.has(raw)) return pending.get(raw);
      const job = (async () => {
        const asset = { id: `asset-${assets.length}`, path: "", mime: "", bytes: 0, status: "missing", data: "", reason: "" };
        assets.push(asset);
        try {
          if (total >= 32 * 1024 * 1024) throw new Error("Asset size budget exceeded");
          const url = new URL(raw, document.baseURI);
          if (!["http:", "https:", "data:", "blob:"].includes(url.protocol) || url.username || url.password || /(?:token|secret|key|auth|signature|password)=/i.test(url.search)) throw new Error("Sensitive or unsupported asset URL");
          signal?.throwIfAborted();
          const types = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/avif": "avif", "image/svg+xml": "svg", "font/woff": "woff", "font/woff2": "woff2", "font/ttf": "ttf", "font/otf": "otf", "application/font-woff": "woff" };
          let bytes, mime = "";
          try {
            const timeout = AbortSignal.timeout(6000);
            const response = await fetch(url.href, { credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow", signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
            if (!response.ok) throw new Error(`Asset unavailable (HTTP ${response.status})`);
            mime = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
            const reader = response.body.getReader(); let length = 0; const chunks = [];
            try {
              for (;;) { const { value, done } = await reader.read(); if (done) break;
                length += value.length; total += value.length;
                if (length > 8 * 1024 * 1024 || total > 32 * 1024 * 1024) throw new Error("Asset size budget exceeded"); chunks.push(value);
              }
            } finally { await reader.cancel(); }
            bytes = new Uint8Array(length); let at = 0; for (const c of chunks) { bytes.set(c, at); at += c.length; }
          } catch (err) {
            signal?.throwIfAborted();
            if (kind !== "images" || !/^https?:$/.test(url.protocol) || err.message === "Asset size budget exceeded") throw err;
            bytes = await E.nativeImage(url.href, signal);
            total += bytes.length;
          }
          if (kind === "images") mime = E.imageMime(bytes);
          if (!types[mime] || (kind === "fonts") !== /font|woff/.test(mime)) throw new Error("Unsupported asset content type");
          if (bytes.length > 8 * 1024 * 1024 || total > 32 * 1024 * 1024) throw new Error("Asset size budget exceeded");
          if (mime === "image/svg+xml") {
            const text = new TextDecoder().decode(bytes);
            if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("SVG document entities are not supported");
            const svg = new DOMParser().parseFromString(text, "image/svg+xml");
            if (svg.querySelector("parsererror") || svg.documentElement.localName !== "svg") throw new Error("Invalid SVG");
            const safe = tree(svg.documentElement);
            // SVG assets must have no nested network resources, including CSS url().
            const strip = n => { if (!n) return; for (const key of Object.keys(n.style || {})) if (/url\(/i.test(n.style[key]) && !/^url\(["']?#/.test(n.style[key])) delete n.style[key];
              for (const key of Object.keys(n.attrs || {})) if (/url\(/i.test(n.attrs[key]) && !/^url\(["']?#/.test(n.attrs[key])) delete n.attrs[key];
              (n.children || []).forEach(strip); };
            strip(safe); bytes = E.bytes(E.serializeNode(safe));
          }
          const data = E.dataURL(bytes, mime);
          if (kind === "images") {
            signal?.throwIfAborted();
            const image = new Image(); image.src = data;
            let timer;
            const abort = () => { image.src = ""; };
            signal?.addEventListener("abort", abort, { once: true });
            try {
              await Promise.race([image.decode(), new Promise((_, reject) => { timer = setTimeout(() => { image.src = ""; reject(new Error("Image decode timed out")); }, 6000); })]);
              if (image.naturalWidth * image.naturalHeight > 16000000) throw new Error("Image pixel budget exceeded");
            } catch (err) {
              signal?.throwIfAborted();
              if (["Image decode timed out", "Image pixel budget exceeded"].includes(err.message)) throw err;
              throw new Error("Image cannot be decoded");
            } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
          }
          asset.path = `assets/${kind}/${asset.id}.${types[mime]}`; asset.mime = mime; asset.bytes = bytes.length;
          asset.status = "embedded"; asset.data = data; return asset.data;
        } catch (err) {
          signal?.throwIfAborted();
          const known = ["Sensitive or unsupported asset URL", "Unsupported asset content type", "Asset size budget exceeded", "Invalid SVG", "SVG document entities are not supported", "Image host permission required; use Allow image downloads and capture again", "Image cannot be decoded", "Image pixel budget exceeded", "Image decode timed out"];
          asset.reason = err.name === "TimeoutError" ? "Asset read timed out after six seconds." : known.includes(err.message) || /^Asset unavailable \(HTTP \d{3}\)$/.test(err.message) ? err.message : "Asset unavailable: CORS or network access was denied by the browser.";
          warn("ASSET_UNAVAILABLE", layerId, `${asset.id}: ${asset.reason}`); return "";
        }
      })();
      pending.set(raw, job); return job;
    };
    const styles = async (style, layerId) => {
      signal?.throwIfAborted();
      for (const key of Object.keys(style)) {
        const matches = [...style[key].matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)];
        for (const m of matches) { const url = (m[1] ?? m[2] ?? m[3]).trim(); const data = await resource(url, "images", layerId); style[key] = style[key].replace(m[0], data ? `url("${data}")` : "none"); }
      }
    };
    const resolveTree = async (node, layerId) => {
      if (!node || node.text !== undefined) return;
      await styles(node.style, layerId);
      for (const key of Object.keys(node.attrs)) if (/url\(/i.test(node.attrs[key]) && !/^url\(["']?#/.test(node.attrs[key])) delete node.attrs[key];
      if (node.tag === "img") { const data = await resource(node.attrs.src, "images", layerId); if (data) node.attrs.src = data; else { node.tag = "span"; delete node.attrs.src; } }
      for (const child of node.children) await resolveTree(child, layerId);
    };
    await styles(background, null);
    // Bounded concurrency also bounds live streams and decoder memory.
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < layers.length) { const layer = layers[next++]; await styles(layer.style, layer.id); await resolveTree(layer.content, layer.id); }
    }));
    const fontRules = [];
    const collectRules = rules => { for (const rule of rules) { if (rule.type === CSSRule.FONT_FACE_RULE) fontRules.push(rule); else if (rule.cssRules) collectRules(rule.cssRules); } };
    for (const sheet of document.styleSheets) {
      try { collectRules(sheet.cssRules); } catch { warn("FONT_STYLESHEET_CORS", null, "A cross-origin stylesheet cannot be inspected; its fonts may use local fallback."); }
    }
    const fontUsage = JSON.stringify(layers);
    for (const rule of fontRules.slice(0, 64)) {
      signal?.throwIfAborted();
      const m = rule.style.src.match(/url\(\s*["']?([^"')]+)["']?\s*\)/i);
      const family = rule.style.fontFamily;
      if (!m || !fontUsage.includes(family.replace(/["']/g, ""))) continue;
      try {
        const data = await resource(new URL(m[1], rule.parentStyleSheet?.href || document.baseURI).href, "fonts", null);
        if (data) design.fonts.push({ family, weight: rule.style.fontWeight || "normal", style: rule.style.fontStyle || "normal", data });
      } catch { signal?.throwIfAborted(); warn("FONT_URL_INVALID", null, "A font URL could not be resolved; local fallback is used."); }
    }
    return design;
  };
})();
