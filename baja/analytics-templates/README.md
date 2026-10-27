# Baja Analytics templates

The template library behind **Templates > Template library** in Baja Analytics (`cpd/baja-analytics.js`).

## What is here

| File | What it is |
|---|---|
| `catalog.json` | The curated list. Hand-edited: title, description, category, tags, status, notes, and which payload file each template uses. |
| `index.json` | Generated from the catalog. Adds what can be read from each payload (tables, column headers, formulas, embedded models, timeline milestones, size, hash) so the browser can describe a template without downloading it. Do not edit by hand. |

The payloads themselves stay where they always were, under `baja/templates/`, in the same format, so the older Tables, Models and Timelines menus keep working on the same files.

## Adding or changing a template

1. Put the payload under `baja/templates/` (or use one already there).
2. Add or edit its entry in `catalog.json`: a kebab-case `id`, a `title`, `kind` (`table`, `model` or `timeline`), a `category` from the list at the top, a `description` that says what it calculates and what to fill in, and `tags`.
3. Run `node tools/analytics-templates/build-index.js` and commit both JSON files.

`node tools/analytics-templates/build-index.js --check` exits non-zero if `index.json` is stale or the catalog is broken (missing file, wrong kind, duplicate id, an `also` copy that is not identical, a template file nobody catalogued). Worth running before every commit that touches templates.

### Status

- `ready`: listed normally.
- `needs-cleanup`: listed, with its note shown. Used for templates that carry unrelated embedded models, are very large, or have placeholder internal names.
- `retired`: hidden from the browser.

## Users' own templates

"Save as my template" (on a table's menu, a workbook package's menu and a timeline's menu) saves to the user's own folder on the server, `<userData>/<user>/.analytics-templates/`, through `/analytics-templates/publish`. Those templates appear under **My templates**. Built-in templates change only through this folder and a deploy.

## Code

| Module | Role |
|---|---|
| `baja/analytics/templates/browser.js` | The list: categories, My templates, search, delete. |
| `baja/analytics/templates/apply.js` | Opens one template on the canvas (tables and timelines through `baja/draw/place-table` and `place-timeline`, workbooks through `place-model.js`). |
| `baja/analytics/templates/place-model.js` | Workbook placement, factored out of `baja/table/datayak-analytics-models.js`. |
| `baja/analytics/templates/publish.js` | "Save as my template". |
| `baja/analytics/templates/api.js` | Calls to `/analytics-templates/*`, with a fallback to `/get-script` for the built-in library on servers without those endpoints. |
| `baja-server/src/analytics-templates.ts` | The server endpoints. |

## Payload format

Unchanged: zlib-deflated JSON (pako), each byte stored as one character of a UTF-8 text file. Workbook packages nest the same encoding inside well properties, sometimes prefixed with `<uuid>:`.
