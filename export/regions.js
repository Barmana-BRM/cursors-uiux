/* Exact rectangular repair masks; no DOM or application state is changed here. */
(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  const intersection = (a, b) => {
    const r = { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) };
    return r.r > r.l && r.b > r.t ? r : null;
  };
  E.intersectRegion = intersection;
  E.subtractRegion = (a, b) => {
    const i = intersection(a, b); if (!i) return [a];
    return [
      { l: a.l, t: a.t, r: a.r, b: i.t }, { l: a.l, t: i.b, r: a.r, b: a.b },
      { l: a.l, t: i.t, r: i.l, b: i.b }, { l: i.r, t: i.t, r: a.r, b: i.b },
    ].filter(r => r.r > r.l && r.b > r.t);
  };
  E.normalizeRegions = (rectangles, width, height) => {
    if (!Array.isArray(rectangles) || !rectangles.length || rectangles.length > 8 || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("Select between one and eight visible areas");
    const result = [], viewport = { l: 0, t: 0, r: width, b: height };
    for (const rect of rectangles) {
      if (!rect || ![rect.l, rect.t, rect.r, rect.b].every(Number.isFinite) || rect.r <= rect.l || rect.b <= rect.t) throw new Error("Invalid selection rectangle");
      const clipped = intersection(rect, viewport);
      if (!clipped || clipped.r - clipped.l < 6 || clipped.b - clipped.t < 6) throw new Error("Each area must be at least 6 × 6 pixels inside the viewport");
      let pieces = [clipped];
      for (const old of result) pieces = pieces.flatMap(piece => E.subtractRegion(piece, old));
      result.push(...pieces);
    }
    return result;
  };
  E.regionMasks = (rectangles, geometry, width, height) => {
    const screen = E.normalizeRegions(rectangles, width, height);
    const port = { l: geometry.ox, t: geometry.oy, r: geometry.ox + geometry.vw, b: geometry.oy + geometry.vh };
    const world = screen.map(rect => intersection(rect, port)).filter(Boolean).map(rect => ({ l: rect.l - geometry.ox + geometry.sx, t: rect.t - geometry.oy + geometry.sy, r: rect.r - geometry.ox + geometry.sx, b: rect.b - geometry.oy + geometry.sy }));
    return { world, under: screen, over: screen };
  };
  E.paintBounds = layer => {
    const f = layer.frame;
    const effects = [layer.style?.["box-shadow"], layer.style?.["text-shadow"], layer.style?.filter].filter(Boolean).join(" ").replace(/rgba?\([^)]+\)/g, "");
    const px = [...effects.matchAll(/(-?[\d.]+)px/g)].map(m => Math.abs(Number(m[1])));
    const pad = Math.max(layer.type === "line" ? layer.strokeWidth / 2 + 1 : 0, ...px.map(n => n * 3), 0);
    const bounds = { l: f.x - pad, t: f.y - pad, r: f.x + Math.max(f.w, .01) + pad, b: f.y + Math.max(f.h, .01) + pad };
    return layer.clip ? intersection(bounds, layer.clip) : bounds;
  };
  E.regionSequence = design => 1 + Math.max(0, ...design.layers.map(l => Number(l.id.match(/^l-region-(\d+)-/)?.[1] || 0)));
  E.regionPlan = (original, fresh, masks, aliases = null) => {
    const copy = structuredClone(original), sequence = E.regionSequence(original), retained = [], incoming = [], removed = new Set();
    let index = 0;
    const id = () => `l-region-${sequence}-${index++}`;
    for (const layer of copy.layers) {
      const bounds = E.paintBounds(layer), regions = masks[layer.plane];
      if (!bounds || !regions.some(rect => intersection(bounds, rect))) { retained.push({ layer, from: layer.id, unchanged: true }); continue; }
      removed.add(layer.id);
      let pieces = [bounds];
      for (const rect of regions) pieces = pieces.flatMap(piece => E.subtractRegion(piece, rect));
      for (const clip of pieces) retained.push({ layer: { ...layer, id: id(), clip, regionClip: true }, from: layer.id, unchanged: false });
      if (retained.length > 12000) throw new Error("Selection is too complex; select fewer or smaller areas");
    }
    const groups = new Map(copy.groups.map(g => [g.id, g])), freshGroups = new Map(fresh.groups.map(g => [g.id, g]));
    const mapped = new Map();
    const groupId = sourceId => {
      if (!sourceId) return null;
      if (mapped.has(sourceId)) return mapped.get(sourceId);
      const existing = aliases ? aliases.get(sourceId) : (groups.has(sourceId) ? sourceId : null);
      if (existing && groups.has(existing)) { mapped.set(sourceId, existing); return existing; }
      const source = freshGroups.get(sourceId); if (!source) throw new Error("Selected layer has no source group");
      const parentId = groupId(source.parentId), newId = `g-region-${sequence}-${mapped.size}`;
      mapped.set(sourceId, newId);
      groups.set(newId, { ...structuredClone(source), id: newId, parentId, children: [], layerIds: [] });
      if (parentId && !groups.get(parentId).children.includes(newId)) groups.get(parentId).children.push(newId);
      return newId;
    };
    for (const layer of fresh.layers) {
      const bounds = E.paintBounds(layer); if (!bounds) continue;
      for (const rect of masks[layer.plane]) {
        const clip = intersection(bounds, rect); if (!clip) continue;
        incoming.push({ layer: { ...structuredClone(layer), id: id(), parentId: groupId(layer.parentId), clip, regionClip: true }, from: layer.id });
        if (retained.length + incoming.length > 12000) throw new Error("Selection is too complex; select fewer or smaller areas");
      }
    }
    // Inner scrollers expose the page background beneath both the port and fixed UI.
    // Root documents paint it in document coordinates. Neither changes outside masks.
    const backgroundPlane = fresh.viewport.isRoot ? "world" : "under";
    const firstOrder = Math.min(0, ...copy.layers.filter(l => l.plane === backgroundPlane).map(l => l.order)) - 1;
    for (const clip of masks[backgroundPlane]) incoming.unshift({ from: null, layer: {
      id: id(), parentId: null, name: "Selected page background", type: "rect", plane: backgroundPlane, order: firstOrder,
      frame: { x: 0, y: 0, w: fresh.viewport.isRoot ? Math.max(fresh.page.width, fresh.viewport.vw) : fresh.viewport.width, h: fresh.viewport.isRoot ? Math.max(fresh.page.height, fresh.viewport.vh) : fresh.viewport.height },
      opacity: 1, blend: "normal", clip, regionClip: true, style: { ...fresh.page.background }, content: null, text: "", points: [], stroke: "", strokeWidth: 0, dash: "",
    } });
    if (!incoming.length || retained.length + incoming.length > 12000) throw new Error("No readable area was selected, or the selection is too complex");
    copy.version = "1.1.0"; copy.capturedAt = fresh.capturedAt;
    copy.viewport.sx = fresh.viewport.sx; copy.viewport.sy = fresh.viewport.sy;
    copy.layers = retained.map(p => p.layer).concat(incoming.map(p => p.layer));
    copy.groups = [...groups.values()];
    for (const group of copy.groups) group.layerIds = [];
    for (const layer of copy.layers) if (layer.parentId) groups.get(layer.parentId).layerIds.push(layer.id);
    const assetIds = new Map();
    for (const asset of fresh.assets) {
      const duplicate = asset.status === "embedded" && copy.assets.find(a => a.data === asset.data);
      if (duplicate) { assetIds.set(asset.id, duplicate.id); continue; }
      const nextId = `asset-${copy.assets.length}`;
      assetIds.set(asset.id, nextId); copy.assets.push({ ...asset, id: nextId, path: asset.path ? asset.path.replace(asset.id, nextId) : "" });
    }
    for (const font of fresh.fonts) if (!copy.fonts.some(f => f.data === font.data && f.family === font.family && f.weight === font.weight && f.style === font.style)) copy.fonts.push(structuredClone(font));
    const layerIds = new Map(incoming.filter(p => p.from).map(p => [p.from, p.layer.id]));
    copy.warnings = copy.warnings.filter(w => !removed.has(w.layerId)).concat(fresh.warnings.map(w => ({ ...w, layerId: layerIds.get(w.layerId) || null, reason: w.reason.replace(/^asset-\d+(?=:)/, value => assetIds.get(value) || value) })));
    copy.warnings.push({ code: "REGION_REFRESH", layerId: null, reason: "Only the user-selected rectangles were re-read and rebuilt; download requires explicit result approval." });
    if (copy.assets.length > 4096 || copy.groups.length > 20000 || copy.warnings.length > 20000 || copy.assets.reduce((total, asset) => total + asset.bytes, 0) > 64 * 1024 * 1024)
      throw new Error("Retained design budget reached; use Capture current viewport for a fresh snapshot");
    E.validate(copy);
    return { design: copy, retained, incoming, removed, groupMap: mapped };
  };
})();
