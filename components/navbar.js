import globalState from '../js/state.js';
import { NAV_MENU_ITEMS } from './navConfig.js';

export const Navbar = () => {
    const { activePage, pathPrefix } = globalState.getState();
    const p = pathPrefix || '';
    const menuItems = NAV_MENU_ITEMS;

    return `
        <nav class="navbar glass fade-in">
            <ul class="navbar-menu">
                ${menuItems.map(item => {
        if (item.children) {
            const isActive = item.children.some(c => c.id === activePage);
            return `
                            <li class="nav-dropdown">
                                <a href="#" class="nav-link ${isActive ? 'active' : ''}" onclick="return false;">
                                    ${item.text} <i class="fas fa-chevron-down" style="font-size: 0.7rem; margin-left: 0.25rem;"></i>
                                </a>
                                <div class="dropdown-menu glass">
                                    ${item.children.map(child => `
                                        <a href="${p}${child.path}" class="dropdown-item ${activePage === child.id ? 'active' : ''}">
                                            <i class="fas ${child.icon}"></i>
                                            ${child.text}
                                        </a>
                                    `).join('')}
                                </div>
                            </li>
                        `;
        }
        return `
                        <li>
                            <a href="${p}${item.path}" class="nav-link ${activePage === item.id ? 'active' : ''}">
                                ${item.text}
                            </a>
                        </li>
                    `;
    }).join('')}
            </ul>

            <div class="nav-actions" style="display: flex; gap: 1rem">
                <!-- Global Stock Search Input -->
                <div class="nav-search-wrapper pc-only" style="position: relative; width: 320px; z-index: 1000;">
                    <div style="position: relative; width: 100%; padding: 0.5rem 0rem 0.5rem 0rem;">
                        <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-secondary); font-size: 0.82rem; pointer-events: none;"></i>
                        <input type="text" id="nav-global-search" placeholder="Quick stock search..." 
                               style="width: 100%; padding: 8px 12px 8px 34px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.04); color: #fff; font-size: 0.8rem; outline: none; transition: all 0.3s;" />
                    </div>
                    <div id="nav-search-results" class="glass" style="display: none; position: absolute; top: calc(100% + 8px); left: 0; right: 0; background: rgba(22, 28, 45, 0.98); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5); max-height: 280px; overflow-y: auto; padding: 0.5rem 0;"></div>
                </div>
            </div>
        </nav>
    `;
};
