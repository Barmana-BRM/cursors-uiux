/* Pointer-captured, multi-area snipping overlay in Swarm's isolated shadow root. */
(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  E.selectAreas = (app, { confirm, cancel }) => {
    const root = app.view.root, width = innerWidth, height = innerHeight, geometry = { ...app.env.geom() };
    const style = document.createElement("style");
    style.textContent = `.area-selector{position:absolute;inset:0;z-index:30;background:#0002;cursor:crosshair;touch-action:none;user-select:none;pointer-events:auto;color:#fff;font:13px/1.5 system-ui}.area-box{position:absolute;border:2px solid #0d99ff;background:#0d99ff18;pointer-events:none}.area-box span{position:absolute;left:0;top:0;background:#0875cb;padding:1px 6px;white-space:nowrap}.area-help,.area-controls{position:absolute;left:50%;transform:translateX(-50%);background:#202124;padding:10px 14px;border:1px solid #555;border-radius:10px;box-shadow:0 4px 18px #0005;max-width:calc(100% - 24px);text-align:center;cursor:default}.area-help{top:12px;pointer-events:none}.area-controls{bottom:12px;display:flex;flex-wrap:wrap;justify-content:center;gap:8px;min-width:min(520px,calc(100% - 24px))}.area-controls button{font:inherit;min-height:36px;padding:6px 12px;border:1px solid #777;border-radius:6px;background:#35363a;color:#fff;cursor:pointer}.area-controls button:disabled{opacity:.45;cursor:default}.area-controls button:focus-visible{outline:2px solid #8cceff;outline-offset:2px}.area-controls .confirm{background:#076fc1}.area-count{width:100%}`;
    const stage = document.createElement("div"); stage.className = "area-selector"; stage.tabIndex = -1; stage.setAttribute("role", "dialog"); stage.setAttribute("aria-modal", "true"); stage.setAttribute("aria-label", "Select rebuild areas");
    stage.innerHTML = '<div class="area-help">Drag to select an area. Drag again to add more. Escape cancels.</div><div class="area-boxes"></div><div class="area-controls"><span class="area-count" role="status" aria-live="polite">No areas selected</span><button data-select="undo" disabled>Undo area</button><button data-select="clear" disabled>Clear areas</button><button class="confirm" data-select="confirm" disabled>Confirm &amp; Rebuild</button><button data-select="cancel">Cancel selection</button></div>';
    root.append(style, stage);
    const boxes = stage.querySelector(".area-boxes"), count = stage.querySelector(".area-count"), controls = stage.querySelector(".area-controls");
    const hidden = [app.view.cursorsEl, app.view.ov, app.view.badges, app.view.rulers].filter(Boolean).map(node => [node, node.style.visibility]);
    for (const [node] of hidden) node.style.visibility = "hidden";
    const unbind = [], rectangles = []; let draft = null, pointer = null, start = null, closed = false;
    const on = (target, event, fn, options) => { target.addEventListener(event, fn, options); unbind.push(() => target.removeEventListener(event, fn, options)); };
    const release = () => { if (pointer !== null && stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer); pointer = null; draft = null; start = null; };
    const draw = () => {
      boxes.replaceChildren(...[...rectangles, ...(draft ? [draft] : [])].map((r, i) => {
        const node = document.createElement("div"); node.className = "area-box";
        Object.assign(node.style, { left: `${r.l}px`, top: `${r.t}px`, width: `${r.r - r.l}px`, height: `${r.b - r.t}px` });
        const label = document.createElement("span"); label.textContent = `${i + 1} · ${Math.round(r.r - r.l)} × ${Math.round(r.b - r.t)}`; node.append(label); return node;
      }));
      count.textContent = rectangles.length ? `${rectangles.length} area${rectangles.length === 1 ? "" : "s"} selected (maximum 8)` : "No areas selected";
      for (const action of ["undo", "clear", "confirm"]) stage.querySelector(`[data-select="${action}"]`).disabled = !rectangles.length || pointer !== null;
    };
    const dispose = () => {
      if (closed) return false; closed = true; release();
      for (const off of unbind) off(); stage.remove(); style.remove();
      for (const [node, visibility] of hidden) node.style.visibility = visibility;
      return true;
    };
    const abort = reason => { if (dispose()) cancel(reason); };
    const position = e => ({ x: Math.max(0, Math.min(width, e.clientX)), y: Math.max(0, Math.min(height, e.clientY)) });
    on(stage, "pointerdown", e => {
      if (!e.isTrusted || e.button !== 0 || !e.isPrimary || e.target.closest(".area-controls") || pointer !== null) return;
      e.preventDefault(); e.stopPropagation();
      if (rectangles.length >= 8) { count.textContent = "Maximum 8 areas. Undo or clear an area to select another."; return; }
      pointer = e.pointerId; start = position(e); draft = { l: start.x, t: start.y, r: start.x, b: start.y }; stage.setPointerCapture(pointer); draw();
    });
    on(stage, "pointermove", e => {
      if (!e.isTrusted || e.pointerId !== pointer) return;
      const p = position(e); draft = { l: Math.min(start.x, p.x), t: Math.min(start.y, p.y), r: Math.max(start.x, p.x), b: Math.max(start.y, p.y) }; draw();
    });
    on(stage, "pointerup", e => {
      if (!e.isTrusted || e.pointerId !== pointer) return;
      const p = position(e), rect = { l: Math.min(start.x, p.x), t: Math.min(start.y, p.y), r: Math.max(start.x, p.x), b: Math.max(start.y, p.y) };
      if (rect && rect.r - rect.l >= 6 && rect.b - rect.t >= 6) rectangles.push(rect);
      release(); draw();
    });
    on(stage, "pointercancel", e => { if (e.pointerId === pointer) { release(); draw(); } });
    on(stage, "lostpointercapture", () => { if (pointer !== null) { release(); draw(); } });
    on(stage, "contextmenu", e => e.preventDefault());
    on(stage, "wheel", e => { e.preventDefault(); e.stopPropagation(); }, { passive: false });
    on(controls, "click", e => {
      const action = e.target.closest("button")?.dataset.select;
      if (action === "cancel") abort();
      else if (action === "undo" || action === "clear") { if (action === "undo") rectangles.pop(); else rectangles.length = 0; draw(); }
      else if (action === "confirm" && e.isTrusted && rectangles.length && pointer === null) {
        const selected = rectangles.map(r => ({ ...r })); if (dispose()) confirm(selected, { geometry, width, height });
      }
    });
    on(window, "keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); abort(); }
      if (e.key === "Tab") {
        e.preventDefault(); e.stopPropagation();
        const buttons = [...controls.querySelectorAll("button:not(:disabled)")], current = buttons.indexOf(root.activeElement);
        buttons[(current + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
      }
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End"].includes(e.key) && !e.target.closest?.("button")) { e.preventDefault(); e.stopPropagation(); }
    }, true);
    const check = () => {
      const g = app.env.geom();
      if (innerWidth !== width || innerHeight !== height || Object.keys(geometry).some(k => Math.abs(g[k] - geometry[k]) > .5)) abort("Viewport moved or resized; select the areas again.");
    };
    on(window, "resize", check); on(window, "scroll", check, true);
    on(window, "blur", () => abort("Selection cancelled because the window lost focus."));
    if (!app.env.isRoot) on(app.env.scroller, "scroll", check, { passive: true });
    stage.focus();
    return { dispose, cancel: abort };
  };
})();
