import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const layoutPath = path.join(root, "templates", "layout.html");
const appsJsonPath = path.join(root, "apps.json");

const NAV_LABELS = {
  "index.html": "Overview",
  "privacy_policy.html": "Privacy Policy",
  "inquiry.html": "Support",
};

function htmlFileNameFor(mdFileName) {
  if (mdFileName === "README.md") return "index.html";
  return mdFileName.toLowerCase().replace(/\.md$/, ".html");
}

function relPath(from, to) {
  let rel = path.relative(from, to);
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel.split(path.sep).join("/");
}

function renderLayout(layout, { title, content, nav, pageDir }) {
  const stylesheet = relPath(pageDir, path.join(root, "assets", "style.css"));
  const home = relPath(pageDir, path.join(root, "index.html"));
  return layout
    .replaceAll("{{title}}", title)
    .replaceAll("{{stylesheet}}", stylesheet)
    .replaceAll("{{home}}", home)
    .replaceAll("{{nav}}", nav)
    .replaceAll("{{content}}", content);
}

function buildAppNav(appDir, mdFiles, currentHtml) {
  const links = mdFiles
    .map((md) => htmlFileNameFor(md))
    .filter((html) => NAV_LABELS[html])
    .sort((a, b) => {
      const order = ["index.html", "privacy_policy.html", "inquiry.html"];
      return order.indexOf(a) - order.indexOf(b);
    });
  const items = links.map((html) => {
    const label = NAV_LABELS[html];
    if (html === currentHtml) {
      return `<span aria-current="page">${label}</span>`;
    }
    return `<a href="./${html}">${label}</a>`;
  });
  return `<nav class="site-nav">${items.join("")}</nav>`;
}

function extractTitle(html, fallback) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!m) return fallback;
  return m[1].replace(/<[^>]+>/g, "").trim() || fallback;
}

async function listMarkdownFiles(dir) {
  const entries = await readdir(dir);
  const out = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    const full = path.join(dir, name);
    const s = await stat(full);
    if (s.isFile()) out.push(name);
  }
  return out;
}

async function buildApp(layout, app) {
  const appDir = path.join(root, app.id);
  if (!existsSync(appDir)) {
    throw new Error(`App folder not found: ${appDir}`);
  }
  const mdFiles = await listMarkdownFiles(appDir);
  if (!mdFiles.includes("README.md")) {
    throw new Error(`${app.id}: README.md is required`);
  }

  for (const md of mdFiles) {
    const srcPath = path.join(appDir, md);
    const htmlName = htmlFileNameFor(md);
    const outPath = path.join(appDir, htmlName);
    const src = await readFile(srcPath, "utf8");
    const body = marked.parse(src);
    const title =
      htmlName === "index.html"
        ? `${app.name} — ${extractTitle(body, app.name)}`
        : `${extractTitle(body, htmlName)} — ${app.name}`;
    const nav = buildAppNav(appDir, mdFiles, htmlName);
    const html = renderLayout(layout, {
      title,
      content: body,
      nav,
      pageDir: appDir,
    });
    await writeFile(outPath, html, "utf8");
    console.log(`  ${path.relative(root, outPath)}`);
  }
}

async function buildIndex(layout, site, apps) {
  const cards = apps
    .map((app) => {
      const href = `./${app.id}/`;
      return `      <li class="app-card">
        <h2><a href="${href}">${app.name}</a></h2>
        <p>${app.tagline ?? ""}</p>
        <div class="app-links">
          <a href="./${app.id}/">Overview</a>
          <a href="./${app.id}/privacy_policy.html">Privacy Policy</a>
          <a href="./${app.id}/inquiry.html">Support</a>
        </div>
      </li>`;
    })
    .join("\n");
  const content = `<h1>${site.title}</h1>
<p>${site.tagline ?? ""}</p>
<ul class="app-list">
${cards}
</ul>`;
  const html = renderLayout(layout, {
    title: site.title,
    content,
    nav: "",
    pageDir: root,
  });
  const outPath = path.join(root, "index.html");
  await writeFile(outPath, html, "utf8");
  console.log(`  ${path.relative(root, outPath)}`);
}

async function main() {
  const layout = await readFile(layoutPath, "utf8");
  const config = JSON.parse(await readFile(appsJsonPath, "utf8"));

  console.log("Building apps:");
  for (const app of config.apps) {
    await buildApp(layout, app);
  }

  console.log("Building index:");
  await buildIndex(layout, config.site, config.apps);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
