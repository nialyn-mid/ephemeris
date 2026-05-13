import { logger } from './logger.js';

/**
 * Time Engine
 * Core conversion logic between Base Time and Calendar Time Objects.
 */

export function convertToBaseTime(timeObject, calendar) {
    if (!calendar || !calendar.units) return 0;

    let baseTime = calendar.epochOffset || 0;
    
    // Sort units by size (largest first) to handle overrides correctly
    const sortedUnits = [...calendar.units].sort((a, b) => (b.lengthInBase || 0) - (a.lengthInBase || 0));
    
    // Track which units are "shadowed" by a more specific superUnit relationship
    const shadowedUnits = new Set();
    for (const unit of sortedUnits) {
        if (timeObject[unit.name] !== undefined && unit.superUnit) {
            // Find all units between this unit and its superUnit and shadow them
            const superUnitObj = calendar.units.find(u => u.name === unit.superUnit);
            if (superUnitObj) {
                const superSize = superUnitObj.lengthInBase || 0;
                const unitSize = unit.lengthInBase || 0;
                for (const other of calendar.units) {
                    const otherSize = other.lengthInBase || 0;
                    if (otherSize < superSize && otherSize > unitSize) {
                        shadowedUnits.add(other.name);
                    }
                }
            }
        }
    }

    for (const unit of calendar.units) {
        if (unit.type === 'cyclic') continue;
        if (shadowedUnits.has(unit.name)) continue;

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
    const remainders = {}; // Stores remaining time AFTER unit processing
    const speed = calendar.conversionFactor || 1.0;
    const totalTime = Math.floor(baseTime * speed) - (calendar.epochOffset || 0);
    let remaining = totalTime;
    
    const sortedUnits = [...calendar.units].sort((a, b) => (b.lengthInBase || 0) - (a.lengthInBase || 0));
    
    // Seed total time as the "top level" remainder for units with no parent or explicit superUnit
    remainders["_total"] = totalTime;

    for (const unit of sortedUnits) {
        const isVariable = unit.type === 'variable' && Array.isArray(unit.values);
        if (!isVariable && (!unit.lengthInBase || unit.lengthInBase <= 0)) continue;
        
        // Determine which pool to use for value calculation
        let calcRemaining = remaining;
        if (unit.superUnit && remainders[unit.superUnit] !== undefined) {
            calcRemaining = remainders[unit.superUnit];
        }

        if (unit.type === 'cyclic' && Array.isArray(unit.values)) {
            let offset = unit.offset || 0;
            const hasObjects = typeof unit.values[0] === 'object';
            
            if (hasObjects) {
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
                let cycles = Math.floor(totalTime / unit.lengthInBase);
                let index = (cycles + offset) % unit.values.length;
                if (index < 0) index += unit.values.length;
                timeObject[unit.name] = unit.values[index];
            }
            continue;
        }

        if (unit.type === 'variable' && Array.isArray(unit.values)) {
            // For variable units, we MUST consume from the main 'remaining' pool
            // But we find the 'activeName' based on the specified pool
            let tempRemaining = calcRemaining;
            let activeName = unit.values[0].name;
            for (const v of unit.values) {
                if (tempRemaining >= v.lengthInBase) {
                    tempRemaining -= v.lengthInBase;
                } else {
                    activeName = v.name;
                    break;
                }
            }
            timeObject[unit.name] = activeName;
            
            // Still MUST update the global 'remaining' for the next unit in the standard hierarchy
            let actualRemaining = remaining;
            for (const v of unit.values) {
                if (actualRemaining >= v.lengthInBase) {
                    actualRemaining -= v.lengthInBase;
                } else {
                    break;
                }
            }
            remaining = actualRemaining;
            remainders[unit.name] = remaining;
            continue;
        }

        let val = Math.floor(calcRemaining / unit.lengthInBase);
        
        // Update main pool
        remaining = remaining % unit.lengthInBase;
        remainders[unit.name] = remaining;
        
        if (unit.type === 'string' && Array.isArray(unit.values)) {
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


