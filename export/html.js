(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  E.escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  E.styleText = style => Object.entries(style).map(([k, v]) => `${k}:${v}`).join(";");
  E.serializeNode = node => {
    if (!node) return "";
    if (node.text !== undefined) return E.escape(node.text);
    const attrs = { ...node.attrs, style: E.styleText(node.style || {}) };
    const a = Object.entries(attrs).map(([k, v]) => ` ${k}="${E.escape(v)}"`).join("");
    if (["img", "br"].includes(node.tag)) return `<${node.tag}${a}/>`;
    return `<${node.tag}${a}>${(node.children || []).map(E.serializeNode).join("")}</${node.tag}>`;
  };
  E.html = (design, localAssets = false) => {
    const v = design.viewport, page = design.page;
    const css = [
      "*{box-sizing:border-box}html,body{margin:0;padding:0}body{overflow:auto} .layer{position:absolute;margin:0;padding:0;transform-origin:0 0} .content{position:absolute;inset:0} .content>img,.content>svg{width:100%;height:100%;display:block} .plane{position:absolute;inset:0;pointer-events:none} .port{position:absolute;overflow:auto} .world{position:relative}",
      ...design.fonts.map(f => `@font-face{font-family:${f.family};font-weight:${f.weight};font-style:${f.style};src:url("${f.data}")}`),
    ];
    const render = layer => {
      const f = layer.frame;
      const st = { position: "absolute", left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px`, opacity: layer.opacity, "mix-blend-mode": layer.blend };
      if (layer.clip) {
        const c = layer.clip;
        const edge = value => layer.regionClip ? value : Math.max(0, value);
        st["clip-path"] = `inset(${edge(c.t - f.y)}px ${edge(f.x + f.w - c.r)}px ${edge(f.y + f.h - c.b)}px ${edge(c.l - f.x)}px)`;
      }
      let content;
      if (layer.type === "line") {
        const d = layer.points.map((p, i) => `${i ? "L" : "M"}${p.x - f.x} ${p.y - f.y}`).join(" ");
        content = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, f.w)}" height="${Math.max(1, f.h)}" style="overflow:visible"><path d="${d}" fill="none" stroke="${E.escape(layer.stroke)}" stroke-width="${layer.strokeWidth}" stroke-dasharray="${E.escape(layer.dash)}"/></svg>`;
      } else if (layer.type === "rect") content = `<div class="content" style="${E.escape(E.styleText(layer.style))}"></div>`;
      else content = `<div class="content" style="${E.escape(E.styleText(layer.type === "image" ? layer.style : {}))}">${E.serializeNode(layer.content)}</div>`;
      return `<div class="layer" data-layer="${E.escape(layer.id)}" style="${E.escape(E.styleText(st))}">${content}</div>`;
    };
    const sorted = [...design.layers].sort((a, b) => a.order - b.order);
    const plane = name => sorted.filter(l => l.plane === name).map(render).join("");
    const height = v.isRoot ? page.height : v.height;
    const world = `<div class="world" style="width:${page.width}px;height:${page.height}px">${plane("world")}</div>`;
    const port = v.isRoot ? world : `<div class="port" style="left:${v.ox}px;top:${v.oy}px;width:${v.vw}px;height:${v.vh}px">${world}</div>`;
    let html = `<!doctype html><html lang="${v.direction === "rtl" ? "fa" : "en"}" dir="${v.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: 'self'; font-src data: 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Swarm visual snapshot ${v.width} × ${v.height}</title><style>${css.join("\n").replace(/</g, "\\3c ")}</style></head><body style="${E.escape(E.styleText(page.background))}"><main style="position:relative;width:${Math.max(v.width, v.isRoot ? page.width : v.width)}px;height:${height}px;isolation:isolate"><div class="plane">${plane("under")}</div>${port}<div class="plane" style="position:fixed;width:${v.width}px;height:${v.height}px">${plane("over")}</div></main></body></html>`;
    if (localAssets) for (const asset of design.assets) if (asset.status === "embedded") html = html.split(asset.data).join(asset.path);
    return html;
  };
  E.preview = async design => {
    const v = design.viewport;
    const width = v.width, height = v.height;
    if (width * height > 16000000) throw new Error("PNG preview exceeds the 16-megapixel limit");
    const html = E.html(design).replace(/<!doctype html>/i, "");
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("meta,title").forEach(n => n.remove());
    const world = doc.querySelector(".world");
    if (world) world.style.transform = `translate(${-v.sx}px,${-v.sy}px)`;
    doc.documentElement.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    const xhtml = new XMLSerializer().serializeToString(doc.documentElement);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
    const image = new Image(); image.src = E.dataURL(E.bytes(svg), "image/svg+xml");
    await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Browser could not render the PNG preview");
    return blob;
  };
})();
