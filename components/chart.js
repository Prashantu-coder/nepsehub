/**
 * Chart Component - Wrapper for Chart.js
 */
export const initStockChart = (canvasId, data, isPositive) => {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const color = isPositive ? '#10b981' : '#ef4444';
    
    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 80);
    gradient.addColorStop(0, color + '33'); // 20% opacity
    gradient.addColorStop(1, color + '00'); // 0% opacity

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map((_, i) => i),
            datasets: [{
                data: data,
                borderColor: color,
                borderWidth: 2,
                pointRadius: 0,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4
            }]
        },
        options: {
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
                x: { display: false },
                y: { display: false }
            },
            maintainAspectRatio: false,
            responsive: true
        }
    });
};
