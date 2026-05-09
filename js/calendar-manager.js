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
    logger.debug('Resolved Active Calendars:', result);
    return result;
}

export function getCalendar(id) {
    const calendars = getActiveCalendars();
    return calendars.find(c => c.id === id) || null;
}

export function formatCalendarDetails(cal) {
    if (!cal) return '';
    let details = `- ${cal.displayName} (${cal.id})`;
    if (cal.abbreviation) details += ` [Abbr: ${cal.abbreviation}]`;
    details += `\n  Epoch Offset: ${cal.epochOffset || 0}s, Speed: ${cal.conversionFactor || 1.0}x`;
    details += `\n  Units:`;
    
    if (cal.units && cal.units.length > 0) {
        cal.units.forEach(u => {
            let typeInfo = `Type: ${u.type || 'number'}`;
            if (u.type === 'variable' && Array.isArray(u.values)) {
                typeInfo += `, Values: ${u.values.map(v => `${v.name} (${v.lengthInBase}s)`).join(', ')}`;
            } else if (u.type === 'cyclic' && Array.isArray(u.values)) {
                typeInfo += `, Offset: ${u.offset || 0}, Cycle: [${u.values.join(', ')}]`;
            } else if (u.type === 'string' && Array.isArray(u.values)) {
                typeInfo += `, Values: [${u.values.join(', ')}]`;
            } else {
                typeInfo += `, Length: ${u.lengthInBase}s`;
            }
            if (u.startAtOne) typeInfo += `, 1-Indexed`;
            details += `\n    * ${u.name}: ${typeInfo}`;
        });
    } else {
        details += ` None`;
    }
    return details;
}
