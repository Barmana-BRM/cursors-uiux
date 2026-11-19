(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  E.within = (root, el) => {
    for (let n = el; n; n = n.getRootNode().host) if (n === root || root.contains(n)) return true;
    return false;
  };
  E.indexSources = model => {
    const groups = new Map();
    const walk = (node, path) => {
      groups.set(node.el, `g-${path}`);
      for (let i = node.start; i < node.end; i++) model.items[i].sourceElement = node.el;
      node.kids.forEach((kid, index) => walk(kid, `${path}-${index}`));
    };
    (model.roots || []).forEach((node, index) => walk(node, String(index)));
    return groups;
  };
  E.currentSection = app => {
    const g = app.env.geom(), x = g.ox + g.vw / 2, y = g.oy + g.vh / 2;
    const host = app.view.host, old = host.style.getPropertyValue("pointer-events"), priority = host.style.getPropertyPriority("pointer-events");
    let target;
    try {
      host.style.setProperty("pointer-events", "none", "important");
      target = document.elementsFromPoint(x, y).find(el => el !== host && !host.contains(el));
    } finally { host.style.setProperty("pointer-events", old, priority); }
    if (!target) throw new Error("No original section is visible here");
    while (target.shadowRoot?.elementFromPoint(x, y)) { const child = target.shadowRoot.elementFromPoint(x, y); if (child === target) break; target = child; }
    let fallback;
    for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement || el.getRootNode().host) {
      if (!app.sourceGroups.has(el)) continue;
      const r = el.getBoundingClientRect();
      if (!fallback && r.width >= 80 && r.height >= 40) fallback = el;
      if (el.matches("section,article,[data-swarm-section],[role=region]")) return el;
    }
    if (fallback) return fallback;
    throw new Error("No captured section is at the viewport center; scroll to the section and retry");
  };
  E.sectionTasks = (model, items) => {
    const own = new Set(items), tasks = [];
    for (const it of items) {
      it.copyOf = null; it.twinOf = null; it.group = null; it.mode = "own";
      const deps = own.has(it.parentBox) ? it.parentBox.final || [] : [];
      const y = it.kind === "text" ? it.tb.y : it.y;
      it.task = { id: tasks.length, y, gate: y, spec: { type: it.kind, it, ...(it.kind === "text" && it.fs >= 28 ? { grow: true } : {}) }, deps, state: "wait", doneAt: 0, layer: it.layer };
      it.final = [it.task]; tasks.push(it.task);
    }
    for (let i = tasks.length - 1; i >= 0; i--) for (const d of tasks[i].deps) d.gate = Math.min(d.gate, tasks[i].gate);
    return { ...model, items, tasks, groups: [], guides: [], backdrops: [] };
  };
  E.mergeSection = (original, fresh, originalId, freshId) => {
    const inside = (id, root) => id === root || id.startsWith(root + "-");
    const oldGroups = original.groups.filter(g => inside(g.id, originalId));
    const oldRoot = oldGroups.find(g => g.id === originalId);
    if (!oldRoot || !fresh.layers.length) throw new Error("Section has no exportable layers; original design was retained");
    const rename = id => id?.startsWith(freshId) ? originalId + id.slice(freshId.length) : id;
    const layerName = id => id?.startsWith(`l-${freshId}-`) ? `l-${originalId}-` + id.slice(freshId.length + 3) : id;
    const removed = new Set(oldGroups.flatMap(g => g.layerIds));
    const copy = structuredClone(original);
    copy.capturedAt = fresh.capturedAt;
    copy.viewport.sx = fresh.viewport.sx; copy.viewport.sy = fresh.viewport.sy;
    const groups = fresh.groups.filter(g => inside(g.id, freshId)).map(g => ({ ...structuredClone(g), id: rename(g.id), parentId: g.id === freshId ? oldRoot.parentId : rename(g.parentId), children: g.children.map(rename), layerIds: g.layerIds.map(layerName) }));
    copy.groups = copy.groups.filter(g => !inside(g.id, originalId)).concat(groups);
    copy.layers = copy.layers.filter(l => !removed.has(l.id)).concat(fresh.layers.map(l => ({ ...structuredClone(l), id: layerName(l.id), parentId: rename(l.parentId) })));
    const assetIds = new Map();
    for (const asset of fresh.assets) {
      const duplicate = asset.status === "embedded" && copy.assets.find(a => a.data === asset.data);
      if (duplicate) { assetIds.set(asset.id, duplicate.id); continue; }
      const id = `asset-${copy.assets.length}`, path = asset.path ? asset.path.replace(asset.id, id) : "";
      assetIds.set(asset.id, id);
      copy.assets.push({ ...asset, id, path });
    }
    for (const font of fresh.fonts) if (!copy.fonts.some(f => f.data === font.data && f.family === font.family && f.weight === font.weight && f.style === font.style)) copy.fonts.push(structuredClone(font));
    copy.warnings = copy.warnings.filter(w => !removed.has(w.layerId)).concat(fresh.warnings.map(w => ({ ...w, layerId: layerName(w.layerId), reason: w.reason.replace(/^asset-\d+(?=:)/, id => assetIds.get(id) || id) })));
    copy.warnings.push({ code: "SECTION_REFRESH", layerId: null, reason: "The visible source section was re-read and rebuilt; other captured sections were retained." });
    const maxY = Math.max(...fresh.layers.filter(l => l.plane === "world").map(l => l.frame.y + l.frame.h), 0);
    copy.page.height = Math.max(copy.page.height, maxY);
    E.validate(copy); return copy;
  };
})();
