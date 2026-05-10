import { logger } from './logger.js';
import { state } from './state.js';
import { settings } from './settings.js';

/**
 * Calendar Manager
 * Handles access to calendar definitions, merging global and per-chat.
 */

export function getActiveCalendars() {
    const globals = settings.globalCalendars || [];
    const chatCals = state.calendars || [];

    // Map to remove duplicates, preferring chat calendars
    const map = new Map();
    for (const cal of globals) {
        map.set(cal.id, cal);
    }
    for (const cal of chatCals) {
        map.set(cal.id, cal); // overrides global if same ID
    }

    const result = Array.from(map.values());
    logger.debug(`[CAL-MGR] Resolved: ${result.map(c => c.id).join(', ')}`);
    return result;
}

export function getCalendar(id) {
    if (!id) return null;
    const calendars = getActiveCalendars();
    const lowerId = id.toLowerCase();
    return calendars.find(c => c.id.toLowerCase() === lowerId) || null;
}

export { formatCalendarDetails } from './formatter.js';
