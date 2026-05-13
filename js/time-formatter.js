import { logger } from './logger.js';

/**
 * Standard verbose formatting of a time object (e.g. "Year: 2024, Month: January, Day: 5")
 */
export function formatTimeObject(timeObject, calendar, joiner = ', ') {
    if (!timeObject || !calendar || !calendar.units) return 'Unknown Time';

    const parts = [];
    for (const unit of calendar.units) {
        if (timeObject[unit.name] !== undefined) {
            parts.push(`${unit.name}: ${timeObject[unit.name]}`);
        }
    }
    return parts.join(joiner);
}

/**
 * Renders a time object into a short formatted string based on calendar.timeFormat.
 * Supports zero-padding based on character repetition (e.g. YYYY for 4-digit year).
 * Literals can be escaped with [brackets].
 */
export function renderFormattedTime(timeObject, calendar) {
    if (!calendar || !calendar.timeFormat || !calendar.units) return formatTimeObject(timeObject, calendar);

    let output = calendar.timeFormat;

    const unitMap = new Map();
    for (const unit of calendar.units) {
        if (unit.formatChar) {
            unitMap.set(unit.formatChar, unit);
        }
    }

    // Replace escaped literals first to protect them
    const literals = [];
    output = output.replace(/\[(.*?)\]/g, (match, p1) => {
        literals.push(p1);
        return `__LITERAL_${literals.length - 1}__`;
    });

    // Replace format sequences
    for (const [char, unit] of unitMap) {
        const regex = new RegExp(`${char}+`, 'g');
        output = output.replace(regex, (match) => {
            const val = timeObject[unit.name];
            if (val === undefined) return match;

            const length = match.length;
            const strVal = val.toString();

            // If it's a number, pad it
            if (typeof val === 'number') {
                return strVal.padStart(length, '0');
            }

            // If it's a string (variable/cyclic/string types)
            if (typeof val === 'string') {
                // Short formats (1-2 chars) often expect numeric index (e.g. MM -> 01)
                if (length < 3 && (unit.type === 'variable' || unit.type === 'cyclic' || unit.type === 'string')) {
                    const index = unit.values.findIndex(v => (typeof v === 'object' ? v.name : v) === val);
                    if (index !== -1) {
                        const numericVal = index + 1; // Default to 1-based for display
                        return numericVal.toString().padStart(length, '0');
                    }
                }

                // Medium formats (exactly 3 chars) usually mean truncated label (e.g. MMM -> Jan)
                if (length === 3 && strVal.length > 3) {
                    return strVal.substring(0, 3);
                }

                // Long formats (4+ chars) usually mean full label (e.g. MMMM -> January)
            }

            return strVal;
        });
    }

    // Restore literals
    output = output.replace(/__LITERAL_(\d+)__/g, (match, p1) => {
        return literals[parseInt(p1)];
    });

    return output;
}

/**
 * Parses a formatted string back into a time object using calendar.timeFormat and unit formatChars.
 */
export function parseFormattedTime(formattedString, calendar) {
    if (!calendar || !calendar.timeFormat || !calendar.units) return null;

    let formatPattern = calendar.timeFormat;
    const unitMap = new Map();
    for (const unit of calendar.units) {
        if (unit.formatChar) {
            unitMap.set(unit.formatChar, unit);
        }
    }

    // 1. Protect literals
    const literals = [];
    const protectedPattern = formatPattern.replace(/\[(.*?)\]/g, (match, p1) => {
        literals.push(p1);
        return `\x01L${literals.length - 1}\x01`;
    });

    // 2. Find format sequences and replace with group placeholders
    const orderedUnits = [];
    const chars = Array.from(unitMap.keys()).join('').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const findRegex = new RegExp(`([${chars}])\\1*`, 'g');
    
    const groupPlaceholders = [];
    const patternWithGroups = protectedPattern.replace(findRegex, (match) => {
        const char = match[0];
        const unit = unitMap.get(char);
        orderedUnits.push(unit);
        
        const groupIdx = groupPlaceholders.length;
        if (unit.type === 'number') {
            groupPlaceholders.push(`(\\d{1,${Math.max(match.length + 2, 10)}})`);
        } else {
            groupPlaceholders.push(`(.+?)`);
        }
        return `\x02G${groupIdx}\x02`;
    });

    // 3. Final Regex Assembly
    let finalRegexStr = patternWithGroups.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Restore literals (escaped)
    for (let i = 0; i < literals.length; i++) {
        const escapedLit = literals[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        finalRegexStr = finalRegexStr.replace(`\x01L${i}\x01`, escapedLit);
    }
    
    // Restore groups
    for (let i = 0; i < groupPlaceholders.length; i++) {
        finalRegexStr = finalRegexStr.replace(`\x02G${i}\x02`, groupPlaceholders[i]);
    }

    const finalRegex = new RegExp(`^${finalRegexStr}$`);
    const values = finalRegex.exec(formattedString);
    
    if (!values) {
        logger.warn(`[TIME-FORMATTER] Failed to parse formatted string: "${formattedString}" using format: "${formatPattern}"`);
        return null;
    }
    
    const result = {};
    for (let i = 0; i < orderedUnits.length; i++) {
        const unit = orderedUnits[i];
        let val = values[i + 1];
        
        if (unit.type === 'number') {
            result[unit.name] = parseInt(val);
        } else {
            // For variable/cyclic, try to find matching label
            const label = unit.values.find(v => {
                const name = typeof v === 'object' ? v.name : v;
                return name.toLowerCase() === val.toLowerCase() || name.toLowerCase().startsWith(val.toLowerCase());
            });
            result[unit.name] = typeof label === 'object' ? label.name : (label || val);
        }
    }
    
    return result;
}
