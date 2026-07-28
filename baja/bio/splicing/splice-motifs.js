function () {

    return new Promise((resolve, reject) => {

        class SplicingMotifs {

            findSpliceConsensusSites(dnaSequence) {
                const spliceSites = [];
                const donorPattern = /GT/g;
                const acceptorPattern = /AG/g;

                let match;
                while ((match = donorPattern.exec(dnaSequence)) !== null) {
                    spliceSites.push({ site: '5\' splice site', position: match.index });
                }

                while ((match = acceptorPattern.exec(dnaSequence)) !== null) {
                    spliceSites.push({ site: '3\' splice site', position: match.index });
                }

                return spliceSites;
            }
            findAcceptorSpliceSites(sequence, strand) {
                let regex = /AG/g;
                const acceptorSites = [];
                if (strand <= 0) {
                    regex = /GA/g;
                }

                let match;
                while ((match = regex.exec(sequence)) !== null) {
                    acceptorSites.push({ site: 'AG', position: match.index });
                }

                return acceptorSites;
            }

            findDonorSpliceSites(sequence, strand) {
                let canonicalRegex = /GT[AG][ACGT]{2}AG[AGT]/g;
                let potentialRegex = /GT/g;
                const canonicalSites = [];
                const potentialSites = [];
                let match;

                if (strand <= 0) {
                    potentialRegex = /TG/g;
                    canonicalRegex = /CA[T]C[ACGT]{2}TC[GA]/g;
                }

                while ((match = canonicalRegex.exec(sequence)) !== null) {
                    canonicalSites.push({ site: match[0], position: match.index });
                }
                potentialRegex.lastIndex = 0;
                while ((match = potentialRegex.exec(sequence)) !== null) {
                    potentialSites.push({ site: 'GT', position: match.index });
                }
                return { canonicalSites, potentialSites };
            }

            findCanonicalDonorSpliceSites(sequence) {
                const pattern = /GT[AG][ACGT]{2}AG[AGT]/g;
                const matches = [];

                let match;
                while ((match = pattern.exec(sequence)) !== null) {
                    matches.push({ consensus: match[0], position: (match.index + 1) });
                }

                return matches;
            }
            findCrypticSpliceSites(sequence) {
                const crypticSites = [];
                const donorPattern = /GT/g;
                const acceptorPattern = /AG/g;

                let match;
                while ((match = donorPattern.exec(sequence)) !== null) {
                    crypticSites.push({ site: 'Potential 5\' cryptic splice site', position: match.index });
                }

                while ((match = acceptorPattern.exec(sequence)) !== null) {
                    crypticSites.push({ site: 'Potential 3\' cryptic splice site', position: match.index });
                }

                return crypticSites;
            }
            findBranchPoints(sequence) {
                const pattern = /([CT][ATGC][CT][CT][AG]A[AG])|(AU.*AC)/g;
                const matches = [];

                let match;
                while ((match = pattern.exec(sequence)) !== null) {
                    matches.push({ branchPoint: match[0], position: match.index });
                }

                return matches;
            }
        }
        return resolve(new SplicingMotifs())
    })

}
