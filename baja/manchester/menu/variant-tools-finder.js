function (graph) {

    return new Promise(async (resolve, reject) => {
        let count = 0;
        let t = graph.track;
        for (let trc of t) {
            if (trc != null && trc.snpindels != null)
                count += trc.snpindels.length;
        }

        graph.setMessage(" Currenty " + count + " snpindels found in the graph.")

        let SnpIndel = await exec('flexigraph/snpindel.js')
        let items = [
            {
                x: 0, y: 0, label: 'Find SNPs', ionFunction: createIonFunction(async () => {
                    let alignGraph_panel_layout = {
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        'title': ' ', 'body': ``,
                                        'width': '100%',
                                        'component':
                                        {
                                            wid: 'input-param-items',
                                            data: {
                                                'input_labels': ['Annotation term'],
                                                buttons: [{
                                                    'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {
                                                        let snpid = input_params['Annotation term']
                                                        let tracks = graph.track;
                                                        let found = []
                                                        for (let selectedTrack of tracks) {
                                                            let snps = selectedTrack.snpindels;
                                                            for (let snp of snps) {
                                                                if (JSON.stringify(snp).toLowerCase().indexOf(snpid.toLowerCase()) > 0) {
                                                                    found.push(snp);
                                                                }
                                                            }
                                                        }
                                                        graph.setMessage(" Found " + found.length + " snps with keyword : " + snpid)

                                                        let highlightmethod = (ctx, graph) => {
                                                            let tracks = graph.track;
                                                            for (let selectedTrack of tracks) {
                                                                let gwcxs = graph.Xwc(0);
                                                                if (!gwcxs)
                                                                    return;
                                                                let gwcxf = graph.Xwc(0 + graph.graph.grid.width);
                                                                if (!gwcxf)
                                                                    return;
                                                                let twcxs = selectedTrack.tgraph.Xwc(gwcxs - 2 * selectedTrack.tgraph.xi);
                                                                let twcxf = selectedTrack.tgraph.Xwc(gwcxf - 2 * selectedTrack.tgraph.xi);
                                                                let snpsv = found
                                                                for (let s of snpsv) {
                                                                    ctx.strokeStyle = 'rgba(259,0,0,0.4)';
                                                                    ctx.lineWidth = 25;

                                                                    let x = graph.X(selectedTrack.tgraph.X(s.xi))
                                                                    let y = graph.Y(selectedTrack.tgraph.Y(s.y))
                                                                    let w = 10;
                                                                    let h = 10;

                                                                    var kappa = .5522848,
                                                                        ox = (w / 2) * kappa,
                                                                        oy = (h / 2) * kappa,
                                                                        xe = x + w,
                                                                        ye = y + h,
                                                                        xm = x + w / 2,
                                                                        ym = y + h / 2;

                                                                    ctx.beginPath();
                                                                    ctx.moveTo(x, ym);
                                                                    ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                                                                    ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                                                                    ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                                                                    ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                                                                    ctx.stroke();
                                                                }

                                                            }
                                                        }
                                                        graph.highlightmethod = highlightmethod;
                                                        setTimeout(() => {

                                                            graph.highlightmethod = null;
                                                        }, 10000)

                                                        hideAllModal();
                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    }
                    showModal(alignGraph_panel_layout)

                })
            },
            {
                x: 1, y: 0, label: 'Highlight SNPs', ionFunction: createIonFunction(async () =>

                {
                    function _attrKey(v) {
                        if (v === undefined) return '__UNDEFINED__'
                        if (v === null) return '__NULL__'
                        return String(v)
                    }
                    function _attrLabel(attr, k) {
                        if (k === '__UNDEFINED__') return `${attr}: (undefined)`
                        if (k === '__NULL__') return `${attr}: (null)`
                        return `${k}`
                    }

                    function collectTrackAttrValues(graph, attr, getValueFn) {
                        const set = Object.create(null)

                        for (const t of (graph.track || [])) {
                            for (const s of (t.snpindels || [])) {
                                const v = getValueFn ? getValueFn(s) : s?.[attr]
                                set[_attrKey(v)] = true
                            }
                        }

                        return Object.keys(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                    }

                    function collectVisibleAttrValues(graph, attr, getValueFn) {
                        const set = Object.create(null)

                        for (const selectedTrack of (graph.track || [])) {
                            const gwcxs = graph.Xwc(0)
                            if (!gwcxs) continue
                            const gwcxf = graph.Xwc(0 + graph.graph.grid.width)
                            if (!gwcxf) continue

                            const twcxs = selectedTrack.tgraph.Xwc(gwcxs - 2 * selectedTrack.tgraph.xi)
                            const twcxf = selectedTrack.tgraph.Xwc(gwcxf - 2 * selectedTrack.tgraph.xi)

                            const snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf) || []
                            for (const s of snpsv) {
                                const v = getValueFn ? getValueFn(s) : s?.[attr]
                                set[_attrKey(v)] = true
                            }
                        }

                        return Object.keys(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                    }

                    function drawRoundDiamond(ctx, x, y, w, h) {
                        const kappa = 0.5522848
                        const ox = (w / 2) * kappa
                        const oy = (h / 2) * kappa
                        const xe = x + w
                        const ye = y + h
                        const xm = x + w / 2
                        const ym = y + h / 2

                        ctx.beginPath()
                        ctx.moveTo(x, ym)
                        ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y)
                        ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym)
                        ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye)
                        ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym)
                    }

                    function makeHighlightMethod(graph, attr, keyToHighlight, getValueFn) {
                        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())

                        return (ctx, graph) => {
                            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
                            const t = (now - t0) / 1000

                            const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.2)
                            const p = Math.pow(pulse, 1.7)

                            const glowBlur = 6 + 16 * p
                            const lineW = 2 + 7 * p
                            const alpha = 0.25 + 0.70 * p
                            const size = 2 + 3 * p
                            const innerAlpha = 0.55 + 0.45 * p

                            ctx.save()
                            ctx.globalAlpha = alpha
                            ctx.strokeStyle = 'red'
                            ctx.lineWidth = lineW
                            ctx.shadowColor = 'red'
                            ctx.shadowBlur = glowBlur
                            ctx.shadowOffsetX = 0
                            ctx.shadowOffsetY = 0

                            for (const selectedTrack of (graph.track || [])) {
                                const gwcxs = graph.Xwc(0)
                                if (!gwcxs) continue
                                const gwcxf = graph.Xwc(0 + graph.graph.grid.width)
                                if (!gwcxf) continue

                                const twcxs = selectedTrack.tgraph.Xwc(gwcxs - 2 * selectedTrack.tgraph.xi)
                                const twcxf = selectedTrack.tgraph.Xwc(gwcxf - 2 * selectedTrack.tgraph.xi)

                                const snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf) || []

                                for (const s of snpsv) {
                                    const v = getValueFn ? getValueFn(s) : s?.[attr]
                                    const k = _attrKey(v)
                                    if (k !== keyToHighlight) continue

                                    const x0 = graph.X(selectedTrack.tgraph.X(s.xi))
                                    const y0 = graph.Y(selectedTrack.tgraph.Y(s.y))

                                    const w = size
                                    const h = size
                                    const x = x0 - w / 2
                                    const y = y0 - h / 2

                                    drawRoundDiamond(ctx, x, y, w, h)
                                    ctx.stroke()

                                    ctx.save()
                                    ctx.globalAlpha = innerAlpha
                                    ctx.shadowBlur = Math.max(2, glowBlur * 0.35)
                                    ctx.lineWidth = Math.max(1.5, lineW * 0.55)
                                    drawRoundDiamond(ctx, x, y, w, h)
                                    ctx.stroke()
                                    ctx.restore()
                                }
                            }

                            ctx.restore()
                        }
                    }

                    function makeHighlightAllMethod(graph) {
                        const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())

                        return (ctx, graph) => {
                            const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
                            const t = (now - t0) / 1000

                            const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 1.2)
                            const p = Math.pow(pulse, 1.7)

                            const glowBlur = 6 + 16 * p
                            const lineW = 2 + 7 * p
                            const alpha = 0.25 + 0.70 * p
                            const size = 2 + 3 * p
                            const innerAlpha = 0.55 + 0.45 * p

                            ctx.save()
                            ctx.globalAlpha = alpha
                            ctx.strokeStyle = 'red'
                            ctx.lineWidth = lineW
                            ctx.shadowColor = 'red'
                            ctx.shadowBlur = glowBlur

                            for (const selectedTrack of (graph.track || [])) {
                                const gwcxs = graph.Xwc(0)
                                if (!gwcxs) continue
                                const gwcxf = graph.Xwc(0 + graph.graph.grid.width)
                                if (!gwcxf) continue

                                const twcxs = selectedTrack.tgraph.Xwc(gwcxs - 2 * selectedTrack.tgraph.xi)
                                const twcxf = selectedTrack.tgraph.Xwc(gwcxf - 2 * selectedTrack.tgraph.xi)

                                const snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf) || []
                                for (const s of snpsv) {
                                    const x0 = graph.X(selectedTrack.tgraph.X(s.xi))
                                    const y0 = graph.Y(selectedTrack.tgraph.Y(s.y))

                                    const w = size
                                    const h = size
                                    const x = x0 - w / 2
                                    const y = y0 - h / 2

                                    drawRoundDiamond(ctx, x, y, w, h)
                                    ctx.stroke()

                                    ctx.save()
                                    ctx.globalAlpha = innerAlpha
                                    ctx.shadowBlur = Math.max(2, glowBlur * 0.35)
                                    ctx.lineWidth = Math.max(1.5, lineW * 0.55)
                                    drawRoundDiamond(ctx, x, y, w, h)
                                    ctx.stroke()
                                    ctx.restore()
                                }
                            }

                            ctx.restore()
                        }
                    }

                    function showHighlightMenu(graph, {
                        durationMs = 10000,
                        attrs = ['type', 'structure', 'clinsig', 'clindn', 'quality', 'strand', 'phase', 'phaseset'],
                        getters = {},
                        valuesFrom = 'track'
                    } = {}) {

                         const attrGetters = {
                            type: s => s?.type,
                            structure: s => s?.structure,
                            clinsig: s => s?.clinsig,
                            clindn: s => s?.clindn,
                            quality: s => s?.quality,
                            strand: s => s?.strand,
                            phase: s => s?.phase,
                            phaseset: s => s?.phaseset,
                            ...getters
                        }

                        function setHighlight(method) {
                            graph.highlightmethod = method
                            if (graph._highlightTimer) clearTimeout(graph._highlightTimer)
                            graph._highlightTimer = setTimeout(() => {
                                graph.highlightmethod = null
                                graph._highlightTimer = null
                                graph.redraw?.()
                            }, durationMs)
                            graph.redraw?.()
                        }

                        function clearHighlight() {
                            if (graph._highlightTimer) clearTimeout(graph._highlightTimer)
                            graph._highlightTimer = null
                            graph.highlightmethod = null
                            graph.redraw?.()
                        }

                        function showValuesMenu(attr) {

                            const getValueFn = attrGetters[attr]
                            const keys =
                                valuesFrom === 'visible'
                                    ? collectVisibleAttrValues(graph, attr, getValueFn)
                                    : collectTrackAttrValues(graph, attr, getValueFn)

                            const valueMenu = []

                            valueMenu.push({
                                label: `← Back`,
                                click: () => showAttrMenu()
                            })

                            valueMenu.push({
                                label: `Highlight ALL (visible)`,
                                click: () => setHighlight(makeHighlightAllMethod(graph))
                            })

                            valueMenu.push({
                                label: `Clear highlight`,
                                click: () => clearHighlight()
                            })

                            for (const k of keys) {
                                valueMenu.push({
                                    label: _attrLabel(attr, k),
                                    click: () => setHighlight(makeHighlightMethod(graph, attr, k, getValueFn))
                                })
                            }

                            graph.showSideMenu(valueMenu)
                        }

                        function showAttrMenu() {
                            const attrMenu = []

                            attrMenu.push({
                                label: `Highlight ALL (visible)`,
                                click: () => setHighlight(makeHighlightAllMethod(graph))
                            })

                            attrMenu.push({
                                label: `Clear highlight`,
                                click: () => clearHighlight()
                            })

                            for (const attr of attrs) {
                                attrMenu.push({
                                    label: ` ${attr}`,
                                    click: () => showValuesMenu(attr)
                                })
                            }

                            graph.showSideMenu(attrMenu)
                        }

                        showAttrMenu()
                    }

                    showHighlightMenu(graph)

                })
            },

            {
                x: 2, y: 0, label: 'Clear all SNP/Indels', ionFunction: createIonFunction(async () => {

                    let confirm = await exec('baja/lib/confirm.js', 'Remove all snps?', async () => {

                        for (let t of graph.track) {
                            t.snpindels = []
                        }
                    })
                    await showModal(confirm)

                }
                )
            },
            {
                x: 3, y: 0, label: 'Filter SNPs', ionFunction: createIonFunction(async () => {

                    {
                        let found = 0
                        for (let t of graph.track) {
                            if (t.snpindels) found += t.snpindels.length
                        }
                        if (found <= 0) {
                            infoPrompt("No SNPs found")
                            return
                        }

                        function _bucketKeyForValue(v) {
                            if (v === undefined) return '__UNDEFINED__'
                            if (v === null) return '__NULL__'
                            return String(v)
                        }

                        function _bucketLabel(attr, k) {
                            if (k === '__UNDEFINED__') return `${attr}: (undefined)`
                            if (k === '__NULL__') return `${attr}: (null)`
                            return `${k}`
                        }

                        function collectTrackAttrValues(graph, attr, getValueFn) {
                            const set = Object.create(null)
                            for (const t of (graph.track || [])) {
                                for (const s of (t.snpindels || [])) {
                                    const v = getValueFn ? getValueFn(s) : s?.[attr]
                                    set[_bucketKeyForValue(v)] = true
                                }
                            }
                            return Object.keys(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                        }

                        function removeByAttrKey(graph, attr, key, getValueFn) {
                            let removed = 0

                            for (const t of (graph.track || [])) {
                                if (!Array.isArray(t.snpindels) || t.snpindels.length === 0) continue

                                const arr = t.snpindels
                                for (let i = arr.length - 1; i >= 0; i--) {
                                    const s = arr[i]
                                    const v = getValueFn ? getValueFn(s) : s?.[attr]
                                    const k = _bucketKeyForValue(v)
                                    if (k === key) {
                                        arr.splice(i, 1)
                                        removed++
                                    }
                                }
                            }

                            return removed
                        }

                        const attrGetters = {
                            type: s => s?.type,
                            structure: s => s?.structure,
                            clinsig: s => s?.clinsig,
                            clindn: s => s?.clindn,
                            quality: s => s?.quality,
                            strand: s => s?.strand,
                            phase: s => s?.phase,
                            phaseset: s => s?.phaseset,
                        }

                        const filterAttrs = ['type', 'structure', 'clinsig', 'clindn', 'quality', 'strand', 'phase', 'phaseset']

                        function showValuesMenu(attr) {
                            const getValueFn = attrGetters[attr]
                            const keys = collectTrackAttrValues(graph, attr, getValueFn)

                            const menu = []

                            menu.push({
                                label: '← Back',
                                click: () => showRemoveByAttrMenu()
                            })

                            menu.push({
                                label: 'Remove ALL',
                                click: () => confirmThen(`Remove ALL ${countAll()} SNPs/indels from every track? This cannot be undone.`, () => {
                                    let removed = 0
                                    for (const t of (graph.track || [])) {
                                        if (Array.isArray(t.snpindels) && t.snpindels.length) {
                                            removed += t.snpindels.length
                                            t.snpindels.length = 0
                                        }
                                    }
                                    infoPrompt?.(`Removed ${removed}`)
                                    graph.redraw?.()
                                })
                            })

                            for (const k of keys) {
                                menu.push({
                                    label: `${_bucketLabel(attr, k)}`,
                                    click: () => confirmThen(`Remove all SNPs/indels where ${attr} = "${_bucketLabel(attr, k)}"? This cannot be undone.`, () => {
                                        const removed = removeByAttrKey(graph, attr, k, getValueFn)
                                        if (removed === 0) infoPrompt?.('Nothing removed')
                                        else infoPrompt?.(`Removed ${removed}`)
                                        graph.redraw?.()

                                        showValuesMenu(attr)
                                    })
                                })
                            }

                            graph.showSideMenu(menu)
                        }

                        // Confirm (Yes/Cancel) before running a destructive removal.
                        async function confirmThen(message, fn) {
                            try {
                                const c = await exec('baja/lib/confirm.js', message, () => { fn(); });
                                showModal(c);
                            } catch (e) { fn(); }
                        }

                        const countAll = () => (graph.track || []).reduce((n, t) => n + ((Array.isArray(t.snpindels) && t.snpindels.length) || 0), 0);

                        // Pick an attribute to remove SNPs/indels by -> its distinct values.
                        function showRemoveByAttrMenu() {
                            const menu = [{ label: '← Back', click: () => showAttrMenu() }]
                            for (const attr of filterAttrs) {
                                menu.push({
                                    label: `${attr} ▸`,
                                    click: () => showValuesMenu(attr)
                                })
                            }
                            graph.showSideMenu(menu)
                        }

                        function showAttrMenu() {
                            const menu = []

                            menu.push({
                                label: 'Remove ALL SNPs/indels',
                                click: () => confirmThen(`Remove ALL ${countAll()} SNPs/indels from every track? This cannot be undone.`, () => {
                                    let removed = 0
                                    for (const t of (graph.track || [])) {
                                        if (Array.isArray(t.snpindels) && t.snpindels.length) {
                                            removed += t.snpindels.length
                                            t.snpindels.length = 0
                                        }
                                    }
                                    infoPrompt?.(`Removed ${removed}`)
                                    graph.redraw?.()
                                })
                            })

                            // Remove by attribute (type / clinical significance / consequence / …).
                            menu.push({
                                label: 'Remove by attribute ▸',
                                click: () => showRemoveByAttrMenu()
                            })

                            graph.showSideMenu(menu)
                        }

                        showAttrMenu()
                    }
                }
                )
            },
        ]

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
                'width': 600,
                'grid': {
                    xmin: 0,
                    xmax: 6,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': items
            }
        }

        return resolve(button_canvas)
    })

}
