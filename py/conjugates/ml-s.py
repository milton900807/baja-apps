import os
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import SGDRegressor
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import PolynomialFeatures
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error
from sklearn.tree import export_text
import re
from typing import List
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import PolynomialFeatures
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import make_pipeline
import random
from sklearn.metrics import mean_squared_error, r2_score
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np
import pandas as pd
from scipy.stats import pearsonr
import matplotlib.pyplot as plt
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Crippen
import matplotlib.pyplot as plt
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from rdkit import Chem
from rdkit.Chem import Descriptors, Crippen, GraphDescriptors, rdMolDescriptors
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
import numpy as np
import matplotlib.pyplot as plt
import json
from itertools import cycle

import matplotlib.pyplot as plt
import seaborn as sns


features = [
    "MENTAL", "DUF3574", "DUF373", "TIL", "7tm_1", "DUF1385", "7TM_GPCR_Srsx", "G3P_acyltransf",
    "Calcyon", "AFG1_ATPase", "SelP_N", "TAS2R", "FxsA", "7TM_GPCR_Srv", "RseC_MucC", "EVC2_like",
    "Phage_30_3", "7tm_4", "DUF202", "DUF1725"
]

features1 = ["MENTAL", "DUF3574", "DUF373", "TIL", "7tm_1", "DUF1385", "7TM_GPCR_Srsx", "G3P_acyltransf", "Calcyon", "AFG1_ATPase", "SelP_N", "TAS2R", "FxsA", "7TM_GPCR_Srv", "RseC_MucC", "EVC2_like", "Phage_30_3", "7tm_4", "DUF202", "DUF1725", "RVT_1", "DUF3704", "Tnp_22_trimer", "Transposase_22", "DUF1492", "SlyX", "GCP_N_terminal", "DUF1515", "7TM_GPCR_Srx", "Cyt_bd_oxida_II", "ArsP_1", "7TM_GPCR_Srw", "DUF3671", "DUF3169", "KilA-N", "Tnp_22_dsRBD", "Laminin_II", "DUF4686", "DUF2095", "Noelin-1", "T3SS_basalb_I", "CENP-F_leu_zip", "TMPIT", "Viral_NABP", "Mt_ATP-synt_D", "Serine_rich", "DUF1664", "FAM27", "SOAR", "DUF2203", "DegS", "Tweety", "Exo_endo_phos_2", "Exo_endo_phos", "YwiC", "NICE-1", "DUF5416", "DUF1651", "FAF", "NAD-GH", "Pox_P21", "Orf78", "DUF2208", "DUF4834", "Shisa", "FAA_hydrolase_N", "ABC-3", "CCER1", "Sid-5", "Chromate_transp", "DUF5559", "PqiA", "CIDR1_gamma", "DUF3098", "Bee_toxin", "DUF4284", "SLC3A2_N", "Piezo_RRas_bdg", "Macoilin", "TP2", "DUF3346", "Neur_chan_memb", "Insulin_TMD", "DUF4491", "ThiJ_like", "DUF997", "Pox_E6", "DUF2232", "YqzL", "PUNUT", "DUF2206", "TMEM191C", "DUF2768", "DUF5313", "RIFIN", "Stevor", "CcmH", "zf-Nse", "DUF5393", "DUF2528", "Fibrillin_U_N", "EMI", "DUF5346", "ARL6IP6", "DUF1661", "Dicty_CAR", "DUF4231", "DMRT-like", "DUF5626", "Sirohm_synth_C", "vMSA", "Vfa1", "PTPRCAP", "Abhydrolase_9_N", "MWFE", "TraG_N", "Ni_hydr_CYTB", "DUF3810", "DUF485", "Neur_chan_LBD", "Glyco_hydro_57", "Papilloma_E5", "DUF2852", "zf-LITAF-like", "Keratin_2_head", "DUF2631", "STE3", "SecG", "FDX-ACB", "Dynamin_M", "DUF4417", "Psu", "CDH", "DUF16", "Syntaxin-6_N"]
features2 = ["PRA1", "GBV-C_env", "Pex24p", "DUF3320", "DUF1510", "GNAT_like", "Herpes_glycop", "UPF0561", "LRRCT", "Dicty_CTDC", "KAR9", "Arabinose_bd", "DctQ", "STAR_dimer", "Herpes_US9", "AsnC_trans_reg2", "PA26", "NPR3", "MAP17", "V_ATPase_I", "Connexin", "CDC45", "PIEZO", "TT_ORF2", "DUF2201_N", "Otopetrin", "DUF2956", "Presenilin", "DUF2828", "DUF2385", "T2SSM", "DUF2304", "NINJA_B", "Na_Ca_ex", "DUF4632", "DUF2157", "DUF2761", "Na_H_antiport_1", "Prominin", "GTP_cyclohydro2", "PseudoU_synth_1", "DUF5367", "BRI3BP", "PRIMA1", "Serpentine_r_xa", "C_GCAxxG_C_C", "Saf_2TM", "BatA", "NPCC", "COX1", "TctB", "DUF2207", "DUF3040", "7TM_GPCR_Srbc", "PKS_DE", "NdhL", "DUF3341", "Wzy_C", "UL42", "DUF4443", "Popeye", "OppC_N", "VEGFR-2_TMD", "DUF4790", "PsbW", "DUF588", "Bac_export_2", "CD225", "Voltage_CLC", "Rap1a", "Kdo_hydroxy", "Ribosomal_L30_N", "Ribosomal_L30", "YdjO", "SPOR", "DUF1345", "Flavi_capsid", "MFS_1", "CPP1-like", "DUF4391", "CoA_transf_3", "ERG2_Sigma1R", "GTP-bdg_M", "DUF4407", "DUF349", "DDE_1", "NAD_binding_1", "UBD", "SANT_DAMP1_like", "PsbX", "MHYT", "STAT2_C", "DUF1229", "COG5", "Srg", "DUF5134", "Orai-1", "APOBEC_C", "PhoLip_ATPase_C", "Git3", "Comm", "DUF1294", "SPC12", "UL17", "DUF1856", "PTCRA", "Frizzled", "COX7C", "Rab5ip", "GerA", "DUF1772", "Cytomega_TRL10", "FtsK_4TM", "AgrB", "DHHC", "7tm_7", "DUF5357", "DUF4233", "KASH", "TPPK_C", "FA_desaturase", "Osw5", "DUF3767", "Secretin_N_2", "SPX", "Plasmodium_Vir", "Tmemb_cc2", "TatC", "DUF4602", "Cadherin", "Cadherin_2", "Cadherin_C_2", "DUF4958", "Big_9", "Cadherin_4", "Cadherin_3", "Papilloma_E5A", "DUF5527", "DUF5320", "SusE", "He_PIG", "PepSY", "Cadherin_tail", "ORC5_C", "Zip", "HpaB_N", "NSP16", "7tm_2", "PapG_N", "ISK_Channel", "TMEM171", "PEX11", "GWT1", "Herpes_UL7", "YqgF", "Thioredoxin_8", "DUF4614", "DDRGK", "RNA_pol_Rpc4", "Hid1", "RPOL_N", "NARP1", "DUF1764", "RR_TM4-6", "PPL5", "TMEM214", "AIF_C", "eIF-3_zeta", "DUF913", "ALMT", "Ocular_alb", "Med15_fungi", "DUF4159", "Atrophin-1", "PRP38_assoc"]
features3 = ["PRP38_assoc", "DUF3915", "DUF4064", "VanW", "DUF2417", "UPAR_LY6", "Val_tRNA-synt_C", "TFR_dimer", "Cyclase", "Dpy19", "H_PPase", "BRCT_3", "Longin", "DUF1601", "DUF996", "Host_attach", "DUF3367", "DUF4106", "DUF3784", "DUF3099", "ABC2_membrane_3", "CBM9_2", "SRX", "BLM_N", "DUF4574", "ERM", "IclR", "Spc7", "TPR_MLP1_2", "HIP1_clath_bdg", "DUF2205", "Cnn_1N", "YabA", "LMBR1", "YtxH", "Bac_rhamnosid6H", "DUF1102", "GNVR", "DUF4200", "Mpp10", "CPSF100_C", "SDA1", "Nop14", "DUF3306", "DDHD", "RPN2_C", "SLC12", "BUD22", "CCSAP", "Tim54", "Nha1_C", "SID-1_RNA_chan", "Folate_carrier", "FAM60A", "XAP5", "SpoIIIAH", "DNA_pol_phi", "Peptidase_S64", "Merozoite_SPAM", "DUF4045", "DUF4471", "Nop53", "SpoIIP", "RAB3GAP2_C", "SAPS", "Dynamin_N", "Gti1_Pac2", "DUF3292", "TRAP_alpha", "FYDLN_acid", "Smg8_Smg9", "TRP", "ANF_receptor", "AcylCoA_DH_N", "DND1_DSRM", "DUF929", "Sh_2", "MotB_plug", "DarA_C", "ASC", "SepRS_C", "Adeno_E1A", "NiFe-hyd_HybE", "Caskin-Pro-rich", "TERT_thumb", "DUF4962", "SUIM_assoc", "DUF1242", "JmjN", "DUF745", "Ground-like", "BES1_N", "AP-5_subunit_s1", "HD-ZIP_N", "EBV-NA1", "Sre", "YlaC", "HlyIII", "DUF2614", "DUF1211", "DUF3278", "DUF4131", "TRAM_LAG1_CLN8", "RDD", "DUF420", "UL16", "Gp_dh_C", "SieB", "MscS_TM", "DUF898", "TMEM234", "Claudin_2", "DUF4149", "E1-E2_ATPase", "PHO4", "HOK_GEF", "RMI2", "PTR2", "SHNi-TPR", "DUF1275", "CopD", "UPF0182", "SK_channel", "DUF2516", "7TM_GPCR_Str", "CitMHS", "Frag1", "DUF621", "FYTT", "VATC", "RET_CLD1", "SRTM1", "Big_1", "Gag_p24", "Tryp_inh"]
features4 = ["Tryp_inh", "DUF1700", "DUF5551", "DUF3504", "FAM75", "TonB_N", "DUF4199", "DUF4162", "NOA36", "Lambda_CIII", "Apis_Csd", "Porph_ging", "Nucleoside_tran", "Phage_Gp23", "DUF2480", "Rsa3", "ABC1", "DUF948", "KELK", "V-ATPase_G", "Rtf2", "DUF4569", "GRP", "OATP", "DUF4776", "DUF4746", "EIIBC-GUT_N", "Auts2", "UPF0242", "Promethin", "RNA_pol_Rpb2_4", "DUF1980", "DUF1624", "Podovirus_Gp16", "GPR_Gpa2_C", "DUF2678", "Form_Nir_trans", "DUF5628", "Phage_holin_3_6", "7TM_GPCR_Srd", "COG7", "SchA_CurD", "Tat", "7TM_GPCR_Sri", "Ferric_reduct", "Epiglycanin_C", "DUF5588", "DUF5540", "YajC", "Blt1", "MdcE", "DUF1467", "UCR_Fe-S_N", "TPR_11", "Ncstrn_small", "Pox_A14", "DUF4220", "Nitr_red_alph_N", "DUF4718", "SR-25", "DUF1645", "PI3K_1B_p101", "Rrn6", "GREB1", "Chorion_2", "FAM199X", "CCDC24", "DUF4667", "DUF1635", "Miga", "SARAF", "DUF508", "DUF3446", "Apt1", "Peptidase_C92", "Herpes_BBRF1", "DUF2946", "Choline_transpo", "Bac_rhodopsin", "DUF2070", "EphA2_TM", "7tm_3", "Gaa1", "DUF543", "Peripla_BP_6", "DUF5438", "GluR_Homer-bdg", "HR1", "YgaB", "Sp38", "MVL", "Leader_Erm", "Psm4", "T2SSN", "NCD3G", "Glyco_trans_A_1", "SIN1_PH", "MNE1", "PEN-2", "DUF5478", "Lipin_mid", "DUF3967", "Phenol_monoox", "Fijivirus_P9-2", "Mucin", "Poxvirus_B22R_C", "DNTTIP1_dimer", "PSI_PsaJ", "DUF346", "DUF4368", "eIF-5_eIF-2B", "zf-HYPF", "Nup54_57_C", "vATP-synt_E", "ELP6", "PMT_4TMC", "DUF4013", "Herpes_LMP1", "DUF2380", "VRP3", "DUF2970", "LAP1C", "MDFI", "CLN3", "Raftlin", "DUF4633", "Abhydro_lipase", "MCM_bind", "AF-4", "Transmemb_17", "S1", "FrhB_FdhB_N", "CoA_binding_3", "7TM_GPCR_Srt", "BaxI_1", "RSB_motif", "Vpu", "DUF5385", "DUF515", "FixH", "Pex14_N", "Band_3_cyto", "MYCBPAP", "SMYLE_N", "DUF1180", "zf-SAP30", "DUF1516", "DUF2469", "YlzJ", "S1_2", "Gal_mutarotas_2", "DUF402", "GlcV_C_terminal", "Striatin", "QWRF", "Menin", "CobT", "DUF3498", "Kp4", "DUF1203", "Arm", "DUF412", "TMEM192", "PhoR", "ResB", "DUF5549", "CXCR4_N"]
features5 = ["CXCR4_N", "COX2_TM", "HA2", "CDP-OH_P_transf", "HTH_IclR", "Fibrillarin_2", "AAA_29", "T2SSE", "AAA_23", "AAA_22", "AAA_7", "DEAD", "TMEM208_SND2", "BMP2K_C", "UPF0542", "SH3_1", "Pkinase_Tyr", "Pkinase", "Tmp39", "SH2", "SH3_3", "SH3_9", "SH3_2", "SH3_6", "F_actin_bind", "FRG2", "Mononeg_mRNAcap", "Glyco_hydro_36C", "FAM76", "FliG_M", "SVM_signal", "YrhC", "OAD_gamma", "DUF443", "Brr6_like_C_C", "HemY_N", "HILPDA", "Ninjurin", "BH3", "Copper-fist", "DUF2675", "Ilm1", "Bradykinin", "DUF2104", "CaMKII_AD", "PD-C2-AF1", "EIN3", "AIM3", "MFS18", "Vitelline_membr", "XRN1_DBM", "2TM", "Glyco_transf_22", "DUF4440", "SnoaL_3", "SnoaL_4", "DUF5565", "AphA_like", "KLRAQ", "ATG16", "EzrA", "DUF4795", "Spectrin", "bZIP_1", "bZIP_2", "Atg14", "Ax_dynein_light", "ADIP", "DUF1465", "WD40_alt", "Troponin", "Jnk-SapK_ap_N", "ZapB", "XhlA", "Occludin_ELL", "Spc24", "FapA", "Toxin_GhoT_OrtT", "DUF5560", "CBM_10", "HIF-1a_CTAD", "C5HCH", "Lge1", "HIGH_NTase1", "GvpK", "Filament", "Transcrip_act", "AAA_13", "Rootletin", "DHR10", "L27", "MIP-T3_C", "JIP_LZII", "zf-RAG1", "DUF3648", "DUF2949", "DUF2238", "DGOK", "DUF3556", "Tudor_3", "Pentapeptide_4", "DUF4307", "MRP_L53", "Eryth_link_C", "Sec_GG", "Dicty_REP", "Furin-like", "Recep_L_domain", "Oxidored_q4", "GF_recep_IV", "Glyoxalase", "ig", "Ig_2", "Peptidase_C7", "Bacteriocin_II", "LELP1", "PTEN_C2", "RNA_pol_Rpb1_R", "zf-P11", "DUF1431", "DUF3377", "DUF959", "COPI_assoc", "FixS", "Kelch_5", "RRN9", "Gyro_capsid", "I-set", "Ig_3", "C2-set_2", "Haspin_kinase", "Arabinose_Iso_C", "PDGLE", "Pkinase_C", "YlmH_RBD", "Corona_NS3b", "APH", "Kinase-like", "KIND", "Pkinase_fungal", "DUF5538", "Neisseria_TspB", "PBD", "DUF281", "Hit1_C", "Rhomboid_SP", "V-set", "Ig_6", "Aim21", "Ig_5", "Rubella_E1", "FLYWCH", "AdenylateSensor", "Fe_hyd_lg_C", "HycA_repressor", "DEC1", "CCDC71L", "Ycf70", "Plk4_PB1", "Rabaptin", "COX3", "C2-C2_1", "Toxin_18", "CD34_antigen", "Innexin", "RNA_POL_M_15KD", "Zn-ribbon_8", "DUF2483", "zf_CopZ", "DUF4451"]
features6 = ["DUF4451", "PLA2_inh", "AA_permease_2", "ECF_trnsprt", "FERM_F1", "CPSF73-100_C", "FERM_F2", "Jak1_Phl", "ANXA2R", "HobA", "DUF4899", "Olduvai", "RCDG1", "Ig_4", "Izumo-Ig", "Herpes_UL43", "BBIP10", "Ion_trans", "PIG-U", "PKD_channel", "Ank_3", "Ank", "Ank_2", "Ank_4", "Ank_5", "DUF2358", "GCR", "MutS_IV", "Phage_holin_4_1", "BRCA2", "NUDIX", "CLP_protease", "Hormone_recep", "MADF_DNA_bdg", "Bacillus_PapR", "LPD37", "DUF5605", "N6_N4_Mtase", "Hamartin", "BMF", "Acyl_transf_3", "DUF4820", "zf-HIT", "DUF4620", "BNR_assoc_N", "KRTAP", "PQ-loop", "zf-RING_13", "GETHR", "Arrestin_N", "MRAP", "LRR_9", "SKG6", "SARG", "DUF3275", "Prog_receptor", "CytochromB561_N", "S4_2", "zf-TRM13_CCCH", "Imm31", "COesterase", "Abhydrolase_3", "Oest_recep", "DUF5400", "DUF1882", "OmpH", "FemAB", "Histone_HNS", "DUF401", "DUF87", "Adeno_E3B", "Kelch_6", "HEPN_MAE_28990", "Peptidase_C39_2", "Flg_hook", "ERbeta_N", "SCFA_trans", "Prismane", "DUF2827", "MtlR", "DUF4028", "Yae1_N", "KH_6", "TT_ORF1"]
features = features1 + features2 + features3 + features4 + features5 + features6


method_names = [
    "count_zinc_fingers",
    "count_helix_loop_helix",
    "count_SH3_domains",
    "count_leucine_zipper",
    "count_serine_threonine_kinase_domains",
    "count_PH_domains",
    "count_WW_domains",
    "count_EF_hand_domains",
    "find_cam_binding_domains"
]

amino_acid_names_dep = [
    'Glutamic acid',
    'Glutamine',
    'Glycine',
    'Lysine',
    'Arginine',
    'normalized_amine_groups'
]
amino_acid_names = [
    'normalized_amine_groups',
    'Alanine',
    'Arginine',
    'Asparagine',
    'Aspartic acid',
    'Cysteine',
    'Glutamic acid',
    'Glutamine',
    'Glycine',
    'Histidine',
    'Isoleucine',
    'Leucine',
    'Lysine',
    'Methionine',
    'Phenylalanine',
    'Proline',
    'Serine',
    'Threonine',
    'Tryptophan',
    'Tyrosine',
    'Valine'
]


# smarts_patterns_filtered = {
#     'hydroxyl': '[OH]',
#     'amino': '[NX3;H2,H1;!$(NC=O)]',
#     'aromatic_nitrogen': '[nX2]',
#     'amide': '[NX3][CX3](=O)[#6]',
#     'aromatic_nitrogen': '[nX2]',
#     'alcohol': '[OH]',
#     'benzyl': '[#6]c1ccccc1',
# }
smarts_patterns_filtered_all = {
    'hydroxyl': '[OH]',
    'carboxyl': 'C(=O)O',
    'amino': '[NX3;H2,H1;!$(NC=O)]',
    'aldehyde': '[CX3H1](=O)[#6]',
    'ketone': '[#6][CX3](=O)[#6]',
    'ester': '[#6]C(=O)O[#6]',
    'amide': '[NX3][CX3](=O)[#6]',
    'ether': '[#6]O[#6]',
    'nitrile': '[CX2]#[NX1]',
    'sulfone': '[SX4](=[OX1])(=[OX1])([#6])[#6]',
    'sulfoxide': '[SX3](=O)[#6]',
    'thiol': '[#16H]',
    'halide': '[F,Cl,Br,I]',
    'phenyl': 'c1ccccc1',
    'benzyl': '[#6]c1ccccc1',
    'alkene': 'C=C',
    'alkyne': 'C#C',
    'aromatic_nitrogen': '[nX2]',
    'hydrazone': '[#6]=[NX2]-[#6]',
    'imine': '[NX2]=[CX3]',
    'alkyl_halide': '[CX4][F,Cl,Br,I]',
    'aromatic': 'c1ccccc1',
    'alcohol': '[OH]',
    'epoxide': 'O1CC1',
    'alkane': 'C'
}

chemical_functional_groups = [
    "hydroxyl", "carboxyl", "amino", "aldehyde",
    "ketone", "ester", "amide", "ether", "nitrile", "sulfone", "sulfoxide",
    "thiol", "halide", "phenyl", "benzyl", "alkene", "alkyne", "aromatic_nitrogen",
    "hydrazone", "imine", "alkyl_halide", "aromatic", "alcohol", "epoxide",
    "alkane"
]

chemfeatures = [
    "basic_in_acidic_conditions",
    'LogP',
    'CalcKappa1', 'CalcKappa2', 'CalcKappa3',
    'TPSA', 'RotatableBonds',
    "acidic_in_acidic_conditions",
    "hydrophobic_in_acidic_conditions",
    "hydrophilic_in_acidic_conditions",
    "polar_groups",
    "Molecular_Weight",
    "Polarity",
    "Hydrophobicity",
]



import re

def count_zinc_fingers(sequence):
    """Estimate the number of zinc finger domains based on a Cys-His pattern."""
    pattern = r'C.{2,4}C.{12}H.{3,5}H'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_helix_loop_helix(sequence):
    """Estimate the number of helix-loop-helix domains based on a basic pattern."""
    pattern = r'[A-Z]{20,40}L[A-Z]{5,10}L[A-Z]{20,40}'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_SH3_domains(sequence):
    """Estimate the number of SH3 domains based on a proline-rich pattern."""
    pattern = r'P.{2}P.{2}P'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_leucine_zipper(sequence):
    """Estimate the number of leucine zipper domains based on leucine repeats."""
    pattern = r'(L.{6}){4,}'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_serine_threonine_kinase_domains(sequence):
    """Estimate the number of serine/threonine kinase domains based on S/T-rich regions."""
    pattern = r'[ST]{5,}'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_PH_domains(sequence):
    """Estimate the number of PH domains based on a basic pattern."""
    # This is highly simplified and speculative; real PH domain prediction is complex
    pattern = r'[RK]{3,}[A-Z]{20,100}[RK]{3,}'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_WW_domains(sequence):
    """Estimate the number of WW domains based on tryptophan (W) presence."""
    pattern = r'W.{20,40}W'
    matches = re.findall(pattern, sequence)
    return len(matches)

def count_EF_hand_domains(sequence):
    """Estimate the number of EF-hand domains based on a calcium-binding motif."""
    pattern = r'D.{1,3}D.{1,3}E.{1,3}D'
    matches = re.findall(pattern, sequence)
    return len(matches)


def apply_method(sequence, method_name):
    method_function = globals().get(method_name)
    if method_function:
        return method_function(sequence)
    else:
        return None
    
def extract_hydrophilic_blocks(sequence):
    hydrophilic = set('RNDQEHKSTCPG')

    blocks = []
    current_block = {'type': None, 'start': 0, 'seq': ''}

    for i, residue in enumerate(sequence):
        if residue in hydrophilic:
            block_type = 'P'
        else:
            continue  # Skip non-standard amino acids

        if current_block['type'] == block_type:
            current_block['seq'] += residue
        else:
            if current_block['seq']:  # If not the first iteration
                current_block['end'] = i - 1
                blocks.append(current_block)
            current_block = {'type': block_type, 'start': i, 'seq': residue}

    # Add the last block
    if current_block['seq']:
        current_block['end'] = len(sequence) - 1
        blocks.append(current_block)

    return blocks


def extract_hydrophobic_blocks(sequence):
    hydrophobic = set('AVILMFYW')

    blocks = []
    current_block = {'type': None, 'start': 0, 'seq': ''}

    for i, residue in enumerate(sequence):
        if residue in hydrophobic:
            block_type = 'H'
        else:
            continue  # Skip non-standard amino acids

        if current_block['type'] == block_type:
            current_block['seq'] += residue
        else:
            if current_block['seq']:  # If not the first iteration
                current_block['end'] = i - 1
                blocks.append(current_block)
            current_block = {'type': block_type, 'start': i, 'seq': residue}

    # Add the last block
    if current_block['seq']:
        current_block['end'] = len(sequence) - 1
        blocks.append(current_block)
    return blocks 



def extract_blocks(sequence):
    hydrophobic = set('AVILMFYW')
    hydrophilic = set('RNDQEHKSTCPG')

    blocks = []
    current_block = {'type': None, 'start': 0, 'seq': ''}

    for i, residue in enumerate(sequence):
        if residue in hydrophobic:
            block_type = 'H'
        elif residue in hydrophilic:
            block_type = 'P'
        else:
            continue  # Skip non-standard amino acids

        if current_block['type'] == block_type:
            current_block['seq'] += residue
        else:
            if current_block['seq']:  # If not the first iteration
                current_block['end'] = i - 1
                blocks.append(current_block)
            current_block = {'type': block_type, 'start': i, 'seq': residue}

    # Add the last block
    if current_block['seq']:
        current_block['end'] = len(sequence) - 1
        blocks.append(current_block)

    return blocks
def find_longest_block(blocks):
    # Filter blocks with more than 3 amino acids
    valid_blocks = [block for block in blocks if len(block['seq']) > 3]

    # Find the longest block
    if not valid_blocks:
        return None  # Return None if no valid blocks are found

    longest_block = max(valid_blocks, key=lambda block: len(block['seq']))
    return longest_block
import pandas as pd

# Assuming the extract_blocks and find_longest_block functions are defined as before

# Example DataFrame
df = pd.DataFrame({
    'protein_sequence': ["AVVVIVVDRRRKLLLLKKEEAVVVV", "RRRAAAVVVV", "LLLLPPPPYYYY", "VVVVDDEE"]
})

# Function to apply on the protein_sequence column
def get_longest_hydrophilic(sequence):
    blocks = extract_hydrophilic_blocks(sequence)
    longest_block = find_longest_block(blocks)
    if longest_block:
        # Returning the sequence of the longest hydrophilic block for simplicity
        return longest_block['seq']
    else:
        return None

# Apply the function and store the result in a new column for hydrophilic blocks

# Function to apply on the protein_sequence column
def get_longest_hydrophobic(sequence):
    blocks = extract_hydrophobic_blocks(sequence)
    longest_block = find_longest_block(blocks)
    if longest_block:
        # Returning the sequence of the longest block for simplicity
        return longest_block['seq']
    else:
        return None

# Apply the function and store the result in a new column

def find_cam_binding_domains(sequence):
    """
    Attempts to identify potential Calmodulin (CaM) ligand-binding domains
    in a protein sequence based on a simplified pattern.

    Args:
    sequence (str): The protein sequence.

    Returns:
    list: A list of potential CaM-binding sequences.
    """
    # Define a simplified regex pattern for CaM-binding domains
    # R/K at position 1, hydrophobic (VILMF) at position 5 and 10
    # This is a very simplified approximation and will not be fully accurate
    pattern = r'[RK].[^RKVILMF]{3}[VILMF].[^RKVILMF]{4}[VILMF]'
    
    # Find all sequences matching the pattern
    matches = re.findall(pattern, sequence)
    
    return len(matches)

method_names = [
    "count_zinc_fingers",
    "count_helix_loop_helix",
    "count_SH3_domains",
    "count_leucine_zipper",
    "count_serine_threonine_kinase_domains",
    "count_PH_domains",
    "count_WW_domains",
    "count_EF_hand_domains",
    "find_cam_binding_domains"
]


# Function to calculate the count of each SMARTS pattern in a molecule
def count_smarts_patterns(smiles, patterns):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return 0
    if mol is None: return [0] * len(patterns)  # Return a list of zeros if the molecule can't be parsed
    counts = []
    for pattern in patterns.values():
        smarts = Chem.MolFromSmarts(pattern)
        count = len(mol.GetSubstructMatches(smarts))
        counts.append(count)
    return counts




def calculate_properties(smiles):
    mol = Chem.MolFromSmiles(smiles)
    logp = Crippen.MolLogP(mol)
    kappa1 = rdMolDescriptors.CalcKappa1(mol)
    kappa2 = rdMolDescriptors.CalcKappa2(mol)
    kappa3 = rdMolDescriptors.CalcKappa3(mol)
    tpsa = Descriptors.TPSA(mol)
    rotatable_bonds = rdMolDescriptors.CalcNumRotatableBonds(mol)
    return logp, kappa1, kappa2, kappa3, tpsa, rotatable_bonds
def save_list_to_json_file(my_list, file_path):
    """
    Saves a list to a JSON file.

    Parameters:
    - my_list: The list to be saved.
    - file_path: The path to the file where the list should be saved.
    """
    with open(file_path, 'w') as file:
        json.dump(my_list, file)
def write_string_to_file(content, filename):
    """
    Writes a given string to a file specified by the filename.

    Parameters:
    - content: The string content to write to the file.
    - filename: The name (and path) of the file to write to.
    """
    with open(filename, 'w') as file:
        file.write(content)


def removeoutliers (df):
	Q1 = df['Kd'].quantile(0.25)
	Q3 = df['Kd'].quantile(0.75)
	IQR = Q3 - Q1
	lower_bound = Q1 - 2.5 * IQR
	upper_bound = Q3 + 2.5 * IQR
	df['protein_length'] = df['protein_sequence'].apply(len)
	outliers = df[(df['Kd'] < lower_bound) | (df['Kd'] > upper_bound)]
	outlier_combinations = outliers[['SMILES', 'protein_sequence']].drop_duplicates()
	clean_df = pd.merge(df, outlier_combinations, on=['SMILES', 'protein_sequence'], how='outer', indicator=True).query('_merge=="left_only"').drop(columns=['_merge'])
	return clean_df 
def contains_one(platform_list):
    return 1 in platform_list
def truncate_filename(filename, max_length=30):
    # Split the filename from its extension
    name, ext = os.path.splitext(filename)
    
    # If the filename exceeds the max_length, truncate it and reattach the extension
    if len(filename) > max_length:
        truncated_name = name[:max_length - len(ext)]  # Reserve space for the extension
        return truncated_name + ext
    else:
        return filename



def linearKd  ( df, platform, variable, order, outputdir, prefix ):
    print ( f'{platform} ')
    print ( f'{variable} ')
    print ( f' ^{order}')
    print ( f' {prefix} ')


    interaction_df = pd.DataFrame(index=df.index)
    for feature_a in variable:
        for feature_b in platform:
            interaction_df[f'{feature_a}_x_{feature_b}'] = df[feature_a] * df[feature_b]
    y = df['Kd']  # Target variable
    combined_df = pd.concat([interaction_df], axis=1)
    poly = PolynomialFeatures(degree=order, interaction_only=True, include_bias=False)
    X_poly = poly.fit_transform(interaction_df)
    
    count = len(interaction_df)
    print ( f'Count: {count}')
    if count < 10:
        return
    
    
    
    feature_names = poly.get_feature_names_out(interaction_df.columns)
    X_train, X_test, y_train, y_test = train_test_split(X_poly, y, test_size=0.2, random_state=42)
    model = GradientBoostingRegressor(n_estimators=1000, learning_rate=0.1, max_depth=3, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    
    mse = mean_squared_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    print(f"Mean Squared Error (MSE): {mse:.2f}")
    print(f"R-squared (R2): {r2:.2f}")
    # accuracy = accuracy_score(y_test, y_pred)
    # print(f'Accuracy: {accuracy:.4f} X_train {len(X_train)}  y_train {len(y_train)}')
    # feature_importances = model.feature_importances_
    # indices = np.argsort(feature_importances)[-10:]
    # print ( feature_importances )
    mse = mean_squared_error(y_test, y_pred)
    # print("Equation components (feature: coefficient):")
    # for name in (feature_names):
    #         print(f"{name} ")
    top_features_df = [] #pd.DataFrame(columns=['Feature Name', 'Coefficient'])
    SAVEit = False
    if count > 10 and mse < 10 and r2 > 0.7:
        SAVEit = True
    if SAVEit: 
        description = """
	Gradient Boosting Regressor trained on polynomial features of the input data. 
	The input data was transformed using PolynomialFeatures with degree=N, where N is the degree of the polynomial features. 
	The model consists of M decision trees (estimators) that sequentially correct the errors of the predecessors.
	"""

	# Replace N with the actual degree and M with the number of estimators
        description = description.replace("N",f"{order}")  # Example: degree 2
        description = description.replace("M", str(1000))  # Example: 100 estimators
        feature_importances = model.feature_importances_
        polynomial_features = poly.get_feature_names_out()
        importance_str = "\n".join([f"{feat}: {importance}" for feat, importance in zip(polynomial_features, feature_importances)])
        description += f"\n {importance_str}\nMSE: {mse}"
        description += f'\nR-squared (R2): {r2:.2f}\n'
        description += f'\nSample size: {count}\n'
        description += f'\n{platform}\n'
        description += f'\n{variable}\n'
        description += f'\n{prefix}\n'
        prefix = truncate_filename ( prefix )
        write_string_to_file (description, f'{outputdir}/{prefix}__eq.out')
def extract_longest_charged_polar_block(protein_sequence):
    # Define charged and polar amino acids
    charged_polar_amino_acids = set("RKHDEQNSTY")

    longest_block = ""
    current_block = ""
    
    for residue in protein_sequence:
        if residue in charged_polar_amino_acids:
            current_block += residue  # Add to current block
        else:
            # End of a block, check if it's the longest
            if len(current_block) > len(longest_block):
                longest_block = current_block
            current_block = ""  # Reset current block
    
    # Check again after the loop in case the sequence ends with the longest block
    if len(current_block) > len(longest_block):
        longest_block = current_block

    return longest_block
def extract_shortest_cysteine_stretch(protein_sequence):
    shortest_stretch = None
    cysteine_positions = [i for i, residue in enumerate(protein_sequence) if residue == 'C']

    # Iterate over cysteine positions, checking stretches of 3 cysteines
    for i in range(len(cysteine_positions) - 2):
        start_pos = cysteine_positions[i]
        end_pos = cysteine_positions[i + 2]  # The third cysteine from the start_pos
        stretch_length = end_pos - start_pos + 1  # +1 to include both start and end positions
        
        stretch = protein_sequence[start_pos:end_pos + 1]  # Extract the stretch
        
        if shortest_stretch is None or len(stretch) < len(shortest_stretch):
            shortest_stretch = stretch

    return shortest_stretch

def extract_longest_aromatic_block(protein_sequence):
    # Define aromatic amino acids
    aromatic_amino_acids = set("FYW")

    longest_block = ""
    current_block = ""
    
    for residue in protein_sequence:
        if residue in aromatic_amino_acids:
            current_block += residue  # Add to current block
        else:
            # End of a block, check if it's the longest
            if len(current_block) > len(longest_block):
                longest_block = current_block
            current_block = ""  # Reset current block
    
    # Check again after the loop in case the sequence ends with the longest block
    if len(current_block) > len(longest_block):
        longest_block = current_block

    return longest_block
df = pd.read_csv('./bt-chem.csv')
df = removeoutliers (df )
print (len(df))
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df.dropna(subset=['Kd'], inplace=True)
# df['Kd_category'] = (df['Kd'] < 1).astype(int) - (df['Kd'] > 10).astype(int)
# df['Low_Kd'] = (df['Kd'] < 10).astype(int)
# Calculate the count of nucleophilic amine groups (K, R, and N-terminus) and chain length
df['amine_group_count'] = df['protein_sequence'].apply(lambda x: x.count('K') + x.count('R') + 1)  # +1 for N-terminus
df['chain_length'] = df['protein_sequence'].apply(len)
df['normalized_amine_groups'] = df['amine_group_count'] / df['chain_length']
properties = df['SMILES'].apply(calculate_properties)
# print ('Low Kd  ', len(df[df['Low_Kd'] == 1])) 
# print ('High Kd  ', len(df[df['Low_Kd'] == 0])) 
pattern_counts = df['SMILES'].apply(lambda x: pd.Series(count_smarts_patterns(x, smarts_patterns_filtered_all)))
pattern_counts.columns = list(smarts_patterns_filtered_all.keys())
df = pd.concat([df, pattern_counts], axis=1)

for method_name in method_names:
    df[method_name] = df['protein_sequence'].apply(lambda sequence: apply_method(sequence, method_name))

df['hydrophobic_block'] = df['protein_sequence'].apply(get_longest_hydrophobic)
df['hydrophilic_block'] = df['protein_sequence'].apply(get_longest_hydrophilic)
df['polar_block'] = df['protein_sequence'].apply(extract_longest_charged_polar_block)
df['ccc_block'] = df['protein_sequence'].apply(extract_shortest_cysteine_stretch)
df['aromatic_block'] = df['protein_sequence'].apply(extract_longest_aromatic_block)

block_cop = ['amine_group_count', 'chain_length', 'normalized_amine_groups', 'hydrophobic_block', 'hydrophilic_block', 'polar_block', 'ccc_block', 'aromatic_block' ]

def protein_features():
    # return ['TFR_dimer']
    return random.sample(features, 1)
t = chemfeatures
def chem_features():
    return random.sample(t, 3)

for bc in block_cop:
    blocks = df[bc].unique().tolist()
    for i in range(0,len(blocks)):
        print ( f'\n\n\n\n\n\n\n{blocks[i]}\n\n\n\n\n')
        sub_df = df[df[bc] == blocks[i]]
        for order in range (1,7):
            for m in chemical_functional_groups:
                variable = chem_features (  )
                linearKd ( sub_df, [m], variable, order, './output', f'{i}{m}_{blocks[i]}')
            sampleChem = random.sample (chemical_functional_groups, 2 )
            linearKd ( sub_df, ['TPSA'], sampleChem, order, './output', f'{i}__sampleChem_{blocks[i]}')


# for m in features:
#     linearKd ( df, [m], variable, 2, './output', f'{m}_{i}')
#     for order in range (1,3):
#         for ch in method_names:
#             linearKd ( df, [ch,m], variable, order, './output', f'{m}_{i}_{ch}')
#             linearKd ( df, [ch], variable, order, './output', f'{i}_{ch}')


    
