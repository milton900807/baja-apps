function (pm, payload, title) {

    // Place a workbook (model) template on the current canvas.
    //
    //   await exec('baja/analytics/templates/place-model', pm, payloadString, 'qPCR ΔΔCt')
    //
    // `payload` is the stored string (zlib bytes, one char each) -- the rule_value that
    // /get-script or /analytics-templates/item returns. This is the click handler from
    // baja/table/datayak-analytics-models.js, factored out so the template browser can feed it a
    // payload from either library, with one fix: when the saved workbook is not already a single
    // package, the old code placed the new package with `pt.panToNextSpot(...)` and
    // `pt.addNextAvailableX(...)`, but `pt` is not defined in that function, so those templates
    // threw a ReferenceError and never appeared. It now places onto the target canvas.
    // Plain JS globals from lib/core.js: exec, __decompress, compressString.

    const target = pm && pm.plateTrack;

    function filterFormulasByAllTableNames(formulas, allowedTableNames) {
        const allowed = new Set(allowedTableNames);
        const tableRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\[/g;
        const onlyAllowed = str => [...('' + str).matchAll(tableRegex)].map(m => m[1]).every(t => allowed.has(t));
        const out = {};
        for (const [k, v] of Object.entries(formulas || {})) {
            if (onlyAllowed(k) && onlyAllowed(v)) out[k] = v;
        }
        return out;
    }

    // Wrap a loaded workbook into one package plate. Placing it is left to setPlateCenter below
    // (which calls addNextAvailableX), so it is added once; the old handler added it here too and
    // then hit "A table with that name already exists" on the second add.
    async function packageWorkbook(source, name) {
        const ggs = source.toJSON();
        const names = source.getAllObjects().map(o => o.name);
        ggs.formulas = filterFormulasByAllTableNames(ggs.formulas, names);
        ggs.root = source.getAllPlates();
        ggs.m_plots = source.getAllPlots();
        ggs.glyphs = source.getAllGlyphs();
        const json = JSON.stringify(ggs, (key, value) =>
            (key != null && ('' + key).toLowerCase().startsWith('_')) ? null : value);

        const bytes = compressString(json);
        let packed = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            packed += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        }
        source.reset();

        const Plate = await exec('baja/plate/plate.js');
        const plate = new Plate(name, 1, 1);
        plate.plateType = 'package';
        plate.completeNullValues();
        plate.setWellValue(0, 0, name);
        plate.wells[0][0].properties['package'] = packed;
        plate.setWellType(0, 0, 'PACKAGE');
        plate.grid.width = target.grid.worldWidth(650);
        plate.grid.height = target.grid.worldHeight(230);
        return plate;
    }

    return new Promise(async (resolve, reject) => {
        try {
            if (!target) throw new Error('Open a Baja Analytics workbook first.');
            if (!payload) throw new Error('The template is empty.');
            target.setMessage(' Loading ' + (title || 'template') + '… ');

            let doc = __decompress(payload);
            if (doc && doc.plateTrack) doc = doc.plateTrack;
            if (!doc || !doc.root) throw new Error('This template is not a workbook.');

            const PlateTrack = await exec('baja/plate/plate-track');
            const loaded = Object.assign(new PlateTrack(), doc);
            loaded.copyFromJSON(doc);
            loaded.name = title || doc.name || 'template';

            const folder = (loaded.root.length === 1 && loaded.root[0].plateType === 'package')
                ? loaded.root[0]
                : await packageWorkbook(loaded, loaded.name);
            folder.grid.width = target.grid.worldWidth(250);
            folder.grid.height = target.grid.worldHeight(100);

            setTimeout(async () => {
                await target.panToNextSpot(folder.grid.width);
                setTimeout(() => {
                    try { target.grid.rescale(); } catch (e) { }
                    target.setPlateCenter(folder);
                    target.setMessage(' Click on the folder to open it… ', 2);
                }, 1400);
            }, 1000);
            try { target.generateTableMenu(); } catch (e) { }
            resolve(folder);
        } catch (e) {
            try { target && target.setMessage(' ' + (e && e.message ? e.message : e) + ' ', 4); } catch (e2) { }
            reject(e);
        }
    });
}
