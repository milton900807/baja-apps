function () {

    const mode = 'hydrophobicity';

    const colors =
    {
        'A': 'C8C8C8',
        'R': '145AFF',
        'N': '00DCDC',
        'D': 'E60A0A',
        'C': 'E6E600',
        'Q': '00DCDC',
        'E': 'E60A0A',
        'G': '000BE0',
        'H': '8282D2',
        'I': '0F820F',
        'L': '0F820F',
        'K': '145AFF',
        'M': 'E6E600',
        'F': '3232AA',
        'P': 'DC9682',
        'S': 'FA9600',
        'T': 'FA9600',
        'W': 'B45AB4',
        'Y': '3232AA',
        'V': '0F820F'

    };

    const polarityColor =
    {
        'A': 'FFA500',
        'R': '0000FF',
        'N': '0000FF',
        'D': '0000FF',
        'C': 'A9A9A9',
        'Q': '0000FF',
        'E': '0000FF',
        'G': 'A9A9A9',
        'H': '0000FF',
        'I': 'FFA500',
        'L': 'FFA500',
        'K': '0000FF',
        'M': 'FFA500',
        'F': 'FFA500',
        'P': 'A9A9A9',
        'S': '0000FF',
        'T': '0000FF',
        'W': 'FFA500',
        'Y': 'A9A9A9',
        'V': 'FFA500'
    }

    const colors2 = [
        {
            'A': '8CFF8C',
            'R': '00007C',
            'N': 'FF7C70',
            'D': 'A00042',
            'C': 'FFFF70',
            'Q': 'FF4C4C',
            'E': '660000',
            'G': 'FFFFFF',
            'H': '7070FF',
            'I': '004C00',
            'L': '455E45',
            'K': '4747B8',
            'M': 'B8A042',
            'F': '534C52',
            'P': '525252',
            'S': 'FF7042',
            'T': 'B84C00',
            'W': '4F4600',
            'Y': '8C704C',
            'V': 'FF8CFF'

        }
    ]

    // Hydrophobic (nonpolar) vs hydrophilic (polar / charged) classification, used to
    // highlight the protein residues. Hydrophobic -> warm orange, hydrophilic -> cool
    // blue, so the two classes read at a glance.
    const HYDROPHOBIC = new Set(['A', 'V', 'L', 'I', 'M', 'F', 'W', 'P', 'G', 'C']);
    const HYDROPHILIC = new Set(['R', 'H', 'K', 'D', 'E', 'N', 'Q', 'S', 'T', 'Y']);
    const HYDROPHOBIC_COLOR = 'E8641C';   // orange  — hydrophobic
    const HYDROPHILIC_COLOR = '1E6FD9';   // blue    — hydrophilic
    const AA_OTHER_COLOR = '9AA0A6';      // grey    — stop / unknown

    return (aa) => {
        if (aa === null || aa === undefined || ('' + aa).length <= 0)
            return '000000'
        const a = ('' + aa).toUpperCase();
        if (mode === 'hydrophobicity') {
            if (HYDROPHOBIC.has(a)) return HYDROPHOBIC_COLOR;
            if (HYDROPHILIC.has(a)) return HYDROPHILIC_COLOR;
            return AA_OTHER_COLOR;
        }
        return colors[a] || AA_OTHER_COLOR;
    }

}
