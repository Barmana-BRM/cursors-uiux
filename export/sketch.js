/* A real Sketch ZIP document, based on the official v146 JSON schema. */
(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  const uuid = () => crypto.randomUUID().toUpperCase();
  const make = (kind, overrides = {}) => {
    const object = structuredClone(E.sketchDefaults[kind]);
    const ids = value => { if (!value || typeof value !== "object") return; for (const k of Object.keys(value)) { if (k === "do_objectID") value[k] = uuid(); else ids(value[k]); } };
    ids(object); return Object.assign(object, overrides);
  };
  const color = css => {
    const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css || "transparent"; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { _class: "color", red: r / 255, green: g / 255, blue: b / 255, alpha: a / 255 };
  };
  const frame = f => ({ _class: "rect", constrainProportions: false, x: f.x, y: f.y, width: Math.max(0, f.w), height: Math.max(0, f.h) });
  const point = (x, y, radius = 0) => make("CurvePoint", { point: `{${x}, ${y}}`, curveFrom: `{${x}, ${y}}`, curveTo: `{${x}, ${y}}`, cornerRadius: radius });
  const base = (kind, name, f) => make(kind, { name, frame: frame(f), isVisible: true, resizingConstraint: 63 });
  const fill = css => make("Fill", { isEnabled: true, color: color(css), contextSettings: { _class: "graphicsContextSettings", blendMode: 0, opacity: 1 }, patternTileScale: 1 });
  const style = (css, opacity = 1) => {
    const st = make("Style", { fills: [], borders: [], shadows: [], contextSettings: { _class: "graphicsContextSettings", blendMode: 0, opacity } });
    st.colorControls.contrast = 1; st.colorControls.saturation = 1;
    if (css["background-color"] && color(css["background-color"]).alpha) st.fills.push(fill(css["background-color"]));
    const width = parseFloat(css["border-top-width"] || css["stroke-width"]);
    const stroke = css["border-top-color"] || css.stroke;
    if (width > 0 && stroke && stroke !== "none") st.borders.push(make("Border", { isEnabled: true, thickness: width, color: color(stroke), contextSettings: { _class: "graphicsContextSettings", blendMode: 0, opacity: 1 } }));
    const blur = (css.filter || css["backdrop-filter"] || "").match(/blur\(([\d.]+)px\)/);
    if (blur) st.blur = make("Blur", { isEnabled: true, radius: Number(blur[1]), type: css["backdrop-filter"] ? 3 : 0, saturation: 1 });
    const shadow = (css["box-shadow"] || "").match(/(rgba?\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/);
    if (shadow) st.shadows.push(make("Shadow", { isEnabled: true, color: color(shadow[1]), offsetX: +shadow[2], offsetY: +shadow[3], blurRadius: +shadow[4], spread: +(shadow[5] || 0), contextSettings: { _class: "graphicsContextSettings", blendMode: 0, opacity: 1 } }));
    // CSS gradients remain exact in design.json/HTML. Supported RGB linear gradients become editable fills.
    const image = css["background-image"] || "";
    if (image.startsWith("linear-gradient(")) {
      const stops = [...image.matchAll(/(rgba?\([^)]+\))(?:\s+([\d.]+)%)?/g)];
      if (stops.length > 1) {
        const f = fill("transparent"); f.fillType = 1;
        f.gradient = { _class: "gradient", gradientType: 0, elipseLength: 0, from: "{0, 0}", to: "{1, 1}", stops: stops.map((m, i) => ({ _class: "gradientStop", color: color(m[1]), position: m[2] ? +m[2] / 100 : i / (stops.length - 1) })) };
        st.fills.push(f);
      }
    }
    return st;
  };
  E.sketch = async design => {
    const files = {}, warnings = [];
    const note = (id, reason) => warnings.push({ code: "SKETCH_APPROXIMATION", layerId: id, reason });
    const rectangle = (name, f, css, opacity) => {
      const radius = parseFloat(css["border-radius"] || css["border-top-left-radius"]) || 0;
      return { ...base("Rectangle", name, f), isClosed: true, fixedRadius: radius, points: [point(0, 0, radius), point(1, 0, radius), point(1, 1, radius), point(0, 1, radius)], style: style(css, opacity) };
    };
    const vector = (node, f, name) => {
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.innerHTML = E.serializeNode(node);
      const root = svg.firstElementChild;
      const vb = (node.attrs.viewBox || `0 0 ${f.w} ${f.h}`).split(/[ ,]+/).map(Number);
      const [vx, vy, vw, vh] = vb;
      const result = [];
      const walk = (el, inherited, matrix) => {
        const css = { ...inherited, ...E.cleanStyle(el.getAttribute("style")) };
        for (const k of ["fill", "stroke", "stroke-width", "opacity"]) if (el.hasAttribute(k)) css[k] = el.getAttribute(k);
        let tf = matrix;
        try { const t = el.transform?.baseVal?.consolidate(); if (t) tf = matrix.multiply(new DOMMatrix([t.matrix.a, t.matrix.b, t.matrix.c, t.matrix.d, t.matrix.e, t.matrix.f])); } catch { note(name, "An SVG transform was approximated."); }
        if (typeof el.getTotalLength === "function") {
          try {
            const length = el.getTotalLength();
            const points = [], count = Math.max(2, Math.min(512, Math.ceil(length / 2)));
            for (let i = 0; i <= count; i++) { const p = el.getPointAtLength(length * i / count), q = new DOMPoint(p.x, p.y).matrixTransform(tf); points.push(point((q.x - vx) / vw, (q.y - vy) / vh)); }
            const path = base("ShapePath", el.localName, f);
            path.points = points; path.isClosed = el.localName !== "line" && (el.localName !== "path" || /z\s*$/i.test(el.getAttribute("d") || ""));
            path.style = style({ ...css, "background-color": css.fill === "none" ? "transparent" : css.fill || "#000" });
            result.push(path);
          } catch { note(name, "An unsupported SVG geometry was omitted."); }
        }
        for (const child of el.children) if (!["defs", "clipPath", "mask", "filter"].includes(child.localName)) walk(child, css, tf);
      };
      walk(root, {}, new DOMMatrix());
      if (!result.length) note(name, "SVG references, text or filters require the original SVG asset in design.json.");
      return result;
    };
    const convert = async layer => {
      const f = { ...layer.frame };
      if (layer.plane === "world" && !design.viewport.isRoot) { f.x += design.viewport.ox; f.y += design.viewport.oy; }
      if (layer.type === "rect") {
        if (/url\(/.test(layer.style["background-image"] || "")) note(layer.id, "CSS background image is retained in HTML/design.json; Sketch uses the base fill.");
        return [rectangle(layer.name, f, layer.style, layer.opacity)];
      }
      if (layer.type === "text") {
        const text = base("Text", layer.name, f), css = layer.style;
        const family = (css["font-family"] || "Arial").split(",")[0].replace(/["']/g, "");
        const attributes = {
          MSAttributedStringFontAttribute: { _class: "fontDescriptor", attributes: { name: family, size: parseFloat(css["font-size"]) || 16 } },
          MSAttributedStringColorAttribute: color(css.color || "#000"),
          paragraphStyle: { _class: "paragraphStyle", alignment: ({ left: 0, right: 1, center: 2, justify: 3 })[css["text-align"]] ?? 4 },
        };
        const lh = parseFloat(css["line-height"]);
        if (Number.isFinite(lh)) Object.assign(attributes.paragraphStyle, { minimumLineHeight: lh, maximumLineHeight: lh });
        text.attributedString = { _class: "attributedString", string: layer.text, attributes: [{ _class: "stringAttribute", location: 0, length: layer.text.length, attributes }] };
        text.style = style({}, layer.opacity); text.style.textStyle = { _class: "textStyle", verticalAlignment: 0, encodedAttributes: attributes };
        text.textBehaviour = 1; text.glyphBounds = `{{0, 0}, {${f.w}, ${f.h}}}`;
        text.userInfo = { "swarm.export": { direction: css.direction || design.viewport.direction, cssFontWeight: css["font-weight"] || "400", layerId: layer.id } };
        note(layer.id, "Text is editable; platform font substitution, mixed inline styles and RTL shaping need import review.");
        return [text];
      }
      if (layer.type === "line") {
        const path = base("ShapePath", layer.name, { ...f, w: Math.max(f.w, 1), h: Math.max(f.h, 1) });
        path.points = layer.points.map(p => point((p.x - layer.frame.x) / Math.max(f.w, 1), (p.y - layer.frame.y) / Math.max(f.h, 1)));
        path.style = style({ stroke: layer.stroke, "stroke-width": layer.strokeWidth }); return [path];
      }
      if (layer.content?.tag === "svg") return vector(layer.content, f, layer.name);
      const src = layer.content?.attrs?.src;
      if (src?.startsWith("data:image/")) {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        if (canvas.width * canvas.height > 16000000) { note(layer.id, "Bitmap exceeds the 16-megapixel decoder limit."); return []; }
        canvas.getContext("2d").drawImage(image, 0, 0);
        const png = E.decodeData(canvas.toDataURL("image/png")), path = `images/${layer.id}.png`;
        files[path] = png;
        const bitmap = base("Bitmap", layer.name, f); bitmap.image = { _class: "MSJSONFileReference", _ref_class: "MSImageData", _ref: path };
        bitmap.intendedDPI = 72; bitmap.style = style(layer.style, layer.opacity); return [bitmap];
      }
      if (layer.type === "image") note(layer.id, "Unavailable media is omitted, with details in design.json.");
      return [];
    };
    const converted = new Map();
    for (const layer of [...design.layers].sort((a, b) => a.order - b.order)) {
      let nodes = await convert(layer);
      for (const n of nodes) n.userInfo = { ...n.userInfo, "swarm.layer": { id: layer.id, clip: layer.clip } };
      if (layer.regionClip && layer.clip && nodes.length) {
        const c = layer.clip, v = design.viewport;
        const x = c.l + (layer.plane === "world" && !v.isRoot ? v.ox : 0), y = c.t + (layer.plane === "world" && !v.isRoot ? v.oy : 0);
        const f = { x, y, w: c.r - c.l, h: c.b - c.t };
        const mask = rectangle("Selected area mask", { x: 0, y: 0, w: f.w, h: f.h }, {}, 1); mask.hasClippingMask = true;
        for (const n of nodes) { n.frame.x -= x; n.frame.y -= y; }
        nodes = [{ ...base("Group", layer.name, f), layers: [mask, ...nodes] }];
      }
      converted.set(layer.id, nodes);
    }
    const byId = new Map(design.groups.map(g => [g.id, g]));
    const layerById = new Map(design.layers.map(l => [l.id, l]));
    const build = (group, plane) => {
      const children = [...group.layerIds.filter(id => layerById.get(id)?.plane === plane).flatMap(id => converted.get(id) || []), ...group.children.map(id => build(byId.get(id), plane)).filter(Boolean)];
      if (!children.length) return null;
      const x = Math.min(...children.map(n => n.frame.x)), y = Math.min(...children.map(n => n.frame.y));
      const w = Math.max(...children.map(n => n.frame.x + n.frame.width)) - x, h = Math.max(...children.map(n => n.frame.y + n.frame.height)) - y;
      for (const child of children) { child.frame.x -= x; child.frame.y -= y; }
      return { ...base("Group", group.name, { x, y, w, h }), layers: children };
    };
    const v = design.viewport;
    const artboard = base("Artboard", `Snapshot ${v.width} × ${v.height}`, { x: 0, y: 0, w: v.isRoot ? Math.max(v.width, design.page.width) : v.width, h: v.isRoot ? design.page.height : v.height });
    artboard.hasBackgroundColor = true; artboard.includeBackgroundColorInExport = true;
    artboard.backgroundColor = color(design.page.background["background-color"]);
    artboard.layers = ["under", "world", "over"].flatMap(plane => [
      ...design.layers.filter(l => !l.parentId && l.plane === plane).sort((a, b) => a.order - b.order).flatMap(l => converted.get(l.id) || []),
      ...design.groups.filter(g => !g.parentId).map(g => build(g, plane)).filter(Boolean),
    ]);
    const page = base("Page", "Swarm UI/UX", { x: 0, y: 0, w: 0, h: 0 }); page.layers = [artboard];
    const sketchDocument = make("Document"); sketchDocument.colorSpace = 1; sketchDocument.pages = [{ _class: "MSJSONFileReference", _ref_class: "MSImmutablePage", _ref: `pages/${page.do_objectID}` }];
    const meta = make("Meta", { version: 146, appVersion: "99.0", build: 1, app: "com.bohemiancoding.sketch3", variant: "NONAPPSTORE", pagesAndArtboards: { [page.do_objectID]: { name: page.name, artboards: { [artboard.do_objectID]: { name: artboard.name } } } } });
    meta.created = { ...meta.created, app: meta.app, appVersion: meta.appVersion, variant: meta.variant, version: 146, compatibilityVersion: 99, build: 1 };
    const user = { document: { pageListHeight: 100, pageListCollapsed: 0 } };
    const expanded = { document: { ...sketchDocument, pages: [page] }, meta, user };
    files["document.json"] = JSON.stringify(sketchDocument); files["meta.json"] = JSON.stringify(meta); files["user.json"] = JSON.stringify(user);
    files[`pages/${page.do_objectID}.json`] = JSON.stringify(page);
    return { blob: E.zip(files), expanded, warnings };
  };
})();
