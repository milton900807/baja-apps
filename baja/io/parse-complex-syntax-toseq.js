function parseSequence(sequence) {

    const patterns = {
        'Um': 'U',
        'Gm': 'G',
        'Am': 'A',
        'Cm': 'C',
        '\\(2\'-deoxy-2\'-fluoro\\)C': 'dF-C',
        '\\(2\'-deoxy-2\'-fluoro\\)G': 'dF-G',
        '\\(2\'-deoxy-2\'-fluoro\\)A': 'dF-A',
        '\\(2\'-deoxy-2\'-fluoro\\)U': 'dF-U',
        'sp': '-'
    };

    for (const [key, value] of Object.entries(patterns)) {
        const regex = new RegExp(key, 'g');
        sequence = sequence.replace(regex, value);
    }

    return sequence;
}
