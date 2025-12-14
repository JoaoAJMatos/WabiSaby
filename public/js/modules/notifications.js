/**
 * Notification System
 * Displays toast notifications to the user
 */

function showNotification(message, type = 'info') {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.bottom = '30px';
    div.style.right = '30px';
    
    // Color scheme based on type
    const colors = {
        success: { bg: '#86E7B8', text: '#2c3e50', icon: 'fa-check' },
        error: { bg: '#ffcdd2', text: '#c62828', icon: 'fa-exclamation' },
        info: { bg: '#a78bfa', text: '#1a1a2e', icon: 'fa-info-circle' }
    };
    const colorScheme = colors[type] || colors.info;
    
    div.style.background = colorScheme.bg;
    div.style.color = colorScheme.text;
    div.style.padding = '15px 25px';
    div.style.fontFamily = '"Inter", sans-serif';
    div.style.fontWeight = '600';
    div.style.zIndex = '2000';
    div.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
    div.style.borderRadius = '12px';
    div.style.transform = 'translateY(100px)';
    div.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    div.innerHTML = `<i class="fas ${colorScheme.icon}"></i> ${message}`;
    
    document.body.appendChild(div);
    
    requestAnimationFrame(() => {
        div.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        div.style.transform = 'translateY(100px)';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

