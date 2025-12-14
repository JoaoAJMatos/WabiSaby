/**
 * Broadcast Channel Communication
 * Handles communication between dashboard and fullscreen player windows
 */

// Communication Channel for Fullscreen Player
const broadcast = new BroadcastChannel('wabisaby_audio_channel');

// Warn if multiple tabs are open (can cause audio overlap)
const tabId = 'dashboard_' + Date.now();
broadcast.postMessage({ type: 'TAB_CHECK', tabId });
let tabCheckCount = 0;
const tabCheckListener = (event) => {
    if (event.data.type === 'TAB_CHECK' && event.data.tabId !== tabId) {
        tabCheckCount++;
        if (tabCheckCount === 1) {
            console.warn('⚠️ WARNING: Multiple dashboard tabs detected!');
            console.warn('   This can cause overlapping audio. Please close other tabs.');
        }
    }
};
broadcast.addEventListener('message', tabCheckListener);
setTimeout(() => broadcast.removeEventListener('message', tabCheckListener), 1000);

