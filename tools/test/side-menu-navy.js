// THE SIDE MENU AND ITS COLLAPSED CHIP WEAR THE EDITOR'S NAVY, NOT A SUNSET GRADIENT.
//
//     node tools/test/side-menu-navy.js
//
// The side menu was the one surface in the editor with a palette of its own: a golden to
// orange gradient panel with black ink, and a warm orange pill when collapsed, while the
// floating menu, the overlay windows and the result panels are all navy with cyan accents.
// Two controls that do the same job looked like they came from different applications.
//
// Checking this by eye is what let it stand for so long, so the check here is mechanical:
// Menu.draw runs against a recording 2d context and every colour it sets is collected. No
// warm fill may appear, and the navy ground, the cyan outline and the light ink must.
const fs = require('fs');
const AF = Object.getPrototypeOf(async function () { }).constructor;

global.isMobile = () => false;
global.CurrentLayout = { getStashed: () => null };

// A 2d context that records rather than paints. createLinearGradient hands back an object
// that remembers its stops, because the panel ground is a gradient and its colours would
// otherwise never be seen.
const mkCtx = () => {
    const seen = [];
    const note = (v) => {
        if (v && typeof v === 'object' && v.__stops) { for (const s of v.__stops) seen.push(s); return; }
        if (typeof v === 'string') seen.push(v);
    };
    const ctx = {
        __seen: seen, canvas: { width: 1200, height: 700 },
        save() { }, restore() { }, beginPath() { }, closePath() { }, moveTo() { }, lineTo() { },
        quadraticCurveTo() { }, arcTo() { }, fill() { }, stroke() { }, clip() { }, fillRect() { },
        drawImage() { }, translate() { }, rotate() { }, scale() { }, roundRect() { },
        measureText: (t) => ({ width: ('' + t).length * 7 }),
        fillText() { }, strokeText() { },
        createLinearGradient: () => ({ __stops: [], addColorStop(p, c) { this.__stops.push(c); } }),
        set fillStyle(v) { note(v); }, get fillStyle() { return ''; },
        set strokeStyle(v) { note(v); }, get strokeStyle() { return ''; },
        set shadowColor(v) { }, get shadowColor() { return ''; },
        font: '', textAlign: '', textBaseline: '', lineWidth: 1, lineCap: '', lineJoin: '',
        letterSpacing: '', filter: '', globalAlpha: 1, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0
    };
    return ctx;
};

const grid = { X: (v) => v, Y: (v) => v, width: 1200, height: 700 };
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

// A colour is "warm" when its red channel runs well ahead of its blue one: the sunset
// gradient, the orange chip and the amber chip text all are, and nothing in the navy
// palette is. Stated as a measurement rather than a list of hexes so a NEW orange cannot
// be introduced and pass.
const warm = (c) => {
    const s = ('' + c).trim();
    let r, g, b;
    let m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) { const n = parseInt(m[1], 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255; }
    else {
        m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (!m) return false;
        r = +m[1]; g = +m[2]; b = +m[3];
    }
    return (r - b) > 40 && r > 120;
};

(async () => {
    const src = fs.readFileSync('flexigraph/menu.js', 'utf8');
    const Menu = await (await new AF('exec', 'args', 'return (' + src + ')')(null, []))();

    // No emphasised row here on purpose: a destructive verb still draws as a warm filled
    // pill, the same one the floating menu uses, and that is the point of it.
    const items = [
        { label: 'Annotations (4)', type: 'text' },
        { label: 'CCDS8702.1 ▸' },
        { label: 'Translation ▸' },
        { type: 'separator' },
        { label: '‹ Back' }
    ];

    // The expanded panel, with a row under the pointer so the hover colours are drawn too.
    const open = new Menu(items, 40, 70, 'rgba(11,37,69,0.985)', '#eaf6f9', 1);
    open.menu_width = 260; open.sunset = true; open.title = 'Annotations'; open.highlight = 1;
    const c1 = mkCtx();
    open.draw(c1, grid);
    const hot1 = c1.__seen.filter(warm);
    ok(hot1.length === 0, 'expanded panel paints nothing warm' + (hot1.length ? ' (found ' + hot1.join(', ') + ')' : ''));
    ok(c1.__seen.some((c) => /rgba\(1[0-9],\s*4[0-9],\s*7[0-9]/.test(c) || /rgba\(8,\s*30,\s*54/.test(c)), 'navy ground');
    ok(c1.__seen.indexOf('#1aa3bd') >= 0, 'cyan outline, the one the other panels use');
    ok(c1.__seen.indexOf('#eaf6f9') >= 0, 'light ink');
    ok(c1.__seen.indexOf('rgba(26,163,189,0.38)') >= 0, 'the floating menu’s hover fill');

    // THE PANEL FADES. gene.js rewrites this.bg frame by frame to fade the menu in and out,
    // and an opaque ground ignores it -- which is what the old gradient did.
    const fading = new Menu(items, 40, 70, 'rgba(11,37,69,0.25)', '#eaf6f9', 1);
    fading.menu_width = 260; fading.sunset = true; fading.title = 'Annotations';
    const c2 = mkCtx();
    fading.draw(c2, grid);
    ok(c2.__seen.some((c) => /,\s*0\.25\)/.test(c)), 'the ground takes its alpha from bg, so the fade is visible');

    // The collapsed chip: the little pill at the edge of the canvas.
    const chip = new Menu([{ label: 'x' }], 600, 70, 'rgba(11,37,69,0.985)', '#eaf6f9', 1);
    chip.menu_width = 200; chip.sunset = true; chip.title = 'KRAS';
    chip.collapsible = true; chip.collapsed = true;
    const c3 = mkCtx();
    chip.draw(c3, grid);
    const hot3 = c3.__seen.filter(warm);
    ok(hot3.length === 0, 'collapsed chip paints nothing warm' + (hot3.length ? ' (found ' + hot3.join(', ') + ')' : ''));
    ok(c3.__seen.some((c) => /rgba\(10,\s*37,\s*64/.test(c)), 'chip ground is navy');
    ok(c3.__seen.indexOf('#4fd0e6') >= 0, 'chip chevron is the accent cyan');

    // A light menu -- the centre menus, which pass no sunset flag -- is untouched by all this.
    const light = new Menu(items, 40, 70, 'rgba(255,255,255,0)', '#344054', 1);
    light.menu_width = 260; light.title = 'Plain';
    const c4 = mkCtx();
    light.draw(c4, grid);
    ok(c4.__seen.indexOf('rgba(255,255,255,0.98)') >= 0, 'a menu without the flag is still the white card');

    // And the side menu hands menu.js the navy, not the old yellow.
    const gene = fs.readFileSync('flexigraph/gene.js', 'utf8');
    ok(gene.indexOf("'rgb(255, 247, 141)'") < 0, 'gene.js no longer hands the side menu a yellow ground');
    ok(/const bg = 'rgba\(11,37,69,0\.985\)'/.test(gene), 'gene.js hands it the navy ground');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
