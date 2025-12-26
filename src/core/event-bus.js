const EventEmitter = require('events');

/**
 * EventBus
 * 
 * Centralized event system for decoupled component communication.
 * Extends EventEmitter to provide all standard event methods.
 * 
 * Usage:
 *   const { createEventBus } = require('./event-bus');
 *   const eventBus = createEventBus();
 *   eventBus.on('some_event', handler);
 *   eventBus.emit('some_event', payload);
 */
class EventBus extends EventEmitter {
    constructor() {
        super();
        // Set max listeners to prevent memory leaks warnings
        this.setMaxListeners(100);
    }
}

/**
 * Factory function to create a new EventBus instance
 * @returns {EventBus} New EventBus instance
 */
function createEventBus() {
    return new EventBus();
}

module.exports = {
    EventBus,
    createEventBus
};

