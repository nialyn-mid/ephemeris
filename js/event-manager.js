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
        id: eventData.id || generateId(),
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

export function updateEvent(id, eventData) {
    const index = state.events.findIndex(e => e.id === id);
    if (index === -1) return null;
    
    state.events[index] = {
        ...state.events[index],
        ...eventData
    };
    
    // Re-sort in case time changed
    state.events.sort((a, b) => a.baseTime - b.baseTime);
    saveChatState();
    logger.info(`Event updated: ${state.events[index].label} (ID: ${id})`);
    return state.events[index];
}

export function getEventsInRange(startTime, endTime) {
    return state.events.filter(e => e.baseTime >= startTime && e.baseTime <= endTime);
}

export function getUpcomingEvents(currentTime, rangeForward = Infinity) {
    return state.events.filter(e => e.baseTime >= currentTime && e.baseTime <= (currentTime + rangeForward));
}

export function getPastEvents(currentTime, rangeBackward = Infinity) {
    return state.events.filter(e => e.baseTime < currentTime && e.baseTime >= (currentTime - rangeBackward));
}

export function getAllEvents() {
    return [...state.events];
}

