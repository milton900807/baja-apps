#!/usr/bin/env node
/*
 * Build baja/analytics-templates/index.json from catalog.json.
 *
 *   node tools/analytics-templates/build-index.js           write index.json, print warnings
 *   node tools/analytics-templates/build-index.js --check   exit 1 if index.json is stale or the
 *                                                            catalog is broken (for CI / pre-commit)
 *
 * catalog.json is the hand-edited source: titles, descriptions, categories, status. This script
 * adds what can be read from the payloads themselves (tables, formulas, embedded models, size,
 * content hash) so the browser can show a template without downloading it, and it checks:
 *   - every catalogued file exists and decodes as the kind it claims
 *   - every `also` copy is byte-identical to its `file`
 *   - every template file under baja/templates is catalogued (or listed in `also`)
 *   - ids are unique and categories exist
 *
 * Payload format (unchanged by this tool): zlib-deflated JSON, each byte stored as one char of a
 * UTF-8 text file -- what pako.deflate + String.fromCharCode + /save-script produce, and what
 * /get-script + __decompress read back. Packages nest the same encoding, optionally prefixed with
 * "<uuid>:".
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const APPS = path.resolve(__dirname, '..', '..');
const TEMPLATES = path.join(APPS, 'baja', 'templates');
const HERE = path.join(APPS, 'baja', 'analytics-templates');
const CATALOG = path.join(HERE, 'catalog.json');
const INDEX = path.join(HERE, 'index.json');

const KIND_BY_EXT = { '.ljt': 'table', '.ljl': 'model', '.bjb': 'model', '.ljp': 'timeline' };
const KINDS = new Set(['table', 'model', 'timeline']);
const STATUSES = new Set(['ready', 'needs-cleanup', 'retired']);
const PLACEHOLDER = /^(test|asdf\w*|hellow\w*|untitled|undefined|_+)$/i;
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:/i;

// ---------------------------------------------------------------- payload codec

function decodeText(text) {
    return JSON.parse(zlib.inflateSync(Buffer.from(text, 'latin1')).toString('utf8'));
}

function decodeFile(abs) {
    return decodeText(fs.readFileSync(abs, 'utf8'));
}

// A string that is itself an encoded payload (a package, a ptrack), or null.
function decodeNested(s) {
    if (typeof s !== 'string' || s.length < 16) return null;
    const body = UUID_PREFIX.test(s) ? s.slice(37) : s;
    if (body.charCodeAt(0) !== 0x78) return null;          // zlib header byte
    try { return decodeText(body); } catch (e) { return null; }
}

// ---------------------------------------------------------------- content summary

function isTable(o) {
    return o && typeof o === 'object' && Array.isArray(o.wells) && o.grid && typeof o.grid === 'object';
}

function cellText(c) {
    if (!c || c.value === undefined || c.value === null) return '';
    return String(c.value).replace(/\s+/g, ' ').trim();
}

// Walk a decoded workbook, descending into nested encoded payloads, and list its tables.
function collectTables(root) {
    const tables = [];
    const seen = new Set();
    const packages = [];
    const walk = (o, depth) => {
        if (depth > 200 || o === null || typeof o !== 'object') return;
        if (isTable(o)) {
            const cols = o.wells.length;
            const rows = cols && Array.isArray(o.wells[0]) ? o.wells[0].length : 0;
            let formulas = 0;
            for (const col of o.wells) for (const c of (col || [])) if (c && c.formula) formulas++;
            formulas += Object.keys(o.formula || {}).length;
            const header = [];
            for (const col of o.wells.slice(0, 12)) {
                const t = cellText(col && col[0]);
                if (t) header.push(t.slice(0, 40));
            }
            const key = o.uid || (o.name + ':' + cols + 'x' + rows);
            if (!seen.has(key)) {
                seen.add(key);
                if (o.plateType === 'package') packages.push(o.name || '');
                else tables.push({ name: o.name || '', type: o.plateType || null, cols, rows, formulas, header });
            }
        }
        const items = Array.isArray(o) ? o : Object.values(o);
        for (const v of items) {
            if (typeof v === 'string') {
                const n = decodeNested(v);
                if (n) walk(n, depth + 1);
            } else if (v && typeof v === 'object') {
                walk(v, depth + 1);
            }
        }
    };
    walk(root, 0);
    return { tables, packages };
}

function summarize(kind, doc) {
    if (kind === 'timeline') {
        const pts = (doc && doc.scatterData && Array.isArray(doc.scatterData.points)) ? doc.scatterData.points : [];
        const named = pts.map(p => (p && p.name ? String(p.name) : '')).filter(Boolean);
        return {
            milestones: Math.max(0, named.length - 2),         // the first two points are the range ends
            range: named.length >= 2 ? [named[0], named[1]] : null,
            preview: named.slice(2, 8),
            internalName: doc && doc.name ? String(doc.name) : '',
        };
    }
    const { tables, packages } = collectTables(doc);
    const real = tables.filter(t => !(t.cols <= 1 && t.rows <= 1) || t.formulas > 0);
    return {
        tables: real.length,
        formulas: real.reduce((n, t) => n + t.formulas, 0),
        embeddedModels: Array.from(new Set(packages.filter(Boolean))),
        preview: real.slice(0, 8).map(t => ({
            name: t.name, rows: Math.max(0, t.rows - 1), cols: t.cols, header: t.header.slice(0, 6),
        })),
        internalName: kind === 'table' ? (doc && doc.name) || '' : '',
    };
}

function emailsIn(doc) {
    const s = JSON.stringify(doc);
    const found = s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/g) || [];
    return Array.from(new Set(found.map(e => e.toLowerCase())));
}

// ---------------------------------------------------------------- build

function listTemplateFiles(dir, rel = '') {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = rel ? rel + '/' + ent.name : ent.name;
        if (ent.isDirectory()) out.push(...listTemplateFiles(path.join(dir, ent.name), r));
        else if (KIND_BY_EXT[path.extname(ent.name)]) out.push(r);
    }
    return out;
}

function sha256(abs) {
    return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}

function build() {
    const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
    const errors = [];
    const warnings = [];
    const categoryIds = new Set((catalog.categories || []).map(c => c.id));
    const ids = new Set();
    const covered = new Set();
    const entries = [];
    const withEmails = [];

    for (const t of catalog.templates || []) {
        const where = `template "${t.id || t.title || '?'}"`;
        if (!t.id || !/^[a-z0-9][a-z0-9-]*$/.test(t.id)) { errors.push(`${where}: id must be kebab-case`); continue; }
        if (ids.has(t.id)) { errors.push(`${where}: duplicate id`); continue; }
        ids.add(t.id);
        if (!KINDS.has(t.kind)) errors.push(`${where}: kind must be table, model or timeline`);
        if (!categoryIds.has(t.category)) errors.push(`${where}: unknown category "${t.category}"`);
        if (t.status && !STATUSES.has(t.status)) errors.push(`${where}: unknown status "${t.status}"`);
        if (!t.title) errors.push(`${where}: missing title`);
        if (!t.description) warnings.push(`${where}: no description`);

        const abs = path.join(TEMPLATES, t.file || '');
        if (!t.file || !fs.existsSync(abs)) { errors.push(`${where}: file not found: ${t.file}`); continue; }
        const extKind = KIND_BY_EXT[path.extname(t.file)];
        if (extKind && extKind !== t.kind) errors.push(`${where}: ${t.file} is a ${extKind} file, catalogued as ${t.kind}`);
        covered.add(t.file);

        let doc;
        try { doc = decodeFile(abs); } catch (e) { errors.push(`${where}: cannot decode ${t.file}: ${e.message}`); continue; }

        const hash = sha256(abs);
        for (const a of t.also || []) {
            const aabs = path.join(TEMPLATES, a);
            if (!fs.existsSync(aabs)) errors.push(`${where}: also-copy not found: ${a}`);
            else if (sha256(aabs) !== hash) errors.push(`${where}: also-copy ${a} differs from ${t.file}; catalogue it separately`);
            covered.add(a);
        }

        const summary = summarize(t.kind, doc);
        const issues = [];
        const emails = emailsIn(doc);
        if (summary.internalName && PLACEHOLDER.test(summary.internalName)) issues.push(`internal name is a placeholder ("${summary.internalName}")`);
        if (t.kind === 'model' && summary.tables === 0) issues.push('no tables found');
        const size = fs.statSync(abs).size;
        if (size > 2 * 1024 * 1024) issues.push(`large payload (${(size / 1048576).toFixed(1)} MB)`);
        if (issues.length && (t.status || 'ready') === 'ready') {
            warnings.push(`${where}: marked ready but ${issues.join('; ')}`);
        }
        // Owner fields from whoever saved the payload. Reported once in total, not per template,
        // because nearly every model has them; they are not shown to users by the browser.
        if (emails.length) withEmails.push(t.id);

        const dir = path.posix.dirname(t.file);
        entries.push({
            id: t.id,
            title: t.title,
            kind: t.kind,
            category: t.category,
            description: t.description || '',
            tags: t.tags || [],
            status: t.status || 'ready',
            notes: t.notes || '',
            source: 'builtin',
            // Where /get-script finds the payload: spath relative to the apps root, plus the name.
            spath: '/baja/templates' + (dir === '.' ? '' : '/' + dir),
            name: path.posix.basename(t.file),
            file: t.file,
            also: t.also || [],
            size,
            sha256: hash,
            summary,
            issues,
        });
    }

    if (withEmails.length) {
        warnings.push(`${withEmails.length} templates still carry author email addresses in their saved owner fields`);
    }
    for (const f of listTemplateFiles(TEMPLATES)) {
        if (!covered.has(f)) warnings.push(`not catalogued: baja/templates/${f}`);
    }

    const index = {
        schema: 'baja.analytics-templates.index/1',
        generatedBy: 'tools/analytics-templates/build-index.js',
        categories: catalog.categories,
        templates: entries,
    };
    return { index, errors, warnings };
}

function main() {
    const check = process.argv.includes('--check');
    const { index, errors, warnings } = build();
    for (const w of warnings) console.warn('warning: ' + w);
    for (const e of errors) console.error('error: ' + e);
    if (errors.length) process.exit(1);

    const text = JSON.stringify(index, null, 2) + '\n';
    if (check) {
        const current = fs.existsSync(INDEX) ? fs.readFileSync(INDEX, 'utf8') : '';
        if (current !== text) {
            console.error('error: index.json is out of date; run node tools/analytics-templates/build-index.js');
            process.exit(1);
        }
        console.log(`index.json is current (${index.templates.length} templates)`);
        return;
    }
    fs.writeFileSync(INDEX, text);
    const by = {};
    for (const t of index.templates) by[t.status] = (by[t.status] || 0) + 1;
    console.log(`wrote ${path.relative(APPS, INDEX)}: ${index.templates.length} templates ` +
        Object.entries(by).map(([k, v]) => `${v} ${k}`).join(', '));
}

if (require.main === module) main();

module.exports = { build, decodeText, decodeFile, decodeNested, summarize };
