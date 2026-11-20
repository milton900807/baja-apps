async function (graph, track, items, opts) {
    // A TOUR OF A TRACK'S REGIONS: frame each one in turn, hold it long enough to read,
    // move on.
    //
    //   exec('baja/bio/region-tour.js', graph, track, items, { seconds: 3, frame, select })
    //
    // items are [{ label, start, end }] in the order they should be visited. frame(item) is
    // what actually moves the view -- the editor's own framing, passed in rather than
    // reimplemented here, so a tour shows exactly what going to one region shows.
    //
    // THE POINT OF THIS IS THE CANVAS, so the panel is a strip at the bottom and nothing
    // else: an overlay that dimmed or covered the view would hide the thing being toured.
    // It is driveable while it runs -- pause, back, forward, stop, and Escape -- because a
    // timed sequence you cannot stop on the interesting one is a demo, not a tool.
    const O = opts || {};
    const list = (items || []).filter((it) => it && isFinite(it.start) && isFinite(it.end));
    const hold = Math.max(200, Math.round((+O.seconds || 3) * 1000));
    const frame = (typeof O.frame === 'function') ? O.frame : (() => Promise.resolve());
    const select = (typeof O.select === 'function') ? O.select : (() => { });
    if (!list.length) return { shown: 0, stopped: false, reason: 'nothing to show' };

    const el = document.createElement('div');
    el.setAttribute('data-region-tour', '1');
    // Above the canvas and its furniture, below a command panel opened later (2147483000 in
    // baja/manchester/menu/editor-command.js): a tour is not a modal and must never be the
    // thing in front of the card you are typing into.
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:22px;'
        + 'z-index:2147482900;display:flex;align-items:center;gap:14px;'
        + 'padding:12px 16px;border-radius:14px;background:rgba(10,26,43,0.94);'
        + 'border:1px solid #1e4a6d;box-shadow:0 10px 30px rgba(0,0,0,0.45);'
        + 'font:13px Arial;color:#e8f1f8;max-width:min(92vw,760px);';
    const H = (s) => ('' + s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const btn = 'cursor:pointer;border-radius:8px;padding:7px 11px;font:700 12px Arial;'
        + 'border:1px solid #2d6b9a;background:transparent;color:#9fd0f5;';
    el.innerHTML = '<div style="min-width:0;flex:1 1 auto;">'
        + '<div id="rt-label" style="font:700 14px Arial;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>'
        + '<div id="rt-sub" style="font:11.5px Arial;color:#9fb3c8;margin-top:2px;"></div>'
        + '<div style="height:3px;border-radius:2px;background:#16344d;margin-top:7px;overflow:hidden;">'
        + '<div id="rt-bar" style="height:100%;width:0%;background:#4aa3df;"></div></div></div>'
        + '<button id="rt-prev" style="' + btn + '">◀</button>'
        + '<button id="rt-pause" style="' + btn + '">Pause</button>'
        + '<button id="rt-next" style="' + btn + '">▶</button>'
        + '<button id="rt-stop" style="' + btn + 'border-color:#7f3a3a;color:#f0a0a0;">Stop</button>';
    document.body.appendChild(el);
    const q = (sel) => el.querySelector(sel);

    let stopped = false, paused = false, step = 0, shown = 0;
    let wake = null;                    // resolves the current dwell early
    const bump = (d) => { step = d; if (wake) wake(); };
    q('#rt-prev').onclick = () => bump(-1);
    q('#rt-next').onclick = () => bump(1);
    q('#rt-stop').onclick = () => { stopped = true; if (wake) wake(); };
    q('#rt-pause').onclick = () => {
        paused = !paused;
        q('#rt-pause').textContent = paused ? 'Play' : 'Pause';
    };
    const onKey = (e) => {
        if (e.key === 'Escape') { stopped = true; if (wake) wake(); }
        else if (e.key === 'ArrowRight') bump(1);
        else if (e.key === 'ArrowLeft') bump(-1);
        else if (e.key === ' ') { q('#rt-pause').onclick(); e.preventDefault(); }
        else return;
        e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);

    // Paused time does not count against the dwell, or pausing would only delay the jump.
    const dwell = () => new Promise((done) => {
        const t0 = Date.now();
        let spent = 0, last = t0;
        wake = () => { wake = null; clearInterval(h); done(); };
        const h = setInterval(() => {
            const now = Date.now();
            if (!paused) spent += now - last;
            last = now;
            const bar = q('#rt-bar');
            if (bar) bar.style.width = Math.min(100, (spent / hold) * 100) + '%';
            if (spent >= hold) { wake = null; clearInterval(h); done(); }
        }, 40);
    });

    try {
        let i = 0;
        while (i >= 0 && i < list.length && !stopped) {
            const it = list[i];
            q('#rt-label').textContent = it.label || ('region ' + (i + 1));
            q('#rt-sub').textContent = (i + 1) + ' of ' + list.length
                + ' · ' + Math.abs(it.end - it.start).toLocaleString() + ' nt'
                + (it.note ? (' · ' + it.note) : '');
            q('#rt-bar').style.width = '0%';
            try { select(it); } catch (e) { }
            try { await frame(it); } catch (e) { }
            shown++;
            step = 1;
            await dwell();
            if (stopped) break;
            i += step;
            // Walking back off the front stays on the first rather than ending the tour:
            // the only thing that ends it is reaching the end or being stopped.
            if (i < 0) i = 0;
        }
    } finally {
        window.removeEventListener('keydown', onKey, true);
        try { el.remove(); } catch (e) { }
    }
    return { shown: shown, stopped: stopped, total: list.length };
}
