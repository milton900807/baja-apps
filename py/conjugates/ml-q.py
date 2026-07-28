import re
from typing import List
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import PolynomialFeatures
from sklearn.metrics import accuracy_score, classification_report
from sklearn.pipeline import make_pipeline
import random

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
    "alkane", "LogP"
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




# features = ["MENTAL", "DUF3574", "DUF373", "TIL", "7tm_1", "DUF1385", "7TM_GPCR_Srsx", "...", "TMPIT", "Viral_NABP", "...", "DUF3346", "Neur_chan_memb", "Insulin_TMD", "..."]


def remove_outliers_for_large_groups(df, group_column='protein_sequence', target_column='Kd', min_group_size=5):
    """
    Removes potential outliers from a DataFrame within each group defined by 'group_column',
    based on the 'target_column' values using the Interquartile Range (IQR) method, but only
    for groups with a number of observations greater than 'min_group_size'.
    
    Args:
    df (pd.DataFrame): The input DataFrame.
    group_column (str): The name of the column to group by.
    target_column (str): The name of the column to analyze for outliers.
    min_group_size (int): The minimum number of observations a group must have to consider
                          outlier removal.
    
    Returns:
    pd.DataFrame: A new DataFrame with potential outliers removed from groups meeting
                  the size criterion.
    """
    # Function to identify outliers within a group
    def identify_outliers(group):
        if len(group) >= min_group_size:
            q1 = group.quantile(0.25)
            q3 = group.quantile(0.75)
            iqr = q3 - q1
            return (group < (q1 - 2 * iqr)) | (group > (q3 + 2 * iqr))
        else:
            return pd.Series([False] * len(group), index=group.index)
    outlier_mask = df.groupby(group_column)[target_column].transform(identify_outliers)
    filtered_df = df[~outlier_mask]
    return filtered_df

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


def count_gp_proximity(protein_sequence, distance):
    gp_count = 0  # Initialize count of G-P or P-G pairs
    sequence_length = len(protein_sequence)  # Get the length of the protein sequence
    
    # Iterate through the protein sequence
    for i, amino_acid in enumerate(protein_sequence):
        # Check for Glycine (G)
        if amino_acid == 'G':
            # Check for Proline (P) within 'distance' amino acids of the Glycine
            for j in range(max(0, i - distance), min(sequence_length, i + distance + 1)):
                if protein_sequence[j] == 'A':
                    gp_count += 1
                    break  # Once a pair is found, move to the next position

        # Check for Proline (P)
        elif amino_acid == 'A':
            # Check for Glycine (G) within 'distance' amino acids of the Proline
            for j in range(max(0, i - distance), min(sequence_length, i + distance + 1)):
                if protein_sequence[j] == 'G':
                    gp_count += 1
                    break  # Once a pair is found, move to the next position
    
    return gp_count


def normalized_glycine_distances(peptide_sequence):
    # Find the positions (indexes) of all glycines in the sequence
    glycine_positions = [i for i, amino_acid in enumerate(peptide_sequence) if amino_acid == 'G']
    
    # Calculate the distances between consecutive glycines
    distances = [glycine_positions[i+1] - glycine_positions[i] for i in range(len(glycine_positions)-1)]
    
    # Sum up the distances
    total_distance = sum(distances)
    
    # Normalize the total distance by the length of the peptide sequence
    normalized_distance = total_distance / len(peptide_sequence) if len(peptide_sequence) > 0 else 0
    
    return normalized_distance



# Define a function that checks if a SMILES string is valid by trying to create an RDKit molecule object from it
def is_valid_smiles(smiles):
    mol = Chem.MolFromSmiles(smiles)
    return mol is not None  # Returns True if mol creation was successful, False otherwise



def sum_feature_values(df, features):
    """
    Sum the numbers from each specified feature in a DataFrame.
    
    Parameters:
    - df: A pandas DataFrame.
    - features: A list of strings representing the feature/column names in the DataFrame.
    
    Returns:
    A dictionary with the feature names as keys and their corresponding sums as values.
    """
    feature_sums = {}
    for feature in features:
        if feature in df.columns:
            feature_sums[feature] = df[feature].sum()
        else:
            print(f"Warning: '{feature}' not found in DataFrame.")
    return feature_sums

def analyze_and_plot(df, grouping_features, chemical_features, output_file, plot_file):
    grouped = df.groupby(grouping_features)
    print ( len(grouped), ' grouping by ', grouping_features )
    print ( grouped.groups.keys() )
    
    for name, group in grouped:
        print ( name )    
    
    with open(output_file, "w") as file:
        all_correlations = {}
        i = 0
        correlations_data = []
        for group_values, group in grouped:
            group_correlations = {}
            for feature in chemical_features:
                # Ensure the group has non-null Kd and chemical feature values
                valid_data = group.dropna(subset=["Kd", feature])
                if not valid_data.empty and len(valid_data)>100:
                    correlation, _ = pearsonr(valid_data[feature], valid_data["Kd"])
                    group_correlations[feature] = correlation
                    file.write(f"{group['Name'].iloc[0]} {group_values}, {feature}, {correlation}\n")
                    all_correlations.setdefault(feature, []).append(correlation)
                    correlations_data.append({
                        "GroupName": str(len(group)) + '  ' + group['Name'].iloc[0] + group['Name'].iloc[1],
                        "GroupValues": len(group_values),  # This may need adjustment based on your grouping
                        "Feature": feature,
                        "Correlation": correlation
                    })
                    
        correlations_df = pd.DataFrame(correlations_data)
        pivot_df = correlations_df.pivot_table(index=['GroupName', 'GroupValues'], columns='Feature', values='Correlation')
        # pivot_df.to_csv ( 'pivot.csv')
        plt.figure(figsize=(50, 40))
        sns.heatmap(pivot_df, annot=True, cmap='coolwarm', fmt=".2f")
        plt.title('Correlation with Kd across Groups and Features')
        plt.ylabel('Group Name and Values')
        plt.xlabel('Chemical Feature')
        plt.tight_layout()
        plt.savefig(f"heatmap{i}_.png")
        plt.close()
        plt.figure(figsize=(20, 12))
        for feature, correlations in all_correlations.items():
            if isinstance(correlations, list):
                sns.barplot(x=list(range(len(correlations))), y=correlations, label=feature)
        plt.title('Correlation of Chemical Features with Kd across Groups')
        plt.xlabel(f'Group')
        plt.ylabel('Correlation with Kd')
        plt.legend(title='Chemical Feature')
        plt.tight_layout()
        plt.savefig(f"{i}_.png")
        i+=1
        plt.close()


def calculate_properties(smiles):
    mol = Chem.MolFromSmiles(smiles)
    logp = Crippen.MolLogP(mol)
    kappa1 = rdMolDescriptors.CalcKappa1(mol)
    kappa2 = rdMolDescriptors.CalcKappa2(mol)
    kappa3 = rdMolDescriptors.CalcKappa3(mol)
    tpsa = Descriptors.TPSA(mol)
    rotatable_bonds = rdMolDescriptors.CalcNumRotatableBonds(mol)
    return logp, kappa1, kappa2, kappa3, tpsa, rotatable_bonds


 
df = pd.read_csv('./bt-chem.csv')
df['Kd'] = pd.to_numeric(df['Kd'], errors='coerce')
df.dropna(subset=['Kd'], inplace=True)
df['Kd_category'] = (df['Kd'] < 1).astype(int) - (df['Kd'] > 10).astype(int)
df['Low_Kd'] = (df['Kd'] < 1).astype(int)
# Calculate the count of nucleophilic amine groups (K, R, and N-terminus) and chain length
df['amine_group_count'] = df['protein_sequence'].apply(lambda x: x.count('K') + x.count('R') + 1)  # +1 for N-terminus
df['chain_length'] = df['protein_sequence'].apply(len)
df['normalized_amine_groups'] = df['amine_group_count'] / df['chain_length']
properties = df['SMILES'].apply(calculate_properties)
# df[['LogP', 'CalcKappa1', 'CalcKappa2', 'CalcKappa3', 'TPSA', 'RotatableBonds']] = pd.DataFrame(properties.tolist(), index=df.index)
    
pattern_counts = df['SMILES'].apply(lambda x: pd.Series(count_smarts_patterns(x, smarts_patterns_filtered_all)))
pattern_counts.columns = list(smarts_patterns_filtered_all.keys())
df = pd.concat([df, pattern_counts], axis=1)
# df = df[df['Kd_category'] != 0]

# logp, kappa1, kappa2, kappa3, tpsa, rotatable_bonds
##########################################################################################################
# properties = df['SMILES'].apply(calculate_properties)
# df[['LogP', 'CalcKappa1', 'CalcKappa2', 'CalcKappa3', 'TPSA', 'RotatableBonds']] = pd.DataFrame(properties.tolist(), index=df.index)
####################################################################################################################
# df.to_csv ( 'bt-chem.csv')
# feature_names = poly.get_feature_names_out()  # Replace 'x1', 'x2', etc. with your original feature names
# for ti in feature_names:
#     print ( ti )
# feature_names = poly.get_feature_names_out(input_features=features)  # Replace ['Feature1', 'Feature2'] with your original feature names
# sorted_indices = np.argsort(feature_importances)[::-1]
# N = 20#len(feature_importances)
# top_n_feature_importances = feature_importances[sorted_indices[:N]]
# top_n_feature_names = np.array(poly.get_feature_names_out())[sorted_indices[:N]]
# for nn in top_n_feature_names:
#     print ( nn )

def find_i_list ( _f, df, degree, N=50 ):
    if N > len(_f):
        N = len(_f)
    X = df[_f]  # Your list of features
    y = df['Low_Kd']  # Target variable
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    poly = PolynomialFeatures(degree=degree, interaction_only=True, include_bias=False)
    X_poly = poly.fit_transform(df[_f])
    X_train, X_test, y_train, y_test = train_test_split(X_poly, y, test_size=0.2, random_state=42)
    clf = RandomForestClassifier(n_estimators=1000, random_state=42)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f'Accuracy: {accuracy:.4f}')
    feature_importances = clf.feature_importances_
    # print ( feature_importances )
    
    sorted_indices = np.argsort(feature_importances)[::-1]
    top_n_feature_names = np.array(poly.get_feature_names_out(_f))[sorted_indices[:N]]
    top_n_feature_importances = feature_importances[sorted_indices[:N]]
    plt.figure(figsize=(12, 8))
    plt.rcParams.update({'font.size': 8})
    plt.subplots_adjust(left=0.15, right=0.95, top=0.85, bottom=0.30)
    plt.barh(range(N), top_n_feature_importances[::-1], align='center')  # Inverse to have the most important at the top
    plt.yticks(range(N), top_n_feature_names[::-1])
    plt.title("Feature Importances")
    plt.xlabel("Feature Descriptors")
    plt.ylabel("Relative Importance")
    plt.savefig(f"performance{degree}_.png")
    plt.close()
    
    
    poly_feature_names = poly.get_feature_names_out(input_features=_f)
    features_importance_df = pd.DataFrame({
        'Feature': poly_feature_names,
        'Importance': feature_importances
    }).sort_values(by='Importance', ascending=False)
    features_importance_df.to_csv (f"feature_importance_deg-{degree}.csv")
    return top_n_feature_names


def findC ( _f, _constant, df, degree, N=50, output_dir='output', file_='ft' ):
    if N > len(_f):
        N = len(_f)
    interaction_df = pd.DataFrame(index=df.index)
    for feature_a in _f:
        for feature_b in _constant:
            interaction_df[f'{feature_a}_x_{feature_b}'] = df[feature_a] * df[feature_b]
    y = df['Low_Kd']  # Target variable

    # Combining original features with the manually created interaction terms
    combined_df = pd.concat([interaction_df], axis=1)

    # Apply PolynomialFeatures
    poly = PolynomialFeatures(degree=degree, interaction_only=False, include_bias=False)
    X_poly = poly.fit_transform(combined_df)
    feature_names = poly.get_feature_names_out(combined_df.columns)
    X_train, X_test, y_train, y_test = train_test_split(X_poly, y, test_size=0.2, random_state=42)
    clf = RandomForestClassifier(n_estimators=1000, random_state=42)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    print(f'Accuracy: {accuracy:.4f} X_train {len(X_train)}  y_train {len(y_train)}')
    
    feature_importances = clf.feature_importances_
    indices = np.argsort(feature_importances)[-N:]
    
    print ( feature_importances )

    results_file_path = os.path.join(output_dir, f"model_results{i}.txt")

    # Extracting top N feature importances
    N = len(feature_importances) # Adjust based on how many top features you want to list
    indices = np.argsort(clf.feature_importances_)[-N:]
    top_feature_names = np.array(feature_names)[indices]
    top_feature_importances = clf.feature_importances_[indices]
    

    

    prr = False    
    for name, importance in zip(top_feature_names, top_feature_importances):
        if importance > 1:
            prr = True
    if prr:
        plt.figure(figsize=(20, 14))
        plt.title("Top N Feature Importances")
        plt.barh(range(N), top_feature_importances[indices], color='b', align='center')
        plt.yticks(range(N), np.array(top_feature_names)[indices])
        plt.xlabel("Relative Importance")
        plt.tight_layout()  # Automatically adjust subplot parameters to give specified padding
        plt.savefig(f"./output/{file_}_{N}.png")
        plt.close()
        with open(results_file_path, "w") as file:
            file.write(f"Model Accuracy: {accuracy:.4f}\n")
            file.write("Top Features Based on Importances:\n")
            for name, importance in zip(top_feature_names, top_feature_importances):
                file.write(f"{name}: {importance:.4f}\n")

        print(f"Results written to {results_file_path}")
        agg_df = df.groupby(['protein_sequence', 'SMILES']).agg(
            mean_Kd=('Kd', 'mean'),
            std_Kd=('Kd', 'std')
        ).reset_index()
        agg_df['label'] = agg_df.index
        fig, axs = plt.subplots(2, 1, figsize=(12, 10))
        axs[0].errorbar(agg_df['label'], agg_df['mean_Kd'], yerr=agg_df['std_Kd'], fmt='o', ecolor='r', capsize=5, linestyle='None', markersize=5, label='Mean Kd with Std Dev')
        axs[0].set_xlabel('Protein_Sequence + SMILES Index')
        axs[0].set_ylabel('Kd (mean with std dev)')
        axs[0].set_title('Mean Kd Values by Protein_Sequence and SMILES with Standard Deviation')
        axs[0].legend()
        axs[1].barh(top_feature_names, top_feature_importances, color='skyblue')
        axs[1].set_xlabel('Feature Importance')
        axs[1].set_title('Top Polynomial Features by Importance')
        plt.tight_layout()
        file_path = os.path.join(output_dir, f"kd_vs_protein_smiles{i}.png")
        plt.savefig(file_path)
        plt.close()

    
    return feature_importances, feature_names



def pnames(poly_features: List[str]) -> List[str]:
    feature_set = set()

    # Iterate over each polynomial feature string in the list
    for feature in poly_features:
    # Split the string into individual terms based on space or multiplication operator
        terms = re.split(r'[\s*]+', feature)

    # Iterate over each term
    for term in terms:
        # Check if the term includes an exponent (^) and split it if necessary
        base_term = term.split('^')[0]
        # Add the base term (i.e., the feature name without the exponent) to the set
        feature_set.add(base_term)

    # Convert the set to a list and return it
    return list(feature_set)

import os
output_dir = "output"
if not os.path.exists(output_dir):
    os.makedirs(output_dir)
# f = find_i_list ( features, data_with_features, 1, 200 )


def protein_features():
    return ['TFR_dimer']
def chem_features():
    # return chemical_functional_groups
    # return chemfeatures
    return random.sample(chemical_functional_groups, 12)


for i in range(10000):
    random_number = random.randint(2, 4) 
    p = protein_features (  )
    c = chem_features (  )
    top_features_names, top_features_importances  = findC ( p, c, df, random_number, 10000, output_dir, 'tfr')


    
