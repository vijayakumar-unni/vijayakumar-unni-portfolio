/**
 * Zero-dependency static site build.
 *
 * Assembles src/ into dist/:
 *   - src/layout/page.html is the entry template
 *   - {{> partial}} pulls in any src/**\/*.html component
 *   - content comes from src/data/*.json (one file per page section)
 *   - CSS is concatenated in STYLE_ORDER into dist/assets/site.css
 *   - JS is copied as real ES modules under dist/assets/
 *   - Images/ and resume/ are copied verbatim
 *
 * Usage:  node build.js [--serve] [--port 4173]
 */

const fs = require("node:fs");
const path = require("node:path");
const { readSize } = require("./scripts/lib/png.js");
const { buildWordmark } = require("./scripts/make-wordmark.js");
const { buildFavicon } = require("./scripts/make-favicon.js");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

/**
 * Logo pipeline. Drop any image in at LOGO_MASTER and the next build crops it,
 * keys out its background, and resizes it — see scripts/make-wordmark.js.
 */
const LOGO_MASTER = path.join(ROOT, "Images", "logo.png");
const LOGO_WORDMARK = path.join(ROOT, "Images", "logo-wordmark.png");

/**
 * Cascade order for the stylesheet. Tokens and base must come first; component
 * files own their own media queries, so their relative order only matters for
 * shared selectors (.dot, .tag) which live in base/layout.
 */
const STYLE_ORDER = [
  "styles/tokens.css",
  "styles/base.css",
  "styles/layout.css",
  "components/topbar/topbar.css",
  "components/hero/hero.css",
  "components/stats/stats.css",
  "components/work/work.css",
  "components/work/diagram.css",
  "components/skills/skills.css",
  "components/testimonials/testimonials.css",
  "components/credentials/credentials.css",
  "components/footer/footer.css",
];

/** Directories copied into dist as-is. */
const STATIC_DIRS = ["Images", "resume"];

/**
 * Files kept in the repo but never published: source masters that exist only
 * so a derived asset can be regenerated, and the *.preview.png contact sheets
 * the image scripts write for eyeballing a result.
 */
const STATIC_EXCLUDE = [
  // The uncropped logo plate; Images/logo-wordmark.png is what ships.
  "Images/logo.png",
  "resume/README.md",
  /\.preview\.png$/,
];

function isExcluded(absolutePath) {
  const rel = path.relative(ROOT, absolutePath).replace(/\\/g, "/");
  return STATIC_EXCLUDE.some((rule) => (rule instanceof RegExp ? rule.test(rel) : rule === rel));
}

// ---------------------------------------------------------------- utilities

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, ext, out);
    else if (entry.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (isExcluded(src)) continue;
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------- template engine

/**
 * Splits a template into a flat token list.
 *
 * {{{path}}}          raw (unescaped) interpolation
 * {{path}}            HTML-escaped interpolation
 * {{> name}}          include partial `name`
 * {{>* path}}         include the partial named by the value at `path`
 * {{#each path}}..{{/each}}
 * {{#if path}}..{{else}}..{{/if}}
 * {{#with path}}..{{/with}}   narrow the scope, e.g. to a section's data
 * {{! note }}                 authoring comment, stripped from the output
 *
 * Inside {{#each}}, `{{.}}` is the item and `{{@index}}` / `{{@first}}` /
 * `{{@last}}` describe its position.
 */
function tokenize(source) {
  const re =
    /\{\{\{\s*([^}\s]+)\s*\}\}\}|\{\{\s*(#each|#if|#with|\/each|\/if|\/with|else|>\*|>|!)?\s*([^}]*?)\s*\}\}/g;
  const tokens = [];
  let cursor = 0;
  let match;

  while ((match = re.exec(source))) {
    if (match.index > cursor) {
      tokens.push({ type: "text", value: source.slice(cursor, match.index) });
    }
    cursor = re.lastIndex;

    if (match[1] !== undefined) {
      tokens.push({ type: "raw", path: match[1] });
      continue;
    }

    const [, , tag, arg] = match;
    switch (tag) {
      case "#each":
        tokens.push({ type: "each", path: arg });
        break;
      case "/each":
        tokens.push({ type: "endEach" });
        break;
      case "#if":
        tokens.push({ type: "if", path: arg });
        break;
      case "/if":
        tokens.push({ type: "endIf" });
        break;
      case "#with":
        tokens.push({ type: "with", path: arg });
        break;
      case "/with":
        tokens.push({ type: "endWith" });
        break;
      case "else":
        tokens.push({ type: "else" });
        break;
      case ">":
        tokens.push({ type: "partial", name: arg });
        break;
      case ">*":
        tokens.push({ type: "dynamicPartial", path: arg });
        break;
      case "!":
        break;
      default:
        tokens.push({ type: "escaped", path: arg });
    }
  }

  if (cursor < source.length) {
    tokens.push({ type: "text", value: source.slice(cursor) });
  }
  return markStandalonePartials(tokens);
}

/**
 * A block tag alone on its own line produces no output, so the line it sits on
 * should not survive into the generated HTML.
 */
function stripStandaloneBlockLines(source) {
  return source.replace(/^[ \t]*(\{\{(?:[#/][^}]*|else|![^}]*)\}\})[ \t]*\r?\n/gm, "$1");
}

/**
 * Records the indentation of a partial that sits alone on its line so the
 * rendered partial can be indented to match, keeping the output readable.
 */
function markStandalonePartials(tokens) {
  tokens.forEach((token, index) => {
    if (token.type !== "partial" && token.type !== "dynamicPartial") return;

    const before = tokens[index - 1];
    const after = tokens[index + 1];
    const startsLine = !before || (before.type === "text" && /(^|\n)[ \t]*$/.test(before.value));
    const endsLine = !after || (after.type === "text" && /^[ \t]*\r?\n/.test(after.value));
    if (!startsLine || !endsLine) return;

    const indent = before ? (before.value.match(/(?:^|\n)([ \t]*)$/) ?? ["", ""])[1] : "";
    token.indent = indent;
    if (before && indent) before.value = before.value.slice(0, before.value.length - indent.length);
    if (after) after.value = after.value.replace(/^[ \t]*\r?\n/, "");
  });
  return tokens;
}

function indentBlock(text, indent) {
  if (!indent) return text;
  return text
    .split("\n")
    .map((line) => (line.trim() ? indent + line : line))
    .join("\n");
}

function parse(tokens, label) {
  const root = { type: "root", children: [] };
  const stack = [root];

  const push = (node) => {
    const top = stack[stack.length - 1];
    (top.inAlternate ? top.alternate : top.children).push(node);
  };

  for (const token of tokens) {
    const top = stack[stack.length - 1];
    switch (token.type) {
      case "each": {
        const node = { type: "each", path: token.path, children: [], alternate: [] };
        push(node);
        stack.push(node);
        break;
      }
      case "if":
      case "with": {
        const node = { type: token.type, path: token.path, children: [], alternate: [] };
        push(node);
        stack.push(node);
        break;
      }
      case "else":
        if (top.type !== "if" && top.type !== "each") {
          throw new Error(`${label}: {{else}} outside of an #if/#each block`);
        }
        top.inAlternate = true;
        break;
      case "endEach":
      case "endIf":
      case "endWith": {
        const expected = { endEach: "each", endIf: "if", endWith: "with" }[token.type];
        if (top.type !== expected) {
          throw new Error(`${label}: unbalanced {{/${expected}}} (open block is "${top.type}")`);
        }
        stack.pop();
        break;
      }
      default:
        push(token);
    }
  }

  if (stack.length !== 1) {
    throw new Error(`${label}: unclosed ${stack[stack.length - 1].type} block`);
  }
  return root;
}

/** Resolves a dotted path against the innermost scope first, then outward. */
function resolve(scopes, expression) {
  if (expression === "." || expression === "this") {
    return scopes[scopes.length - 1];
  }
  const [head, ...rest] = expression.split(".");
  for (let i = scopes.length - 1; i >= 0; i -= 1) {
    const scope = scopes[i];
    if (scope == null || typeof scope !== "object" || !(head in scope)) continue;
    let value = scope[head];
    for (const key of rest) {
      if (value == null) return undefined;
      value = value[key];
    }
    return value;
  }
  return undefined;
}

function createRenderer(partials) {
  const compiled = new Map();

  function template(name) {
    if (!compiled.has(name)) {
      if (!partials.has(name)) {
        throw new Error(`Unknown partial "${name}". Known: ${[...partials.keys()].sort().join(", ")}`);
      }
      compiled.set(name, parse(tokenize(stripStandaloneBlockLines(partials.get(name))), name));
    }
    return compiled.get(name);
  }

  function render(node, scopes) {
    let out = "";
    for (const child of node.children) {
      switch (child.type) {
        case "text":
          out += child.value;
          break;
        case "raw": {
          const value = resolve(scopes, child.path);
          out += value == null ? "" : String(value);
          break;
        }
        case "escaped": {
          const value = resolve(scopes, child.path);
          out += value == null ? "" : escapeHtml(value);
          break;
        }
        case "partial":
          out += indentBlock(render(template(child.name), scopes), child.indent);
          break;
        case "dynamicPartial": {
          const name = resolve(scopes, child.path);
          if (!name) throw new Error(`{{>* ${child.path}}} resolved to nothing`);
          out += indentBlock(render(template(name), scopes), child.indent);
          break;
        }
        case "each": {
          const list = resolve(scopes, child.path);
          if (Array.isArray(list) && list.length) {
            list.forEach((item, index) => {
              // Position metadata goes in its own scope beneath the item so
              // {{.}} still resolves for primitive items (e.g. string lists).
              const meta = { "@index": index, "@first": index === 0, "@last": index === list.length - 1 };
              out += render(child, [...scopes, meta, item]);
            });
          } else {
            out += render({ children: child.alternate }, scopes);
          }
          break;
        }
        case "if": {
          const value = resolve(scopes, child.path);
          const truthy = Array.isArray(value) ? value.length > 0 : Boolean(value);
          out += render(truthy ? child : { children: child.alternate }, scopes);
          break;
        }
        case "with": {
          const value = resolve(scopes, child.path);
          if (value == null) throw new Error(`{{#with ${child.path}}} resolved to nothing`);
          out += render(child, [...scopes, value]);
          break;
        }
        default:
          throw new Error(`Unhandled node type "${child.type}"`);
      }
    }
    return out;
  }

  return (name, data) => render(template(name), [data]);
}

// ------------------------------------------------------------------- inputs

/** Registers every src/**\/*.html as a partial, keyed by path and short alias. */
function loadPartials() {
  const partials = new Map();
  const aliases = new Map();

  for (const file of walk(SRC, ".html")) {
    const key = path.relative(SRC, file).replace(/\\/g, "/").replace(/\.html$/, "");
    partials.set(key, fs.readFileSync(file, "utf8"));

    // components/hero/hero -> also addressable as "hero"
    const segments = key.split("/");
    const base = segments[segments.length - 1];
    if (segments.length > 1 && segments[segments.length - 2] === base) {
      if (aliases.has(base)) {
        throw new Error(`Partial alias "${base}" is ambiguous (${aliases.get(base)} vs ${key})`);
      }
      aliases.set(base, key);
    }
  }

  for (const [alias, key] of aliases) {
    if (!partials.has(alias)) partials.set(alias, partials.get(key));
  }
  return partials;
}

/** Merges src/data/*.json into one object keyed by filename. */
function loadData() {
  const dir = path.join(SRC, "data");
  const data = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const key = path.basename(file, ".json");
    data[key] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  }
  return data;
}

/**
 * Regenerates the header wordmark when the logo master has changed, then
 * reports its real pixel size. This is what makes swapping the logo a matter
 * of replacing one file: nothing in src/data records the dimensions, so a new
 * logo with a different aspect ratio needs no edits anywhere.
 */
function resolveWordmark(asset) {
  const dest = path.join(ROOT, asset.src);

  if (fs.existsSync(LOGO_MASTER) && path.resolve(dest) === path.resolve(LOGO_WORDMARK)) {
    const masterAt = fs.statSync(LOGO_MASTER).mtimeMs;
    const builtAt = fs.existsSync(dest) ? fs.statSync(dest).mtimeMs : 0;

    if (masterAt > builtAt) {
      console.log("Logo master changed — regenerating the wordmark:");
      buildWordmark({
        source: LOGO_MASTER,
        dest,
        log: (line) => console.log(`  ${line}`),
      });
    }
  }

  if (!fs.existsSync(dest)) {
    throw new Error(`Missing ${asset.src}. Add Images/logo.png and rebuild, or run scripts/make-wordmark.js.`);
  }

  return { ...asset, ...readSize(fs.readFileSync(dest)) };
}

/**
 * Regenerates the site icons when their geometry definition has changed, so
 * editing scripts/lib/monogram.js is enough to redraw the favicon.
 */
function resolveIcons(icons) {
  const outputs = [icons.svg, icons.png].map((rel) => path.join(ROOT, rel));
  const sourceAt = fs.statSync(path.join(ROOT, "scripts", "lib", "monogram.js")).mtimeMs;
  const stale = outputs.some((file) => !fs.existsSync(file) || fs.statSync(file).mtimeMs < sourceAt);

  if (stale) {
    console.log("Monogram changed — regenerating the site icons:");
    buildFavicon({ log: (line) => console.log(`  ${line}`) });
  }
  return icons;
}

/**
 * The resume href is derived from what is actually committed in resume/ rather
 * than hardcoded, so renaming the PDF can never leave a 404 behind.
 */
function resolveResume() {
  const dir = path.join(ROOT, "resume");
  const pdfs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort() : [];
  if (!pdfs.length) {
    console.warn("! No PDF found in resume/ — resume links will point at the folder.");
    return { href: "resume/", available: false };
  }
  if (pdfs.length > 1) {
    console.warn(`! Multiple PDFs in resume/; linking ${pdfs[0]}`);
  }
  return { href: `resume/${encodeURIComponent(pdfs[0])}`, file: pdfs[0], available: true };
}

/**
 * Fails the build if the page points at a local file that dist/ does not
 * contain. Cheap insurance: a mistyped image path or a renamed PDF otherwise
 * deploys as a silent 404 that nobody notices until a visitor clicks it.
 */
function verifyLocalReferences(html) {
  const missing = new Map();

  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const ref = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|#|\/\/)/.test(ref)) continue;

    const relative = decodeURIComponent(ref.split(/[?#]/)[0]);
    if (!relative || !fs.existsSync(path.join(DIST, relative))) {
      missing.set(relative, (missing.get(relative) ?? 0) + 1);
    }
  }

  // Stylesheet url(...) targets, resolved relative to dist/assets/.
  const css = fs.readFileSync(path.join(DIST, "assets", "site.css"), "utf8");
  for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
    const ref = match[1];
    if (/^(?:https?:|data:|\/\/)/.test(ref)) continue;
    const resolved = path.resolve(DIST, "assets", decodeURIComponent(ref));
    if (!fs.existsSync(resolved)) {
      missing.set(`assets/${ref}`, (missing.get(`assets/${ref}`) ?? 0) + 1);
    }
  }

  if (missing.size) {
    const list = [...missing]
      .map(([ref, count]) => `  - ${ref}${count > 1 ? ` (referenced ${count}x)` : ""}`)
      .join("\n");
    throw new Error(
      `The build references ${missing.size} file(s) that do not exist in dist/:\n${list}\n\n` +
        `Fix the path in src/, add the file, or add it to STATIC_DIRS in build.js.`
    );
  }
}

// -------------------------------------------------------------------- build

function build() {
  const started = Date.now();
  const data = loadData();
  data.resume = resolveResume();
  data.site.brand.wordmark = resolveWordmark(data.site.brand.wordmark);
  data.site.icons = resolveIcons(data.site.icons);

  const render = createRenderer(loadPartials());
  const html = render("layout/page", data);

  // maxRetries matters on Windows, where a lingering handle from a dev server,
  // an open preview, or the file indexer makes a plain rmSync throw ENOTEMPTY.
  fs.rmSync(DIST, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });

  fs.writeFileSync(path.join(DIST, "index.html"), html);

  const css = STYLE_ORDER.map((rel) => {
    const file = path.join(SRC, rel);
    if (!fs.existsSync(file)) throw new Error(`STYLE_ORDER references missing file: ${rel}`);
    return `/* ${rel} */\n${fs.readFileSync(file, "utf8").trim()}\n`;
  }).join("\n");
  fs.writeFileSync(path.join(DIST, "assets", "site.css"), css);

  // Copied rather than bundled so imports stay real ES modules and stack
  // traces in devtools point at the file you actually edit.
  for (const file of walk(SRC, ".js")) {
    const rel = path.relative(SRC, file);
    const dest = path.join(DIST, "assets", rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }

  for (const dir of STATIC_DIRS) {
    const from = path.join(ROOT, dir);
    if (fs.existsSync(from)) copyDir(from, path.join(DIST, dir));
  }

  verifyLocalReferences(html);

  const styleCount = STYLE_ORDER.length;
  console.log(
    `Built dist/ in ${Date.now() - started}ms — index.html (${(html.length / 1024).toFixed(1)} kB), ` +
      `${styleCount} stylesheets, resume: ${data.resume.file ?? "none"}`
  );
}

// ---------------------------------------------------------------- dev server

function serve(port) {
  const http = require("node:http");
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".pdf": "application/pdf",
  };

  http
    .createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      let target = path.join(DIST, url === "/" ? "index.html" : url);

      if (!target.startsWith(DIST)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
        target = path.join(target, "index.html");
      }
      if (!fs.existsSync(target)) {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
        return;
      }
      res.writeHead(200, {
        "content-type": types[path.extname(target)] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      fs.createReadStream(target).pipe(res);
    })
    .listen(port, () => console.log(`Serving dist/ at http://localhost:${port}`));

  fs.watch(SRC, { recursive: true }, () => {
    try {
      build();
    } catch (error) {
      console.error(`Build failed: ${error.message}`);
    }
  });
  console.log("Watching src/ for changes.");
}

const args = process.argv.slice(2);
build();
if (args.includes("--serve")) {
  const portFlag = args.indexOf("--port");
  serve(portFlag === -1 ? 4173 : Number(args[portFlag + 1]) || 4173);
}
