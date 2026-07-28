function () {
    return new Promise(async (resolve, reject) => {

        function parseMutation(mutation) {

            const insertionRegex = /^([A-Za-z]+)(\d+)(?:[\^_])([A-Za-z]+)(\d+)ins([A-Za-z]+)$/;
            const insertionMatch = mutation.match(insertionRegex);
            if (insertionMatch) {
                return {
                    type: 'insertion',
                    firstResidue: insertionMatch[1],
                    firstPosition: parseInt(insertionMatch[2]),
                    secondResidue: insertionMatch[3],
                    secondPosition: parseInt(insertionMatch[4]),
                    insertedSequence: insertionMatch[5]
                };
            }

            const indelRegex = /^([A-Za-z]+)(\d+)(?:_([A-Za-z]+)(\d+))?delins([A-Za-z]+)$/;
            const indelMatch = mutation.match(indelRegex);
            if (indelMatch) {
                if (indelMatch[3] && indelMatch[4]) {
                    return {
                        type: 'deletion-insertion',
                        fromResidue: indelMatch[1],
                        fromPosition: parseInt(indelMatch[2]),
                        toResidue: indelMatch[3],
                        toPosition: parseInt(indelMatch[4]),
                        insertedSequence: indelMatch[5]
                    };
                } else {
                    return {
                        type: 'deletion-insertion',
                        fromResidue: indelMatch[1],
                        fromPosition: parseInt(indelMatch[2]),
                        insertedSequence: indelMatch[5]
                    };
                }
            }

            const duplicationRegex = /^([A-Za-z]+)(\d+)_(\D+)(\d+)dup$/;
            const duplicationMatch = mutation.match(duplicationRegex);
            if (duplicationMatch) {
                return {
                    type: 'duplication',
                    firstResidue: duplicationMatch[1],
                    firstPosition: parseInt(duplicationMatch[2]),
                    secondResidue: duplicationMatch[3],
                    secondPosition: parseInt(duplicationMatch[4])
                };
            }

            const frameShiftRegex = /^([A-Za-z]+)(\d+)fs(?:X(\d+))?$/;
            const frameShiftMatch = mutation.match(frameShiftRegex);
            if (frameShiftMatch) {
                return {
                    type: 'frame shift',
                    residue: frameShiftMatch[1],
                    position: parseInt(frameShiftMatch[2]),
                    newFrameLength: frameShiftMatch[3] ? parseInt(frameShiftMatch[3]) : undefined
                };
            }

            const pointMutationRegex = /^([A-Za-z]+)(\d+)([A-Za-zX]+)$/;
            const pointMutationMatch = mutation.match(pointMutationRegex);
            if (pointMutationMatch) {
                const type = pointMutationMatch[3] === 'X' ? 'nonsense mutation' : 'substitution';
                return {
                    type: type,
                    residueFrom: pointMutationMatch[1],
                    position: parseInt(pointMutationMatch[2]),
                    residueTo: pointMutationMatch[3]
                };
            }

            const repeatRegex = /^(\d+)\(([A-Za-z])\)(\d+)-(\d+)$/;
            const repeatMatch = mutation.match(repeatRegex);
            if (repeatMatch) {
                return {
                    type: 'variable short sequence repeat',
                    position: parseInt(repeatMatch[1]),
                    residue: repeatMatch[2],
                    minRepeats: parseInt(repeatMatch[3]),
                    maxRepeats: parseInt(repeatMatch[4])
                };
            }

            throw new Error("Invalid mutation syntax");
        }

        function containsMutation(description) {

            const mutationRegex = /([A-Za-z]+\d+(?:[\^_][A-Za-z]+\d+)?ins[A-Za-z]+)|([A-Za-z]+\d+(?:_[A-Za-z]+\d+)?delins[A-Za-z]+)|([A-Za-z]+\d+_(\D+)\d+dup)|([A-Za-z]+\d+fs(?:X\d+)?)|([A-Za-z]+\d+[A-Za-zX]+)|(\d+\([A-Za-z]\)\d+-\d+)/;

            return mutationRegex.test(description);
        }

        resolve ( parseMutation, containsMutation )

    })

}
