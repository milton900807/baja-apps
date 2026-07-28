gene = load ( 'hg38', 'KRAS')
mech = Mechanism ( 'RNasH' );
oligo_chemistry = OligonucleotideChemistry ( '[(moe.sp.)*20]--GalNAc' );
si_chemistry = SIChemistry ( '[(moe.sp.)*20]|[(moe.sp.)*20]',  );
annotation_props = {
    3_utr:0.7,
    exon:0.3
}
moe_oligos = mech.generate ( olig_chemistry,  gene, annotation_props, 70 );
si_oligos = mech.generate ( si_chemistry,  gene, annotation_props, 13 );
print ( len ( oligos ))