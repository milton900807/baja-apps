// A MENU THE USER CLICKED FOR OPENS SHOWING ITS ITEMS, NOT AS A CHIP TO HOVER.
//
//     node tools/test/menu-opens-when-asked.js
//
// Every side menu opened collapsed: a small pill with the menu's name, expanding only when
// the pointer reached it. That is right for a menu that arrives on its own, and wrong for
// one the user just asked for -- choosing KRAS in the selection window produced a pill
// reading KRAS, the answer to a question already asked, and a second reach for the same
// thing.
//
// Opening expanded is only half of it. The menu appears at the edge of the canvas while the
// pointer is wherever the click happened, so the very next mouse move is a leave and the old
// rule tucked the panel straight back into a chip. It stays open until the pointer has been
// inside it once, and after that behaves like any other collapsible menu.
const fs = require('fs');
const AF = Object.getPrototypeOf(async function () { }).constructor;
global.isMobile = () => false;
global.CurrentLayout = { getStashed: () => null };

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

(async () => {
    const src = fs.readFileSync('flexigraph/menu.js', 'utf8');
    const Menu = await (await new AF('exec', 'args', 'return (' + src + ')')(null, []))();

    // A graph whose coordinates are screen pixels, and a menu 200 wide at (100,100).
    const graph = { X: (v) => v, Y: (v) => v, width: 1200, height: 700 };
    const mk = (asked) => {
        const m = new Menu([{ label: 'one' }, { label: 'two' }], 100, 100, 'rgba(11,37,69,0.985)', '#eaf6f9', 1);
        m.menu_width = 200; m.sunset = true; m.title = 'KRAS';
        m.collapsible = true; m.collapsed = !asked;
        if (asked) m.__openOnArrival = true;
        return m;
    };

    const asked = mk(true);
    ok(asked.collapsed === false, 'a menu opened from a click starts expanded');
    asked.mouseMove(graph, 900, 600);                 // pointer still where the click was
    ok(asked.collapsed === false, 'and a mouse move far away does not tuck it back');
    asked.mouseMove(graph, 150, 120);                 // the user reaches it
    ok(asked.collapsed === false, 'it stays open while the pointer is in it');
    asked.mouseMove(graph, 900, 600);                 // and leaves again
    ok(asked.collapsed === true, 'once visited, leaving collapses it like any other menu');
    asked.mouseMove(graph, 150, 120);
    ok(asked.collapsed === false, 'and hovering the chip expands it again');

    // A menu that arrived on its own is unchanged: a chip until the pointer finds it.
    const unasked = mk(false);
    ok(unasked.collapsed === true, 'a menu nobody asked for still opens as a chip');
    unasked.mouseMove(graph, 900, 600);
    ok(unasked.collapsed === true, 'and stays one while the pointer is elsewhere');
    unasked.mouseMove(graph, 150, 112);               // over the chip
    ok(unasked.collapsed === false, 'hovering the chip expands it');
    unasked.mouseMove(graph, 900, 600);
    ok(unasked.collapsed === true, 'leaving collapses it');

    // The wiring: showSideMenu decides from the same recent-click mark the chip is named
    // from, so a menu that follows a click opens expanded and nothing else does.
    const gene = fs.readFileSync('flexigraph/gene.js', 'utf8');
    ok(/this\.side_menu\.collapsed = !__asked;/.test(gene), 'showSideMenu collapses only when nobody asked');
    ok(/__asked = !!\(__mp && \(Date\.now\(\) - \(__mp\.t \|\| 0\)\) < 4000\)/.test(gene), 'asked = a recent __menuParent, the mark the chip is named from');
    ok(/if \(__asked\) this\.side_menu\.__openOnArrival = true;/.test(gene), 'and it arms the stay-open rule');

    console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
    process.exit(fails ? 1 : 0);
})();
