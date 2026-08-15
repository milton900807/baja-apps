function(graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        function reverseComplement(sequence) {
            const complements = { 'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C' };
            return sequence.split('')
                .reverse()
                .map(base => complements[base])
                .join('');
        }

        let findAntisenseSequences = async (dnaSequence, windowLength) => {
            const antisenseSequences = [];
            const reverseComplementDNA = reverseComplement(dnaSequence);

            for (let i = 0; i <= dnaSequence.length - windowLength; i++) {
                const windowSegment = dnaSequence.substring(i, i + windowLength);
                let foundIndex = reverseComplementDNA.indexOf(windowSegment);

                while (foundIndex >= 0) {
                    antisenseSequences.push(foundIndex);

                    foundIndex = reverseComplementDNA.indexOf(windowSegment, foundIndex + 1);
                }
                console.log(" found " + antisenseSequences)
            }

            return antisenseSequences;
        }

        function getRandomColorWithAlpha() {
            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            const a = (Math.random() * 0.8 + 0.2).toFixed(2);
            return `rgba(${r},${g},${b},${a})`;
        }

        async function annotateWithDelay(seq, t, m, color, delay) {
            let result = findPalindromicSequences(seq, 1, m)
            if (result.length > 0) {
                graph.setMessage(" Adding " + result.length + " annotations... ")
            }
            for (let r of result) {
                console.log(" r i " + r)
                let annotation = new Annotation("UserAnnotation", r, t.xi + r, t.xi + r + m);
                annotation.color = color;
                t.annotations.push(annotation);
                await sleep(delay);
            }
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        function isPalindrome(sequence) {
            return sequence === sequence.split('').reverse().join('');
        }

        function hasContiguousRepeats(str, maxRepeats) {
            let count = 1;
            for (let i = 1; i < str.length; i++) {
                if (str[i] === str[i - 1]) {
                    count++;
                    if (count > maxRepeats) {
                        return true;
                    }
                } else {
                    count = 1;
                }
            }
            return false;
        }

        function findPalindromicSequences(dnaSequence, increment, windowLength) {

            const antisenseSequences = [];
            const reverseComplementDNA = reverseComplement(dnaSequence);

            for (let i = 0; i <= dnaSequence.length - windowLength; i++) {
                const windowSegment = dnaSequence.substring(i, i + windowLength);
                let foundIndex = reverseComplementDNA.indexOf(windowSegment);
                while (foundIndex >= 0) {
                    antisenseSequences.push(foundIndex);
                    foundIndex = reverseComplementDNA.indexOf(windowSegment, foundIndex + 1);
                }
                console.log(" found " + antisenseSequences)
            }
            return antisenseSequences;
        }

        let Annotation = await exec('flexigraph/annotation.js')
        let va = await prompt("Length", ["Length"], { "Lenvth": 100 }, 300, 300)
        let m = va['Length']
        if (m === null) {
            return;
        } else {
            m = +m;
            hideAllModal();
            setTimeout(async () => {
                for (let t of graph.track) {
                    let seq = t.getHighlightedSequence();
                    if (seq != null && seq.length > 0) {
                        await annotateWithDelay(seq, t, m, getRandomColorWithAlpha(), 100);
                    }
                }
            }, 1000)
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
    }, 1000)
}
