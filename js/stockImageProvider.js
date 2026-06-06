/**
 * Stock Image Provider - Resolves stock symbols or company names to their correct logo URL,
 * applying heuristics for derivatives, debentures, unsubscribed rights, promoter shares,
 * and company names.
 */

const IMAGE_FILES = [
    "ACLBSL", "ADBL", "ADBLD83", "AHL", "AHPC", "AKJCL", "AKPL", "ALBSL", "ALICL", "ANLB", 
    "API", "AVYAN", "Appolo Hydropower Limited", "BANDIPUR", "BARUN", "BBC", "BEDC", "BENI", 
    "BFC", "BFCPO", "BGWT", "BHCL", "BHDC", "BHL", "BHNC", "BHPL", "BJHL", "BNHC", "BNL", 
    "BNT", "BPCL", "BUNGAL", "C30MF", "CBBL", "CBLD88", "CCBD88", "CFCL", "CGH", "CHCL", 
    "CHDC", "CHL", "CIT", "CITY", "CIZBD86", "CKHL", "CLI", "CMF2", "CORBL", "CREST", 
    "CSY", "CYCL", "CZBIL", "DDBL", "DHEL", "DHPL", "DLBS", "DOLTI", "DORDI", "EBL", 
    "EBLD85", "EBLD86", "EBLD91", "EBLEB89", "ECL", "EDBL", "EHPL", "ENL", "FMDBL", 
    "FOWAD", "GBBD85", "GBBL", "GBIME", "GBIMESY2", "GBLBS", "GCIL", "GFCL", "GFCLPO", 
    "GHL", "GIBF1", "GILB", "GLBSL", "GLH", "GMFBS", "GMFIL", "GMLI", "GRDBL", "GSY", 
    "GUFL", "GUFLPO", "GVL", "H8020", "HATHY", "HBL", "HBLD83", "HBLD86", "HDHPC", 
    "HDL", "HEI", "HEIP", "HFIN", "HHL", "HIDCL", "HIDCLP", "HIMSTAR", "HLBSL", "HLI", 
    "HLICF", "HPPL", "HRL", "HURJA", "ICFC", "ICFCD88", "ICFCD89", "ICFCPO", "IGI", 
    "IHL", "ILBS", "ILI", "JBBL", "JBLB", "JFL", "JFLPO", "JHAPA", "JOSHI", "JSLBB", 
    "JSLBBP", "KBL", "KBLD86", "KBLD90", "KBLPO", "KBSH", "KDBY", "KDL", "KEF", "KHPL", 
    "KKHC", "KMCDB", "KPCL", "KSBBL", "KSBBLD87", "KSY", "Kalanga Hydro Limited", 
    "Kalinchock Hydropower Limited", "LBBL", "LBLD86", "LBLD88", "LEC", "LICN", "LLBS", 
    "LSL", "LSLPO", "LUBLPO", "LUK", "LVF2", "MABEL", "MAKAR", "MANDU", "MATRI", "MBJC", 
    "MBL", "MBLD2085", "MBLEF", "MBLPO", "MCHL", "MDB", "MDBLPO", "MEHL", "MEL", "MEN", 
    "MEPDL", "MERO", "MFIL", "MFLD85", "MHCL", "MHL", "MHNL", "MKCL", "MKHC", "MKHL", 
    "MKJC", "MLBBL", "MLBL", "MLBS", "MLBSL", "MMF1", "MMKJL", "MNBBL", "MNMF1", "MPFL", 
    "MSHL", "MSLB", "NABBC", "NABIL", "NABILD2089", "NABILD87", "NABILP", "NADEP", 
    "NBBD2085", "NBF2", "NBF3", "NBL", "NBLD82", "NBLD85", "NBLD87", "NCCD86", "NESDO", 
    "NFS", "NGPL", "NHDL", "NHPC", "NIBD84", "NIBLGF", "NIBLSTF", "NIBSF2", "NICA", 
    "NICAD2091", "NICAP", "NICBF", "NICD88", "NICFC", "NICGF2", "NICL", "NICLBSL", 
    "NICSF", "NIFRA", "NIFRAGED", "NIL", "NIMB", "NIMBD90", "NIMBPO", "NLG", "NLIC", 
    "NLICL", "NMB", "NMB50", "NMBD2085", "NMBHF2", "NMBMF", "NMBPO", "NMFBS", "NMIC", 
    "NMLBBL", "NRIC", "NRM", "NRN", "NSIF2", "NSY", "NTC", "NUBL", "NWCL", "NYADI", 
    "OHL", "OMPL", "PBD84", "PBD85", "PBD88", "PBLD84", "PBLD86", "PCBL", "PCIL", 
    "PDBLPO", "PFL", "PFLPO", "PHCL", "PMHPL", "PMLI", "PPCL", "PPL", "PRIN", "PROFL", 
    "PROFLP", "PRSF", "PRVU", "PSF", "PURE", "RADHI", "RAWA", "RBBD2088", "RBBD83", 
    "RBBF40", "RBCL", "RBCLPO", "RFPL", "RHGCL", "RHPL", "RIDI", "RLEL", "RLFL", "RMF1", 
    "RMF2", "RNLI", "RSDC", "RSML", "RSY", "RURU", "SABBL", "SADBL", "SAGAR", "SAGF", 
    "SAHAS", "SAIL", "SALICO", "SAND2085", "SANIMA", "SANVI", "SAPDBL", "SARBTM", 
    "SARVOTTAM", "SBCF", "SBD87", "SBD89", "SBI", "SBID2090", "SBID83", "SBID89", 
    "SBIPO", "SBL", "SBLD2091", "SBLD84", "SBLD89", "SBLPO", "SCB", "SCBD", "SDBD87", 
    "SEF", "SFCL", "SFCLP", "SFEF", "SFMF", "SGHC", "SGIC", "SHEL", "SHINE", "SHINED", 
    "SHIVM", "SHL", "SHLB", "SHPC", "SICL", "SIFC", "SIFCPO", "SIGS2", "SIGS3", 
    "SIKLES", "SINDU", "SIPD", "SJCL", "SJLIC", "SKBBL", "SKHEL", "SKHL", "SLBBL", 
    "SLBSL", "SLCF", "SMATA", "SMB", "SMFBS", "SMH", "SMHL", "SMJC", "SMPDA", "SNLI", 
    "SNMAPO", "SOHL", "SONA", "SOPAN", "SPC", "SPDL", "SPHL", "SPIL", "SPL", "SRBLD83", 
    "SRLI", "SSHL", "STC", "SWASTIK", "SWBBL", "SWBBLP", "SWMF", "SYPNL", 
    "Sanigad Hydro Limited", "Shikhar Power Development Limited", "Snow Rivers Limited", 
    "TAMOR", "TPC", "TRH", "TSHL", "TTL", "TVCL", "Taksar Pikhuwa Khola Hydropower Limited", 
    "UAIL", "UHEWA", "ULBSL", "ULHC", "UMHL", "UMRH", "UNHPL", "UNL", "UNLB", "UPCL", 
    "UPPER", "USHEC", "USHL", "USLB", "VLBS", "VLUCL", "WNLB", "Yambaling Hydropower Limited"
];

// Map of uppercase symbol/name -> original case file name
const EXISTING_IMAGES = new Map();
IMAGE_FILES.forEach(file => {
    EXISTING_IMAGES.set(file.toUpperCase(), file);
});

/**
 * Extracts a key based on the first three words of a name string.
 * Strips common corporate suffixes to improve mapping robustness.
 * 
 * @param {string} str - The input name string
 * @returns {string} The first-three-words key in uppercase
 */
function getFirstThreeWordsKey(str) {
    if (!str) return '';
    // Replace non-word/non-space characters with space
    const cleanStr = str.replace(/[^\w\s]/g, ' ');
    // Tokenize by whitespace
    const rawWords = cleanStr.toUpperCase().split(/\s+/).filter(Boolean);
    
    // Words to strip to ensure robust abbreviation matching
    const ignoreList = new Set([
        "LTD", "LIMITED", "CORP", "CORPORATION", "CO", "COMPANY", "INC", "INCORPORATED", 
        "PROMOTER", "SHARES", "SHARE", "GROUP", "PROJECT", "DEVELOPMENT", "DEVELOPERS"
    ]);
    
    const words = rawWords.filter(w => !ignoreList.has(w));
    return words.slice(0, 3).join(' ');
}

// Map of first-three-words key -> original file name
const IMAGE_NAME_WORDS_MAP = new Map();
IMAGE_FILES.forEach(file => {
    const key = getFirstThreeWordsKey(file);
    if (key) {
        IMAGE_NAME_WORDS_MAP.set(key, file);
    }
});

/**
 * Normalizes a stock symbol and returns its corresponding image URL.
 * Falls back to parent company logo for derivatives/debentures/unsubscribed rights,
 * and tries matching by company name (exact & first 3 words fallback) if symbol matching fails.
 * 
 * @param {string} symbol - The stock symbol (e.g., "NMBUR93/94", "NMBD87/88", "NIFRA")
 * @param {string} prefix - Path prefix to root directory (e.g., "../../" or "../")
 * @param {string} name - Optional company name (e.g., "Appolo Hydropower Ltd")
 * @returns {string} The path to the stock logo image
 */
export function getStockImageUrl(symbol, prefix = '', name = '') {
    if (!symbol) return `${prefix}images/stocks/default.png`;

    const cleanSymbol = symbol.toUpperCase().trim();

    // 1. Direct symbol match check
    if (EXISTING_IMAGES.has(cleanSymbol)) {
        const originalName = EXISTING_IMAGES.get(cleanSymbol);
        return `${prefix}images/stocks/${originalName}.png`;
    }

    // 2. Base symbol extraction
    let baseSymbol = cleanSymbol;
    if (cleanSymbol.includes('/')) {
        baseSymbol = cleanSymbol.split('/')[0];
    }

    // Match parent company symbol by stripping suffix indicators of derivatives:
    // - UR (Unsubscribed Right share) e.g., NIFRAUR85 -> NIFRA
    // - D (Debenture) e.g., NMBD87 -> NMB
    // - PO / PP / P (Promoter Share) e.g., NMBPO -> NMB, NABILP -> NABIL
    // - MF / SF / GF / EF / BF / CF (Mutual Fund) e.g., NMBMF -> NMB
    // - S / Y (Series / Schemes) e.g., GBIMESY2 -> GBIME
    const match = baseSymbol.match(/^([A-Z]+?)(?:UR|D|PO|PP|MF|SF|GF|EF|BF|CF|S|Y)?\d*$/);
    if (match) {
        const potentialBase = match[1];
        if (EXISTING_IMAGES.has(potentialBase)) {
            const originalName = EXISTING_IMAGES.get(potentialBase);
            return `${prefix}images/stocks/${originalName}.png`;
        }
    }

    // 3. Name-based match check if symbol matching fails
    if (name) {
        const cleanName = name.toUpperCase().trim();

        // 3a. Exact name check
        if (EXISTING_IMAGES.has(cleanName)) {
            const originalName = EXISTING_IMAGES.get(cleanName);
            return `${prefix}images/stocks/${originalName}.png`;
        }

        // 3b. First three word match from image full name
        const companyKey = getFirstThreeWordsKey(cleanName);
        if (companyKey && IMAGE_NAME_WORDS_MAP.has(companyKey)) {
            const originalName = IMAGE_NAME_WORDS_MAP.get(companyKey);
            return `${prefix}images/stocks/${originalName}.png`;
        }
    }

    // 4. Fallback to original symbol name (onerror logic in frontend will show avatar fallback if file doesn't exist)
    return `${prefix}images/stocks/${cleanSymbol}.png`;
}
