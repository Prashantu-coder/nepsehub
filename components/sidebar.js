import globalState from '../js/state.js';
import { NAV_MENU_ITEMS } from './navConfig.js';

export const Sidebar = () => {
    const { activePage, pathPrefix } = globalState.getState();
    const p = pathPrefix || '';
    const menuItems = NAV_MENU_ITEMS;

    return `
        <aside class="sidebar" id="sidebar">
            <div class="logo" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <i class="fas fa-chart-line text-gradient"></i>
                    <span class="logo-text text-gradient">NEPSE HUB</span>
                </div>
                <button id="closeSidebar" class="btn-icon" style="background: none; border: none; color: var(--text-secondary); font-size: 1.25rem; cursor: pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <!-- Global Stock Search Input (Mobile/Sidebar) -->
            <div class="sidebar-search-wrapper" style="position: relative; padding: 0.5rem 1rem; margin-top: 0.75rem; z-index: 1000;">
                <div style="position: relative; width: 100%;">
                    <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); font-size: 0.82rem; pointer-events: none;"></i>
                    <input type="text" id="sidebar-global-search" placeholder="Search stock..." 
                           style="width: 100%; padding: 8px 12px 8px 34px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.04); color: #fff; font-size: 0.8rem; outline: none; transition: all 0.3s;" />
                </div>
                <div id="sidebar-search-results" class="glass" style="display: none; position: absolute; top: calc(100% + 8px); left: 1rem; right: 1rem; background: rgba(22, 28, 45, 0.98); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); max-height: 250px; overflow-y: auto; padding: 0.5rem 0;"></div>
            </div>
            
            <ul class="nav-menu" style="padding-top: 0.5rem;">
                ${menuItems.map(item => {
        if (item.children) {
            return `
                            <li class="nav-item-wrapper">
                                <div class="nav-item" style="cursor: default;">
                                    <i class="fas ${item.icon} nav-icon"></i>
                                    <span class="nav-text">${item.text}</span>
                                </div>
                                <ul class="sidebar-submenu">
                                    ${item.children.map(child => `
                                        <li>
                                            <a href="${p}${child.path}" class="nav-item ${activePage === child.id ? 'active' : ''}">
                                                <i class="fas ${child.icon} nav-icon" style="font-size: 1rem;"></i>
                                                <span class="nav-text">${child.text}</span>
                                            </a>
                                        </li>
                                    `).join('')}
                                </ul>
                            </li>
                        `;
        }
        return `
                        <li class="nav-item-wrapper">
                            <a href="${p}${item.path}" class="nav-item ${activePage === item.id ? 'active' : ''}">
                                <i class="fas ${item.icon} nav-icon"></i>
                                <span class="nav-text">${item.text}</span>
                            </a>
                        </li>
                    `;
    }).join('')}
            </ul>

        </aside>
    `;
};
