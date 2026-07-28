function () {

    exec('bio/align/swaligner.js').then(SWaligner => {
        log(' --- ')
        const defaultAligner = SWaligner();
        const customAligner = SWaligner({
            gapScoreFunction: x => x / 2,
            gapSymbol: '~',
        })

        const defaultResult = defaultAligner.align('GCATATGATAAAGCTGTGGCTTCATTTAAGCATGCTCTAAAGAATGGTGACATTTGTGAAACTTCGGGTATCACTTTCATAATGCTGGTGGGACCAGGAAAGCCAGGTCTAAAATTCAATGGCCCACCACCGCCACCGCCACCACCACCACCCCACTT', 'TCACTTTCATAATGCTGGACCATTGCTTCAATTGATTTTAAGAGAGAAACCTGTGTTGTGGTTTACACTGGATATGGAAATAGAGAGG');
        const customResult = customAligner.align('insertion', 'deletion');

        showWidget({
            wid: 'json',
            data: JSON.stringify(defaultResult)
        })

        console.log(defaultResult.alignment)

    })

}
