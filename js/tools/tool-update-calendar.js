import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { state, saveChatState } from '../state.js';
import { settings } from '../settings.js';
import { getCalendar } from '../calendar-manager.js';
import { RejectedCallError } from '../errors.js';
import { lengthInSubUnitsSchema } from './infra/schema.js';
import { eventSource } from '/scripts/events.js';

/**
 * Resolves relative unit lengths (lengthInSubUnits) into absolute base seconds (lengthInBase).
 */
function resolveLengths(units) {
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
    const maxIterations = units.length * 2; // Prevent infinite loops

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
                // If it's cyclic and all values are strings, it needs an external length (already handled by Seed or SubUnits)
                // If it's cyclic or variable and values are objects, we sum their lengths.
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

    // Final check for unresolvable units with improved error reporting
    const unresolved = units.filter(u => u.type !== 'string' && !u.lengthInBase);

    if (unresolved.length > 0) {
        const errorDetails = unresolved.map(u => {
            if (u.lengthInSubUnits) {
                const subUnitName = Object.keys(u.lengthInSubUnits)[0];
                const subUnitExists = units.find(target => target.name === subUnitName);
                if (!subUnitExists) {
                    return `'${u.name}' depends on non-existent unit '${subUnitName}'`;
                } else {
                    return `'${u.name}' depends on '${subUnitName}' which is also unresolved`;
                }
            } else if (u.type === 'number') {
                return `'${u.name}' needs 'lengthInBase' or 'lengthInSubUnits'`;
            } else if (u.type === 'variable') {
                return `'${u.name}' must have lengths defined for each entry in 'values'`;
            } else if (u.type === 'cyclic') {
                return `'${u.name}' must have a uniform 'lengthInBase' OR individual lengths defined for each entry in 'values'`;
            }
            return null;
        }).filter(Boolean);

        const primaryError = unresolved[0];
        let message = `Could not resolve length for unit '${primaryError.name}'.`;

        if (errorDetails.length > 0) {
            message += ` Root issues found: ${errorDetails.join('; ')}.`;
        }

        throw new RejectedCallError(message);
    }
}


export function registerUpdateCalendarTool() {
    const { registerFunctionTool } = getContext();

    const doRegister = () => {
        const calendarDescription = `Creates or updates a custom calendar system for the current chat. 
If the calendar ID already exists, it will be patched with the provided fields. 
If it is a new ID, it will be created (requires displayName, abbreviation, and units/baseTemplate).

Crucial Requirements:
- Each unit MUST have a unique 'name'. This name is used as the key in time objects and for relative length definitions.${settings.requireShortFormat ? "\n- Each unit MUST have a unique 'formatChar' (single unique character like 'H' or 'Y') and the calendar MUST have a 'timeFormat' string (e.g. \"YYYY-MM-DD HH:mm:ss\").\n- All letters used in 'timeFormat' MUST correspond to a defined 'formatChar' in a unit, or be wrapped in [brackets] if they are literal text." : ""}
- Each unit must have a unique 'formatChar' (if short format is enabled).
- If 'superUnit' is used, it must refer to another existing unit in the calendar.

Supported Unit Types:
- 'number': Basic division (e.g. Hour = 3600s). Use startAtOne: true for 1-indexed (e.g. Day 1). Use startValue (e.g. 1970) for timeline anchoring.
- 'variable': For units with varying lengths (e.g. Months). Provide 'values' as an array of objects: [{"name": "Jan", "lengthInBase": 2678400}, ...]
- 'cyclic': For repeating cycles (e.g. Weekdays). Provide 'values' as strings and an optional 'offset'.
Tips:
- Use 'baseTemplate': [calendar_id] to inherit a defined calendar structure (e.g. 'gregorian') and only override what you need.
- You can define unit lengths relative to each other using 'lengthInSubUnits' (e.g. Day = 28 Hours) to avoid long number math.
- You can define 'superUnit' (e.g. Day superUnit: "Year") to make the unit track its value relative to that parent (Day-of-Year) instead of the immediate parent (Day-of-Month).`;

        registerFunctionTool({
            name: 'eph_update_calendar',
            displayName: 'Ephemeris: Update Calendar',
            description: calendarDescription,
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'Unique identifier without spaces' },
                    displayName: { type: 'string', description: 'Human-readable name. Required for new calendars.' },
                    baseTemplate: { type: 'string', description: 'ID of an existing calendar to copy units/settings from (e.g., "gregorian")' },
                    units: {
                        type: 'array',
                        description: 'Array of units. Overrides template if provided.',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                type: { type: 'string', enum: ['number', 'string', 'variable', 'cyclic'] },
                                lengthInBase: {
                                    type: 'number',
                                    description: 'Duration of this unit in base seconds.'
                                },
                                lengthInSubUnits: lengthInSubUnitsSchema(),
                                superUnit: { type: 'string', description: 'Explicit parent for formatting representation (e.g. "Year" for Day-of-Year).' },
                                values: {
                                    type: 'array',
                                    description: 'For "variable" or non-uniform "cyclic" units, provide objects: [{"name": "A", "lengthInBase": 100}, ...].',
                                    items: {
                                        anyOf: [
                                            { type: 'string' },
                                            {
                                                type: 'object',
                                                properties: {
                                                    name: { type: 'string' },
                                                    lengthInBase: { type: 'number' },
                                                    lengthInSubUnits: lengthInSubUnitsSchema()
                                                },
                                                required: ['name']
                                            }
                                        ]
                                    }
                                },
                                offset: { type: 'number', description: 'For cyclic types: shift the starting index' },
                                startAtOne: { type: 'boolean', description: 'True if unit is 1-indexed (like Day 1)' },
                                startValue: { type: 'number', description: 'Initial value at Epoch 0 (e.g. 1970 for years).' },
                                formatChar: { type: 'string', description: 'A single representative character for this unit in short formats (e.g. "H" for Hour).' }
                            },
                            required: ['name', 'type']
                        }
                    },
                    epochOffset: { type: 'number', description: 'Offset from base time 0' },
                    conversionFactor: { type: 'number', description: 'Speed relative to base time (default 1.0).' },
                    notes: { type: 'string', description: 'Cultural context or narrative flavor.' },
                    abbreviation: { type: 'string', description: 'Short label (e.g. ISO 8601, ABC)' },
                    timeFormat: { type: 'string', description: 'A template for short time display (e.g. "YYYY-MM-DD HH:mm:ss"). Must ONLY contain format characters defined in units.' }
                },
                required: ['id'],
            },
            action: async (params) => {
                const { provideDependency, announceCreator } = await import('./infra/tool-queue.js');
                if (params.id) {
                    announceCreator('calendar', params.id);
                }
                try {
                    const existingIndex = state.calendars.findIndex(c => c.id === params.id);
                    const isNew = existingIndex === -1;

                    // 1. Initialize target
                    let oldCalendar = isNew ? null : JSON.parse(JSON.stringify(state.calendars[existingIndex]));
                    let targetCalendar = isNew ? { id: params.id, units: [] } : JSON.parse(JSON.stringify(oldCalendar));

                    // 2. Apply Base Template if provided
                    if (params.baseTemplate) {
                        const baseCal = getCalendar(params.baseTemplate); // getCalendar searches global and local
                        if (!baseCal) {
                            throw new RejectedCallError(`Base template '${params.baseTemplate}' not found.`);
                        }
                        const templateClone = JSON.parse(JSON.stringify(baseCal));
                        targetCalendar = { ...templateClone, ...targetCalendar };
                        targetCalendar.id = params.id; // Ensure ID remains correct
                    }

                    // 3. Apply Overrides
                    if (params.displayName) targetCalendar.displayName = params.displayName;
                    if (params.units) targetCalendar.units = params.units;
                    if (params.epochOffset !== undefined) targetCalendar.epochOffset = params.epochOffset;
                    if (params.conversionFactor !== undefined) targetCalendar.conversionFactor = params.conversionFactor;
                    if (params.notes !== undefined) targetCalendar.notes = params.notes;
                    if (params.abbreviation) targetCalendar.abbreviation = params.abbreviation;
                    if (params.timeFormat) targetCalendar.timeFormat = params.timeFormat;

                    // 4. Resolve relative lengths and sort
                    if (targetCalendar.units) {
                        resolveLengths(targetCalendar.units);
                        targetCalendar.units.sort((a, b) => (b.lengthInBase || 0) - (a.lengthInBase || 0));
                    }

                    // 5. Validation
                    const { Validator } = await import('./infra/schema.js');
                    const v = new Validator(`Validation failed for calendar '${params.id}'`);

                    if (isNew) {
                        v.require(targetCalendar.displayName, 'displayName is required for new calendars');
                        v.require(targetCalendar.abbreviation, 'abbreviation is required for new calendars');
                        v.require(targetCalendar.units && targetCalendar.units.length > 0, 'units are required for new calendars');
                    }

                    if (settings.requireShortFormat) {
                        v.require(targetCalendar.timeFormat, 'timeFormat is required when short format support is enabled');

                        if (targetCalendar.timeFormat && targetCalendar.units) {
                            const formatChars = targetCalendar.units.map(u => u.formatChar).filter(c => !!c);
                            const definedChars = new Set(formatChars);

                            if (definedChars.size !== formatChars.length) {
                                const charToUnit = {};
                                for (const u of targetCalendar.units) {
                                    if (!u.formatChar) continue;
                                    if (charToUnit[u.formatChar]) {
                                        v.require(false, `Multiple units ('${charToUnit[u.formatChar]}' and '${u.name}') share the format character '${u.formatChar}'.`);
                                        break;
                                    }
                                    charToUnit[u.formatChar] = u.name;
                                }
                            }

                            const strippedFormat = targetCalendar.timeFormat.replace(/\[(.*?)\]/g, '');
                            const usedChars = new Set(strippedFormat.match(/[a-zA-Z]/g) || []);
                            for (const char of usedChars) {
                                v.require(definedChars.has(char), `timeFormat uses undefined character '${char}'.`);
                            }
                        }
                    }

                    if (targetCalendar.units) {
                        targetCalendar.units.forEach((u, idx) => {
                            const unitId = u.name || `[Unit ${idx}]`;
                            v.require(u.name && u.name.trim().length > 0, `Unit at index ${idx} is missing a 'name'`);
                            v.require(u.type, `Unit '${unitId}' is missing a 'type'`);

                            if (settings.requireShortFormat) {
                                v.require(u.formatChar && u.formatChar.length === 1, `Unit '${unitId}' must have a 1-char 'formatChar'`);
                            }

                            if (u.superUnit) {
                                const parentExists = targetCalendar.units.find(target => target.name === u.superUnit);
                                v.require(parentExists, `Unit '${unitId}' has non-existent superUnit '${u.superUnit}'`);
                            }

                            if (u.type === 'variable' || u.type === 'cyclic') {
                                v.require(Array.isArray(u.values) && u.values.length > 0, `Unit '${unitId}' must provide a 'values' array`);
                            }
                        });
                    }

                    v.throwIfErrors();

                    // 6. Save
                    if (isNew) {
                        state.calendars.push(targetCalendar);
                    } else {
                        state.calendars[existingIndex] = targetCalendar;
                    }

                    saveChatState();

                    const { generateChangelog } = await import('../formatter.js');
                    const changes = isNew ? [] : generateChangelog(oldCalendar, targetCalendar);

                    let finalMessage = `Calendar '${targetCalendar.displayName}' ${isNew ? 'created' : 'updated'}.` + (changes.length > 0 ? ` Changes: ${changes.join('; ')}` : '');

                    return JSON.stringify({
                        status: 'ok',
                        error: false,
                        message: finalMessage,
                        calendarId: targetCalendar.id,
                        isNew: isNew,
                        changes: changes
                    }, null, 2);
                } finally {
                    provideDependency('calendar', params.id);
                }
            },
        });
    };

    doRegister();
    eventSource.on('ephemeris-settings-changed', doRegister);
}


