import { logger } from './logger.js';
import { state, saveChatState } from './state.js';

/**
 * Event Manager
 * Handles CRUD for world events.
 */

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function addEvent(eventData) {
    const newEvent = {
        id: generateId(),
        label: eventData.label || 'Unnamed Event',
        description: eventData.description || '',
        baseTime: eventData.baseTime || 0,
        sourceCalendar: eventData.sourceCalendar || 'unknown',
        recurring: eventData.recurring || 'none',
        significance: eventData.significance || 5,
        tags: eventData.tags || [],
    };
    
    state.events.push(newEvent);
    // Keep sorted by time
    state.events.sort((a, b) => a.baseTime - b.baseTime);
    saveChatState();
    logger.info(`Event added: ${newEvent.label} at baseTime ${newEvent.baseTime}`);
    return newEvent.id;
}

export function getEventsInRange(startTime, endTime) {
    return state.events.filter(e => e.baseTime >= startTime && e.baseTime <= endTime);
}

export function getUpcomingEvents(currentTime, rangeForward) {
    return getEventsInRange(currentTime, currentTime + rangeForward);
}

export function getPastEvents(currentTime, rangeBackward) {
    return getEventsInRange(currentTime - rangeBackward, currentTime);
}
