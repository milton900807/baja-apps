function () {

    return new Promise(async (resolve, reject) => {

        function polymerSyntaxToHelm(input, options = {}) {
            const polymerName = options.polymerName || "RNA1";
            const polymerType = options.polymerType || "RNA";

            const defaultMonomerTemplates = {
                lna: {
                    sp: (base) => "[LR](" + base + ")[sP]",
                    p: (base) => "[LR](" + base + ")P",
                    none: (base) => "[LR](" + base + ")"
                },
                d: {
                    sp: (base) => "[dR](" + base + ")[sP]",
                    p: (base) => "[dR](" + base + ")P",
                    none: (base) => "[dR](" + base + ")"
                }
            };

            const monomerTemplates = options.monomerTemplates || defaultMonomerTemplates;

            const segmentRegex = /\[\(([ACGTU])\)([A-Za-z0-9_+-]+)(?:\.([A-Za-z0-9_+-]+)\.?)?\]\{(\d+)\}/g;

            const residues = [];
            let match;

            while ((match = segmentRegex.exec(input)) !== null) {
                const [, base, sugarRaw, linkerRaw, countRaw] = match;

                const sugar = sugarRaw.toLowerCase();
                const linker = linkerRaw ? linkerRaw.toLowerCase() : "none";
                const count = Number(countRaw);

                const sugarTemplates = monomerTemplates[sugar];
                if (!sugarTemplates) {
                    throw new Error(`Unknown sugar/modifier "${sugarRaw}"`);
                }

                const template = sugarTemplates[linker];
                if (!template) {
                    throw new Error(`Unknown linker "${linkerRaw || "none"}" for sugar "${sugarRaw}"`);
                }

                for (let i = 0; i < count; i++) {
                    residues.push(template(base));
                }
            }

            if (residues.length === 0) {
                throw new Error("No valid polymer segments were parsed from the input.");
            }

            return `${polymerType}1{${residues.join(".")}}$$$$`;
        }
        resolve(polymerSyntaxToHelm)
    })

}
