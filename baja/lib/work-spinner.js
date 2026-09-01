function (label) {

    // Small working spinner badge pinned to the UPPER-RIGHT of the app.
    //   const sp = await exec('baja/lib/work-spinner.js', 'Loading…');
    //   sp.text('Loading tracks…');   // update the label
    //   sp.progress(45);              // optional 0-100, appended as a percentage
    //   sp.stop();                    // remove it
    //
    // Used in place of a `wid: 'progress'` widget where mounting a progress bar would take
    // over a layout slot (the viewer's showWidget put it in the button-menu panel, which on a
    // read-only screen has no other reason to exist). This is a plain fixed-position DOM
    // element: it overlays whatever is on screen, occupies no layout, and is
    // pointer-events:none so it never intercepts a click on the canvas beneath it.

    return (async () => {
        const ID = 'baja-work-spinner';
        try {
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);
            if (!document.getElementById('baja-spin-style')) {
                const st = document.createElement('style');
                st.id = 'baja-spin-style';
                st.textContent = '@keyframes bajaSpin{to{transform:rotate(360deg)}}';
                (document.head || document.documentElement).appendChild(st);
            }
            const wrap = document.createElement('div');
            wrap.id = ID;
            wrap.style.cssText = 'position:fixed;top:12px;right:14px;z-index:2147483200;'
                + 'display:flex;align-items:center;gap:8px;background:rgba(11,37,69,0.92);color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:7px 12px;'
                + 'font:600 12px Arial;box-shadow:0 8px 26px rgba(0,0,0,0.35);pointer-events:none;';
            const ring = document.createElement('span');
            ring.style.cssText = 'width:16px;height:16px;border-radius:50%;flex:0 0 auto;'
                + 'border:2px solid rgba(255,255,255,0.25);border-top-color:#4fd0e6;'
                + 'animation:bajaSpin 0.8s linear infinite;display:inline-block;';
            const txt = document.createElement('span');
            const base = ('' + (label || 'Working…'));
            txt.textContent = base;
            wrap.appendChild(ring);
            wrap.appendChild(txt);
            (document.body || document.documentElement).appendChild(wrap);

            let current = base;
            const render = (pct) => {
                try {
                    txt.textContent = (pct == null || !isFinite(pct))
                        ? current
                        : (current + '  ' + Math.max(0, Math.min(100, Math.round(pct))) + '%');
                } catch (e) { }
            };
            return {
                text: (s) => { current = ('' + (s == null ? current : s)); render(null); },
                // Signature-compatible with the progressBar callback the graph is handed, so it
                // can be passed straight to exec('flexigraph/gene.js', …) in place of one.
                progress: (pct) => render(+pct),
                stop: () => { try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { } }
            };
        } catch (e) {
            // Never let a missing DOM break a caller that only wants progress feedback.
            return { text: () => { }, progress: () => { }, stop: () => { } };
        }
    })();
}
