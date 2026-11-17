function (graph, opts) {

    // THE OFF-TARGET SCREEN'S OPTIONS, asked once, in the editor's own look.
    //   const choice = await exec('baja/manchester/menu/off-target-options.js', graph, {
    //       region: 'full' | 'seed',        which screen is about to run
    //       genomes: <whatever /genomes returned>,
    //       endpoint: '<url>',              only so an error can say where it looked
    //       counts: { all, unscreened, selected },   optional, for the Run-on labels
    //       trackLabel: 'SPTLC2-201',
    //       defaults: { genome, scope, editDistance }
    //   });
    //   // -> { genome, scope: 'all'|'unscreened'|'selected', editDistance }  or null if cancelled
    //
    // WHY THIS IS NOT THE OLD PANEL. The previous one was built from the legacy card/radio
    // widgets and mounted into mainPanel, which means it REPLACED the canvas: a full-page
    // light-grey form in an editor that is navy everywhere else, and the track gone while you
    // chose a reference for it. This is an overlay, so the canvas stays where it was and
    // closing it changes nothing.
    //
    // AND WHY THE REFERENCE LIST IS VALIDATED. The old panel did
    // `for (let a of Object.keys(available_genomes))` straight onto whatever GETJSON returned.
    // GETJSON hands back an error envelope rather than throwing, so when /genomes was down the
    // keys of that envelope became the list of things to choose from: headers, status,
    // statusText, url, ok, name, message, error. Eight fake genomes, each of which would have
    // been sent to the server as a reference. A failed lookup has to look like a failure.

    return (async () => {
        const o = opts || {};
        const ID = 'baja-offtarget-options';
        const H = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const fmt = (n) => (+n || 0).toLocaleString();

        // A FAILED LOOKUP IS NOT A LIST OF GENOMES. Anything carrying the shape of a fetch
        // error is refused outright, and so is a response whose keys are all envelope fields:
        // either way there is nothing here a user could meaningfully pick.
        const ENVELOPE = ['headers', 'status', 'statustext', 'url', 'ok', 'name', 'message',
            'error', 'stack', 'type', 'redirected', 'bodyused', 'code', 'errno'];
        const genomesOf = (res) => {
            if (!res) return null;
            if (Array.isArray(res)) {
                const a = res.map((x) => '' + x).filter((x) => x.trim());
                return a.length ? a : null;
            }
            if (typeof res !== 'object') return null;
            if (res.error != null || res.ok === false || res.statusText != null || res.stack != null) return null;
            const keys = Object.keys(res);
            if (!keys.length) return null;
            const real = keys.filter((k) => ENVELOPE.indexOf(('' + k).toLowerCase()) < 0);
            // Every key an envelope field: that is the envelope, not a short genome list.
            if (!real.length) return null;
            return real;
        };
        const whyFailed = (res) => {
            if (!res) return 'the reference server returned nothing';
            if (typeof res === 'object') {
                // statusText is often the literal string "OK" even on a 404, which printed as
                // "HTTP 404 OK"; and the framework's message usually just restates the status
                // and the URL that is already on screen. Neither is echoed verbatim.
                const st = ('' + (res.statusText || '')).trim();
                if (res.status != null) {
                    return 'HTTP ' + res.status + ((st && st.toUpperCase() !== 'OK') ? (' ' + st) : '');
                }
                const m = ('' + (res.message || res.error || '')).trim();
                if (m) return m.length > 140 ? (m.slice(0, 137) + '…') : m;
            }
            return 'the reference list could not be read';
        };

        const list = genomesOf(o.genomes);
        const region = (o.region === 'seed') ? 'seed' : 'full';
        const counts = o.counts || null;
        const D = o.defaults || {};

        let genome = (list && list.indexOf(D.genome) >= 0) ? D.genome : (list ? list[0] : '');
        let scope = ['all', 'unscreened', 'selected'].indexOf(D.scope) >= 0 ? D.scope : 'all';
        let editDistance = [0, 1, 2, 3].indexOf(+D.editDistance) >= 0 ? +D.editDistance : 0;

        try { const old = document.getElementById(ID); if (old) old.remove(); } catch (e) { }

        return await new Promise((resolve) => {
            const panel = document.createElement('div');
            panel.id = ID;
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483300;background:#071a30;color:#e8f0fb;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

            const seg = (on, disabled) => 'cursor:' + (disabled ? 'default' : 'pointer')
                + ';border-radius:9px;padding:9px 15px;font:700 12.5px Arial;text-align:left;'
                + (on ? 'border:1px solid #12c2e0;background:#12c2e0;color:#04202a;'
                    : 'border:1px solid rgba(255,255,255,0.18);background:#0a1e3a;color:#c9d7e6;')
                + (disabled ? 'opacity:0.4;' : '');
            const label = 'display:block;font:700 12px Arial;color:#9fb3c8;letter-spacing:0.04em;'
                + 'text-transform:uppercase;margin:0 0 9px;';
            const note = 'font:12px Arial;color:#6b8299;line-height:1.6;margin-top:8px;';

            const scopes = [
                // "All compounds · 1" on a track carrying 210 reads as a bug rather than as the
                // zoom it is, so visible goes in the label and not only in the subtitle above.
                ['all', 'All visible compounds', 'Rerun every compound in view, replacing any result it already has.'],
                ['unscreened', 'Only those in view with no result yet', 'Leaves results already on the other compounds untouched.'],
                ['selected', 'Selected compounds only', 'Just the compounds currently selected and in view.']
            ];
            const countOf = (k) => (counts && counts[k] != null) ? counts[k] : null;

            const header = '<div style="display:flex;align-items:center;gap:16px;padding:16px 24px;'
                + 'border-bottom:1px solid rgba(255,255,255,0.08);background:#0b2545;flex:0 0 auto;">'
                + '<div style="min-width:0;"><div style="font:700 18px Arial;">Off-target screen</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + (region === 'seed' ? 'Seed region, positions 2–8 of the guide' : 'Full antisense strand')
                + (o.trackLabel ? (' · ' + H(o.trackLabel)) : '')
                + ' · runs on the compounds currently <b style="color:#cfe4ef;">visible</b> on the track</div></div>'
                + '<button id="ot-x" style="margin-left:auto;cursor:pointer;border-radius:8px;padding:9px 16px;'
                + 'font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;'
                + 'color:#e8f0fb;flex:0 0 auto;">Close</button></div>';

            const refBody = list
                ? ('<div id="ot-genomes" style="display:flex;flex-wrap:wrap;gap:8px;">'
                    + list.map((g, i) => '<button data-g="' + i + '" style="' + seg(g === genome) + '">' + H(g) + '</button>').join('')
                    + '</div>')
                : ('<div style="border:1px solid rgba(251,191,36,0.45);background:rgba(251,191,36,0.08);'
                    + 'border-radius:10px;padding:13px 15px;">'
                    + '<div style="font:700 13px Arial;color:#fbbf24;">No search reference is available.</div>'
                    + '<div style="' + note + 'margin-top:5px;">The reference server did not return a '
                    + 'genome list — ' + H(whyFailed(o.genomes))
                    + (o.endpoint ? (' from ' + H(o.endpoint)) : '')
                    + '. Nothing can be screened until it answers. Check that the off-target service '
                    + 'is running, or the <b style="color:#cfe4ef;">offtarget</b> endpoint in env.js '
                    + 'if it has moved.</div></div>');

            panel.innerHTML = header
                + '<div style="flex:1 1 auto;overflow:auto;padding:22px 24px 26px;">'
                + '<div style="max-width:760px;margin:0 auto;">'

                + '<div style="margin-bottom:26px;"><span style="' + label + '">Search reference</span>'
                + refBody + '</div>'

                + '<div style="margin-bottom:26px;"><span style="' + label + '">Run on</span>'
                + '<div id="ot-scope" style="display:flex;flex-direction:column;gap:8px;">'
                + scopes.map(([k, t, d]) => {
                    const n = countOf(k);
                    return '<button data-s="' + k + '" style="' + seg(k === scope) + '">'
                        + H(t) + (n != null ? (' · ' + fmt(n)) : '')
                        + '<div style="font:400 11.5px Arial;opacity:0.75;margin-top:3px;">' + H(d) + '</div></button>';
                }).join('')
                + '</div></div>'

                + '<div><span style="' + label + '">Edit distance</span>'
                + '<div id="ot-ed" style="display:flex;gap:8px;">'
                + [0, 1, 2, 3].map((n) => '<button data-e="' + n + '" style="' + seg(n === editDistance)
                    + 'min-width:54px;text-align:center;">' + n + '</button>').join('')
                + '</div>'
                + '<div style="' + note + '">How many insertions, deletions or mismatches a hit may carry. '
                + '0 finds exact matches only; each step up finds more and takes longer.</div></div>'

                + '</div></div>'

                + '<div style="flex:0 0 auto;display:flex;gap:10px;padding:14px 24px;'
                + 'border-top:1px solid rgba(255,255,255,0.08);background:#08203c;">'
                + '<button id="ot-run" style="cursor:pointer;border-radius:9px;padding:10px 22px;font:700 13px Arial;'
                + 'border:0;background:#22c55e;color:#04210f;">Run screen</button>'
                + '<button id="ot-no" style="cursor:pointer;border-radius:9px;padding:10px 20px;font:700 13px Arial;'
                + 'border:1px solid rgba(255,255,255,0.24);background:transparent;color:#cfe4ef;">Cancel</button>'
                + '<div id="ot-say" style="margin-left:auto;align-self:center;font:12px Arial;color:#9fb3c8;"></div>'
                + '</div>';

            document.body.appendChild(panel);
            const q = (s) => panel.querySelector(s);

            const done = (val) => {
                try { panel.remove(); } catch (e) { }
                try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
                resolve(val);
            };
            const onKey = (e) => {
                try { e.stopPropagation(); } catch (e2) { }
                if (e.key === 'Escape') done(null);
            };
            document.addEventListener('keydown', onKey, true);
            for (const ev of ['keyup', 'keypress', 'wheel']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }

            const syncRun = () => {
                const run = q('#ot-run');
                const n = countOf(scope);
                // Nothing to screen is said here rather than after the run returns having
                // done nothing: an empty scope and a dead reference look identical afterwards.
                const bad = !list ? 'no search reference' : ((n === 0) ? 'no compounds in that scope' : '');
                run.disabled = !!bad;
                run.style.opacity = bad ? '0.45' : '';
                run.style.cursor = bad ? 'default' : 'pointer';
                q('#ot-say').textContent = bad ? ('Cannot run: ' + bad)
                    : (n != null ? (fmt(n) + ' compound' + (n === 1 ? '' : 's') + ' will be screened') : '');
            };

            if (list) {
                q('#ot-genomes').querySelectorAll('button[data-g]').forEach((b) => {
                    b.onclick = () => {
                        genome = list[+b.getAttribute('data-g')];
                        q('#ot-genomes').querySelectorAll('button[data-g]').forEach((x) => {
                            x.style.cssText = seg(list[+x.getAttribute('data-g')] === genome);
                        });
                        syncRun();
                    };
                });
            }
            q('#ot-scope').querySelectorAll('button[data-s]').forEach((b) => {
                b.onclick = () => {
                    scope = b.getAttribute('data-s');
                    q('#ot-scope').querySelectorAll('button[data-s]').forEach((x) => {
                        const on = x.getAttribute('data-s') === scope;
                        x.style.cssText = seg(on);
                    });
                    syncRun();
                };
            });
            q('#ot-ed').querySelectorAll('button[data-e]').forEach((b) => {
                b.onclick = () => {
                    editDistance = +b.getAttribute('data-e');
                    q('#ot-ed').querySelectorAll('button[data-e]').forEach((x) => {
                        x.style.cssText = seg(+x.getAttribute('data-e') === editDistance) + 'min-width:54px;text-align:center;';
                    });
                    syncRun();
                };
            });

            q('#ot-no').onclick = () => done(null);
            q('#ot-x').onclick = () => done(null);
            q('#ot-run').onclick = () => {
                if (q('#ot-run').disabled) return;
                done({ genome: genome, scope: scope, editDistance: editDistance, region: region });
            };
            syncRun();
        });
    })();
}
