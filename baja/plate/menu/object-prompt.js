function (pt, obj) {

    // A TEXT FIELD ON THE OBJECT ITSELF, under its title bar.
    //
    // The canvas cannot hold a text field, so this is a real input positioned over the
    // canvas and kept in step with the object underneath it: every frame it recomputes
    // where the object is and moves. That is the only honest way to do it here -- drawing
    // something that looks like a field and faking a caret is worse than having no field.
    //
    // ONE AT A TIME. The id is fixed, and opening it for a new object removes the old one,
    // so switching selection cannot leave a field floating over nothing.
    //
    // IT FOLLOWS, AND IT HIDES. Scroll the canvas and it moves with the object; zoom out
    // until the object is small, or push it off screen, and the field hides rather than
    // sitting somewhere meaningless. It stops its own loop when the object stops being the
    // selected one, so nothing keeps running after the thing it belonged to has gone.

    const ID = 'baja-object-prompt';

    const kill = () => {
        try {
            const old = document.getElementById(ID);
            if (old) {
                if (old.__stop) old.__stop();
                if (old.parentNode) old.parentNode.removeChild(old);
            }
        } catch (e) { }
    };

    kill();
    if (!pt || !obj || !obj.grid) return { closed: true };

    // The canvas the object is drawn on, reached the way everything else here reaches it.
    let canvas = null;
    try { canvas = pt.grid && pt.grid.canvas && pt.grid.canvas.getCTX && pt.grid.canvas.getCTX().canvas; } catch (e) { canvas = null; }
    if (!canvas) { try { canvas = pt.canvas && pt.canvas.getCTX && pt.canvas.getCTX().canvas; } catch (e) { canvas = null; } }
    if (!canvas || !canvas.getBoundingClientRect) return { error: 'no canvas to sit on' };

    const wrap = document.createElement('div');
    wrap.id = ID;
    wrap.style.cssText = 'position:fixed;z-index:100040;display:none;box-sizing:border-box;';

    const isTimeline = !!(obj.type === 'timeline');
    const name = ('' + (obj.name || '')).trim();
    const hint = isTimeline
        ? ('This timeline' + (name ? ' (' + name + ')' : '') + ': add a milestone on a date, a phase between two dates…')
        : ((name ? name + ': ' : '') + 'say what you want done here…');

    wrap.innerHTML = '<div style="display:flex;align-items:center;gap:8px;'
        + 'background:rgba(255,255,255,0.97);border:1px solid rgba(15,23,42,0.18);'
        + 'border-top:none;border-radius:0 0 8px 8px;box-shadow:0 6px 18px rgba(0,0,0,0.18);'
        + 'padding:6px 8px;">'
        + '<input id="' + ID + '-q" type="text" autocomplete="off" spellcheck="false" '
        + 'style="flex:1 1 auto;min-width:0;border:none;outline:none;background:transparent;'
        + 'font:13px Inter, system-ui, -apple-system, Roboto, Arial, sans-serif;color:#0f172a;" />'
        + '<span id="' + ID + '-busy" style="font:700 11.5px Arial;color:#475569;"></span>'
        + '</div>';
    document.body.appendChild(wrap);

    const input = wrap.querySelector('#' + ID + '-q');
    const busy = wrap.querySelector('#' + ID + '-busy');
    input.placeholder = hint;

    // Keystrokes belong to the field, not to the canvas underneath: without this, typing a
    // letter that is also a canvas shortcut does both.
    //
    // ON THE WAY OUT, NOT ON THE WAY IN. Capture runs on this wrapper BEFORE the event
    // reaches the input inside it, so stopping it there stopped the field's own Enter
    // handler from ever running: the box swallowed everything typed into it and did nothing.
    // Bubbling catches the event after the input has had it and before the canvas does,
    // which is exactly the window that needs blocking.
    for (const ev of ['keydown', 'keyup', 'keypress', 'mousedown', 'mouseup', 'click', 'wheel']) {
        wrap.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } }, false);
    }

    const place = () => {
        try {
            const r = canvas.getBoundingClientRect();
            // The canvas is sized in device pixels and laid out in CSS pixels; everything the
            // grid returns is in the former.
            const sx = canvas.width ? (r.width / canvas.width) : 1;
            const sy = canvas.height ? (r.height / canvas.height) : 1;

            const left = pt.grid.X(obj.grid.xi);
            const bottom = pt.grid.Y(obj.grid.yi);
            const w = pt.grid.screenWidth(obj.grid.width);
            const h = pt.grid.screenHeight(typeof obj.getHeight === 'function' ? obj.getHeight() : obj.grid.height);
            const top = bottom - h;

            const px = r.left + left * sx;
            const py = r.top + top * sy;
            const pw = w * sx;

            // Too small to type in, or off the canvas: hidden rather than put somewhere
            // meaningless.
            const visible = pw >= 140 && (h * sy) >= 40
                && px + pw > r.left + 4 && px < r.right - 4
                && py > r.top - 4 && py < r.bottom - 24;
            if (!visible) { wrap.style.display = 'none'; return; }

            wrap.style.display = 'block';
            wrap.style.left = Math.round(px) + 'px';
            wrap.style.top = Math.round(py) + 'px';
            wrap.style.width = Math.round(pw) + 'px';
        } catch (e) {
            wrap.style.display = 'none';
        }
    };

    let running = true, raf = null;
    const tick = () => {
        if (!running) return;
        // The object stopped being the selected one: this field belonged to it, so it goes.
        let still = false;
        try { still = (pt.selectedPlate === obj) || (pt.root || []).indexOf(obj) >= 0; } catch (e) { still = true; }
        if (!still) { kill(); return; }
        place();
        raf = requestAnimationFrame(tick);
    };
    wrap.__stop = () => { running = false; try { if (raf) cancelAnimationFrame(raf); } catch (e) { } };
    tick();

    let inFlight = false;
    const ask = async () => {
        const t = ('' + input.value).trim();
        if (!t || inFlight) return;
        inFlight = true;
        input.disabled = true;
        busy.textContent = 'Working…';
        try {
            // The interpreter reads plain language for a timeline already, so it gets first
            // refusal here too, exactly as the toolbar field gives it.
            let handled = false;
            if (isTimeline) {
                try {
                    const ti = await exec('baja/engine/timeline-interpreter.js', pt);
                    const r = await ti.executeCommand(t);
                    handled = !!(r && r.type === 'rgx');
                    if (handled) { try { pt.wake && pt.wake(); } catch (e) { } }
                } catch (e) { handled = false; }
            }
            if (!handled) {
                let menus = [];
                try { menus = (pt.__lastMenubar && pt.__lastMenubar()) || []; } catch (e) { menus = []; }
                await exec('baja/plate/menu/project-command.js', {
                    menus: menus,
                    pm: pt,
                    text: t,
                    context: {
                        selected: name || null,
                        showing: isTimeline ? 'a timeline' : 'an object on the canvas'
                    },
                    setError: (m) => { try { pt.setMessage(m, 8); } catch (e) { } }
                });
            }
            input.value = '';
        } catch (e) {
            try { pt.setMessage('Could not read that: ' + ('' + (e && e.message ? e.message : e)), 8); } catch (e2) { }
        }
        inFlight = false;
        input.disabled = false;
        busy.textContent = '';
        try { input.focus(); } catch (e) { }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { try { e.preventDefault(); } catch (e2) { } ask(); }
        else if (e.key === 'Escape') { try { input.blur(); } catch (e2) { } }
    });

    return { close: kill, element: wrap };
}
