(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  E.snapshots ||= [];
  E.autoExport ??= true;
  const autoExported = new WeakSet();
  E.save = (blob, filename) => {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  E.readme = design => `# Swarm UI/UX visual snapshot\n\nViewport: ${design.viewport.width} × ${design.viewport.height}; captured ${design.capturedAt}.\n\nOpen design.html offline, or design-with-css.html with design.css. The react/ and next/ folders contain editable JSX, CSS, package manifests and public/assets; their README files explain local development and production builds. Text is real HTML; there is no original application behavior. design.json is a versioned, self-contained blueprint for coding agents; validate with design.schema.json. assets/ holds locally acquired images/fonts. preview.png shows the captured viewport, not a full-page scroll composition. Each viewport must be captured independently; responsiveness is not inferred.\n\nSketch is an actual document archive containing editable text, shapes, vectors and bitmaps. Official Sketch schema validation is covered by the repository tests. Real Figma/Sketch import and exact font/RTL rendering require manual verification; this export must not be represented as a verified native .fig file. Font weights, complex gradients, clips, stacking across source groups and SVG curves may be approximated. All original CSS remains in design.json.\n\n## Privacy\nAll form values and marked private regions are excluded. Mark private prose/media with data-swarm-private before capture. Automatic redaction cannot identify arbitrary personal text or sensitive image pixels. No source page URL, query string, source IDs, event handlers or page scripts are exported. Asset reads omit credentials and are never uploaded to a conversion service. Redirected and incorrectly labelled images are identified by their bytes; already displayed origin-clean images can be read as PNG. Blocked cross-origin image hosts require an explicit optional host grant using Allow image downloads, followed by recapture.\n\n## Capture controls\nThe initial complete ZIP downloads automatically after real completion by default; Auto Export can be disabled for the current tab. Rebuild this section opens mouse-area selection (up to eight rectangles). Confirm & Rebuild re-reads only the selected areas. After reviewing the result, Approve & Download ZIP explicitly authorizes the updated download. Cancelling selection does not change the design or approve a download.\n\n## Limits\n${design.limitations.map(s => `- ${s}`).join("\n")}\n\n## Capture / asset / conversion report\n${design.warnings.length ? design.warnings.map(w => `- ${w.code}${w.layerId ? ` (${w.layerId})` : ""}: ${w.reason}`).join("\n") : "No capture warnings."}\n`;
  E.package = async design => {
    E.validate(design);
    // Work on a copy so repeated downloads do not mutate the retained snapshot.
    const copy = structuredClone(design), files = {};
    const sketch = await E.sketch(copy); copy.warnings.push(...sketch.warnings); files["design.sketch"] = new Uint8Array(await sketch.blob.arrayBuffer());
    try { files["preview.png"] = new Uint8Array(await (await E.preview(copy)).arrayBuffer()); }
    catch { copy.warnings.push({ code: "PNG_UNAVAILABLE", layerId: null, reason: "Browser refused safe SVG/canvas rendering. No placeholder preview file was generated." }); }
    Object.assign(files, E.code(copy));
    files["design.html"] = E.html(copy, true); files["design.json"] = JSON.stringify(copy, null, 2);
    files["design.schema.json"] = JSON.stringify(E.schema, null, 2); files["README.md"] = E.readme(copy);
    for (const asset of copy.assets) if (asset.status === "embedded") {
      const bytes = E.decodeData(asset.data);
      files[asset.path] = bytes;
      files[`react/public/${asset.path}`] = bytes;
      files[`next/public/${asset.path}`] = bytes;
    }
    return E.zip(files);
  };
  E.frameworkPackage = (design, framework) => {
    const files = {};
    for (const [name, content] of Object.entries(E.code(design))) if (name.startsWith(framework + "/")) files[name.slice(framework.length + 1)] = content;
    for (const asset of design.assets) if (asset.status === "embedded") files[`public/${asset.path}`] = E.decodeData(asset.data);
    return E.zip(files);
  };
  E.attach = (app, recapture) => {
    const root = app.view.root;
    const style = document.createElement("style");
    style.textContent = `.hud{max-width:calc(100vw - 16px);flex-wrap:wrap;justify-content:center;white-space:normal}.export-panel{position:absolute;bottom:calc(100% + 12px);right:0;display:grid;gap:8px;width:min(320px,calc(100vw - 32px));max-height:calc(100vh - 140px);overflow-y:auto;overscroll-behavior:contain;padding:14px;border:1px solid #555;border-radius:12px;background:#202124;color:#fff;box-shadow:0 8px 32px #0007;font:13px/1.4 system-ui}.export-panel[hidden]{display:none}.export-panel button,.export-panel select{min-height:36px;text-align:left;background:#35363a;color:#fff;border:1px solid #666;border-radius:6px;padding:7px;white-space:normal}.export-panel :focus-visible{outline:2px solid #83c6ff;outline-offset:2px}.export-report{max-height:120px;overflow:auto;font-size:12px;color:#e1e1e1}.export-state{font-weight:600}`;
    root.appendChild(style);
    const button = document.createElement("button"); button.textContent = "Export UI/UX"; button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", "swarm-export-panel");
    const repair = document.createElement("button"); repair.textContent = "Rebuild this section"; repair.disabled = true; repair.title = "Drag to select one or more areas, then confirm rebuilding";
    const approve = document.createElement("button"); approve.textContent = "Approve & Download ZIP"; approve.hidden = true; approve.title = "Approve the rebuilt areas and download the updated complete package";
    const panel = document.createElement("div"); panel.id = "swarm-export-panel"; panel.className = "export-panel"; panel.hidden = true;
    panel.innerHTML = `<div class="export-state" role="status" aria-live="polite">Rebuilding…</div><label>Snapshot <select aria-label="Captured viewport"></select></label><button data-export="html" disabled>Export HTML</button><button data-export="json" disabled>Export Design JSON</button><button data-export="sketch" disabled>Export Sketch (import unverified)</button><button data-export="png" disabled>Export PNG Preview</button><button data-export="zip" disabled>Export Complete Package (ZIP)</button><label><input type="checkbox"> Auto Export complete package</label><button class="recapture">Capture current viewport</button><div class="export-report" role="status" aria-live="polite"></div>`;
    for (const [format, label] of [["css", "Export CSS"], ["react", "Export React (ZIP)"], ["next", "Export Next.js (ZIP)"]]) {
      const item = document.createElement("button"); item.dataset.export = format; item.textContent = label; item.disabled = true;
      panel.insertBefore(item, panel.querySelector("label:has(input)"));
    }
    const allow = document.createElement("button"); allow.textContent = "Allow image downloads"; allow.title = "Grant optional access only to image hosts that blocked this capture, then capture again";
    panel.insertBefore(allow, panel.querySelector(".export-report"));
    app.view.hud.insertBefore(button, app.view.hud.lastElementChild); app.view.hud.insertBefore(repair, button); app.view.hud.insertBefore(approve, button); app.view.hud.appendChild(panel);
    const status = panel.querySelector(".export-state"), report = panel.querySelector(".export-report"), select = panel.querySelector("select"), auto = panel.querySelector("input");
    auto.checked = !!E.autoExport;
    let busy = false, repairing = false, selector = null;
    const setEnabled = enabled => {
      panel.querySelectorAll("[data-export]").forEach(b => b.disabled = !enabled || busy || repairing || !!selector || !!app.repairReviewRequired);
      repair.disabled = !enabled || busy || repairing || !!selector;
      approve.disabled = !enabled || busy || repairing || !!selector;
      approve.hidden = !app.repairReviewRequired;
      panel.querySelector(".recapture").disabled = busy || repairing || !!selector;
      allow.disabled = busy || repairing || !!selector || !E.blockedImageOrigins.size;
    };
    const refresh = () => {
      select.replaceChildren(...E.snapshots.map((d, i) => { const o = document.createElement("option"); o.value = i; o.textContent = `${d.viewport.width} × ${d.viewport.height} (${i + 1})`; return o; }));
      select.value = String(E.snapshots.length - 1);
    };
    const on = (target, type, fn) => { target.addEventListener(type, fn); (app.unbinds ||= []).push(() => target.removeEventListener(type, fn)); };
    on(button, "click", () => { panel.hidden = !panel.hidden; button.setAttribute("aria-expanded", String(!panel.hidden)); });
    on(auto, "change", () => { E.autoExport = auto.checked; });
    on(panel.querySelector(".recapture"), "click", () => { if (!busy && !repairing) recapture(); });
    on(repair, "click", () => {
      if (busy || repairing || selector || !app.complete) return;
      if (app.design.viewport.width !== innerWidth || app.design.viewport.height !== innerHeight) { report.textContent = "Viewport changed; use Capture current viewport before selecting areas."; return; }
      panel.hidden = true; button.setAttribute("aria-expanded", "false");
      selector = E.selectAreas(app, {
        confirm(rectangles, viewport) { selector = null; setEnabled(true); void app.rebuildRegions(rectangles, viewport); },
        cancel(reason) { selector = null; status.textContent = app.repairReviewRequired ? "Review rebuilt areas" : "Design Ready"; report.textContent = reason || "Selection cancelled. The design was not changed."; setEnabled(true); repair.focus(); },
      });
      setEnabled(false);
    });
    on(allow, "click", async e => {
      if (!e.isTrusted || busy || repairing) return;
      busy = true; setEnabled(app.complete);
      try { await E.allowImages(); report.textContent = "Image access granted. Use Rebuild this section or Capture current viewport to include the images."; }
      catch { report.textContent = "Image access was not granted. Other exports remain available; missing image reasons stay in the report."; }
      finally { busy = false; setEnabled(app.complete && !!app.design); }
    });
    const download = async (format, approvedDesign = null) => {
      if (busy || repairing || selector || !app.complete || !app.design || (app.repairReviewRequired && approvedDesign !== app.design)) return;
      const design = approvedDesign || E.snapshots[Number(select.value)]; if (!design) return;
      busy = true; setEnabled(false); report.textContent = "Preparing local export…";
      try {
        E.validate(design);
        let blob, filename;
        if (format === "html") { blob = new Blob([E.html(design)], { type: "text/html;charset=utf-8" }); filename = "design.html"; }
        else if (format === "css") {
          let css = E.code(design)["design.css"];
          for (const asset of design.assets) if (asset.status === "embedded") css = css.split(asset.path).join(asset.data);
          blob = new Blob([css], { type: "text/css;charset=utf-8" }); filename = "design.css";
        }
        else if (format === "react" || format === "next") { blob = E.frameworkPackage(design, format); filename = `Swarm-${format}-Export.zip`; }
        else if (format === "json") { blob = new Blob([JSON.stringify(design, null, 2)], { type: "application/json" }); filename = "design.json"; }
        else if (format === "png") { blob = await E.preview(design); filename = "preview.png"; }
        else if (format === "sketch") { blob = (await E.sketch(design)).blob; filename = "design.sketch"; }
        else { blob = await E.package(design); filename = "Swarm-UIUX-Export.zip"; }
        if (app.dead) return;
        E.save(blob, filename);
        if (approvedDesign) { app.repairReviewRequired = false; autoExported.add(design); status.textContent = "Design Ready"; }
        report.textContent = `${filename} ready. ${design.warnings.length} capture notices; see Design JSON or package README.`;
      } catch (err) {
        console.error("[swarm-export] Export failed", err);
        report.textContent = "Export failed. The browser may have blocked a resource or PNG rendering; try HTML/Design JSON and inspect their capture report.";
      } finally { busy = false; setEnabled(app.complete && !!app.design); }
    };
    on(panel, "click", e => { const format = e.target.closest("[data-export]")?.dataset.export; if (format) void download(format); });
    on(approve, "click", e => { if (e.isTrusted && app.repairReviewRequired) void download("zip", app.design); });
    setEnabled(false);
    return {
      get busy() { return busy || repairing || !!selector; },
      cancelSelection() { if (!selector) return false; selector.cancel(); return true; },
      dispose() { selector?.dispose(); selector = null; },
      rebuilding() { repairing = true; status.textContent = "Re-reading selected source…"; report.textContent = "Areas outside the selection will be retained."; setEnabled(false); },
      repairFailed(message) { repairing = false; status.textContent = app.repairReviewRequired ? "Review rebuilt areas" : "Design Ready"; report.textContent = message; setEnabled(true); },
      ready(design) { repairing = false; refresh(); status.textContent = app.repairReviewRequired ? "Review rebuilt areas" : "Design Ready"; setEnabled(true); report.textContent = app.repairReviewRequired ? "Review the rebuilt areas, then press Approve & Download ZIP. Nothing downloads before approval." : `${design.warnings.length} capture notices. Private form content omitted.`; if (!app.repairReviewRequired && E.autoExport && !autoExported.has(design)) { autoExported.add(design); void download("zip"); } },
      failed() { status.textContent = "Export capture failed"; report.textContent = "Rebuild remains available. Retry capture on a smaller or supported page."; },
    };
  };
})();
