function (pt, plates, opts) {
    // AUTO CELL TYPES: pick how each cell of a table should be displayed.
    //
    //   await exec('baja/plate/views/auto-cell-types.js', pt, [plate, ...], { cells, overwrite })
    //
    // Run after a Build puts tables on the canvas, and from the Cell data type library
    // ("Detect automatically"). For every data cell -- not the header row, not the label
    // column -- it reads four things, most explicit first:
    //
    //   1. a Unit column in the same row ("USD", "fraction", "patients", "years", "ratio")
    //   2. the column header ("Price", "Success_Rate", "Addressable_Patients", "Year")
    //   3. the row label, for Label | Value tables ("Phase_I_Cost", "Start_Date")
    //   4. the values themselves: dates, links, true/false, whole numbers, fractions,
    //      very small or very large numbers
    //
    // A type already on a cell is kept -- one the model builder set from its units, or one
    // somebody chose -- unless opts.overwrite. A skin name the display factory does not know
    // (the builder used to set units such as "patients" as if they were types) counts as none.
    //
    // opts.cells limits the pass to those cells (the library's selection). Returns
    // { tables, cells, byType }.
    return (async () => {
        const WellDisplay = await exec('baja/plate/views/well-display-factory');
        const o = opts || {};
        const only = Array.isArray(o.cells) && o.cells.length ? new Set(o.cells) : null;
        const list = (Array.isArray(plates) ? plates : [plates]).filter(p => p && Array.isArray(p.wells) && p.wells.length);
        const out = { tables: 0, cells: 0, byType: {} };

        // ---- reading values -------------------------------------------------------------
        const str = (v) => (v == null ? '' : ('' + v)).trim();
        const numOf = (v) => {
            if (typeof v === 'number') return isFinite(v) ? v : NaN;
            const s = str(v).replace(/[$,\s]/g, '').replace(/%$/, '');
            return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? +s : NaN;
        };
        const isDate = (v) => /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(str(v));
        const isUrl = (v) => /^(https?:\/\/|www\.)\S+$/i.test(str(v));
        const isBool = (v) => typeof v === 'boolean' || /^(true|false)$/i.test(str(v));
        const hasFormula = (plate, w, c, r) => {
            try { if (w && typeof w.formula === 'string' && w.formula.trim()) return true; } catch (e) { }
            try { return !!(plate.formulaTextForWell && plate.formulaTextForWell(w)); } catch (e) { return false; }
        };

        // ---- words that name a kind of quantity ---------------------------------------
        // Matched against underscore/space separated words, so "Price" matches Peak_Price
        // but not "Priceless". Fractions are tried before money: Market_Share is a share.
        const words = (s) => str(s).toLowerCase().split(/[^a-z0-9%$]+/).filter(Boolean);
        const any = (ws, set) => ws.some(w => set.has(w));
        const W = (a) => new Set(a.split(' '));
        const FRACTION = W('share rate rates percent percentage pct % probability prob fraction growth margin yield efficiency compliance penetration discount conversion churn retention utilization coverage pos likelihood');
        const MONEY = W('usd $ cost costs price prices revenue revenues sales budget budgets capex opex cogs profit profits income expense expenses spend spending cash funding fee fees salary wage wages capital investment payment payments dollar dollars ebitda arpu tam sam som market markets');
        const COUNT = W('patients patient people persons count counts number subjects cases population prevalence incidence headcount employees staff doses visits sites samples reads units members users customers households births deaths');
        const YEARW = W('year years fy yr');
        const DURATION = W('years months weeks days duration time');
        const RATIO = W('ratio multiple fold x multiplier');
        const CHANGE = W('change delta difference diff variance minus');
        const PVAL = W('pvalue p_value pval fdr qvalue');
        const STATUSW = W('status state');
        const BADGEW = W('type category kind class confidence plausibility priority tier grade risk phase stage group');
        const STATUS_VALUES = W('done complete completed pending blocked active inactive open closed yes no ok failed passed running queued planned ongoing');

        // A Unit column's word decides outright.
        const fromUnit = (u) => {
            const s = str(u).toLowerCase();
            if (!s) return null;
            if (/usd|\$|dollar|eur|gbp/.test(s)) return 'DOLLAR';
            if (/fraction|percent|%/.test(s)) return 'PERCENT';
            if (/ratio|multiple|fold/.test(s)) return 'MULTIPLE';
            if (/patients|people|count|cases|subjects|units|doses|persons/.test(s)) return 'INTEGER';
            if (/year|month|week|day/.test(s)) return 'NUMBER';
            return null;
        };
        // A header or row label: a type when its words name a quantity, else null.
        const fromName = (name) => {
            const ws = words(name);
            if (!ws.length) return null;
            const joined = ws.join('_');
            if (/(^|_)(p_?value|pval|fdr|q_?value)(_|$)/.test(joined)) return 'SCIENTIFIC';
            if (/(^|_)required_to_date(_|$)|(^|_)to_date_(usd|cost|spend)/.test(joined)) return 'DOLLAR';
            if (any(ws, FRACTION)) return 'PERCENT';
            if (any(ws, RATIO)) return 'MULTIPLE';
            if (any(ws, MONEY)) return 'DOLLAR';
            if (any(ws, CHANGE)) return 'DELTA';
            if (ws.length <= 3 && any(ws, YEARW) && !any(ws, W('per to'))) return 'YEAR?';   // confirmed by the values
            if (any(ws, COUNT)) return 'INTEGER';
            if (any(ws, DURATION)) return 'NUMBER';
            return null;
        };
        // A column's values, as a profile.
        const profile = (vals) => {
            const p = { n: 0, num: 0, int: 0, unit: 0, date: 0, url: 0, bool: 0, text: 0, small: 0, big: 0, years: 0, distinct: new Set(), maxLen: 0 };
            for (const v of vals) {
                const s = str(v);
                if (s === '') continue;
                p.n++;
                if (isDate(v)) { p.date++; continue; }
                if (isUrl(v)) { p.url++; continue; }
                if (isBool(v)) { p.bool++; continue; }
                const n = numOf(v);
                if (isNaN(n)) { p.text++; p.distinct.add(s.toLowerCase()); p.maxLen = Math.max(p.maxLen, s.length); continue; }
                p.num++;
                if (Math.abs(n - Math.round(n)) < 1e-9) p.int++;
                if (Math.abs(n) <= 1.5) p.unit++;
                if (n !== 0 && Math.abs(n) < 1e-3) p.small++;
                if (Math.abs(n) >= 1e12) p.big++;
                if (Number.isInteger(n) && n >= 1900 && n <= 2200) p.years++;
            }
            return p;
        };
        // What the values alone suggest, when no name did.
        const fromValues = (p) => {
            if (!p.n) return null;
            if (p.date === p.n) return 'DATE';
            if (p.url === p.n) return 'LINK';
            if (p.bool === p.n) return 'BOOL';
            if (p.num === p.n) {
                if (p.small + p.big > 0 && p.small + p.big >= p.num / 2) return 'SCIENTIFIC';
                if (p.int === p.num) return 'INTEGER';
                return 'NUMBER';
            }
            return null;
        };
        // A name's type, checked against the values it would apply to.
        const NUMERIC = new Set(['DOLLAR', 'PERCENT', 'INTEGER', 'NUMBER', 'MULTIPLE', 'DELTA', 'SCIENTIFIC', 'YEAR?']);
        const settle = (t, p) => {
            if (!t) return null;
            if (!NUMERIC.has(t)) return t;         // BADGE, STATUS, LINK, DATE, BOOL: chosen from the values already
            if (t === 'YEAR?') return (p.num && p.years === p.num) ? 'YEAR' : (p.num ? 'NUMBER' : null);
            if (!p.n) return t;                    // formulas not computed yet: trust the name
            if (p.date === p.n) return 'DATE';     // a "Date" column is dates whatever else it says
            if (p.num < p.n / 2) return null;      // mostly text: not a number column after all
            if (t === 'PERCENT' && p.unit < p.num) return p.int === p.num ? 'INTEGER' : 'NUMBER';   // 45 for 45% would read 4500%
            if (t === 'INTEGER' && p.int < p.num) return 'NUMBER';
            return t;
        };

        for (const plate of list) {
            const cols = plate.wells.length;
            const rows = Math.max(0, ...plate.wells.map(c => (c ? c.length : 0)));
            if (cols < 2 || rows < 2) continue;
            const header = (c) => (plate.wells[c] && plate.wells[c][0]) ? str(plate.wells[c][0].value) : '';
            const label = (r) => (plate.wells[0] && plate.wells[0][r]) ? str(plate.wells[0][r].value) : '';
            let unitCol = -1;
            for (let c = 1; c < cols; c++) if (/^units?$/i.test(header(c))) { unitCol = c; break; }
            // Label | Value tables: the row label says what each value is.
            const labelValue = cols <= 4 && /^(value|values|amount)$/i.test(header(1));
            let touched = 0;

            for (let c = 1; c < cols; c++) {
                if (c === unitCol) continue;
                const col = plate.wells[c] || [];
                const vals = [];
                for (let r = 1; r < rows; r++) if (col[r]) vals.push(col[r].value);
                const cp = profile(vals);
                const h = header(c);
                // Short categorical text under a category-like header: badges.
                const hw = words(h);
                let colType = null;
                if (cp.n && cp.text === cp.n && cp.distinct.size <= 8 && cp.maxLen <= 24) {
                    if (any(hw, STATUSW) || [...cp.distinct].every(v => STATUS_VALUES.has(v))) colType = 'STATUS';
                    else if (any(hw, BADGEW)) colType = 'BADGE';
                }
                if (!colType) colType = settle(fromName(h), cp) || fromValues(cp);

                for (let r = 1; r < rows; r++) {
                    const w = col[r];
                    if (!w) continue;
                    if (only && !only.has(w)) continue;
                    const cur = w.skin_type;
                    const known = cur && cur !== 'default' && WellDisplay[cur];
                    if (known && !o.overwrite) continue;
                    if (cur === 'RowHeader' || cur === 'ColumnHeader') continue;
                    const v = w.value;
                    const empty = str(v) === '' && !hasFormula(plate, w, c, r);
                    if (empty) continue;
                    const cellP = profile([v]);
                    let t = null;
                    // 1. the row's unit
                    if (unitCol > 0 && plate.wells[unitCol] && plate.wells[unitCol][r]) t = settle(fromUnit(plate.wells[unitCol][r].value), cellP);
                    // 2-3. the column header; the row label where the header says nothing
                    if (!t && labelValue) t = settle(fromName(label(r)), cellP);
                    if (!t) t = colType ? settle(colType, cellP) || null : null;
                    if (!t && !labelValue) t = settle(fromName(label(r)), cellP);
                    // 4. the value itself
                    if (!t) t = fromValues(cellP);
                    if (!t || !WellDisplay[t]) continue;
                    if (t === cur) continue;
                    try { w.setWellType(t); } catch (e) { continue; }
                    touched++;
                    out.byType[t] = (out.byType[t] || 0) + 1;
                }
            }
            if (touched) { out.tables++; out.cells += touched; }
        }
        return out;
    })();
}
