/**
 * SymbolSearch — Reusable autocomplete dropdown for NEPSE symbols
 * 
 * Usage:
 *   const search = new SymbolSearch({
 *     wrapperId: 'my-wrapper',
 *     inputId:   'my-input',
 *     placeholder: 'Search symbol...',
 *     onSelect: (symbol) => console.log(symbol)
 *   });
 *   search.setData(marketDataArray);  // call after market data loads
 *   search.getValue();                // returns selected symbol string
 *   search.clear();                   // resets input + dropdown
 */
export class SymbolSearch {
    constructor({ wrapperId, inputId, placeholder = 'Search symbol...', onSelect }) {
        this.wrapper     = document.getElementById(wrapperId);
        this.inputId     = inputId;
        this.placeholder = placeholder;
        this.onSelect    = onSelect;
        this.marketData  = [];
        this.selected    = null;    // currently chosen symbol string
        this.activeIndex = -1;      // keyboard nav index

        if (!this.wrapper) {
            console.warn(`SymbolSearch: wrapper #${wrapperId} not found`);
            return;
        }
        this._render();
    }

    // ── Public API ──────────────────────────────────────────────

    /** Feed the component with live market data */
    setData(marketData) {
        this.marketData = marketData || [];
    }

    /** Returns the currently selected symbol (e.g. "NICA") */
    getValue() {
        return this.selected;
    }

    /** Programmatically set a value */
    setValue(symbol) {
        this.selected    = symbol;
        this.input.value = symbol;
        this._closeDropdown();
    }

    /** Reset input and selection */
    clear() {
        this.selected    = null;
        this.input.value = '';
        this._closeDropdown();
    }

    // ── Private ─────────────────────────────────────────────────

    _render() {
        this.wrapper.innerHTML = `
            <div class="sym-search-wrap">
                <input
                    type="text"
                    id="${this.inputId}"
                    class="form-input sym-search-input"
                    placeholder="${this.placeholder}"
                    autocomplete="off"
                    spellcheck="false"
                />
                <ul class="sym-dropdown" id="${this.inputId}-dropdown" role="listbox"></ul>
            </div>
        `;

        this.input    = document.getElementById(this.inputId);
        this.dropdown = document.getElementById(`${this.inputId}-dropdown`);

        this.input.addEventListener('input',   () => this._onInput());
        this.input.addEventListener('keydown', (e) => this._onKeydown(e));
        this.input.addEventListener('focus',   () => {
            if (this.input.value.trim()) this._onInput();
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.wrapper.contains(e.target)) this._closeDropdown();
        });
    }

    _onInput() {
        const q = this.input.value.trim().toUpperCase();
        this.selected    = null;   // reset on any typing
        this.activeIndex = -1;

        if (!q) { this._closeDropdown(); return; }

        const results = this.marketData
            .filter(s =>
                s.symbol.toUpperCase().includes(q) ||
                (s.securityName && s.securityName.toUpperCase().includes(q))
            )
            .slice(0, 10);

        if (results.length === 0) { this._closeDropdown(); return; }

        this.dropdown.innerHTML = results.map((s, i) => `
            <li class="sym-item" role="option" data-symbol="${s.symbol}" data-index="${i}">
                <span class="sym-ticker">${this._highlight(s.symbol, q)}</span>
                <span class="sym-full">${s.securityName || ''}</span>
            </li>
        `).join('');

        this.dropdown.style.display = 'block';

        this.dropdown.querySelectorAll('.sym-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // prevent blur before click
                this._select(item.dataset.symbol);
            });
        });
    }

    _highlight(text, query) {
        const i = text.toUpperCase().indexOf(query);
        if (i === -1) return text;
        return (
            text.slice(0, i) +
            `<mark class="sym-mark">${text.slice(i, i + query.length)}</mark>` +
            text.slice(i + query.length)
        );
    }

    _select(symbol) {
        this.selected    = symbol;
        this.input.value = symbol;
        this._closeDropdown();
        if (this.onSelect) this.onSelect(symbol);
    }

    _closeDropdown() {
        this.dropdown.style.display = 'none';
        this.activeIndex = -1;
    }

    _setActive(index) {
        const items = this.dropdown.querySelectorAll('.sym-item');
        items.forEach(i => i.classList.remove('sym-item-active'));
        if (index >= 0 && index < items.length) {
            items[index].classList.add('sym-item-active');
            items[index].scrollIntoView({ block: 'nearest' });
        }
        this.activeIndex = index;
    }

    _onKeydown(e) {
        const items = this.dropdown.querySelectorAll('.sym-item');
        const count = items.length;
        if (!count || this.dropdown.style.display === 'none') return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            this._setActive(Math.min(this.activeIndex + 1, count - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            this._setActive(Math.max(this.activeIndex - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (this.activeIndex >= 0 && items[this.activeIndex]) {
                this._select(items[this.activeIndex].dataset.symbol);
            }
        } else if (e.key === 'Escape') {
            this._closeDropdown();
        }
    }
}
