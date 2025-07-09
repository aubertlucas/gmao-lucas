// Code à ajouter dans initCharts() juste avant sa fermeture
// Graphique de répartition des actions en retard vs total
initializeChart('overdueChart', (ctx) => {
    // Récupérer les données des actions
    const totalActions = this.stats.total_actions || 0;
    const overdueActions = this.stats.overdue_actions || 0;
    const onTimeActions = totalActions - overdueActions;
    
    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Actions en retard', 'Actions dans les délais'],
            datasets: [{
                data: [
                    overdueActions,
                    onTimeActions
                ],
                backgroundColor: ['#dc3545', '#198754']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? Math.round((value / total) * 100) : 0;
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
});
