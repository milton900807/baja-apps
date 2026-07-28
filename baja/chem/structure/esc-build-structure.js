function (chemObj, bioObj) {

    return new Promise(async (res, rej) => {
        let Biopolymer = await exec('baja/chem/biopolymer.js')
        let SIRNA = await exec('flexigraph/sirna.js')

        let sense = "m(?)[sp].m(?)[sp].m(?)p.m(?)p.m(?)p.m(?)p.[fl2r](?)p.m(?)p.[fl2r](?)p.[fl2r](?)p.[fl2r](?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)";

        let antisense =    "m(?)[sp].[fl2r](?)[sp].m(?)p.m(?)p.m(?)p.[fl2r](?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.[fl2r](?)p.m(?)p.[fl2r](?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)[sp].m(?)[sp].m(?)";
        let targetSequence = bioObj.targetSequence;
        let senseSeq = targetSequence
        let strand = 0;
        if (bioObj.strand != null) {
            strand = bioObj.strand;
        }
        if (bioObj.strand != null) {
            strand = bioObj.strand;
        }
        let currentStartX = bioObj.startIndex;
        let y = bioObj.y;
        let synthesisSeq = targetSequence;
        let structure = ''
        let senseStructure = '';
        let antisenseStructure = '';

        if ( strand < 0 ) {
            synthesisSeq = Biopolymer.comp(senseSeq)
            if ( synthesisSeq.length > 21 ){
                senseSeq = synthesisSeq.substring ( 0, 21 )
            }
            senseSeq = Biopolymer.comp ( senseSeq )
            senseStructure = Biopolymer.applySequenceToTemplate(sense, (senseSeq));
            antisenseStructure = Biopolymer.applyAntisenseSequenceToTemplate(antisense, (synthesisSeq));
            structure = `RNA1{${senseStructure}}|RNA2{${antisenseStructure}}$RNA1,RNA2,2:pair-62:pair|RNA1,RNA2,5:pair-59:pair|RNA1,RNA2,8:pair-56:pair|RNA1,RNA2,11:pair-53:pair|RNA1,RNA2,14:pair-50:pair|RNA1,RNA2,17:pair-47:pair|RNA1,RNA2,20:pair-44:pair|RNA1,RNA2,23:pair-41:pair|RNA1,RNA2,26:pair-38:pair|RNA1,RNA2,29:pair-35:pair|RNA1,RNA2,32:pair-32:pair|RNA1,RNA2,35:pair-29:pair|RNA1,RNA2,38:pair-26:pair|RNA1,RNA2,41:pair-23:pair|RNA1,RNA2,44:pair-20:pair|RNA1,RNA2,47:pair-17:pair|RNA1,RNA2,50:pair-14:pair|RNA1,RNA2,53:pair-11:pair|RNA1,RNA2,56:pair-8:pair|RNA1,RNA2,59:pair-5:pair|RNA1,RNA2,62:pair-2:pair$$$V2.0`

        }else {
            synthesisSeq = Biopolymer.comp(senseSeq)
            synthesisSeq = Biopolymer.reverse ( synthesisSeq )

            if ( synthesisSeq.length > 21 ){
                senseSeq = synthesisSeq.substring ( 0, 21 )
            }
            senseSeq = Biopolymer.reverseComp ( senseSeq )

            senseStructure = Biopolymer.applySequenceToTemplate(sense, (senseSeq));
            antisenseStructure = Biopolymer.applyAntisenseSequenceToTemplate(antisense, (synthesisSeq));
            structure = `RNA1{${senseStructure}}|RNA2{${antisenseStructure}}$RNA1,RNA2,2:pair-62:pair|RNA1,RNA2,5:pair-59:pair|RNA1,RNA2,8:pair-56:pair|RNA1,RNA2,11:pair-53:pair|RNA1,RNA2,14:pair-50:pair|RNA1,RNA2,17:pair-47:pair|RNA1,RNA2,20:pair-44:pair|RNA1,RNA2,23:pair-41:pair|RNA1,RNA2,26:pair-38:pair|RNA1,RNA2,29:pair-35:pair|RNA1,RNA2,32:pair-32:pair|RNA1,RNA2,35:pair-29:pair|RNA1,RNA2,38:pair-26:pair|RNA1,RNA2,41:pair-23:pair|RNA1,RNA2,44:pair-20:pair|RNA1,RNA2,47:pair-17:pair|RNA1,RNA2,50:pair-14:pair|RNA1,RNA2,53:pair-11:pair|RNA1,RNA2,56:pair-8:pair|RNA1,RNA2,59:pair-5:pair|RNA1,RNA2,62:pair-2:pair$$$V2.0`

        }
        let oligo = new SIRNA(chemObj.type, targetSequence, senseSeq, synthesisSeq,
            currentStartX,
            (currentStartX + targetSequence.length), y, strand, structure);

        oligo.strand = strand;
        oligo.shapeFunction = async (graph, xs, xf, y, color, structure, sirna) => {
            let font = "16px Arial";
            let ys = graph.Y(y);
            let xss = graph.X(xs);
            let xff = graph.X(xf);

            if (sirna.strand > 0) {
                graph.drawScreenLine(xss - 25, ys + 15, xff - 2, ys + 15, 'lightBlue', 10, 'butt')

                if (structure) {
                    if (structure.indexOf('THAGN') > 0 || structure.indexOf('THAGN') > 0) {
                        graph.drawString("GalNAc", xs - 3, y, 'black', font)
                    }
                    graph.drawScreenLine(xss, ys, xff, ys, 'lightGray', 11, 'round')
                } else {
                    graph.drawScreenLine(xss, ys, xff, ys, 'maroon', 3, 'round')
                }
            } else {
                graph.drawScreenLine(xss, ys, xff + 20, ys, 'lightBlue', 10, 'butt')

                if (structure) {
                    if (structure.indexOf('THAGN') > 0 || structure.indexOf('THAGN') > 0) {
                        graph.drawString("GalNAc", xs - 3, y, 'black', font)
                    }
                    graph.drawScreenLine(xss, ys + 15, xff, ys + 15, 'lightGray', 11, 'round')
                } else {
                    graph.drawScreenLine(xss, ys + 15, xff, ys, 'maroon', 3, 'round')

                }
            }
        }
        return res(oligo);
    })

}
