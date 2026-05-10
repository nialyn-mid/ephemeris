import { logger } from './logger.js';

/**
 * Ephemeris Formatter
 * Unified logic for describing calendars and time systems to LLMs.
 */

/**
 * Calculates a human-readable description of a unit's length by finding its largest sub-unit.
 */
function getSubUnitDescription(lengthInSeconds, currentUnitName, allUnits) {
    if (!lengthInSeconds || lengthInSeconds <= 0) return `${lengthInSeconds}s`;

    // Only look at numeric units for sub-unit descriptions
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
            const currentBestLen = bestSubUnit ? allUnits.find(u => u.name === bestSubUnit).lengthInBase : 0;
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

/**
 * Formats a single calendar's full hierarchical structure into a markdown block.
 */
export function formatCalendarDetails(cal) {
    if (!cal) return '';
    let details = `### ${cal.displayName} [ID: ${cal.id}]`;
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
                else if (u.startValue !== undefined && u.startValue !== 0) desc += `. Starts at ${u.startValue}`;
            }
            details += `\n- **${u.name}**: ${desc}`;
        });
    } else {
        details += `\n- None`;
    }

    if (cal.notes && cal.notes.trim()) {
        details += `\n\n**Calendar Notes:**\n${cal.notes.trim()}`;
    }

    // Add shared instructional note
    details += `\n\n*Note: You can use the \`ephemeris-get-time\` tool to convert between calendars or \`ephemeris-add-event\` to mark past or future occurrences.*`;

    return details;
}

/**
 * Generates a human-readable list of changes between two objects.
 */
export function generateChangelog(oldObj, newObj, keysToIgnore = []) {
    const changes = [];
    const allKeys = [...new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})])];

    for (const key of allKeys) {
        if (keysToIgnore.includes(key)) continue;

        const oldVal = oldObj ? oldObj[key] : undefined;
        const newVal = newObj ? newObj[key] : undefined;

        // Skip if both are essentially empty/undefined
        if (oldVal === newVal) continue;
        
        // Deep equality check for arrays/objects (like units or tags)
        if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

        const oldDisplay = (oldVal !== undefined && oldVal !== null && String(oldVal) !== '') 
            ? (typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal)) 
            : '(none)';
        const newDisplay = (newVal !== undefined && newVal !== null && String(newVal) !== '') 
            ? (typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal)) 
            : '(none)';

        changes.push(`${key}: ${oldDisplay} → ${newDisplay}`);
    }
    return changes;
}

