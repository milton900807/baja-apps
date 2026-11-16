function (pm, o) {

    // "SHARE THIS" OPENS THE SHARE DIALOG. IT DOES NOT SHARE ANYTHING.
    //
    // Asking to share a table is asking for the thing the Share button opens: the dialog
    // with the address field, the access choice and the list of who already has it. So that
    // is what this puts on screen, filled in with whatever the request named, and then it
    // stops. Nothing is sent until the owner presses Share in that dialog.
    //
    // THAT STOP IS THE POINT, not timidity. A share is a document leaving the owner's hands
    // for a named person, read off a sentence that may have the address or the name slightly
    // wrong, and there is no taking it back afterwards. The dialog is one press away and
    // shows exactly what is about to happen, so the only thing an automatic send would save
    // is the press that makes it deliberate.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            if (!pt) { resolve({ error: 'there is no project open' }); return; }

            const pick = await exec('baja/plate/ops/pick-canvas-object.js', pt,
                (o && (o.name || o.table || o.object)) || '');
            if (!pick || pick.error) { resolve({ error: (pick && pick.error) || 'which one?' }); return; }

            if (typeof pt.shareObject !== 'function') {
                resolve({ error: 'sharing a single object is not available in this view' });
                return;
            }

            // Only what the request actually said. An address it did not name is left for
            // the owner to type, and an access it did not name stays on the dialog's own
            // default rather than being guessed at.
            const emails = ('' + ((o && (o.emails || o.email || o.with)) || '')).trim();
            const asked = ('' + ((o && o.access) || '')).trim().toLowerCase();
            let access = '';
            if (/^(view|read|look|view_only|viewonly|read_only)/.test(asked)) access = 'view';
            else if (/^(public|link|anyone)/.test(asked)) access = 'public';
            else if (/^(edit|write|co.?edit)/.test(asked)) access = 'edit';
            const message = ('' + ((o && o.message) || '')).trim();

            const prefill = (emails || access || message)
                ? { emails: emails, access: access, message: message } : null;

            // THE OBJECT IS BROUGHT INTO VIEW FIRST. The dialog names it, and seeing the
            // table it is about behind the dialog is how the owner catches the wrong one
            // before the address goes in rather than after it is sent.
            try { await exec('baja/plate/ops/show-new-object.js', pt, pick.object); } catch (e) { }
            try { if (typeof pt.setSelected === 'function' && pick.kind === 'plate') pt.setSelected(pick.object); } catch (e) { }

            try { pt.shareObject(pick.object, prefill); }
            catch (e) { resolve({ error: ('' + (e && e.message ? e.message : e)) }); return; }

            resolve({
                opened: true, name: pick.name, kind: pick.kind,
                prefilled: prefill ? Object.keys(prefill).filter((k) => prefill[k]) : [],
                message: 'The share dialog for "' + pick.name + '" is open'
                    + (emails ? ', with ' + emails + ' filled in' : '')
                    + (access ? ' and the access set to ' + (access === 'public' ? 'a public link'
                        : access === 'view' ? 'view only' : 'can edit') : '')
                    + '. Nothing is sent until you press Share.'
            });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
