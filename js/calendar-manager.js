import { logger } from './logger.js';
import { state } from './state.js';
import { settings } from './settings.js';

/**
 * Calendar Manager
 * Handles access to calendar definitions, merging global and per-chat.
 */

/**
 * Resolves relative unit lengths (lengthInSubUnits) into absolute base seconds (lengthInBase).
 */
export function resolveLengths(units, throwOnError = false) {
    const resolved = new Map();

    // Seed with explicitly defined lengths
    for (const unit of units) {
        if (unit.lengthInBase) {
            resolved.set(unit.name, unit.lengthInBase);
        }
    }

    // Iteratively resolve relative lengths
    let changed = true;
    let iterations = 0;
    const maxIterations = units.length * 2; 

    while (changed && iterations < maxIterations) {
        changed = false;
        iterations++;

        for (const unit of units) {
            if (resolved.has(unit.name)) continue;

            if (unit.lengthInSubUnits) {
                const subUnitName = Object.keys(unit.lengthInSubUnits)[0];
                const multiplier = unit.lengthInSubUnits[subUnitName];

                if (resolved.has(subUnitName)) {
                    unit.lengthInBase = resolved.get(subUnitName) * multiplier;
                    resolved.set(unit.name, unit.lengthInBase);
                    changed = true;
                }
            } else if ((unit.type === 'variable' || unit.type === 'cyclic') && Array.isArray(unit.values)) {
                let allValuesResolved = true;
                let totalLength = 0;
                let hasObjects = false;

                for (const v of unit.values) {
                    if (typeof v === 'object') {
                        hasObjects = true;
                        if (v.lengthInBase) {
                            totalLength += v.lengthInBase;
                        } else if (v.lengthInSubUnits) {
                            const subName = Object.keys(v.lengthInSubUnits)[0];
                            const mult = v.lengthInSubUnits[subName];
                            if (resolved.has(subName)) {
                                v.lengthInBase = resolved.get(subName) * mult;
                                totalLength += v.lengthInBase;
                            } else {
                                allValuesResolved = false;
                                break;
                            }
                        } else {
                            allValuesResolved = false;
                            break;
                        }
                    }
                }

                if (hasObjects && allValuesResolved) {
                    unit.lengthInBase = totalLength;
                    resolved.set(unit.name, unit.lengthInBase);
                    changed = true;
                }
            }
        }
    }

    if (throwOnError) {
        const unresolved = units.filter(u => u.type !== 'string' && !u.lengthInBase);
        if (unresolved.length > 0) {
            const getChain = (startUnit) => {
                const chain = [startUnit.name];
                let current = startUnit;
                const visited = new Set();
                
                while (current && (current.lengthInSubUnits || current.type === 'variable' || current.type === 'cyclic')) {
                    if (visited.has(current.name)) {
                        chain.push(`(CIRCULAR: ${current.name})`);
                        break;
                    }
                    visited.add(current.name);
                    
                    let nextName = null;
                    if (current.lengthInSubUnits) {
                        nextName = Object.keys(current.lengthInSubUnits)[0];
                    } else if (Array.isArray(current.values)) {
                        const firstObj = current.values.find(v => typeof v === 'object' && v.lengthInSubUnits);
                        if (firstObj) nextName = Object.keys(firstObj.lengthInSubUnits)[0];
                    }

                    if (!nextName) break;
                    chain.push(nextName);
                    current = units.find(u => u.name === nextName);
                    if (!current) {
                        chain[chain.length - 1] = `${nextName} (MISSING)`;
                        break;
                    }
                    if (current.lengthInBase) break; // Found the end of the chain
                }
                return chain.join(' > ');
            };

            const errorDetails = unresolved.map(u => {
                const chainStr = getChain(u);
                const isMissing = chainStr.includes('(MISSING)');
                const type = isMissing ? 'linear dependency' : 'resolution failure';
                return `Cannot resolve length for unit ${u.name} (${type}): ${chainStr}`;
            });

            const primaryError = unresolved[0];
            let message = `Could not resolve length for unit '${primaryError.name}'.`;
            if (errorDetails.length > 0) message = errorDetails[0]; // Use the detailed one as primary
            
            const err = new Error(message);
            err.name = 'ResolutionError';
            throw err;
        }
    }
}

export function getActiveCalendars() {
    const globals = settings.globalCalendars || [];
    const chatCals = state.calendars || [];

    // Map to remove duplicates, preferring chat calendars
    const map = new Map();
    for (const cal of globals) {
        const clone = JSON.parse(JSON.stringify(cal));
        if (clone.units) resolveLengths(clone.units);
        map.set(clone.id, clone);
    }
    for (const cal of chatCals) {
        const clone = JSON.parse(JSON.stringify(cal));
        if (clone.units) resolveLengths(clone.units);
        map.set(clone.id, clone); // overrides global if same ID
    }

    return Array.from(map.values());
}

export function getCalendar(id) {
    if (!id) return null;
    const calendars = getActiveCalendars();
    const lowerId = id.toLowerCase();
    return calendars.find(c => c.id.toLowerCase() === lowerId) || null;
}

export { formatCalendarDetails } from './formatter.js';
