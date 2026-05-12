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
                
                // Adjust for starting values (e.g. Year 1970) and indexing
                let startOffset = unit.startValue !== undefined ? unit.startValue : (unit.startAtOne ? 1 : 0);
                
                val -= startOffset;
                baseTime += val * (unit.lengthInBase || 0);
            }
        }
    }
    
    const speed = calendar.conversionFactor || 1.0;
    return Math.floor(baseTime / speed);
}

export function calculateDeltaSeconds(deltaObject, calendar) {
    if (!calendar || !calendar.units) return 0;

    let deltaSeconds = 0;

    // Special bypass for raw seconds injection
    if (deltaObject._baseSeconds !== undefined) {
        let raw = Number(deltaObject._baseSeconds);
        if (!isNaN(raw)) {
            deltaSeconds += raw;
        }
    }
    
    for (const unit of calendar.units) {
        if (unit.type === 'cyclic') continue;

        if (deltaObject[unit.name] !== undefined) {
            let val = Number(deltaObject[unit.name]);
            if (isNaN(val)) continue;
            
            if (unit.type === 'variable' && Array.isArray(unit.values)) {
                // For delta, we use the average length or the first few items.
                // Simple approach: sum the first 'val' items if positive, or just use a standard year/month length.
                // But since our variables are fixed lengths in settings, we can just sum them.
                if (val > 0) {
                    for (let i = 0; i < val; i++) {
                        const v = unit.values[i % unit.values.length];
                        deltaSeconds += v.lengthInBase || 0;
                    }
                } else if (val < 0) {
                    for (let i = 0; i < Math.abs(val); i++) {
                        const v = unit.values[(unit.values.length - 1 - i) % unit.values.length];
                        deltaSeconds -= v.lengthInBase || 0;
                    }
                }
            } else {
                deltaSeconds += val * (unit.lengthInBase || 0);
            }
        }
    }
    
    const speed = calendar.conversionFactor || 1.0;
    return Math.floor(deltaSeconds / speed);
}

export function convertToTimeObject(baseTime, calendar) {
    if (!calendar || !calendar.units) return {};

    const timeObject = {};
    const speed = calendar.conversionFactor || 1.0;
    const totalTime = Math.floor(baseTime * speed) - (calendar.epochOffset || 0);
    let remaining = totalTime;
    
    // Iterate from largest unit to smallest. Ensure units are correctly ordered.
    const sortedUnits = [...calendar.units].sort((a, b) => (b.lengthInBase || 0) - (a.lengthInBase || 0));
    
    for (const unit of sortedUnits) {
        const isVariable = unit.type === 'variable' && Array.isArray(unit.values);
        if (!isVariable && (!unit.lengthInBase || unit.lengthInBase <= 0)) continue;
        
        if (unit.type === 'cyclic' && Array.isArray(unit.values)) {
            let offset = unit.offset || 0;
            const hasObjects = typeof unit.values[0] === 'object';
            
            if (hasObjects) {
                // Non-uniform cycle: find position by summing durations
                let cycleTime = totalTime % unit.lengthInBase;
                if (cycleTime < 0) cycleTime += unit.lengthInBase;
                
                let accumulated = 0;
                let foundIndex = 0;
                for (let i = 0; i < unit.values.length; i++) {
                    const idx = (i + offset) % unit.values.length;
                    const v = unit.values[idx];
                    accumulated += v.lengthInBase || 0;
                    if (cycleTime < accumulated) {
                        foundIndex = idx;
                        break;
                    }
                }
                timeObject[unit.name] = unit.values[foundIndex].name;
            } else {
                // Uniform cycle: simple modulo
                let cycles = Math.floor(totalTime / unit.lengthInBase);
                let index = (cycles + offset) % unit.values.length;
                if (index < 0) index += unit.values.length;
                timeObject[unit.name] = unit.values[index];
            }
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
            let startOffset = unit.startValue !== undefined ? unit.startValue : (unit.startAtOne ? 1 : 0);
            
            val += startOffset;
            timeObject[unit.name] = val;
        }
    }
    
    return timeObject;
}

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

