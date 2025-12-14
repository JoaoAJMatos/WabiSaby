/**
 * API Communication
 * Handles all API calls to the backend
 */

// Listen for seek requests from fullscreen player
async function handleSeekRequest(newTime, currentAudio, fetchData) {
    // Update frontend audio element immediately for responsive UI
    if (currentAudio && !isNaN(newTime) && isFinite(newTime)) {
        const newTimeSeconds = newTime / 1000; // convert to seconds
        currentAudio.currentTime = newTimeSeconds;
    }
    
    // Send seek request to backend
    try {
        const response = await fetch('/api/queue/seek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ time: newTime })
        });
        
        if (response.ok) {
            console.log(`Seeking to ${formatTime(newTime)}`);
            // Refresh data to get updated state
            if (fetchData) fetchData();
        } else {
            console.error('Seek failed:', await response.text());
        }
    } catch (error) {
        console.error('Error seeking:', error);
    }
}

// Main data fetching function (returns data, doesn't update UI)
async function fetchStatusData() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching status:', error);
        return null;
    }
}

