function (title, detail) {

    // SOMETHING IS HAPPENING, AND HERE IS WHAT.
    //   const w = await exec('baja/lib/working.js', 'Conservation map', 'asking Ensembl');
    //   w.step('aligning 6 species');  w.done();   // or w.fail('...')
    //
    // A lookup that takes forty seconds and says nothing is indistinguishable from a
    // lookup that did not start. setMessage puts a line in the corner that is easy to
    // miss, disappears on a timer, and says nothing more while the wait goes on, so the
    // honest reading of the screen was "nothing happened" -- and the second press, on a
    // button that is still working, starts the whole thing again.
    //
    // THE CLOCK IS THE POINT. A spinner says "wait"; a count of seconds says "wait, and
    // here is how long you have waited", which is what tells someone whether to keep
    // waiting or go and do something else. It starts counting immediately and keeps
    // counting until it is told to stop.
    //
    // It covers the canvas because the canvas is not usable while this runs, and because
    // a panel that can be clicked past invites the second press.

    return (async () => {
        // A NESTED PANEL DOES NOT END THE ONE UNDER IT.
        //
        // This used to destroy whatever panel was up before putting its own there, which
        // was fine for two unrelated operations and wrong for the common case: an
        // operation that raises a panel and then calls another operation that raises one
        // too. The inner panel killed the outer one's node, the inner one's done() took
        // itself away, and the outer operation carried on for another minute writing
        // step() into a node that was no longer in the document -- feedback that stopped
        // dead partway through, which is what "it ran and then went quiet" was.
        //
        // So the panels are a stack: a new one hides the one beneath it, and taking it
        // away puts the one beneath it back, with whatever text it has since been given.
        let under = null;
        try {
            const cur = window.__bajaWorking;
            if (cur && cur.el && cur.el.parentNode) { under = cur; cur.el.style.display = 'none'; }
            else if (cur && cur.destroy) { cur.destroy(); }
        } catch (e) { under = null; }

        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const el = document.createElement('div');
        el.id = 'baja-working';
        el.setAttribute('role', 'status');
        // ABOVE THE CARD THAT ASKED FOR THE WORK. The ask panel sits at 2147483000, and
        // at 2147482600 this was drawn underneath it: the spinner existed, ran, and was
        // covered by the very card the user was looking at, which is indistinguishable
        // from no feedback at all. Only the handful of things that must interrupt
        // anything -- a name prompt, a leave warning -- go above this.
        el.style.cssText = 'position:fixed;inset:0;z-index:2147483450;display:flex;'
            + 'align-items:center;justify-content:center;background:rgba(7,32,47,0.72);'
            + 'color:#eaf6f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;';
        el.innerHTML =
            '<div style="min-width:320px;max-width:min(560px,86vw);background:rgba(10,37,64,0.985);'
            + 'border:1px solid #1aa3bd;border-radius:12px;padding:20px 22px;'
            + 'box-shadow:0 22px 60px rgba(4,16,30,0.6);">'
            + '<div style="display:flex;align-items:center;gap:12px;">'
            + '<svg width="22" height="22" viewBox="0 0 22 22" style="flex:none;">'
            + '<circle cx="11" cy="11" r="9" fill="none" stroke="rgba(159,196,212,0.25)" stroke-width="3"></circle>'
            + '<path d="M11 2 a9 9 0 0 1 9 9" fill="none" stroke="#1aa3bd" stroke-width="3" stroke-linecap="round">'
            + '<animateTransform attributeName="transform" type="rotate" from="0 11 11" to="360 11 11" '
            + 'dur="0.9s" repeatCount="indefinite"></animateTransform></path></svg>'
            + '<div style="font-weight:700;font-size:15px;">' + esc(title || 'Working') + '</div></div>'
            + '<div data-id="detail" style="font-size:13px;color:#cfe9f3;margin-top:10px;">'
            + esc(detail || '') + '</div>'
            + '<div data-id="clock" style="font-size:12px;color:#9fc4d4;margin-top:8px;"></div>'
            + '</div>';
        document.body.appendChild(el);

        const t0 = Date.now();
        const clock = el.querySelector('[data-id="clock"]');
        const tick = () => {
            if (!clock) return;
            const s = Math.round((Date.now() - t0) / 1000);
            clock.textContent = s + ' second' + (s === 1 ? '' : 's');
        };
        tick();
        const timer = setInterval(tick, 1000);

        const w = {
            el: el,
            step(text) {
                try {
                    const d = el.querySelector('[data-id="detail"]');
                    if (d) d.textContent = '' + (text || '');
                    // An operation still reporting progress is still running, so if
                    // something took its panel away, its next word brings it back rather
                    // than being written into a node nobody can see.
                    if (!el.parentNode) {
                        document.body.appendChild(el);
                        el.style.display = 'flex';
                        window.__bajaWorking = w;
                    }
                } catch (e) { }
            },
            // The panel goes when the work does, and takes its clock with it: a timer left
            // running on a removed node is a leak that only shows up after an hour.
            done() {
                try { clearInterval(timer); } catch (e) { }
                try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
                // Back to the operation that was already running, if there was one: it has
                // not finished, and the screen should go on saying so.
                let back = null;
                try { if (under && under.el) { under.el.style.display = 'flex'; back = under; } } catch (e) { }
                if (window.__bajaWorking === w) window.__bajaWorking = back;
                under = null;
            },
            // IT SAYS HOW IT ENDED, TOO. A panel that vanishes the instant the work is done
            // leaves the same question it was put up to answer: did that do anything? The
            // outcome used to go to a line in the corner, which is the thing this panel
            // exists because nobody sees. finish() swaps the spinner for a tick, puts the
            // result where the eye already is, and takes itself away after a moment or on
            // a click, so a success is seen without having to be dismissed.
            finish(text, ms) {
                try { clearInterval(timer); } catch (e) { }
                try {
                    const d = el.querySelector('[data-id="detail"]');
                    if (d) { d.textContent = '' + (text || 'Done.'); d.style.color = '#b7f0c8'; }
                    const sp = el.querySelector('svg');
                    if (sp) sp.outerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" style="flex:none;">'
                        + '<circle cx="11" cy="11" r="10" fill="#1f9d55"></circle>'
                        + '<path d="M6 11.5l3.2 3.2L16 8" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
                    const c = el.querySelector('[data-id="clock"]');
                    if (c) c.textContent = 'took ' + Math.max(1, Math.round((Date.now() - t0) / 1000)) + ' second' + (Math.round((Date.now() - t0) / 1000) > 1 ? 's' : '');
                    el.style.background = 'rgba(7,32,47,0.35)';
                    el.style.cursor = 'pointer';
                    el.addEventListener('click', () => { try { w.done(); } catch (e) { } });
                } catch (e) { }
                setTimeout(() => { try { w.done(); } catch (e) { } }, (typeof ms === 'number' && ms > 0) ? ms : 2200);
            },
            // A failure stays on screen until it is read, which a corner message does not.
            fail(text) {
                try { clearInterval(timer); } catch (e) { }
                try {
                    const d = el.querySelector('[data-id="detail"]');
                    if (d) { d.textContent = '' + (text || 'That did not work.'); d.style.color = '#ff9d92'; }
                    const sp = el.querySelector('svg');
                    if (sp && sp.parentNode) sp.parentNode.removeChild(sp);
                    const c = el.querySelector('[data-id="clock"]');
                    if (c) {
                        c.innerHTML = '<button type="button" data-id="close" style="margin-top:6px;'
                            + 'background:transparent;border:1px solid rgba(159,196,212,0.5);'
                            + 'color:#eaf6f9;border-radius:7px;padding:5px 12px;cursor:pointer;'
                            + 'font:inherit;">Close</button>';
                    }
                } catch (e) { }
            }
        };
        w.destroy = w.done;
        el.addEventListener('click', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-id="close"]') : null;
            if (b) w.done();
        });
        // Escape gives up waiting for the panel, not for the work: the work has no handle
        // to stop it, and pretending otherwise would be worse than leaving it running.
        const onKey = (e) => { if (e.key === 'Escape') { w.done(); } };
        document.addEventListener('keydown', onKey, true);
        const realDone = w.done;
        w.done = () => {
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            realDone();
        };
        w.destroy = w.done;
        window.__bajaWorking = w;
        return w;
    })();
}
