export const Table = (headers, rows, className = '') => {
    return `
        <div class="data-table-container glass ${className}">
            <table class="data-table">
                <thead>
                    <tr>
                        ${headers.map(h => `<th>${h}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.length > 0 ? rows.map(row => `
                        <tr>
                            ${row.map(cell => `<td>${cell}</td>`).join('')}
                        </tr>
                    `).join('') : `<tr><td colspan="${headers.length}" style="text-align: center; padding: 2rem; color: var(--text-secondary);">No data available</td></tr>`}
                </tbody>
            </table>
        </div>
    `;
};
