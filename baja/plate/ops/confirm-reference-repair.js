function (pt, proposal, handlers) {

    // "Did you mean …?" — the user approves or ignores a proposed formula repair.
    //   exec('baja/plate/ops/confirm-reference-repair.js', pt, proposal, { onApprove, onIgnore })
    //
    // `proposal` comes from resolve-missing-references.js run with { apply: false }:
    //   { formula, changes: [{from, to}], tables: {"Table[Label]": value}, notes: [] }
    // Nothing is changed here. Approve runs onApprove (which rewrites the stored formula,
    // creates any inputs and recalculates); Ignore runs onIgnore (which records the choice
    // so the same formula is not asked about again this session).
    const h = handlers || {};
    const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const changes = Array.isArray(proposal.changes) ? proposal.changes : [];
    const rows = Object.entries(proposal.tables || {});

    let body = '<div style="font-family:system-ui,-apple-system,\'Segoe UI\',Roboto,sans-serif;color:#0a2540;">';
    body += '<div style="font:600 15px system-ui,-apple-system,\'Segoe UI\',Roboto,sans-serif;margin-bottom:6px;">Did you mean…</div>';
    body += '<div style="font-size:12.5px;color:#4a5a70;margin-bottom:12px;">A formula names something the model does not have. This is the repair on offer.</div>';
    if (changes.length) {
        body += '<div style="font:600 11px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b7a90;margin:8px 0 4px;">Rewrite</div>';
        for (const c of changes) {
            body += '<div style="font:13px Menlo,Consolas,monospace;padding:6px 10px;margin:3px 0;background:#f4f7fa;border:1px solid #dfe6ee;border-radius:6px;">'
                + '<span style="color:#b42318;text-decoration:line-through;">' + esc(c.from) + '</span>'
                + '<span style="color:#6b7a90;margin:0 8px;">→</span>'
                + '<span style="color:#0f6e7a;font-weight:600;">' + esc(c.to) + '</span></div>';
        }
    }
    if (rows.length) {
        body += '<div style="font:600 11px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b7a90;margin:10px 0 4px;">Create input' + (rows.length > 1 ? 's' : '') + '</div>';
        for (const [k, v] of rows) {
            body += '<div style="font:13px Menlo,Consolas,monospace;padding:6px 10px;margin:3px 0;background:#f4f7fa;border:1px solid #dfe6ee;border-radius:6px;">'
                + esc(k) + ' <span style="color:#6b7a90;">=</span> <span style="color:#0f6e7a;font-weight:600;">' + esc(v) + '</span></div>';
        }
    }
    body += '<div style="font:600 11px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#6b7a90;margin:10px 0 4px;">Formula after the repair</div>';
    body += '<div style="font:12.5px Menlo,Consolas,monospace;padding:8px 10px;background:#0a2540;color:#eaf6f9;border-radius:6px;word-break:break-all;">' + esc(proposal.formula) + '</div>';
    const notes = (proposal.notes || []).filter(n => !/^Would create/.test(n) && !/ read as /.test(n));
    if (notes.length) {
        body += '<div style="font-size:12px;color:#4a5a70;margin-top:10px;">' + notes.map(esc).join('<br>') + '</div>';
    }
    body += '</div>';

    let settled = false;
    const done = (fn) => { if (settled) return; settled = true; try { hideAllModal(); } catch (e) { } try { if (fn) fn(); } catch (e) { console.error(e); } };

    const t = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            cards: [
                [
                    { 'title': '', 'width': '100%', 'component': { wid: 'html', data: body } }
                ],
                [
                    {
                        'title': '', 'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Approve and recalculate',
                                        background: '#1aa3bd', color: '#ffffff', borderColor: '#1aa3bd',
                                        ionFunction: createIonFunction(() => done(h.onApprove))
                                    },
                                    {
                                        label: 'Ignore',
                                        background: 'transparent', color: '#0a2540', borderColor: '#c7d2dd',
                                        ionFunction: createIonFunction(() => done(h.onIgnore))
                                    }
                                ]
                            }
                        }
                    }
                ]
            ]
        }
    };
    showModal(t, 620, 460);
    return t;
}
