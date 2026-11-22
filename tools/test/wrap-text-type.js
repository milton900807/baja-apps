// WRAPPED TEXT: THE WHOLE TEXT, ALWAYS.
//
//     node tools/test/wrap-text-type.js
//
// A data type for notes. Plain text cuts off what does not fit at 9px; this one wraps, takes
// the largest size at which every word is inside the cell, and never drops any of it. The
// renderer is lifted out of the factory and run on a recording canvas whose text width is a
// simple function of the font size, so the layout can be checked exactly.
const fs = require('fs');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };

const src = fs.readFileSync('baja/plate/views/well-display-factory.js', 'utf8');
const lift = (head) => {
    const a = src.indexOf(head);
    let depth = 0, b = src.indexOf('{', a + head.length - 1);
    const open = b;
    for (let k = b; k < src.length; k++) { if (src[k] === '{') depth++; if (src[k] === '}') { depth--; if (!depth) { b = k; break; } } }
    return src.slice(open + 1, b);
};
const params = ['graph', 'grid', 'ctx', 'min', 'max', 'x', 'y', 'well'];
const WRAP = new Function('drawRoundedRect', 'isMobile', ...params, lift('t.WRAP_TEXT = (graph, grid, ctx, min, max, x, y, well) => {'));
const SIMPLE = new Function('drawRoundedRect', 'isMobile', 'Icon', ...params, lift('SIMPLE_TEXT: (graph, grid, ctx, min, max, x, y, well) => {'));

const mkCtx = () => {
    const c = { drawn: [], font: '10px Arial', clipped: false };
    const size = () => parseFloat(c.font);
    c.measureText = (s) => ({ width: ('' + s).length * size() * 0.5 });
    c.fillText = (s, x, y) => c.drawn.push({ s, x, y, fs: size() });
    c.clip = () => { c.clipped = true; };
    for (const f of ['save', 'restore', 'setTransform', 'fill', 'stroke', 'beginPath', 'rect']) c[f] = () => { };
    return c;
};
const graph = { X: (v) => v, Y: (v) => v }, grid = { X: (v) => v, Y: (v) => v };
const draw = (fn, value, w, h, extra) => {
    const ctx = mkCtx();
    const well = Object.assign({ value, x: 0, y: 0, __screen_x: 100, __screen_width: w, __screen_height: h }, extra || {});
    const args = [() => { }, () => false];
    if (fn === SIMPLE) args.push({});
    fn(...args, graph, grid, ctx, 0, 0, 0, 0, well);
    return { ctx, well, text: ctx.drawn.map((d) => d.s).join(' '), lines: ctx.drawn };
};
const NOTE = 'Annual insurance from assumptions, divided by twelve to give a monthly figure that feeds operating expenses.';
const words = (s) => s.split(/\s+/).filter(Boolean).join(' ');

// ---- the complaint: a note in an ordinary cell ------------------------------------------------
let plain = draw(SIMPLE, NOTE, 260, 34);
ok(plain.text !== words(NOTE) && /…/.test(plain.text), 'plain text cuts the note off: "' + plain.text.slice(0, 50) + '"');
let r = draw(WRAP, NOTE, 260, 34);
ok(r.text === words(NOTE), 'the wrapped type draws every word of it');
ok(!/…/.test(r.text) && r.well.__wrap.fits === true && r.ctx.clipped === false, 'with no ellipsis, and nothing clipped');
ok(r.lines.length > 1, 'on ' + r.lines.length + ' lines, at ' + r.well.__wrap.fontSize + 'px');
const cellRight = 100 + 260, cellBottom = 34;
ok(r.lines.every((d) => d.x >= 100 && d.x + d.s.length * d.fs * 0.5 <= cellRight + 0.01), 'every line is inside the cell’s width');
ok(r.lines.every((d) => d.y - d.fs * 0.625 >= -0.01 && d.y + d.fs * 0.625 <= cellBottom + 0.01), 'and inside its height');

// ---- the largest size that fits ---------------------------------------------------------------
const small = draw(WRAP, NOTE, 260, 34).well.__wrap.fontSize;
const tall = draw(WRAP, NOTE, 260, 120).well.__wrap.fontSize;
const wide = draw(WRAP, NOTE, 900, 34).well.__wrap.fontSize;
const cramped = draw(WRAP, NOTE, 120, 34).well.__wrap.fontSize;
ok(tall > small && small > cramped && wide >= small, 'the size follows the room: ' + cramped + 'px in a narrow cell, ' + small + 'px in the ordinary one, ' + tall + 'px in a taller one');
ok(wide === draw(SIMPLE, 'Rent', 900, 34).lines[0].fs, 'and never larger than plain text in the same cell, however much width is spare: ' + wide + 'px');
r = draw(WRAP, 'Rent', 260, 34);
const p2 = draw(SIMPLE, 'Rent', 260, 34);
ok(r.lines.length === 1 && Math.abs(r.lines[0].fs - p2.lines[0].fs) < 8 && Math.abs(r.lines[0].y - 17) < 0.01,
   'short text is one line at about the size plain text draws it, centred on the row: ' + r.lines[0].fs + 'px');

// ---- words that will not fit, and line breaks -------------------------------------------------
const URL = 'https://example.org/a/very/long/path/that/has/no/spaces/in/it/at/all/and/keeps/going/for/a/while';
r = draw(WRAP, URL, 200, 60);
ok(r.lines.map((d) => d.s).join('') === URL && r.lines.length > 1 && r.lines.every((d) => d.s.length * d.fs * 0.5 <= 200),
   'a word wider than the cell is broken across lines, all of it kept');
r = draw(WRAP, 'first line\nsecond line', 400, 80);
ok(r.lines.length === 2 && r.lines[0].s === 'first line' && r.lines[1].s === 'second line', 'a line break in the text is kept');

// ---- far too much text for the cell: as small as it goes, clipped, never spilled --------------
r = draw(WRAP, new Array(400).fill('word').join(' '), 60, 20);
ok(r.well.__wrap.fontSize === 3 && r.well.__wrap.fits === false && r.ctx.clipped === true, 'text that cannot fit at any size is drawn at the floor and clipped to the cell');
r = draw(WRAP, '', 260, 34);
ok(r.lines.length === 0, 'an empty cell draws no text');
r = draw(WRAP, 12345, 260, 34);
ok(r.text === '12345', 'and a number is shown as it is');

// ---- registered, listed, and used ---------------------------------------------------------------
ok(src.indexOf('t.WRAP_TEXT = ') < src.indexOf("Object.defineProperty(t, '__canonical'") && src.indexOf('t.WRAP_TEXT = ') > 0,
   'it is registered before the list of canonical types is taken, so the library lists it');
ok(/WRAP_TEXT: \['WRAP', 'WRAPPED_TEXT', 'NOTE', 'PARAGRAPH'\]/.test(src), 'with aliases');
const lib = fs.readFileSync('baja/plate/views/well-type-library.js', 'utf8');
ok(/T\('WRAP_TEXT', 'Text', 'Wrapped text'/.test(lib), 'the data type library offers it, under Text, as "Wrapped text"');
const ann = fs.readFileSync('baja/plate/ops/annotate-rows.js', 'utf8');
ok(/setWellType\('WRAP_TEXT'\)/.test(ann) && /!x\.cell\.skin_type \|\| x\.cell\.skin_type === 'SIMPLE_TEXT'/.test(ann),
   'and a generated note is given it, unless a type was already chosen for the cell');

console.log(fails ? ('\n' + fails + ' failed') : '\nall assertions passed');
process.exit(fails ? 1 : 0);
