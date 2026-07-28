function (chemObj, bioObj) {

    return new Promise(async (res, rej) => {
        let Biopolymer = await exec('baja/chem/biopolymer.js')
        let SIRNA = await exec('flexigraph/sirna.js')
        let targetSequence = bioObj.targetSequence;
        let strand = 0;

        if (bioObj.strand != null) {
            strand = bioObj.strand;
        }
        let currentStartX = bioObj.startIndex;
        let y = bioObj.y;
        let synthesisSeq = targetSequence;
        let passengerStrand = targetSequence;
        if (strand < 0) {
            synthesisSeq = Biopolymer.comp(targetSequence)
            passengerStrand = Biopolymer.reverse(passengerStrand)
            passengerStrand = passengerStrand.substring(2, passengerStrand.length);
        } else {
            synthesisSeq = Biopolymer.reverseComp(targetSequence)

            passengerStrand =  Biopolymer.reverse(Biopolymer.reverse(targetSequence).substring(0, targetSequence.length-2));
        }
        let passengarTemplate = `m(?)[sp].m(?)[sp].m(?)p.m(?)p.m(?)p.m(?)p.r(?)p.m(?)p.r(?)p.r(?)p.r(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)`
        let guideTemplate = `m(?)[sp].r(?)[sp].m(?)p.m(?)p.m(?)p.r(?)p.m(?)p.r(?)p.r(?)p.m(?)p.m(?)p.m(?)p.m(?)p.r(?)p.m(?)p.r(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)[sp].m(?)[sp].m(?)`

        console.log ( ' synthesis seq ' + synthesisSeq )

        let antisenseStructure = Biopolymer.applySequenceToTemplate(guideTemplate, synthesisSeq);
        let senseStructure = Biopolymer.applySequenceToTemplate(passengarTemplate, passengerStrand);
        let structure = ''
        if (strand > 0) {
            structure = 'RNA1{' + antisenseStructure + '}|RNA2{' +
                senseStructure + '}$RNA1,RNA2,2:pair-62:pair|RNA1,RNA2,5:pair-59:pair|RNA1,RNA2,8:pair-56:pair|RNA1,RNA2,11:pair-53:pair|RNA1,RNA2,14:pair-50:pair|RNA1,RNA2,17:pair-47:pair|RNA1,RNA2,20:pair-44:pair|RNA1,RNA2,23:pair-41:pair|RNA1,RNA2,26:pair-38:pair|RNA1,RNA2,29:pair-35:pair|RNA1,RNA2,32:pair-32:pair|RNA1,RNA2,35:pair-29:pair|RNA1,RNA2,38:pair-26:pair|RNA1,RNA2,41:pair-23:pair|RNA1,RNA2,44:pair-20:pair|RNA1,RNA2,47:pair-17:pair|RNA1,RNA2,50:pair-14:pair|RNA1,RNA2,53:pair-11:pair|RNA1,RNA2,56:pair-8:pair|RNA1,RNA2,59:pair-5:pair|RNA1,RNA2,62:pair-2:pair$$$'
        } else {
            structure = 'RNA1{' + antisenseStructure   + '}|RNA2{' +
            senseStructure + '}$RNA2,RNA1,62:pair-2:pair|RNA1,RNA2,5:pair-59:pair|RNA1,RNA2,8:pair-56:pair|RNA1,RNA2,11:pair-53:pair|RNA1,RNA2,14:pair-50:pair|RNA1,RNA2,17:pair-47:pair|RNA1,RNA2,20:pair-44:pair|RNA1,RNA2,23:pair-41:pair|RNA1,RNA2,26:pair-38:pair|RNA1,RNA2,29:pair-35:pair|RNA1,RNA2,32:pair-32:pair|RNA1,RNA2,35:pair-29:pair|RNA1,RNA2,38:pair-26:pair|RNA1,RNA2,41:pair-23:pair|RNA1,RNA2,44:pair-20:pair|RNA1,RNA2,47:pair-17:pair|RNA1,RNA2,50:pair-14:pair|RNA1,RNA2,53:pair-11:pair|RNA1,RNA2,56:pair-8:pair|RNA1,RNA2,59:pair-5:pair|RNA1,RNA2,62:pair-2:pair$$$'

        }

        let oligo = new SIRNA(chemObj.type, targetSequence, targetSequence, synthesisSeq,
            currentStartX,
            (currentStartX + targetSequence.length), y, strand, structure);
        let shobject = chemObj.shapeFunction
        oligo.strand = strand;
        if (shobject) {
            oligo.shapeFunction = shobject;
        }
        return res(oligo);

    })

}
