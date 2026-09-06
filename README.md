# Vijayakumar Unni - Portfolio

Static portfolio for Vijayakumar Unni, Adobe Certified AEM Developer.

The published site is generated from `src/` by `build.js` — a zero-dependency
Node script. There are no npm packages to install.

## Run locally

```bash
node build.js --serve     # builds, serves dist/ on http://localhost:4173, rebuilds on save
node build.js             # one-off build into dist/
```

`npm run dev` and `npm run build` are aliases for the same two commands.

`dist/` is generated and git-ignored; never edit it by hand.

## Project layout

```
src/
  data/                     all page copy, one JSON file per section
    site.json               meta tags, brand, nav, contact details
    hero.json  stats.json  work.json  skills.json
    testimonials.json  credentials.json  footer.json
  layout/
    page.html               the document shell — the order of sections
    section-head.html       shared section tag + heading + subheading
    svg-defs.html           shared SVG marker defs used by every diagram
  components/<name>/
    <name>.html             markup, driven by src/data
    <name>.css              styles, including that component's media queries
    <name>.js               behaviour (only where a component needs it)
  components/work/diagrams/ one hand-authored SVG per project
  styles/
    tokens.css              colours, spacing, radii — change the palette here
    base.css                element resets and typography
    layout.css              page scaffolding and shared primitives (.btn, .dot, .tag)
  main.js                   entry point; declares which components are on the page
build.js                    template engine + build + dev server
scripts/
  make-wordmark.js          Images/logo.png -> Images/logo-wordmark.png
  make-favicon.js           monogram -> Images/favicon.svg + favicon.png
  lib/monogram.js           the VU mark's geometry (one source of truth)
  lib/png.js                dependency-free PNG decode/encode
  sync_resume.py            resume PDF -> resume-data.json
```

The build fails if the page references a local file that is not in `dist/`, so
a mistyped image path or a renamed PDF cannot deploy as a silent 404.

To change page copy, edit the matching file in `src/data/`. To change how a
section looks or behaves, edit that component's folder. Nothing needs to be
touched in two places.

### Adding a project

1. Append an entry to `projects` in `src/data/work.json`.
2. Add `src/components/work/diagrams/<id>.html` containing the SVG, and point
   the entry's `diagram` field at `components/work/diagrams/<id>`.

The tab, panel, diagram, bullet list, and tech-stack pills are all generated
from that one entry.

### Changing the header logo

Replace `Images/logo.png` and run the build. That is the whole procedure.

The build notices the master is newer than the derived wordmark and regenerates
`Images/logo-wordmark.png`: cropping to the artwork, keying the background out
to real transparency, and resizing for the header. The rendered `width`/`height`
are read from the resulting PNG, so a logo with a different aspect ratio needs
no edits anywhere.

It does not assume anything about the logo's colours. Light-on-dark,
dark-on-light, any hue, and already-transparent masters all work; the
background colour is measured from the image and the threshold comes from
Otsu's method, so a vignette or a glow is not mistaken for artwork. Small
isolated marks that sit outside the artwork's rows and columns — the watermarks
image generators stamp into a corner — are discarded.

To resize the logo on the page, change `--logo-height` in
[tokens.css](src/styles/tokens.css). The header height, the mobile menu
overlay offset, and anchor-link scroll offsets are all derived from it.

To check a swapped logo without opening the site:

```bash
node scripts/make-wordmark.js --preview
```

That writes `Images/logo-wordmark.preview.png`, showing the result composited
over the site's real background colours plus white — where any surviving
background plate is obvious. `*.preview.png` files are never deployed.

A master the script cannot separate from its background (a flat colour, for
instance) fails with an explanatory error rather than producing a blank logo.

### Changing the favicon

The site icon is a **VU monogram** — a gold chevron with two copper stems on a
dark rounded tile — defined as plain geometry in
[lib/monogram.js](scripts/lib/monogram.js).

Edit those numbers and the next build redraws both outputs:

- `Images/favicon.svg` (~1 kB) is the primary icon, sharp at every size
- `Images/favicon.png` (180x180) covers older Safari and the Apple touch icon

Both come from the same definition, so they cannot drift apart. The PNG is
rasterised in plain JavaScript with supersampled anti-aliasing, so no SVG
renderer is needed.

The mark is deliberately straight-edged. The script wordmark cannot be reused
here: fine cursive strokes disappear at 16px, whereas a bold chevron survives.

```bash
node scripts/make-favicon.js --preview
```

That writes `Images/favicon.preview.png` — the icon at 16, 32, 48, 64 and 128px
over both a dark and a light backdrop, which is the only reliable way to judge
whether a favicon still reads.

### Template syntax

`build.js` implements a small subset of Handlebars:

| Tag | Meaning |
| --- | --- |
| `{{path}}` | interpolate, HTML-escaped |
| `{{{path}}}` | interpolate raw |
| `{{> name}}` | include a partial (any `.html` under `src/`) |
| `{{>* path}}` | include the partial named by the value at `path` |
| `{{#each path}}…{{/each}}` | iterate; `{{.}}` is the item, `{{@index}}` / `{{@first}}` / `{{@last}}` its position |
| `{{#if path}}…{{else}}…{{/if}}` | conditional |
| `{{#with path}}…{{/with}}` | narrow the scope, e.g. to one section's data |
| `{{! note }}` | authoring comment, stripped from the output |

Partials are addressed by their path under `src/` without the extension
(`components/hero/hero`), or by short name when the file matches its folder
(`hero`).

## Deploy

Pushing to `main` runs `.github/workflows/pages.yml`, which builds `dist/` and
publishes it to GitHub Pages. Pages must be set to **Source: GitHub Actions** in
the repository settings.

## Keep the portfolio in sync with a resume

Place the latest PDF anywhere in `resume/` and push it to `main`. The
`Resume sync` workflow extracts the PDF text and updates `resume-data.json`.
The extraction only refreshes that sync metadata and summary — project details
in `src/data/` should still be reviewed manually before publishing.

The resume download links are derived at build time from whatever PDF is
committed in `resume/`, so renaming the file cannot leave a broken link behind.
