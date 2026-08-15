function (track, vcfString) {
    return new Promise(async (resolve, reject) => {
        if (vcfString != null) {
            let Snpindel = await exec('flexigraph/snpindel.js');
            vcfString = vcfString.trim();
            vcfString = vcfString.replaceAll('\r', ' ');
            let vcf = vcfString.split(/\r?\n/);
            let chro = 0;
            let pos = 1;
            let ref = 2;
            let alt = 3;
            let filt = 6;
            let inf = 8;

            let sam = 9;

            for (let line of vcf) {
                line = line.trim();
                if (line.startsWith('##')) {
                    continue;

                } else if (line.startsWith('#')) {
                    var header = line.split('\t');
                    let index = 0;
                    for (let h of header) {
                        if (h.startsWith('#CHROM')) {
                            chro = index;
                        } else if (h.startsWith('POS')) {
                            pos = index;
                        } else if (h.startsWith('REF')) {
                            ref = index;
                        } else if (h.startsWith('ALT')) {
                            alt = index;
                        } else if (h.startsWith('FILTER')) {
                            filt = index;
                        };
                        index += 1;
                    };
                    if ( header.length > 10 ){
                        console.log( 'This is a multi-sample vcf. Only read first sample.')
                    };

                } else {
                    let variant = line.split('\t');
                    if (variant.length != header.length) {
                        console.log('vcf line is not following header conventions.');
                        continue;
                    }

                    let position = ~~variant[pos];
                    let reference = variant[ref];
                    let alternate = variant[alt];
                    let phaseset;
                    if (alternate == '<DUP>') {
                        alternate = reference+reference;
                    }

                    let snpinfo = variant[inf];
                    let filter = variant[filt];
                    console.log(filter);
                    snpinfo = snpinfo.split(':');

                    let sample = variant[sam];
                    sample = sample.split(':');

                    if ( position < track.xi || position > track.xf ) {
                        continue;
                    }

                    if ( filter == 'PASS' ) {

                        let GTindex = snpinfo.indexOf('GT');
                        if ( GTindex === -1 ) {

                            GTindex = 0;
                        }

                        if (snpinfo.includes('PS')) {
                            phaseset = sample[snpinfo.indexOf('PS')];
                        }

                        let genotype = sample[GTindex];

                        let phases = [reference].concat( alternate.split(',') )
                        let genotypes = genotype.split(/[/|]/g)

                        for (let i=0; i < genotypes.length; i++) {
                            let geno = phases[genotypes[i]];

                            if ( i < 2 && geno && genotypes[i] != 0 ) {
                                if (genotype != '1/1' && genotype.includes('/')) {
                                    console.log('Unphased variant '+ line);
                                } else if ( reference.length === geno.length ) {
                                    track.addsnpindel( new Snpindel('snp', position, reference, geno, i, track.strand, null, phaseset ) );
                                } else if (reference.length > geno.length ) {
                                    track.addsnpindel( new Snpindel('del', position, reference, geno, i, track.strand, null, phaseset ) );
                                } else if (reference.length < geno.length ) {
                                    track.addsnpindel( new Snpindel('ins', position, reference, geno, i, track.strand, null, phaseset ) );
                                }
                            } else if ( genotypes[i] == 0 ){
                                console.log( 'Reference' )
                            } else if ( typeof geno == 'undefined') {
                                console.log( 'Likely ambiguous phase.')
                            } else if ( i >= 2) {
                                console.log( 'Triploid or greater' )
                            }
                            console.log(track.snpindels[
                        }
                    } else {
                        console.log('Variant does not pass quality threshold');
                    }
                }
            }
            console.log ( track )
            resolve();
        } else {
            reject();
        }
    });
}
