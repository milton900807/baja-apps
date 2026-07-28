function (path, config) {


    return new Promise(async (resolve, reject) => {




        // const cleanedSvg = removeLongTextElements(result.svg);

        function removeLongTextElements(svgString, maxLength = 10) {
            try {
                const parser = new DOMParser();
                const doc = parser.parseFromString(svgString, "image/svg+xml");

                const textElements = doc.querySelectorAll("text");

                textElements.forEach((el) => {
                    const textContent = (el.textContent || "").trim();

                    if (textContent.length > maxLength) {
                        el.remove();
                    }
                });

                const serializer = new XMLSerializer();
                return serializer.serializeToString(doc);
            } catch (err) {
                // If anything breaks, just return original SVG
                return svgString;
            }
        }

        function parseChainObjectsForHairpinNoText(input) {
            const items = Array.isArray(input) ? input : (input?.shapes || []);
            if (!Array.isArray(items)) {
                throw new Error("Expected an array of drawing objects or { shapes: [...] }");
            }
            debugger;

            const EPS_Y_CLUSTER = 28;
            const EPS_X_MATCH = 18;
            const BASE_OFFSET_MIN = 28;
            const BASE_OFFSET_MAX = 80;

            const SUGAR_BY_COLOR = {
                "#E8F4FD|#1D4ED8": "RNA",
                "#F3F4F6|#4B5563": "DNA",
                "#ECFDF3|#16A34A": "2'-OMe",
                "#FEF3C7|#D97706": "2'-F",
                "#FCE7F3|#BE185D": "LNA",
                "#F3E8FF|#7C3AED": "MOE",
                "#E0F2FE|#0891B2": "GNA",
                "#FFF1F2|#E11D48": "cEt"
            };

            const BASE_BY_FILL = {
                "#2563EB": "A",
                "#059669": "G",
                "#7C3AED": "C",
                "#DC2626": "Y" // Y = pyrimidine, resolve later to U or T from chemistry
            };

            const BACKBONE_BY_FILL = {
                "#6B7280": "PO",
                "#B45309": "PS",
                "#7C2D12": "PS2"
            };

            function normHex(v) {
                return typeof v === "string" ? v.trim().toUpperCase() : null;
            }

            function isFiniteNum(v) {
                return typeof v === "number" && Number.isFinite(v);
            }

            function getStyle(obj) {
                return obj?.style || {};
            }

            function getCircleOrEllipseCenter(group) {
                if (!group || group.type !== "svg_group" || !Array.isArray(group.shapes)) return null;
                for (const s of group.shapes) {
                    if (s.type === "circle" && isFiniteNum(s.cx) && isFiniteNum(s.cy)) {
                        return {
                            x: s.cx,
                            y: s.cy,
                            fill: normHex(getStyle(s).fill),
                            stroke: normHex(getStyle(s).stroke)
                        };
                    }
                    if (s.type === "ellipse" && isFiniteNum(s.cx) && isFiniteNum(s.cy)) {
                        return {
                            x: s.cx,
                            y: s.cy,
                            fill: normHex(getStyle(s).fill),
                            stroke: normHex(getStyle(s).stroke)
                        };
                    }
                }
                return null;
            }

            function clusterSorted(values, eps = EPS_Y_CLUSTER) {
                const out = [];
                for (const v of values.sort((a, b) => a - b)) {
                    const last = out[out.length - 1];
                    if (!last || Math.abs(last.center - v) > eps) {
                        out.push({ center: v, values: [v] });
                    } else {
                        last.values.push(v);
                        last.center = last.values.reduce((s, x) => s + x, 0) / last.values.length;
                    }
                }
                return out;
            }

            function chemistryFromResidues(residues) {
                if (residues.some(r => r.sugar === "DNA")) return "DNA";
                return "RNA";
            }

            // 1) Pull out monomers by geometry/color only.
            const monomers = items
                .filter(x => x?.type === "svg_group")
                .map(group => {
                    const c = getCircleOrEllipseCenter(group);
                    if (!c) return null;
                    const sugar = SUGAR_BY_COLOR[`${c.fill}|${c.stroke}`];
                    if (!sugar) return null;
                    return { x: c.x, y: c.y, sugar };
                })
                .filter(Boolean);

            if (monomers.length === 0) return [];

            // 2) Cluster by Y to find strand rows.
            const yClusters = clusterSorted(monomers.map(m => m.y));
            const rows = yClusters.map(cluster => {
                const members = monomers
                    .filter(m => Math.abs(m.y - cluster.center) <= EPS_Y_CLUSTER)
                    .sort((a, b) => a.x - b.x);
                return {
                    y: cluster.center,
                    monomers: members
                };
            }).filter(r => r.monomers.length >= 3);

            // 3) Pull out candidate base glyphs, but decode bases from fill color only.
            const baseGlyphs = items
                .filter(x => x?.type === "text")
                .map(t => ({
                    x: t.x,
                    y: t.y,
                    fontSize: t.fontSize,
                    fill: normHex(getStyle(t).fill),
                    baseCode: BASE_BY_FILL[normHex(getStyle(t).fill)] || null
                }))
                .filter(t =>
                    isFiniteNum(t.x) &&
                    isFiniteNum(t.y) &&
                    isFiniteNum(t.fontSize) &&
                    t.fontSize >= 18 &&
                    !!t.baseCode
                );

            // 4) Pull out backbone label glyphs, but decode from fill color only.
            const backboneGlyphs = items
                .filter(x => x?.type === "text")
                .map(t => ({
                    x: t.x,
                    y: t.y,
                    fontSize: t.fontSize,
                    fill: normHex(getStyle(t).fill),
                    backbone: BACKBONE_BY_FILL[normHex(getStyle(t).fill)] || null
                }))
                .filter(t =>
                    isFiniteNum(t.x) &&
                    isFiniteNum(t.y) &&
                    isFiniteNum(t.fontSize) &&
                    t.fontSize <= 13 &&
                    !!t.backbone
                );

            function nearestBaseForMonomer(monomer, rowY) {
                const candidates = baseGlyphs.filter(b =>
                    Math.abs(b.x - monomer.x) <= EPS_X_MATCH &&
                    Math.abs(b.y - rowY) >= BASE_OFFSET_MIN &&
                    Math.abs(b.y - rowY) <= BASE_OFFSET_MAX
                );
                if (!candidates.length) return null;
                candidates.sort((a, b) => Math.abs(a.x - monomer.x) - Math.abs(b.x - monomer.x));
                return candidates[0];
            }

            function nearestBackboneForSegment(midX, rowY) {
                const candidates = backboneGlyphs.filter(b =>
                    Math.abs(b.x - midX) <= 16 &&
                    Math.abs(b.y - rowY) >= 10 &&
                    Math.abs(b.y - rowY) <= 28
                );
                if (!candidates.length) return null;
                candidates.sort((a, b) => Math.abs(a.x - midX) - Math.abs(b.x - midX));
                return candidates[0].backbone;
            }

            const chains = rows.map((row, rowIndex) => {
                const visualResidues = row.monomers.map((m, i) => {
                    const baseGlyph = nearestBaseForMonomer(m, row.y);
                    return {
                        idxVisual: i,
                        x: m.x,
                        y: m.y,
                        sugar: m.sugar,
                        baseCode: baseGlyph?.baseCode || "N",
                        baseY: baseGlyph?.y ?? null
                    };
                });

                // If most bases are above the sugar row, this row was drawn with show_bases_above=True.
                // In your duplex renderer that is the row which is typically visually reversed relative
                // to actual 5'->3' order, so flip it back.
                const aboveCount = visualResidues.filter(r => r.baseY != null && r.baseY < row.y).length;
                const belowCount = visualResidues.filter(r => r.baseY != null && r.baseY > row.y).length;
                const basesAbove = aboveCount > belowCount;

                let actualResidues = visualResidues.slice();
                if (basesAbove) {
                    actualResidues.reverse();
                }

                const roughChemistry = chemistryFromResidues(actualResidues);

                actualResidues = actualResidues.map((r, i, arr) => {
                    const canonical_base =
                        r.baseCode === "Y"
                            ? (roughChemistry === "DNA" ? "T" : "U")
                            : r.baseCode;

                    const next = arr[i + 1];
                    const backbone_to_next = next
                        ? (nearestBackboneForSegment((r.x + next.x) / 2, row.y) || "PO")
                        : null;

                    return {
                        index: i + 1,
                        base: canonical_base,
                        canonical_base,
                        sugar: r.sugar,
                        backbone_to_next
                    };
                });

                const chemistry = chemistryFromResidues(actualResidues);
                const sequence_5to3 = actualResidues
                    .map(r => {
                        if (r.canonical_base === "Y") return chemistry === "DNA" ? "T" : "U";
                        return r.canonical_base;
                    })
                    .join("");

                return {
                    hairpin_input: {
                        sequence: sequence_5to3,
                        chemistry,
                        min_loop_size: 3
                    },
                    chain_object: {
                        strand_type: "single",
                        chemistry,
                        chemistry_recipe: "Parsed from drawing object using geometry and color only",
                        seed_sequence: "",
                        sequence_source: "explicit",
                        strands: [
                            {
                                name: `chain_${rowIndex + 1}`,
                                sequence_5to3,
                                residues: actualResidues
                            }
                        ]
                    },
                    meta: {
                        row_index: rowIndex + 1,
                        y: row.y,
                        bases_above: basesAbove,
                        residue_count: actualResidues.length
                    }
                };
            });

            return chains.filter(c => c.hairpin_input.sequence.length > 0);

        }
        return resolve(parseChainObjectsForHairpinNoText)

    })

}