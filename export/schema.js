(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  const str = { type: "string" }, num = { type: "number" };
  const ref = name => ({ $ref: `#/$defs/${name}` });
  const list = items => ({ type: "array", items });
  const obj = properties => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
  const nullable = schema => ({ anyOf: [schema, { type: "null" }] });
  E.schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://swarm.local/schemas/design-1.1.0.json",
    ...obj({ format: { const: "swarm-design" }, version: { enum: ["1.0.0", "1.1.0"] }, capturedAt: str,
      viewport: obj({ width: num, height: num, pixelRatio: num, direction: { enum: ["rtl", "ltr"] }, isRoot: { type: "boolean" }, ox: num, oy: num, sx: num, sy: num, vw: num, vh: num }),
      page: obj({ width: num, height: num, background: ref("style") }),
      groups: list(ref("group")), layers: list(ref("layer")), assets: list(ref("asset")),
      fonts: list(obj({ family: str, weight: str, style: str, data: str })),
      warnings: list(obj({ code: str, layerId: nullable(str), reason: str })), limitations: list(str),
    }),
    $defs: {
      style: { type: "object", additionalProperties: str },
      frame: obj({ x: num, y: num, w: { type: "number", minimum: 0 }, h: { type: "number", minimum: 0 } }),
      node: { anyOf: [obj({ text: str }), obj({ tag: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9]*$" }, attrs: { type: "object", additionalProperties: str }, style: ref("style"), children: list(ref("node")) })] },
      group: obj({ id: str, parentId: nullable(str), name: str, tag: str, frame: ref("frame"), layerIds: list(str), children: list(str), source: obj({ position: str, float: str, zIndex: str, transform: str, direction: str, overflowX: str, overflowY: str, scrollX: num, scrollY: num }) }),
      layer: obj({ id: str, parentId: nullable(str), name: str, type: { enum: ["rect", "text", "image", "line"] }, frame: ref("frame"), plane: { enum: ["under", "world", "over"] }, order: num, opacity: { type: "number", minimum: 0, maximum: 1 }, blend: str,
        clip: nullable(obj({ l: num, t: num, r: num, b: num })), style: ref("style"), content: nullable(ref("node")), text: str, points: list(obj({ x: num, y: num })), stroke: str, strokeWidth: num, dash: str }),
      asset: obj({ id: str, path: str, mime: str, bytes: { type: "integer", minimum: 0 }, status: { enum: ["embedded", "missing"] }, data: str, reason: str }),
    },
  };
  E.schema.$defs.layer.properties.regionClip = { type: "boolean" };
  E.validate = design => {
    if (design.format !== "swarm-design" || !["1.0.0", "1.1.0"].includes(design.version) || !design.layers.length) throw new Error("No exportable design layers were captured");
    const ids = new Set();
    for (const node of [...design.groups, ...design.layers]) {
      if (ids.has(node.id)) throw new Error("Duplicate design layer ID"); ids.add(node.id);
      if (Object.values(node.frame).some(n => !Number.isFinite(n)) || node.frame.w < 0 || node.frame.h < 0) throw new Error("Invalid design geometry");
    }
    for (const node of [...design.groups, ...design.layers]) if (node.parentId && !ids.has(node.parentId)) throw new Error("Missing design parent");
    return true;
  };
})();
