/**
 * Notification System
 * Displays toast notifications to the user with modern glass morphism design
 */

// Ensure toast container exists
function getToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    return container;
}

// Icon mapping for toast types
const toastIcons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    info: 'fa-info-circle',
    warning: 'fa-exclamation-triangle'
};

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (success, error, info, warning)
 * @param {number} duration - Duration in milliseconds (default: 4000)
 */
function showNotification(message, type = 'info', duration = 4000) {
    const container = getToastContainer();
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Create icon
    const icon = document.createElement('div');
    icon.className = 'toast-icon';
    icon.innerHTML = `<i class="fas ${toastIcons[type] || toastIcons.info}"></i>`;
    
    // Create content
    const content = document.createElement('div');
    content.className = 'toast-content';
    content.textContent = message;
    
    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.onclick = () => dismissToast(toast);
    
    // Create progress bar
    const progress = document.createElement('div');
    progress.className = 'toast-progress';
    
    // Assemble toast
    toast.appendChild(icon);
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    toast.appendChild(progress);
    
    // Add to container
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
        // Start progress bar countdown animation (starts full, empties to 0)
        progress.style.transform = 'scaleX(1)';
        progress.style.transition = `transform ${duration}ms linear`;
        // Animate to empty
        requestAnimationFrame(() => {
            progress.style.transform = 'scaleX(0)';
        });
    });
    
    // Track start time for hover pause functionality
    const startTime = Date.now();
    toast._startTime = startTime;
    
    // Auto-dismiss
    const timeoutId = setTimeout(() => {
        dismissToast(toast);
    }, duration);
    
    // Store timeout ID for manual dismissal
    toast._timeoutId = timeoutId;
    toast._duration = duration;
    
    // Pause on hover
    toast.addEventListener('mouseenter', () => {
        if (toast._timeoutId) {
            clearTimeout(toast._timeoutId);
            const elapsed = Date.now() - toast._startTime;
            const remaining = Math.max(0, toast._duration - elapsed);
            const progressValue = remaining / toast._duration;
            progress.style.transition = 'transform 0.2s linear';
            progress.style.transform = `scaleX(${progressValue})`;
            toast._remaining = remaining;
        }
    });
    
    toast.addEventListener('mouseleave', () => {
        const remaining = toast._remaining || Math.max(0, toast._duration - (Date.now() - toast._startTime));
        if (remaining > 0) {
            // Continue countdown from current position
            progress.style.transition = `transform ${remaining}ms linear`;
            progress.style.transform = 'scaleX(0)';
            toast._timeoutId = setTimeout(() => {
                dismissToast(toast);
            }, remaining);
        }
    });
}

/**
 * Dismiss a toast notification
 * @param {HTMLElement} toast - The toast element to dismiss
 */
function dismissToast(toast) {
    if (!toast || !toast.parentElement) return;
    
    // Clear timeout if exists
    if (toast._timeoutId) {
        clearTimeout(toast._timeoutId);
    }
    
    // Animate out
    toast.classList.remove('show');
    toast.classList.add('hide');
    
    // Remove after animation
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 400);
}

