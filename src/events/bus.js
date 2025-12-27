const EventEmitter = require('events');

/**
 * EventBus
 * 
 * Centralized event system for decoupled component communication.
 * Extends EventEmitter to provide all standard event methods.
 * 
 * Usage:
 *   const eventBus = require('../events/bus');
 *   eventBus.on('some_event', handler);
 *   eventBus.emit('some_event', payload);
 */
class EventBus extends EventEmitter {
    constructor() {
        super();
        // Set max listeners to prevent memory leak warnings
        this.setMaxListeners(100);
    }
}

module.exports = new EventBus();

