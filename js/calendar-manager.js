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

function getSubUnitDescription(lengthInSeconds, currentUnitName, allUnits) {
    if (!lengthInSeconds || lengthInSeconds <= 0) return `${lengthInSeconds}s`;

    const candidates = allUnits.filter(u => 
        u.type === 'number' && 
        u.name !== currentUnitName && 
        u.lengthInBase && 
        u.lengthInBase <= lengthInSeconds
    );

    let bestSubUnit = null;
    let bestCount = 0;
    let isApprox = false;

    for (const sub of candidates) {
        if (lengthInSeconds % sub.lengthInBase === 0) {
            const currentBestLen = bestSubUnit ? allUnits.find(u=>u.name===bestSubUnit).lengthInBase : 0;
            if (!bestSubUnit || sub.lengthInBase > currentBestLen) {
                bestSubUnit = sub.name;
                bestCount = lengthInSeconds / sub.lengthInBase;
                isApprox = false;
            }
        } else if (!bestSubUnit && lengthInSeconds > sub.lengthInBase) {
            bestSubUnit = sub.name;
            bestCount = Math.floor(lengthInSeconds / sub.lengthInBase);
            isApprox = true;
        }
    }

    if (bestSubUnit) {
        const prefix = isApprox ? '~' : '';
        const plural = bestCount === 1 ? '' : 's';
        return `${lengthInSeconds.toLocaleString()}s (${prefix}${bestCount} ${bestSubUnit}${plural})`;
    }

    return `${lengthInSeconds.toLocaleString()}s`;
}

export function formatCalendarDetails(cal) {
    if (!cal) return '';
    let details = `### ${cal.displayName}`;
    if (cal.abbreviation) details += ` [Abbr: ${cal.abbreviation}]`;
    details += `\nThis system uses the following hierarchical structure:`;
    
    if (cal.units && cal.units.length > 0) {
        cal.units.forEach(u => {
            let desc = '';
            if (u.type === 'variable' && Array.isArray(u.values)) {
                const seq = u.values.map(v => `${v.name} (${getSubUnitDescription(v.lengthInBase, u.name, cal.units)})`).join(', ');
                desc = `Variable length. Sequence: ${seq}`;
            } else if (u.type === 'cyclic' && Array.isArray(u.values)) {
                const valCount = u.values.length;
                let alias = 'step';
                const match = cal.units.find(sub => sub.type === 'number' && sub.lengthInBase === u.lengthInBase && sub.name !== u.name);
                if (match) alias = match.name;
                
                desc = `${valCount}-${alias} cycle: [${u.values.join(', ')}]`;
            } else if (u.type === 'string' && Array.isArray(u.values)) {
                desc = `String values: [${u.values.join(', ')}] (${getSubUnitDescription(u.lengthInBase, u.name, cal.units)} per step)`;
            } else {
                desc = `${getSubUnitDescription(u.lengthInBase, u.name, cal.units)}`;
                if (u.startAtOne) desc += `. 1-indexed`;
            }
            details += `\n- **${u.name}**: ${desc}`;
        });
    } else {
        details += `\n- None`;
    }

    if (cal.notes && cal.notes.trim()) {
        details += `\n\n**Calendar Notes:**\n${cal.notes.trim()}`;
    }

    return details;
}
