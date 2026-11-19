/* Real JSX and extracted CSS from the same inert HTML visual snapshot. */
(() => {
  "use strict";
  const E = globalThis.SwarmExport ||= {};
  const json = value => JSON.stringify(value).replace(/</g, "\\u003c");
  const prop = name => name === "class" ? "className" : name === "for" ? "htmlFor" : /^(data-|aria-)/.test(name) ? name : name.replace(/[-:]([a-z])/g, (_, c) => c.toUpperCase());
  E.code = design => {
    const doc = new DOMParser().parseFromString(E.html(design, true), "text/html");
    const rules = [doc.querySelector("style").textContent], styles = new Map();
    for (const node of [doc.body, ...doc.body.querySelectorAll("[style]")]) {
      // Computed 100% is exactly normal. Some production CSS minifiers otherwise
      // emit an ambiguous/invalid `font: 700 100% 25px ...` shorthand.
      if (node.style.getPropertyValue("font-stretch") === "100%") node.style.setProperty("font-stretch", "normal");
      const css = node.getAttribute("style"); node.removeAttribute("style"); if (!css) continue;
      let name = styles.get(css);
      if (!name) { name = `swarm-style-${styles.size}`; styles.set(css, name); rules.push(`.${name}{${css}}`); }
      node.classList.add(name); node.removeAttribute("style");
    }
    const jsx = (node, depth = 0) => {
      if (node.nodeType === 3) return node.data ? `{${json(node.data)}}` : "";
      if (node.nodeType !== 1) return "";
      const attrs = [...node.attributes].map(a => ` ${prop(a.name)}={${json(a.value)}}`).join("");
      const children = [...node.childNodes].map(child => jsx(child, depth + 1)).filter(Boolean);
      const indent = "  ".repeat(depth);
      return children.length ? `${indent}<${node.localName}${attrs}>\n${children.join("\n")}\n${indent}</${node.localName}>` : `${indent}<${node.localName}${attrs} />`;
    };
    const v = design.viewport;
    const body = `<div className={${json(doc.body.className)}} dir={${json(v.direction)}} lang={${json(v.direction === "rtl" ? "fa" : "en")}}>\n${[...doc.body.childNodes].map(node => jsx(node, 2)).join("\n")}\n  </div>`;
    const css = rules.join("\n");
    const component = `import React from "react";\n\n// Static visual snapshot; original website behavior is not included.\nexport default function Design() {\n  return (${body});\n}\n`;
    const rootHtml = `<!doctype html>${doc.documentElement.outerHTML}`.replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="design.css">').replace("style-src 'unsafe-inline'", "style-src 'self' 'unsafe-inline'");
    const appCss = css.replace(/url\(["']?(assets\/[^"')]+)["']?\)/g, (_, path) => `url("/${path}")`);
    const appComponent = component.replace(/(src=\{)"assets\//g, '$1"/assets/');
    const reactPackage = { name: "swarm-react-design", version: "1.0.0", private: true, type: "module", scripts: { dev: "vite", build: "vite build", preview: "vite preview" }, dependencies: { react: "19.3.1", "react-dom": "19.3.1" }, devDependencies: { vite: "8.3.7" } };
    const nextPackage = { name: "swarm-next-design", version: "1.0.0", private: true, scripts: { dev: "next dev", build: "next build" }, dependencies: { next: "16.4.6", react: "19.3.1", "react-dom": "19.3.1" } };
    return {
      "design.css": css,
      "design-with-css.html": rootHtml,
      "react/package.json": JSON.stringify(reactPackage, null, 2),
      "react/index.html": `<!doctype html><html lang="${v.direction === "rtl" ? "fa" : "en"}" dir="${v.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Swarm React Design</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
      "react/src/Design.jsx": appComponent,
      "react/src/design.css": appCss,
      "react/src/main.jsx": 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport Design from "./Design.jsx";\nimport "./design.css";\ncreateRoot(document.getElementById("root")).render(<Design />);\n',
      "next/package.json": JSON.stringify(nextPackage, null, 2),
      "next/next.config.mjs": 'import { fileURLToPath } from "node:url";\nexport default { turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) }, output: "export", images: { unoptimized: true } };\n',
      "next/app/page.jsx": appComponent,
      "next/app/design.css": appCss,
      "next/app/layout.jsx": `import "./design.css";\nexport const metadata = { title: "Swarm Next Design" };\nexport default function RootLayout({ children }) { return <html lang="${v.direction === "rtl" ? "fa" : "en"}" dir="${v.direction}"><body>{children}</body></html>; }\n`,
      "react/README.md": "# React visual snapshot\n\nRun npm install, then npm run dev or npm run build. Requires Node 22.12+ or a newer supported Node version. Images/fonts are in public/assets. Edit src/Design.jsx and src/design.css. No original website scripts, API calls or application behavior are included.\n",
      "next/README.md": "# Next.js App Router visual snapshot\n\nRun npm install, then npm run dev. npm run build creates static output in out/; serve it with a local static HTTP server. Requires Node 22.12+ or a newer supported Node version. Edit app/page.jsx and app/design.css; assets are in public/assets. No original website scripts, APIs or application behavior are included.\n",
    };
  };
})();
