function (graph, snps, options) {

    // ASK A QUESTION ABOUT THE SELECTED VARIANTS, AND SHOW WHICH ONES ANSWER IT.
    //   await exec('baja/data/variant-association.js', graph, selectedSnpIndels);
    //
    // The selection panel can hold thirty variants, and the question a reader has about
    // them is rarely positional: "are any of these found in cancer", "do any of these
    // affect splicing". There is no column for that, so this asks a model and then marks
    // the answer ON THE TRACK -- the variants with variant-level evidence are selected,
    // which is the same highlight everything else in this app uses for "these ones".
    //
    // GENE-LEVEL EVIDENCE IS NOT VARIANT-LEVEL EVIDENCE, and this panel never lets the two
    // look alike. Asked whether an intronic change in TP53 is found in cancer, a model will
    // reason that TP53 is a cancer gene and say yes -- true of the gene, and silent about
    // the thing the reader actually selected. The backend makes every verdict declare what
    // its evidence is about and downgrades a yes that cannot; this file keeps them in
    // separate cards with separate headings, and only variant-level hits are marked on the
    // track. A gene-level finding is worth reading and is not an answer about this variant.
    //
    // NOT A DATABASE LOOKUP. No provenance, no literature, no clinical interpretation: a
    // language model's recollection, labelled as one, every time.

    const o = options || {};

    return (async () => {
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { } };
        const list = (Array.isArray(snps) ? snps : (snps ? [snps] : [])).filter(Boolean);
        if (!list.length) { say('No variants are selected.'); return null; }

        // The same record the text search builds, so the two agree about what a variant
        // "says" and there is one place to add a field.
        let recordOf = null;
        try {
            const eng = await exec('baja/data/variant-search.js', graph, { engineOnly: true });
            recordOf = eng && eng.recordOf;
        } catch (e) { recordOf = null; }

        const descriptors = list.map((v, i) => {
            const r = recordOf ? recordOf(v) : {};
            let chr = '';
            try { chr = '' + ((v.track && v.track.chr) || v.chr || ''); } catch (e) { chr = ''; }
            return {
                i: i,
                label: r.name || ('variant ' + (i + 1)),
                gene: r.gene || '', rsid: /^rs\d+$/i.test(r.name || '') ? r.name : '',
                hgvs: r.annotations && /c\.|p\./.test(r.annotations) ? r.annotations.slice(0, 200) : '',
                clinsig: r.clinsig || '', condition: r.condition || '',
                consequence: r.consequence || '',
                chr: chr, pos: r.pos || '', ref: r.ref || '', alt: r.alt || ''
            };
        });

        const question = (o.question != null) ? ('' + o.question) : await (async () => {
            return new Promise((resolve) => {
                try { const old = document.getElementById('baja-variant-ask'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
                const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                    + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;font:13px Arial;';
                const panel = document.createElement('div');
                panel.id = 'baja-variant-ask';
                panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                    + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
                panel.innerHTML = ''
                    + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                    + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);">'
                    + '<div><div style="font:700 20px Arial;">Ask about these variants</div>'
                    + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                    + list.length + ' selected. A model is asked, not a database.</div></div>'
                    + '<div style="margin-left:auto;display:flex;gap:10px;">'
                    + '<button id="va-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                    + '<button id="va-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Ask</button>'
                    + '</div></div>'
                    + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px;">'
                    + '<div style="width:100%;max-width:640px;margin:0 auto;">'
                    + '<textarea id="va-q" rows="3" placeholder="are any of these found in cancer" style="' + inp + 'resize:vertical;"></textarea>'
                    + '<div style="font:12px Arial;color:#9fb3c8;margin-top:8px;line-height:1.7;">'
                    + 'e.g. <b>are any of these found in cancer</b> &middot; <b>do any affect splicing</b> '
                    + '&middot; <b>any known in cardiomyopathy</b><br>'
                    + 'Answers come from a language model’s recollection. They carry no citation and '
                    + 'are not a clinical interpretation. What is known about a GENE is reported '
                    + 'separately from what is known about these particular changes.</div>'
                    + '</div></div>';
                document.body.appendChild(panel);
                const q = (s) => panel.querySelector(s);
                const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
                for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                    panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
                }
                panel.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') { close(); resolve(null); }
                    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) q('#va-go').click();
                });
                q('#va-cancel').onclick = () => { close(); resolve(null); };
                q('#va-go').onclick = () => { const t = ('' + q('#va-q').value).trim(); close(); resolve(t || null); };
                try { q('#va-q').focus(); } catch (e) { }
            });
        })();

        if (!question) return null;

        say('Asking about ' + list.length + ' variant' + (list.length === 1 ? '' : 's') + '…');
        let res = null;
        try {
            res = await exec('py/bio/variants/variant-association.py',
                JSON.stringify(descriptors), question, '' + (o.model || ''));
            if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) { } }
        } catch (e) {
            say('The lookup failed: ' + ((e && e.message) || e));
            return null;
        }
        if (!res || res.status !== 'OK') {
            say('The lookup failed: ' + ((res && res.error) || 'no answer'));
            return null;
        }

        const hits = Array.isArray(res.hits) ? res.hits : [];
        const byLevel = (lvl, verdict) => hits.filter((h) => h.evidence_level === lvl
            && (verdict ? h.verdict === verdict : true));
        const atVariant = byLevel('variant', 'yes');
        const atGene = byLevel('gene', 'yes');
        const unsure = hits.filter((h) => h.verdict === 'unsure');
        const no = hits.filter((h) => h.verdict === 'no');

        // MARK THE ANSWER ON THE TRACK, and only the part of it that is about these
        // variants. A gene-level finding selects nothing: it is not a claim about any
        // marker on this track, and lighting one up would make it look like one.
        try {
            for (const v of list) { try { v.deselect(); } catch (e) { } }
            for (const h of atVariant) { const v = list[h.i]; if (v) { try { v.select(); } catch (e) { } } }
            if (graph.wake) graph.wake();
        } catch (e) { }

        const nameOf = (h) => (descriptors[h.i] && descriptors[h.i].label) || ('variant ' + (h.i + 1));
        const rows = (arr) => arr.map((h) => ({
            heading: nameOf(h) + '  ·  ' + h.confidence + ' confidence',
            text: h.why || '(no reason given)'
        }));

        const cards = [];
        cards.push({
            title: 'Answer', meta: question,
            sections: [{ heading: 'ACROSS THE ' + list.length + ' SELECTED', text: res.answer || '(no answer)' }]
        });
        if (atVariant.length) {
            cards.push({
                title: 'Documented for these variants (' + atVariant.length + ')',
                meta: 'selected on the track',
                sections: rows(atVariant)
            });
        }
        if (atGene.length) {
            cards.push({
                title: 'Known for the GENE only (' + atGene.length + ')',
                meta: 'not a finding about this change',
                sections: [{
                    heading: 'READ THIS FIRST',
                    text: 'These are statements about the gene. Nothing is documented about the '
                        + 'particular change selected here, and an intronic or synonymous change in a '
                        + 'disease gene is not thereby associated with that disease. They are NOT '
                        + 'selected on the track.'
                }].concat(rows(atGene))
            });
        }
        if (no.length) cards.push({ title: 'No association found (' + no.length + ')', sections: rows(no) });
        if (unsure.length) cards.push({ title: 'Not known (' + unsure.length + ')', sections: rows(unsure) });
        const cav = (res.caveats || []).slice();
        cav.unshift('This is a language model’s recollection, not a database lookup, a literature '
            + 'search or a clinical interpretation. It carries no citation and nobody has checked it.');
        cards.push({ title: 'What this is', sections: cav.map((c, i) => ({ heading: 'NOTE ' + (i + 1), text: '' + c })) });

        say(atVariant.length + ' of ' + list.length + ' have variant-level evidence'
            + (atGene.length ? (', ' + atGene.length + ' gene-level only') : '')
            + (atVariant.length ? '; those are selected on the track.' : '.'));

        try {
            await exec('baja/lib/model-panel.js', {
                id: 'baja-variant-association',
                title: 'Selected variants',
                subtitle: question,
                cards: cards
            });
        } catch (e) { }
        return res;
    })();
}
