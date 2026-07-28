import pandas as pd

# Load the CSV file
df = pd.read_csv('./pattern.counts.csv')

# Remove columns where all values are 0
df_filtered = df.loc[:, (df != 0).any(axis=0)]

# Optionally, save the filtered dataframe to a new CSV file
df_filtered.to_csv('./filtered_pattern.counts.csv', index=False)

# Display the first few rows of the dataframe to verify
print(df_filtered.head())


import pandas as pd

# Step 1: Define the list of specific column names
specific_columns = [
    'MENTAL', 'DUF3574', 'DUF373', 'TIL', '7tm_1', 'DUF1385', '7TM_GPCR_Srsx', 
    'G3P_acyltransf', 'Calcyon', 'AFG1_ATPase', 'SelP_N', 'TAS2R', 'FxsA', 
    '7TM_GPCR_Srv', 'RseC_MucC', 'EVC2_like', 'Phage_30_3', '7tm_4', 'DUF202', 
    'DUF1725', 'RVT_1', 'DUF3704', 'Tnp_22_trimer', 'Transposase_22', 'DUF1492', 
    'SlyX', 'GCP_N_terminal', 'DUF1515', '7TM_GPCR_Srx', 'Cyt_bd_oxida_II', 
    'ArsP_1', '7TM_GPCR_Srw', 'DUF3671', 'DUF3169', 'KilA-N', 'Tnp_22_dsRBD', 
    'Laminin_II', 'DUF4686', 'DUF2095', 'Noelin-1', 'T3SS_basalb_I', 
    'CENP-F_leu_zip', 'TMPIT', 'Viral_NABP', 'Mt_ATP-synt_D', 'Serine_rich', 
    'DUF1664', 'FAM27', 'SOAR', 'DUF2203', 'DegS', 'Tweety', 'Exo_endo_phos_2', 
    'Exo_endo_phos', 'YwiC', 'NICE-1', 'DUF5416', 'DUF1651', 'FAF', 'NAD-GH', 
    'Pox_P21', 'Orf78', 'DUF2208', 'DUF4834', 'Shisa', 'FAA_hydrolase_N', 
    'ABC-3', 'CCER1', 'Sid-5', 'Chromate_transp', 'DUF5559', 'PqiA', 'CIDR1_gamma', 
    # Continue adding the rest of your features here...
]

# Step 2: Load your CSV file
file_path = './bt-proteins.csv'  # Adjust this path
df = pd.read_csv(file_path)

# Step 3: Filter the DataFrame to include only the specific columns
df_filtered = df[specific_columns]

# Step 4 & 5: Find columns with at least one entry greater than 0
# columns_with_at_least_one = [col for col in df_filtered.columns if df_filtered[col].gt(0).any()]
columns_with_more_than_two = [col for col in df_filtered.columns if df_filtered[col].gt(0).sum() > 400]

# Print or use the list of column names as needed
print("Columns with at least one entry greater than 0 in the specified list:")
print(columns_with_more_than_two)



# MENTAL,DUF3574,DUF373,TIL,7tm_1,DUF1385,7TM_GPCR_Srsx,G3P_acyltransf,Calcyon,AFG1_ATPase,SelP_N,TAS2R,FxsA,7TM_GPCR_Srv,RseC_MucC,EVC2_like,Phage_30_3,7tm_4,DUF202,DUF1725,RVT_1,DUF3704,Tnp_22_trimer,Transposase_22,DUF1492,SlyX,GCP_N_terminal,DUF1515,7TM_GPCR_Srx,Cyt_bd_oxida_II,ArsP_1,7TM_GPCR_Srw,DUF3671,DUF3169,KilA-N,Tnp_22_dsRBD,Laminin_II,DUF4686,DUF2095,Noelin-1,T3SS_basalb_I,CENP-F_leu_zip,TMPIT,Viral_NABP,Mt_ATP-synt_D,Serine_rich,DUF1664,FAM27,SOAR,DUF2203,DegS,Tweety,Exo_endo_phos_2,Exo_endo_phos,YwiC,NICE-1,DUF5416,DUF1651,FAF,NAD-GH,Pox_P21,Orf78,DUF2208,DUF4834,Shisa,FAA_hydrolase_N,ABC-3,CCER1,Sid-5,Chromate_transp,DUF5559,PqiA,CIDR1_gamma,DUF3098,Bee_toxin,DUF4284,SLC3A2_N,Piezo_RRas_bdg,Macoilin,TP2,DUF3346,Neur_chan_memb,Insulin_TMD,DUF4491,ThiJ_like,DUF997,Pox_E6,DUF2232,YqzL,PUNUT,DUF2206,TMEM191C,DUF2768,DUF5313,RIFIN,Stevor,CcmH,zf-Nse,DUF5393,DUF2528,Fibrillin_U_N,EMI,DUF5346,ARL6IP6,DUF1661,Dicty_CAR,DUF4231,DMRT-like,DUF5626,Sirohm_synth_C,vMSA,Vfa1,PTPRCAP,Abhydrolase_9_N,MWFE,TraG_N,Ni_hydr_CYTB,DUF3810,DUF485,Neur_chan_LBD,Glyco_hydro_57,Papilloma_E5,DUF2852,zf-LITAF-like,Keratin_2_head,DUF2631,STE3,SecG,FDX-ACB,Dynamin_M,DUF4417,Psu,CDH,DUF16,Syntaxin-6_N,FlxA,Glycoprotein_G,PilJ,DUF3636,Gastrin,ECH_2,GTP_EFTU,BRICHOS,Orthoreo_P17,Histone,Tantalus,YlbE,DUF5390,UL45,DUF5133,Baculo_11_kDa,ABC_export,PDE6_gamma,LRRC37AB_C,HCO3_cotransp,DUF872,Trypan_PARP,FTH,DUF1761,PetG,SNF,CRPA,5HT_transport_N,PRONE,GpcrRhopsn4,DUF805,Pico_P2A,DUF4191,PRA1,GBV-C_env,Pex24p,DUF3320,DUF1510,GNAT_like,Herpes_glycop,UPF0561,LRRCT,Dicty_CTDC,KAR9,Arabinose_bd,DctQ,STAR_dimer,Herpes_US9,AsnC_trans_reg2,PA26,NPR3,MAP17,V_ATPase_I,Connexin,CDC45,PIEZO,TT_ORF2,DUF2201_N,Otopetrin,DUF2956,Presenilin,DUF2828,DUF2385,T2SSM,DUF2304,NINJA_B,Na_Ca_ex,DUF4632,DUF2157,DUF2761,Na_H_antiport_1,Prominin,GTP_cyclohydro2,PseudoU_synth_1,DUF5367,BRI3BP,PRIMA1,Serpentine_r_xa,C_GCAxxG_C_C,Saf_2TM,BatA,NPCC,COX1,TctB,DUF2207,DUF3040,7TM_GPCR_Srbc,PKS_DE,NdhL,DUF3341,Wzy_C,UL42,DUF4443,Popeye,OppC_N,VEGFR-2_TMD,DUF4790,PsbW,DUF588,Bac_export_2,CD225,Voltage_CLC,Rap1a,Kdo_hydroxy,Ribosomal_L30_N,Ribosomal_L30,YdjO,SPOR,DUF1345,Flavi_capsid,MFS_1,CPP1-like,DUF4391,CoA_transf_3,ERG2_Sigma1R,GTP-bdg_M,DUF4407,DUF349,DDE_1,NAD_binding_1,UBD,SANT_DAMP1_like,PsbX,MHYT,STAT2_C,DUF1229,COG5,Srg,DUF5134,Orai-1,APOBEC_C,PhoLip_ATPase_C,Git3,Comm,DUF1294,SPC12,UL17,DUF1856,PTCRA,Frizzled,COX7C,Rab5ip,GerA,DUF1772,Cytomega_TRL10,FtsK_4TM,AgrB,DHHC,7tm_7,DUF5357,DUF4233,KASH,TPPK_C,FA_desaturase,Osw5,DUF3767,Secretin_N_2,SPX,Plasmodium_Vir,Tmemb_cc2,TatC,DUF4602,Cadherin,Cadherin_2,Cadherin_C_2,DUF4958,Big_9,Cadherin_4,Cadherin_3,Papilloma_E5A,DUF5527,DUF5320,SusE,He_PIG,PepSY,Cadherin_tail,ORC5_C,Zip,HpaB_N,NSP16,7tm_2,PapG_N,ISK_Channel,TMEM171,PEX11,GWT1,Herpes_UL7,YqgF,Thioredoxin_8,DUF4614,DDRGK,RNA_pol_Rpc4,Hid1,RPOL_N,NARP1,DUF1764,RR_TM4-6,PPL5,TMEM214,AIF_C,eIF-3_zeta,DUF913,ALMT,Ocular_alb,Med15_fungi,DUF4159,Atrophin-1,PRP38_assoc,DUF3915,DUF4064,VanW,DUF2417,UPAR_LY6,Val_tRNA-synt_C,TFR_dimer,Cyclase,Dpy19,H_PPase,BRCT_3,Longin,DUF1601,DUF996,Host_attach,DUF3367,DUF4106,DUF3784,DUF3099,ABC2_membrane_3,CBM9_2,SRX,BLM_N,DUF4574,ERM,IclR,Spc7,TPR_MLP1_2,HIP1_clath_bdg,DUF2205,Cnn_1N,YabA,LMBR1,YtxH,Bac_rhamnosid6H,DUF1102,GNVR,DUF4200,Mpp10,CPSF100_C,SDA1,Nop14,DUF3306,DDHD,RPN2_C,SLC12,BUD22,CCSAP,Tim54,Nha1_C,SID-1_RNA_chan,Folate_carrier,FAM60A,XAP5,SpoIIIAH,DNA_pol_phi,Peptidase_S64,Merozoite_SPAM,DUF4045,DUF4471,Nop53,SpoIIP,RAB3GAP2_C,SAPS,Dynamin_N,Gti1_Pac2,DUF3292,TRAP_alpha,FYDLN_acid,Smg8_Smg9,TRP,ANF_receptor,AcylCoA_DH_N,DND1_DSRM,DUF929,Sh_2,MotB_plug,DarA_C,ASC,SepRS_C,Adeno_E1A,NiFe-hyd_HybE,Caskin-Pro-rich,TERT_thumb,DUF4962,SUIM_assoc,DUF1242,JmjN,DUF745,Ground-like,BES1_N,AP-5_subunit_s1,HD-ZIP_N,EBV-NA1,Sre,YlaC,HlyIII,DUF2614,DUF1211,DUF3278,DUF4131,TRAM_LAG1_CLN8,RDD,DUF420,UL16,Gp_dh_C,SieB,MscS_TM,DUF898,TMEM234,Claudin_2,DUF4149,E1-E2_ATPase,PHO4,HOK_GEF,RMI2,PTR2,SHNi-TPR,DUF1275,CopD,UPF0182,SK_channel,DUF2516,7TM_GPCR_Str,CitMHS,Frag1,DUF621,FYTT,VATC,RET_CLD1,SRTM1,Big_1,Gag_p24,Tryp_inh,DUF1700,DUF5551,DUF3504,FAM75,TonB_N,DUF4199,DUF4162,NOA36,Lambda_CIII,Apis_Csd,Porph_ging,Nucleoside_tran,Phage_Gp23,DUF2480,Rsa3,ABC1,DUF948,KELK,V-ATPase_G,Rtf2,DUF4569,GRP,OATP,DUF4776,DUF4746,EIIBC-GUT_N,Auts2,UPF0242,Promethin,RNA_pol_Rpb2_4,DUF1980,DUF1624,Podovirus_Gp16,GPR_Gpa2_C,DUF2678,Form_Nir_trans,DUF5628,Phage_holin_3_6,7TM_GPCR_Srd,COG7,SchA_CurD,Tat,7TM_GPCR_Sri,Ferric_reduct,Epiglycanin_C,DUF5588,DUF5540,YajC,Blt1,MdcE,DUF1467,UCR_Fe-S_N,TPR_11,Ncstrn_small,Pox_A14,DUF4220,Nitr_red_alph_N,DUF4718,SR-25,DUF1645,PI3K_1B_p101,Rrn6,GREB1,Chorion_2,FAM199X,CCDC24,DUF4667,DUF1635,Miga,SARAF,DUF508,DUF3446,Apt1,Peptidase_C92,Herpes_BBRF1,DUF2946,Choline_transpo,Bac_rhodopsin,DUF2070,EphA2_TM,7tm_3,Gaa1,DUF543,Peripla_BP_6,DUF5438,GluR_Homer-bdg,HR1,YgaB,Sp38,MVL,Leader_Erm,Psm4,T2SSN,NCD3G,Glyco_trans_A_1,SIN1_PH,MNE1,PEN-2,DUF5478,Lipin_mid,DUF3967,Phenol_monoox,Fijivirus_P9-2,Mucin,Poxvirus_B22R_C,DNTTIP1_dimer,PSI_PsaJ,DUF346,DUF4368,eIF-5_eIF-2B,zf-HYPF,Nup54_57_C,vATP-synt_E,ELP6,PMT_4TMC,DUF4013,Herpes_LMP1,DUF2380,VRP3,DUF2970,LAP1C,MDFI,CLN3,Raftlin,DUF4633,Abhydro_lipase,MCM_bind,AF-4,Transmemb_17,S1,FrhB_FdhB_N,CoA_binding_3,7TM_GPCR_Srt,BaxI_1,RSB_motif,Vpu,DUF5385,DUF515,FixH,Pex14_N,Band_3_cyto,MYCBPAP,SMYLE_N,DUF1180,zf-SAP30,DUF1516,DUF2469,YlzJ,S1_2,Gal_mutarotas_2,DUF402,GlcV_C_terminal,Striatin,QWRF,Menin,CobT,DUF3498,Kp4,DUF1203,Arm,DUF412,TMEM192,PhoR,ResB,DUF5549,CXCR4_N,COX2_TM,HA2,CDP-OH_P_transf,HTH_IclR,Fibrillarin_2,AAA_29,T2SSE,AAA_23,AAA_22,AAA_7,DEAD,TMEM208_SND2,BMP2K_C,UPF0542,SH3_1,Pkinase_Tyr,Pkinase,Tmp39,SH2,SH3_3,SH3_9,SH3_2,SH3_6,F_actin_bind,FRG2,Mononeg_mRNAcap,Glyco_hydro_36C,FAM76,FliG_M,SVM_signal,YrhC,OAD_gamma,DUF443,Brr6_like_C_C,HemY_N,HILPDA,Ninjurin,BH3,Copper-fist,DUF2675,Ilm1,Bradykinin,DUF2104,CaMKII_AD,PD-C2-AF1,EIN3,AIM3,MFS18,Vitelline_membr,XRN1_DBM,2TM,Glyco_transf_22,DUF4440,SnoaL_3,SnoaL_4,DUF5565,AphA_like,KLRAQ,ATG16,EzrA,DUF4795,Spectrin,bZIP_1,bZIP_2,Atg14,Ax_dynein_light,ADIP,DUF1465,WD40_alt,Troponin,Jnk-SapK_ap_N,ZapB,XhlA,Occludin_ELL,Spc24,FapA,Toxin_GhoT_OrtT,DUF5560,CBM_10,HIF-1a_CTAD,C5HCH,Lge1,HIGH_NTase1,GvpK,Filament,Transcrip_act,AAA_13,Rootletin,DHR10,L27,MIP-T3_C,JIP_LZII,zf-RAG1,DUF3648,DUF2949,DUF2238,DGOK,DUF3556,Tudor_3,Pentapeptide_4,DUF4307,MRP_L53,Eryth_link_C,Sec_GG,Dicty_REP,Furin-like,Recep_L_domain,Oxidored_q4,GF_recep_IV,Glyoxalase,ig,Ig_2,Peptidase_C7,Bacteriocin_II,LELP1,PTEN_C2,RNA_pol_Rpb1_R,zf-P11,DUF1431,DUF3377,DUF959,COPI_assoc,FixS,Kelch_5,RRN9,Gyro_capsid,I-set,Ig_3,C2-set_2,Haspin_kinase,Arabinose_Iso_C,PDGLE,Pkinase_C,YlmH_RBD,Corona_NS3b,APH,Kinase-like,KIND,Pkinase_fungal,DUF5538,Neisseria_TspB,PBD,DUF281,Hit1_C,Rhomboid_SP,V-set,Ig_6,Aim21,Ig_5,Rubella_E1,FLYWCH,AdenylateSensor,Fe_hyd_lg_C,HycA_repressor,DEC1,CCDC71L,Ycf70,Plk4_PB1,Rabaptin,COX3,C2-C2_1,Toxin_18,CD34_antigen,Innexin,RNA_POL_M_15KD,Zn-ribbon_8,DUF2483,zf_CopZ,DUF4451,PLA2_inh,AA_permease_2,ECF_trnsprt,FERM_F1,CPSF73-100_C,FERM_F2,Jak1_Phl,ANXA2R,HobA,DUF4899,Olduvai,RCDG1,Ig_4,Izumo-Ig,Herpes_UL43,BBIP10,Ion_trans,PIG-U,PKD_channel,Ank_3,Ank,Ank_2,Ank_4,Ank_5,DUF2358,GCR,MutS_IV,Phage_holin_4_1,BRCA2,NUDIX,CLP_protease,Hormone_recep,MADF_DNA_bdg,Bacillus_PapR,LPD37,DUF5605,N6_N4_Mtase,Hamartin,BMF,Acyl_transf_3,DUF4820,zf-HIT,DUF4620,BNR_assoc_N,KRTAP,PQ-loop,zf-RING_13,GETHR,Arrestin_N,MRAP,LRR_9,SKG6,SARG,DUF3275,Prog_receptor,CytochromB561_N,S4_2,zf-TRM13_CCCH,Imm31,COesterase,Abhydrolase_3,Oest_recep,DUF5400,DUF1882,OmpH,FemAB,Histone_HNS,DUF401,DUF87,Adeno_E3B,Kelch_6,HEPN_MAE_28990,Peptidase_C39_2,Flg_hook,ERbeta_N,SCFA_trans,Prismane,DUF2827,MtlR,DUF4028,Yae1_N,KH_6,TT_ORF1,