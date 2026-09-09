function (options) {

    // "Are you sure you want to leave?" — one dialog, shared by every full-screen editor.
    //
    //   const ok = await exec('baja/lib/confirm-leave.js', {
    //       title: 'Close the neoantigen designer?',
    //       message: 'Anything you have not saved will be lost.',
    //       confirmLabel: 'Close without saving'
    //   });
    //   if (!ok) return;
    //
    // Resolves TRUE to proceed and FALSE to stay. It never throws and never resolves
    // undefined, because the callers use it to guard navigation and an ambiguous answer
    // there means either losing someone's work or trapping them in an editor.
    //
    // WHY NOT baja/lib/confirm.js. That one draws on the graph canvas, which is right for a
    // question about the graph. Two of the four editors this guards are fixed DOM overlays
    // with no graph and a z-index above the canvas, so a canvas-drawn dialog would be asked
    // from behind the thing it is asking about. This one is a fixed element stacked above
    // every editor in the application.
    //
    // WHY NOT window.confirm. It is blocking, unstyleable, suppressible by the browser after
    // repeated use, and on some configurations silently returns false — which here would
    // mean a close button that stops working with no explanation.

    return new Promise((resolve) => {
        const o = options || {};
        const title = o.title || 'Leave this screen?';
        const message = o.message || 'Anything you have not saved will be lost.';
        const confirmLabel = o.confirmLabel || 'Leave without saving';
        const cancelLabel = o.cancelLabel || 'Stay here';
        const ID = 'baja-confirm-leave';

        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // A second dialog stacked on the first would leave one of them unanswered and its
        // promise unresolved for the life of the page.
        try {
            const prev = document.getElementById(ID);
            if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
        } catch (e) { }

        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { }
            resolve(!!value);
        };

        const wrap = document.createElement('div');
        wrap.id = ID;
        // Above every editor in the application: the full-screen panels sit at 2147482900
        // and their own overlays at 2147483100.
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483600;'
            + 'background:rgba(3,12,24,0.72);display:flex;align-items:center;justify-content:center;'
            + 'padding:24px;font-family:Arial,Helvetica,sans-serif;';

        wrap.innerHTML = ''
            + '<div role="dialog" aria-modal="true" aria-labelledby="' + ID + '-t" '
            + 'style="background:#0a1e3a;color:#fff;border:1px solid rgba(255,255,255,0.16);'
            + 'border-radius:12px;width:min(460px,96vw);box-shadow:0 18px 48px rgba(0,0,0,0.5);overflow:hidden;">'
            + '<div style="padding:20px 22px 6px;">'
            + '<div id="' + ID + '-t" style="font:700 17px Arial;letter-spacing:-0.01em;">' + esc(title) + '</div>'
            + '<div style="font:13.5px/1.6 Arial;color:#9fb3c8;margin-top:8px;">' + esc(message) + '</div>'
            + '</div>'
            + '<div style="display:flex;gap:10px;justify-content:flex-end;padding:18px 22px 20px;">'
            + '<button type="button" data-role="cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;'
            + 'font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.24);background:transparent;color:#fff;">'
            + esc(cancelLabel) + '</button>'
            + '<button type="button" data-role="confirm" style="cursor:pointer;border-radius:8px;padding:9px 18px;'
            + 'font:700 12.5px Arial;border:1px solid #b4413e;background:#b4413e;color:#fff;">'
            + esc(confirmLabel) + '</button>'
            + '</div></div>';

        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
            else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
        };

        try {
            wrap.querySelector('[data-role="cancel"]').onclick = () => finish(false);
            wrap.querySelector('[data-role="confirm"]').onclick = () => finish(true);
            // Clicking the backdrop is a cancel, never a confirm: the safe answer is the one
            // that does not throw work away.
            wrap.onclick = (e) => { if (e.target === wrap) finish(false); };
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(wrap);
            // Focus lands on Stay, so a stray Enter or Space keeps the work.
            setTimeout(() => { try { wrap.querySelector('[data-role="cancel"]').focus(); } catch (e) { } }, 0);
        } catch (e) {
            // If the dialog cannot be shown at all, do not silently swallow the click and do
            // not silently discard the work: refuse to leave and let the caller's own error
            // path speak.
            finish(false);
        }
    });
}
