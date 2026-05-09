import { logger } from './logger.js';

/**
 * Time Engine
 * Core conversion logic between Base Time and Calendar Time Objects.
 */

export function convertToBaseTime(timeObject, calendar) {
    if (!calendar || !calendar.units) return 0;

    let baseTime = calendar.epochOffset || 0;
    
    for (const unit of calendar.units) {
        if (unit.type === 'cyclic') continue; // Cyclic units are derived, not absolute

        if (timeObject[unit.name] !== undefined) {
            let val = timeObject[unit.name];
            
            if (unit.type === 'variable' && Array.isArray(unit.values)) {
                let accumulatedOffset = 0;
                for (const v of unit.values) {
                    if (v.name === val) {
                        break;
                    }
                    accumulatedOffset += v.lengthInBase || 0;
                }
                baseTime += accumulatedOffset;
            } else if (unit.type === 'string' && Array.isArray(unit.values)) {
                val = unit.values.indexOf(val);
                if (val < 0) val = 0;
                baseTime += val * (unit.lengthInBase || 0);
            } else {
                val = Number(val);
                if (isNaN(val)) val = 0;
                // Adjust if the unit is 1-indexed (e.g., Day 1 means 0 offset)
                if (unit.startAtOne) {
                    val -= 1;
                }
                baseTime += val * (unit.lengthInBase || 0);
            }
        }
    }
    
    const speed = calendar.conversionFactor || 1.0;
    return Math.floor(baseTime / speed);
}

export function convertToTimeObject(baseTime, calendar) {
    if (!calendar || !calendar.units) return {};

    const timeObject = {};
    const speed = calendar.conversionFactor || 1.0;
    const totalTime = Math.floor(baseTime * speed) - (calendar.epochOffset || 0);
    let remaining = totalTime;
    
    // Iterate from largest unit to smallest. Assumes units array is correctly ordered.
    for (const unit of calendar.units) {
        if (!unit.lengthInBase || unit.lengthInBase <= 0) continue;
        
        if (unit.type === 'cyclic' && Array.isArray(unit.values)) {
            let cycles = Math.floor(totalTime / unit.lengthInBase);
            let offset = unit.offset || 0;
            let index = (cycles + offset) % unit.values.length;
            if (index < 0) index += unit.values.length; // Handle negative modulo
            timeObject[unit.name] = unit.values[index];
            continue; // Cyclic units do not consume remaining time
        }

        if (unit.type === 'variable' && Array.isArray(unit.values)) {
            let activeName = unit.values[0].name;
            for (const v of unit.values) {
                if (remaining >= v.lengthInBase) {
                    remaining -= v.lengthInBase;
                } else {
                    activeName = v.name;
                    break;
                }
            }
            timeObject[unit.name] = activeName;
            continue;
        }

        let val = Math.floor(remaining / unit.lengthInBase);
        remaining = remaining % unit.lengthInBase;
        
        if (unit.type === 'string' && Array.isArray(unit.values)) {
            // Handle overflow by modulo or clamping.
            const index = val >= 0 ? val % unit.values.length : 0; 
            timeObject[unit.name] = unit.values[index];
        } else {
            if (unit.startAtOne) {
                val += 1;
            }
            timeObject[unit.name] = val;
        }
    }
    
    return timeObject;
}

export function formatTimeObject(timeObject, calendar) {
    if (!timeObject || !calendar || !calendar.units) return 'Unknown Time';
    
    const parts = [];
    for (const unit of calendar.units) {
        if (timeObject[unit.name] !== undefined) {
            parts.push(`${timeObject[unit.name]}`);
        }
    }
    return parts.join(' ');
}
