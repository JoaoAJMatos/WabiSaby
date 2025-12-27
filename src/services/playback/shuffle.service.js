/**
 * Shuffle Service
 *
 * Handles all shuffle-related logic:
 * - Weighted selection algorithm (VIP songs 3x weight)
 * - Shuffle songs for repeat all mode
 */
class ShuffleService {
    constructor() {}

    /**
     * Select a random item from queue using weighted selection
     * VIP songs have 3x higher probability than regular songs
     * @param {Array} queue - Queue array
     * @returns {number} Index of selected item
     */
    selectShuffledItem(queue) {
        if (queue.length === 0) {
            return -1;
        }

        if (queue.length === 1) {
            return 0;
        }

        // Calculate weights: VIP = 3, regular = 1
        const weights = queue.map(item => item.isPriority ? 3 : 1);
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

        // Generate random number between 0 and totalWeight
        let random = Math.random() * totalWeight;

        // Select item based on weighted probability
        for (let i = 0; i < queue.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return i;
            }
        }

        // Fallback to last item (shouldn't happen, but safety)
        return queue.length - 1;
    }

    /**
     * Shuffle songs for repeat all mode
     * Uses weighted selection to give VIP songs higher priority
     * @param {Array} songs - Array of songs to shuffle
     * @param {boolean} shuffleEnabled - Whether shuffle is enabled
     * @returns {Array} Shuffled array of songs
     */
    shuffleForRepeatAll(songs, shuffleEnabled) {
        if (!shuffleEnabled || songs.length <= 1) {
            return [...songs];
        }

        // Shuffle using weighted selection (VIP songs have 3x weight)
        const shuffled = [];
        const remaining = [...songs];

        while (remaining.length > 0) {
            const weights = remaining.map(item => item.isPriority ? 3 : 1);
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
            let random = Math.random() * totalWeight;

            for (let i = 0; i < remaining.length; i++) {
                random -= weights[i];
                if (random <= 0) {
                    shuffled.push(remaining.splice(i, 1)[0]);
                    break;
                }
            }
        }

        return shuffled;
    }
}

module.exports = new ShuffleService();
