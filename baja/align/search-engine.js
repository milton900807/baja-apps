function () {

    return new Promise(async (resolve, reject) => {
        let Match = await exec('baja/align/match.js')
        let SeqObject = await exec('baja/align/seq-obj.js')
        let AligmentMap = await exec ( 'baja/align/alignment-map.js')

        let SearchEngine = class SearchEngine {
            static compare(seq1, seq2) {
                var alignmentMap = SearchEngine.search(seq1, seq2);
                alignmentMap = alignmentMap.map(function (value, index) {
                    return { position: index - seq1.length, matches: value };
                });
                alignmentMap.sort(function (a, b) {
                    return a.matches - b.matches;
                });

                let input = new SeqObject(seq1);
                let target = new SeqObject(seq2);
                let am = new AligmentMap ( alignmentMap );
                let match = new Match(input, target, am);

                return match;

            }
            static search(seqSearch, seqGenome) {
                var sLen = seqSearch.length;
                var gLen = seqGenome.length;

                var map = new Uint32Array(gLen + sLen);
                var curChar;
                var offset;
                for (var j = 0; j < sLen; j++) {
                    curChar = seqSearch[j];
                    offset = sLen - j;
                    for (var i = 0; i < gLen; i++) {
                        if (curChar === seqGenome[i]) {
                            ++map[offset + i];
                        }
                    }

                }

                return [].slice.call(map);
            }
        }
        return resolve(SearchEngine)
    })

}
