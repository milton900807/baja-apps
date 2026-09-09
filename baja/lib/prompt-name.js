function (options) {

    // ASK FOR ONE NAME, in the navy dialog the rest of the application uses.
    //
    //   const name = await exec('baja/lib/prompt-name.js', {
    //       title: 'New folder',
    //       message: 'It will be created in Screens.',
    //       label: 'Folder name',
    //       value: '',
    //       placeholder: 'e.g. KRAS screens',
    //       confirmLabel: 'Create',
    //       validate: (v) => v.indexOf('/') >= 0 ? 'A name cannot contain a slash.' : ''
    //   });
    //   if (!name) return;              // cancelled
    //
    // Resolves the trimmed string, or null when cancelled. It never throws and never
    // resolves undefined, because callers branch on the answer to decide whether to write
    // something.
    //
    // WHY THIS EXISTS. The menus that needed a name showed `showModal({wid:
    // 'input-param-items'})` with no card around it -- no title saying what was being asked,
    // no cancel, and a bare input widget rendered against the modal's own background, which
    // is where the unreadable boxes came from. A dialog that asks a question should look
    // like the other dialogs that ask questions.

    return new Promise((resolve) => {
        const o = options || {};
        const title = o.title || 'Name';
        const message = o.message || '';
        const label = o.label || 'Name';
        const confirmLabel = o.confirmLabel || 'Create';
        const cancelLabel = o.cancelLabel || 'Cancel';
        const placeholder = o.placeholder || '';
        const initial = ('' + (o.value == null ? '' : o.value));
        const ID = 'baja-prompt-name';

        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // A second prompt stacked on the first would leave one of them unanswered and its
        // promise pending for the life of the page.
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
            resolve(value);
        };

        const wrap = document.createElement('div');
        wrap.id = ID;
        // Above the editors (2147482900) and their own overlays (2147483100), alongside the
        // leave-confirmation dialog.
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483600;'
            + 'background:rgba(3,12,24,0.72);display:flex;align-items:center;justify-content:center;'
            + 'padding:24px;font-family:Arial,Helvetica,sans-serif;';

        wrap.innerHTML = ''
            + '<div role="dialog" aria-modal="true" aria-labelledby="' + ID + '-t" '
            + 'style="background:#0a1e3a;color:#fff;border:1px solid rgba(255,255,255,0.16);'
            + 'border-radius:12px;width:min(460px,96vw);box-shadow:0 18px 48px rgba(0,0,0,0.5);overflow:hidden;">'
            + '<div style="padding:20px 22px 4px;">'
            + '<div id="' + ID + '-t" style="font:700 17px Arial;letter-spacing:-0.01em;">' + esc(title) + '</div>'
            + (message ? '<div style="font:13px/1.55 Arial;color:#9fb3c8;margin-top:7px;">' + esc(message) + '</div>' : '')
            + '</div>'
            + '<div style="padding:14px 22px 4px;">'
            + '<label for="' + ID + '-i" style="display:block;font:600 11px Arial;letter-spacing:.06em;'
            + 'text-transform:uppercase;color:#7f9bb8;margin:0 0 6px;">' + esc(label) + '</label>'
            + '<input id="' + ID + '-i" type="text" autocomplete="off" spellcheck="false" '
            + 'placeholder="' + esc(placeholder) + '" '
            + 'style="width:100%;box-sizing:border-box;background:#071a30;color:#e8f0fb;'
            + 'border:1px solid rgba(255,255,255,0.22);border-radius:8px;padding:10px 12px;font:14px Arial;outline:none;">'
            + '<div id="' + ID + '-e" style="font:12px Arial;color:#fca5a5;margin-top:7px;min-height:16px;"></div>'
            + '</div>'
            + '<div style="display:flex;gap:10px;justify-content:flex-end;padding:8px 22px 20px;">'
            + '<button type="button" data-role="cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;'
            + 'font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.24);background:transparent;color:#fff;">'
            + esc(cancelLabel) + '</button>'
            + '<button type="button" data-role="confirm" style="cursor:pointer;border-radius:8px;padding:9px 18px;'
            + 'font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">'
            + esc(confirmLabel) + '</button>'
            + '</div></div>';

        const submit = () => {
            const input = wrap.querySelector('#' + ID + '-i');
            const err = wrap.querySelector('#' + ID + '-e');
            const v = ('' + (input ? input.value : '')).trim();
            if (!v) {
                if (err) err.textContent = 'Enter a name.';
                try { input.focus(); } catch (e) { }
                return;
            }
            // The caller owns the rule; this only reports what it says. Returning a string
            // keeps the dialog open with that message rather than closing on a bad value.
            let why = '';
            try { if (typeof o.validate === 'function') why = o.validate(v) || ''; } catch (e) { why = ''; }
            if (why) {
                if (err) err.textContent = why;
                try { input.focus(); } catch (e) { }
                return;
            }
            finish(v);
        };

        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
            else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
        };

        try {
            wrap.querySelector('[data-role="cancel"]').onclick = () => finish(null);
            wrap.querySelector('[data-role="confirm"]').onclick = submit;
            // Clicking the backdrop cancels; it never submits a half-typed name.
            wrap.onclick = (e) => { if (e.target === wrap) finish(null); };
            // The editors stop key events at their own panel, and this sits above them, so
            // the listener is on the document with capture to be sure it is reached.
            document.addEventListener('keydown', onKey, true);
            document.body.appendChild(wrap);
            const input = wrap.querySelector('#' + ID + '-i');
            if (input) {
                input.value = initial;
                setTimeout(() => { try { input.focus(); input.select(); } catch (e) { } }, 0);
            }
        } catch (e) {
            // If the dialog cannot be shown, answer "cancelled" rather than leaving the
            // caller waiting on a promise that will never settle.
            finish(null);
        }
    });
}
