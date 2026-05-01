import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const layoutPath = path.join(root, "templates", "index.html");
const appsJsonPath = path.join(root, "apps.json");
const stylesheetPath = path.join(root, "assets", "style.css");
const rootIndexPath = path.join(root, "index.html");

const PAGE_LABELS = {
  "index.html": "Overview",
  "privacy_policy.html": "Privacy Policy",
  "inquiry.html": "Support",
};
const PAGE_ORDER = ["index.html", "privacy_policy.html", "inquiry.html"];

function htmlFileNameFor(mdFileName) {
  if (mdFileName === "README.md") return "index.html";
  return mdFileName.toLowerCase().replace(/\.md$/, ".html");
}

function relPath(fromDir, toFile) {
  let rel = path.relative(fromDir, toFile);
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel.split(path.sep).join("/");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLayout(layout, vars) {
  return layout.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? vars[key] : ""
  );
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

function buildAppAside(app, mdFiles, currentHtml, pageDir) {
  const pages = mdFiles
    .map((md) => htmlFileNameFor(md))
    .filter((html) => PAGE_LABELS[html])
    .sort((a, b) => PAGE_ORDER.indexOf(a) - PAGE_ORDER.indexOf(b));
  const items = pages
    .map((html) => {
      const label = PAGE_LABELS[html];
      if (html === currentHtml) {
        return `<li><strong>${label}</strong></li>`;
      }
      return `<li><a href="./${html}">${label}</a></li>`;
    })
    .join("\n");
  const home = relPath(pageDir, rootIndexPath);
  return `<div class="left-title">${escapeHtml(app.name)}</div>
<div class="link">
<ul>
${items}
</ul>
</div>
<div class="left-title">Other</div>
<div class="link">
<ul>
<li><a href="${home}">Back to top</a></li>
</ul>
</div>`;
}

function buildIndexAside(apps) {
  const items = apps
    .map(
      (a) =>
        `<li><a href="./${a.id}/">${escapeHtml(a.name)}</a></li>`
    )
    .join("\n");
  return `<div class="left-title">Apps</div>
<div class="link">
<ul>
${items}
</ul>
</div>`;
}

async function buildApp(layout, site, app) {
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
    const pageHeading = extractTitle(body, app.name);
    const title =
      htmlName === "index.html"
        ? `${app.name} — ${site.title}`
        : `${pageHeading} — ${app.name}`;
    const aside = buildAppAside(app, mdFiles, htmlName, appDir);
    const html = renderLayout(layout, {
      title: escapeHtml(title),
      description: escapeHtml(app.tagline ?? site.tagline ?? ""),
      keywords: escapeHtml([app.name, site.title].filter(Boolean).join(", ")),
      stylesheet: relPath(appDir, stylesheetPath),
      home: relPath(appDir, rootIndexPath),
      site_title: escapeHtml(site.title),
      site_tagline: escapeHtml(site.tagline ?? ""),
      content: body,
      aside,
    });
    await writeFile(outPath, html, "utf8");
    console.log(`  ${path.relative(root, outPath)}`);
  }
}

async function buildIndex(layout, site, apps) {
  const cards = apps
    .map((app) => {
      const href = `./${app.id}/`;
      return `<h2><a href="${href}">${escapeHtml(app.name)}</a></h2>
<p>${escapeHtml(app.tagline ?? "")}</p>
<p><a href="${href}">Overview</a> &middot; <a href="./${app.id}/privacy_policy.html">Privacy Policy</a> &middot; <a href="./${app.id}/inquiry.html">Support</a></p>`;
    })
    .join("\n");
  const content = cards;
  const aside = buildIndexAside(apps);
  const html = renderLayout(layout, {
    title: escapeHtml(site.title),
    description: escapeHtml(site.tagline ?? ""),
    keywords: escapeHtml(
      [site.title, ...apps.map((a) => a.name)].filter(Boolean).join(", ")
    ),
    stylesheet: relPath(root, stylesheetPath),
    home: relPath(root, rootIndexPath),
    site_title: escapeHtml(site.title),
    site_tagline: escapeHtml(site.tagline ?? ""),
    content,
    aside,
  });
  await writeFile(rootIndexPath, html, "utf8");
  console.log(`  ${path.relative(root, rootIndexPath)}`);
}

async function main() {
  const layout = await readFile(layoutPath, "utf8");
  const config = JSON.parse(await readFile(appsJsonPath, "utf8"));

  console.log("Building apps:");
  for (const app of config.apps) {
    await buildApp(layout, config.site, app);
  }

  console.log("Building index:");
  await buildIndex(layout, config.site, config.apps);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
