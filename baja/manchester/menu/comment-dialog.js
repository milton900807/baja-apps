function (title, subtitle, initial) {

    // Navy "Add a comment" dialog — same look-and-feel as manchester/demo.js (a DOM overlay,
    // not a wid modal). Resolves the entered comment string on Save, or null on Cancel/Escape.
    //   const c = await exec('baja/manchester/menu/comment-dialog.js', 'Add a comment', 'Write a note…');
    return new Promise((resolve) => {
        try {
            const old = document.getElementById('baja-comment-dialog');
            if (old && old.parentNode) old.parentNode.removeChild(old);

            const panel = document.createElement('div');
            panel.id = 'baja-comment-dialog';
            panel.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;'
                + 'width:min(480px,94vw);background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);'
                + 'border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;padding:18px;';

            let onKey;
            const done = (val) => {
                try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                resolve(val);
            };

            panel.innerHTML = ''
                + '<div style="font:700 16px Arial;margin-bottom:4px;">' + (title || 'Add a comment') + '</div>'
                + '<div style="font:13px Arial;color:#9fb3c8;margin-bottom:12px;">' + (subtitle || 'Write a note for this annotation.') + '</div>'
                + '<textarea id="cd-input" rows="3" style="width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:10px;font:13px Arial;resize:vertical;"></textarea>'
                + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">'
                + '<button id="cd-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                + '<button id="cd-save" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 13px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Save</button>'
                + '</div>';

            document.body.appendChild(panel);
            const input = panel.querySelector('#cd-input');
            try { if (input && initial != null) input.value = '' + initial; } catch (e) { }
            panel.querySelector('#cd-save').onclick = () => done(input ? input.value : '');
            panel.querySelector('#cd-cancel').onclick = () => done(null);

            onKey = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); done(null); }
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); done(input ? input.value : ''); }
            };
            document.addEventListener('keydown', onKey, true);
            try { input.focus(); } catch (e) { }
        } catch (e) { resolve(null); }
    });
}
