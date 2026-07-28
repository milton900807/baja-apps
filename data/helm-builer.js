function parseHELM(helmString) {
    const parts = helmString.split('$$$');
    const sequences = parts[0].split('|').filter(part => part.startsWith("RNA"));
    const pairs = parts[1].split('|');
    return { sequences, pairs };
}

function parseMonomers(sequence) {

    const monomers = sequence.match(/{(.*?)}/)[1].split('.');
    return monomers.map(monomer => {

        const backbone = monomer.match(/m\((.*?)\)/)[1];
        const branches = monomer.match(/\[(.*?)\]/g) || [];
        const rGroups = branches.map(branch => branch.replace(/[\[\]]/g, ''));
        return { backbone, rGroups };
    });
}

function constructMolecule(monomers) {
    return monomers.map(({ backbone, rGroups }) => {

        const rGroupConnections = rGroups.join('-connect-');
        return `${backbone}${rGroupConnections ? ' with ' + rGroupConnections : ''}`;
    }).join(' -> ');
}

function applyPairs(molecule1, molecule2, pairs) {
    pairs.forEach(pair => {
        const details = pair.split(',');
        const pairInfo = details[2];
        console.log(`Applying pair between ${details[0]} and ${details[1]}: ${pairInfo}`);
    });
}

function main(helmString) {
    const { sequences, pairs } = parseHELM(helmString);
    const molecules = sequences.map(seq => {
        const monomers = parseMonomers(seq);
        return constructMolecule(monomers);
    });
    if (molecules.length >= 2) {
        applyPairs(molecules[0], molecules[1], pairs);
    }
}

const helmInput = "RNA1{m(C)[sp].[fl2r](T)[sp].m(C)p.m(G)p.m(T)p.[fl2r](C)p.[fl2r](A)p.[fl2r](G)p.[fl2r](C)p.m(T)p.m(A)p.m(G)p.[fl2r](C)p.m(G)p.[fl2r](T)p.m(G)p.m(G)p.m(C)p.m(G)p.m(A)p.m(G)p.m(C)}|RNA2{m(A)[sp].m(G)[sp].m(C)p.m(T)p.m(C)p.m(G)p.[fl2r](C)p.m(C)p.[fl2r](A)p.[fl2r](C)p.[fl2r](G)p.m(C)p.m(T)p.m(A)p.m(G)p.m(C)p.m(T)p.m(G)p.m(A)p.m(C)p.m(G)}$RNA1,RNA2,2:pair-65:pair|RNA1,RNA2,5:pair-62:pair|...";
main(helmInput);
