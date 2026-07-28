function () {

    function tmfun(dnaSequence, concentration) {

        if (!concentration) {
            concentration = 50e-9
        }
        const thermodynamicParams = {
            AA: -7.9,
            AT: -7.2,
            TA: -7.2,
            TC: -7.2,
            TG: -8.5,
            TT: -7.9,
            CA: -8.5,
            CC: -8.0,
            CT: -8.4,
            CG: -10.6,
            GC: -9.8,
            GA: -9.8,
            GG: -8.0,
            GT: -8.4,
            AC: -7.2,
            AG: -7.6,
          };

        const sequenceLength = dnaSequence.length;
        let enthalpy = 0;
        let entropy = 0;

        for (let i = 0; i < sequenceLength - 1; i++) {
            const basePair = dnaSequence.slice(i, i + 2);
            enthalpy += thermodynamicParams[basePair];
            if ( !enthalpy ){
                alert ( basePair )
            }
            entropy += thermodynamicParams[basePair];
        }

        const R = 8.314;
        const Tm = (enthalpy * 1000) / (entropy + R * Math.log(concentration / 4));

        return Tm;
    }
    return tmfun;
}
