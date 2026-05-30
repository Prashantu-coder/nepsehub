import globalState from '../../state.js';
import { Layout } from '../../layout.js';
import DataService from '../../../services/dataService.js';

const AVAILABLE_LOGOS = new Set(["ACLBSL","ADBL","AHL","AHPC","AKJCL","AKPL","ALBSL","ALICL","ANLB","API","Appolo Hydropower Limited","AVYAN","BANDIPUR","BARUN","BBC","BEDC","BFC","BGWT","BHCL","BHDC","BHL","BHNC","BHPL","BJHL","BNHC","BNL","BNT","BPCL","BUNGAL","CBBL","CBLD88","CFCL","CGH","CHCL","CHDC","CHL","CIT","CITY","CKHL","CLI","CORBL","CREST","CYCL","CZBIL","DDBL","DHEL","DHPL","DLBS","DOLTI","DORDI","EBL","EBLD85","EBLD86","EBLD91","EBLEB89","EDBL","EHPL","ENL","FMDBL","FOWAD","GBBD85","GBBL","GBIME","GBLBS","GCIL","GFCL","GHL","GILB","GLBSL","GLH","GMFBS","GMFIL","GMLI","GRDBL","GUFL","GVL","HATHY","HBL","HBLD83","HBLD86","HDHPC","HDL","HEI","HEIP","HFIN","HHL","HIDCL","HIDCLP","HIMSTAR","HLBSL","HLI","HPPL","HRL","HURJA","ICFC","ICFCD88","ICFCD89","IGI","IHL","ILBS","ILI","JBBL","JBLB","JFL","JHAPA","JOSHI","JSLBB","JSLBBP","Kalanga Hydro Limited","Kalinchock Hydropower Limited","KBL","KBLD90","KBSH","KDL","KHPL","KKHC","KMCDB","KPCL","KSBBL","KSBBLD87","LBBL","LBLD86","LBLD88","LEC","LICN","LLBS","LSL","MABEL","MAKAR","MANDU","MATRI","MBJC","MBL","MBLD2085","MCHL","MDB","MEHL","MEL","MEN","MERO","MFIL","MFLD85","MHCL","MHL","MHNL","MKCL","MKHC","MKHL","MKJC","MLBBL","MLBL","MLBS","MLBSL","MMKJL","MNBBL","MPFL","MSHL","MSLB","NABBC","NABIL","NABILD2089","NADEP","NBL","NBLD82","NBLD85","NCCD86","NESDO","NFS","NGPL","NHDL","NHPC","NIBD84","NICA","NICAD2091","NICD88","NICL","NICLBSL","NIFRA","NIFRAGED","NIL","NIMB","NIMBD90","NIMBPO","NLG","NLIC","NLICL","NMB","NMBD2085","NMBMF","NMFBS","NMIC","NMLBBL","NRIC","NRM","NRN","NTC","NUBL","NWCL","NYADI","OHL","OMPL","PBD88","PBLD86","PCBL","PCIL","PFL","PHCL","PMHPL","PMLI","PPCL","PPL","PRIN","PROFL","PRVU","PURE","RADHI","RAWA","RBBD2088","RBBD83","RBCL","RBCLPO","RFPL","RHGCL","RHPL","RIDI","RLEL","RLFL","RNLI","RSDC","RSML","RURU","SABBL","SADBL","SAGAR","SAGF","SAHAS","SAIL","SALICO","SAND2085","Sanigad Hydro Limited","SANIMA","SANVI","SAPDBL","SARBTM","SBD87","SBI","SBID83","SBL","SBLD2091","SBLD89","SCB","SCBD","SDBD87","SFCL","SFEF","SGHC","SGIC","SHEL","Shikhar Power Development Limited","SHINE","SHIVM","SHL","SHLB","SHPC","SICL","SIFC","SIKLES","SINDU","SIPD","SJCL","SJLIC","SKBBL","SKHEL","SKHL","SLBBL","SLBSL","SLCF","SMATA","SMB","SMFBS","SMH","SMHL","SMJC","SMPDA","SNLI","Snow Rivers Limited","SOHL","SONA","SOPAN","SPC","SPDL","SPHL","SPIL","SPL","SRBLD83","SRLI","SSHL","STC","SWASTIK","SWBBL","SWMF","SYPNL","Taksar Pikhuwa Khola Hydropower Limited","TAMOR","TPC","TRH","TSHL","TTL","TVCL","UAIL","UHEWA","ULBSL","ULHC","UMHL","UMRH","UNHPL","UNL","UNLB","UPCL","UPPER","USHEC","USHL","USLB","VLBS","VLUCL","WNLB","Yambaling Hydropower Limited", "SARVOTTAM", "MEPDL", "BENI", "ECL"]);


let currentPage = 1;
let totalPages = 1;
let currentStatus = 'all';
let currentOfferingType = 'ipo/general';
let activeIPOs = []; // Stored list for search/filter operations

async function init() {
    globalState.setState({ activePage: 'ipo-tracker' });
    await Layout.init();

    // Initial fetch
    await fetchAndRenderIPOs();

    // Event Listeners for Offering Types
    const offeringBtns = document.querySelectorAll('.offering-tab-btn');
    offeringBtns.forEach(btn => {
        btn.onclick = async () => {
            offeringBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentOfferingType = btn.dataset.type;
            currentPage = 1;
            await fetchAndRenderIPOs();
        };
    });

    // Event Listeners for Filters
    const filterBtns = document.querySelectorAll('.tab-btn');
    filterBtns.forEach(btn => {
        btn.onclick = async () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStatus = btn.dataset.status;
            currentPage = 1;
            await fetchAndRenderIPOs();
        };
    });

    // Pagination Listeners
    document.getElementById('prev-page').onclick = async () => {
        if (currentPage > 1) {
            currentPage--;
            await fetchAndRenderIPOs();
        }
    };

    document.getElementById('next-page').onclick = async () => {
        if (currentPage < totalPages) {
            currentPage++;
            await fetchAndRenderIPOs();
        }
    };
}

async function fetchAndRenderIPOs() {
    const container = document.getElementById('ipo-list');
    
    // Show premium shimmering skeletons
    container.innerHTML = Array(3).fill(0).map(() => `
        <div class="ipo-card skeleton-card" style="min-height: 320px; padding: 1.75rem; display: flex; flex-direction: column; gap: 1.5rem; background: rgba(255,255,255,0.02); border-radius: 24px; border: 1px solid var(--surface-border);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
               <div class="skeleton" style="width: 50px; height: 50px; border-radius:14px;"></div>
               <div class="skeleton" style="width: 80px; height: 24px; border-radius:8px;"></div>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.5rem;">
               <div class="skeleton" style="width: 75%; height: 1.25rem; border-radius:4px;"></div>
               <div class="skeleton" style="width: 45%; height: 0.85rem; border-radius:4px;"></div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
               <div class="skeleton" style="height: 45px; border-radius:12px;"></div>
               <div class="skeleton" style="height: 45px; border-radius:12px;"></div>
            </div>
            <div class="skeleton" style="height: 50px; border-radius:14px; margin-top:auto;"></div>
        </div>
    `).join('');

    try {
        const rawItems = await DataService.getIPOs(currentOfferingType);
        activeIPOs = rawItems || [];
        
        if (!activeIPOs || activeIPOs.length === 0) {
            container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">No offerings found in this category.</div>`;
            return;
        }

        // Handle filtering based on currentStatus
        let filteredItems = activeIPOs;
        if (currentStatus !== 'all') {
            filteredItems = activeIPOs.filter(item => {
                const status = (item.status || "").toLowerCase();
                if (currentStatus === 'open') return status === 'open';
                if (currentStatus === 'closed') return status === 'closed';
                if (currentStatus === 'ComingSoon') return status.includes('coming') || status.includes('soon');
                return true;
            });
        }

        renderCards(filteredItems);
        
        // Update Pagination Info
        const pageInfo = document.getElementById('page-info');
        if (pageInfo) pageInfo.innerText = `Showing ${filteredItems.length} items`;
        
        const prevBtn = document.getElementById('prev-page');
        const nextBtn = document.getElementById('next-page');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;

    } catch (error) {
        console.error("IPO Render Error:", error);
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">Error connecting to IPO server.</div>`;
    }
}

function renderCards(items) {
    const container = document.getElementById('ipo-list');
    
    if (items.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">No offerings found for this status.</div>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const name = item.name || item.companyName || item.securityName || 'Unknown Company';
        const symbol = item.symbol || item.scrip || 'N/A';
        const units = parseFloat(item.units || item.totalUnits || 0);
        const price = parseFloat(item.price || item.perUnit || 100);
        const amount = parseFloat(item.totalAmount || (units * price) || 0);
        const manager = item.issueManager || item.manager || 'N/A';
        const sector = item.sector || item.category || 'N/A';
        
        const symbolUpper = symbol.toUpperCase();
        let logoUrl = '';
        if (AVAILABLE_LOGOS.has(symbolUpper)) {
            logoUrl = `../../images/stocks/${symbolUpper}.png`;
        } else if (AVAILABLE_LOGOS.has(name)) {
            logoUrl = `../../images/stocks/${name}.png`;
        }

        const openDateObj = item.openingDate ? new Date(item.openingDate) : null;
        const closeDateObj = item.closingDate ? new Date(item.closingDate) : null;
        const now = new Date();
        
        const openingDateStr = openDateObj ? openDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
        const closingDateStr = closeDateObj ? closeDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD';
        
        let statusLabel = 'Upcoming';
        let statusClass = 'status-comingsoon';
        let btnText = 'Application Not Open';
        let btnClass = 'btn-disabled';
        let isApplyOpen = false;

        if (openDateObj && closeDateObj) {
            if (now >= openDateObj && now <= closeDateObj) {
                statusLabel = 'Open';
                statusClass = 'status-open';
                btnText = 'Apply via MeroShare';
                btnClass = 'btn-apply';
                isApplyOpen = true;
            } else if (now > closeDateObj) {
                statusLabel = 'Closed';
                statusClass = 'status-closed';
                btnText = 'Closed';
                btnClass = 'btn-disabled';
                isApplyOpen = false;
            } else if (now < openDateObj) {
                const diffTime = openDateObj - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                statusLabel = 'Coming Soon';
                statusClass = 'status-comingsoon';
                btnText = `Open in ${diffDays} days`;
                btnClass = 'btn-disabled';
                isApplyOpen = false;
            }
        }

        return `
            <div class="ipo-card">
                <span class="ipo-status-badge ${statusClass}">${statusLabel}</span>
                
                <div class="ipo-header">
                    <div class="ipo-icon-wrap" style="position: relative; width: 56px; height: 56px; flex-shrink: 0;">
                        <div class="ipo-icon" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-weight: 700; background: linear-gradient(135deg, var(--surface-hover), var(--surface-solid)); color: var(--primary); z-index: 1; margin: 0;">
                            ${symbolUpper.substring(0, 2)}
                        </div>
                        ${logoUrl ? `
                        <img src="${logoUrl}" 
                             class="ipo-icon" 
                             style="opacity: 0; transition: opacity 0.2s; position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; margin: 0; background: transparent; z-index: 2;" 
                             onload="this.style.opacity=1; if(this.previousElementSibling) this.previousElementSibling.style.display='none';" 
                             onerror="this.style.display='none';" 
                             alt="${symbolUpper}">
                        ` : ''}
                    </div>
                    <div>
                        <div class="ipo-company-name" title="${name}">${name}</div>
                        <div class="ipo-symbol-info">${symbol} • ${sector}</div>
                    </div>
                </div>

                <div class="ipo-details-grid">
                    <div class="detail-item">
                        <span class="detail-label">Units</span>
                        <span class="detail-value">${units.toLocaleString()}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Price</span>
                        <span class="detail-value">Rs. ${price}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Issue Manager</span>
                        <span class="detail-value" style="font-size: 0.7rem; line-height: 1.2;" title="${manager}">${manager}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Total Amount</span>
                        <span class="detail-value">Rs. ${(amount / 10000000).toFixed(2)} Cr</span>
                    </div>
                </div>

                <div class="ipo-dates-row">
                    <div class="date-box">
                        <span class="date-label">Opens</span>
                        <span class="date-value">${openingDateStr}</span>
                    </div>
                    <span class="date-sep"><i class="fas fa-chevron-right"></i></span>
                    <div class="date-box" style="text-align: right;">
                        <span class="date-label">Closes</span>
                        <span class="date-value">${closingDateStr}</span>
                    </div>
                </div>

                <button class="ipo-btn ${btnClass}" 
                        onclick="window.open('https://meroshare.cdsc.com.np', '_blank')" 
                        ${!isApplyOpen ? 'disabled' : ''}>
                    <i class="fas ${isApplyOpen ? 'fa-external-link-alt' : 'fa-lock'}"></i>
                    ${btnText}
                </button>
            </div>
        `;
    }).join('');
}

document.addEventListener('DOMContentLoaded', init);
