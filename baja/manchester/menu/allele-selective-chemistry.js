function (graph, targets, opts) {

    // PICK A CHEMISTRY, THEN DESIGN AGAINST THESE VARIANTS.
    //
    // The one place this happens. It is reached from the SNP right-click menu and from the
    // selection library's SNPs / Indels shelf, and those two must not drift: the chemistry
    // catalogue, the phase choice and the handover to tile-variant are the same question
    // however you got here.
    //
    //   targets : [{ snp, track, label }]  -- what to design against
    //   opts    : { title, subtitle }      -- optional wording for the shelf
    //
    // tile-variant.js takes (variant, track, graph, opposite, all):
    //   opposite=false  the variant's own phase, and the neighbours on it
    //   opposite=true   the other phase too -- and `all` is what stops it refusing when a
    //                   second mutation sits at the SAME position, which is exactly the
    //                   case "design around all the mutations at that location" means.

    return (async () => {
        const o = opts || {};
        const list = (targets || []).filter(function (t) { return t && t.snp; });
        if (!list.length) {
            try { graph.setMessage(' No variants to design against. '); } catch (e) { }
            return false;
        }

        let templates = [];
        try {
            const ChemistryTemplateDB = await exec('baja/chem/chem-template-repo.js');
            const cdb = await new ChemistryTemplateDB();
            templates = await cdb.load();
        } catch (e) { templates = []; }
        // A record with no name cannot be offered -- there would be nothing on the card to
        // choose -- and the repo does carry a few.
        templates = (templates || []).filter(function (t) { return t && t.name; });
        if (!templates.length) {
            try { graph.setMessage(' No chemistry templates are available. '); } catch (e) { }
            return false;
        }

        const say = function (m) { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };

        const design = async function (tpl, phase) {
            graph.props.selected_chemistry = tpl;
            const opposite = !!(phase && phase.opposite);
            const all = !!(phase && phase.all);
            let done = 0, failed = 0;
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                if (list.length > 1) {
                    say(tpl.name + ' — ' + (i + 1) + ' of ' + list.length + '…');
                }
                try {
                    await exec('baja/manchester/annotation/tile-variant.js',
                        t.snp, t.track, graph, opposite, all);
                    done++;
                } catch (e) {
                    failed++;
                    say((t.label || 'a variant') + ' failed: ' + (e && e.message ? e.message : e));
                }
            }
            say(tpl.name + ' — designed against ' + done + ' variant'
                + (done === 1 ? '' : 's')
                + (opposite ? ', including the opposite phase' : '')
                + (failed ? '; ' + failed + ' could not be tiled' : '') + '.');
            try { if (graph.wake) graph.wake(); } catch (e) { }
        };

        // The type each template carries is what a chemist sorts them by, so it is the
        // section heading -- gapmers together, siRNAs together -- rather than however many
        // cards in whatever order the folder returned them.
        const TYPE = { gapmer: 'Gapmers', aso: 'Uniform ASOs', siRNA: 'siRNA' };
        const order = ['gapmer', 'aso', 'siRNA'];
        const rank = function (t) {
            const i = order.indexOf('' + (t.type || ''));
            return i < 0 ? order.length : i;
        };
        templates.sort(function (a, b) {
            return (rank(a) - rank(b)) || ('' + a.name).localeCompare('' + b.name);
        });

        const what = list.length === 1
            ? (list[0].label || 'the selected variant')
            : (list.length + ' selected variants');

        // ONE SHELF PER CHEMISTRY, holding the phase choice. Picking a chemistry is not the
        // whole question -- "around all the mutations at that location" is the other half of
        // it -- so the card walks INTO the choice rather than acting immediately. A card
        // carrying `books` is a sub-library; only a leaf performs an action.
        const phaseBooks = function (tpl) {
            return [
                {
                    title: 'This phase only',
                    badge: 'default',
                    blurb: 'Design against each selected variant on its own phase, with the '
                        + 'neighbouring variants on that phase written into the target.',
                    open: function () { return design(tpl, { opposite: false, all: false }); },
                },
                {
                    title: 'All mutations at this location',
                    badge: 'both phases',
                    blurb: 'Take the other phase into account as well, including a second '
                        + 'mutation sitting at the same position — which is refused by the '
                        + 'option above rather than guessed at.',
                    open: function () { return design(tpl, { opposite: true, all: true }); },
                },
            ];
        };

        const books = templates.map(function (t) {
            return {
                title: '' + t.name,
                section: TYPE['' + (t.type || '')] || 'Other chemistry',
                badge: '' + (t.type || ''),
                blurb: ('' + (t.description || '')).trim()
                    || 'No description recorded for this template.',
                books: function () { return phaseBooks(t); },
            };
        });

        try {
            await exec('baja/lib/shelf.js', {
                id: 'baja-allele-selective-chemistry',
                title: o.title || 'Allele selective ASOs',
                subtitle: o.subtitle
                    || (templates.length + ' chemistry templates — pick one to design against ' + what),
                books: books,
                graph: graph,
            });
        } catch (e) {
            say('Could not open the chemistry library: ' + (e && e.message ? e.message : e));
            return false;
        }
        return true;
    })();
}
