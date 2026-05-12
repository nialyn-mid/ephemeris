import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { state, saveChatState } from '../state.js';
import { getCalendar } from '../calendar-manager.js';
import { RejectedCallError } from '../errors.js';
import { lengthInSubUnitsSchema } from './infra/schema.js';

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

    const calendarDescription = `Creates or updates a custom calendar system for the current chat. 
If the calendar ID already exists, it will be patched with the provided fields. 
If it is a new ID, it will be created (requires displayName, abbreviation, and units/baseTemplate).

Supported Unit Types:
- 'number': Basic division (e.g. Hour = 3600s). Use startAtOne: true for 1-indexed (e.g. Day 1). Use startValue (e.g. 1970) for timeline anchoring.
- 'variable': For units with varying lengths (e.g. Months). Provide 'values' as an array of objects: [{"name": "Jan", "lengthInBase": 2678400}, ...]
- 'cyclic': For repeating cycles (e.g. Weekdays). Provide 'values' as strings and an optional 'offset'.
Tips:
- Use 'baseTemplate': [calendar_id] to inherit a defined calendar structure and only override what you need.
- You can define unit lengths relative to each other using 'lengthInSubUnits' (e.g. Day = 28 Hours) to avoid long number math.
- Define starting with the smallest unit first - using lengthInBase to define the smallest unit against the Base Time (Seconds) - to avoid errors.
- Create calendars before setting the current time or creating events intended to be used with them.`;

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
                                description: 'Duration of this unit in base seconds. For "cyclic" units, this is the length of one step (e.g. 86400 for a 1-day weekday).'
                            },
                            lengthInSubUnits: lengthInSubUnitsSchema(),
                            values: {
                                type: 'array',
                                description: 'For "variable" or non-uniform "cyclic" units, provide objects: [{"name": "A", "lengthInBase": 100}, ...]. For uniform "cyclic" units, an array of strings is sufficient.',
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
                            startValue: { type: 'number', description: 'Initial value at Epoch 0 (e.g. 1970 for years).' }
                        },
                        required: ['name', 'type']
                    }
                },
                epochOffset: { type: 'number', description: 'Offset from base time 0' },
                conversionFactor: { type: 'number', description: 'Speed relative to base time (default 1.0). Keep it close to 1.0 unless you want some wild unit dissonance.' },
                notes: { type: 'string', description: 'For stating inobvious time system quirks, cultural context, or narrative flavor.' },
                abbreviation: { type: 'string', description: 'Short label (e.g. ISO 8601, ABC)' }
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

                // 1. Initialize target (either clone existing or start empty)
                const oldCalendar = isNew ? null : JSON.parse(JSON.stringify(state.calendars[existingIndex]));
                let targetCalendar = isNew ? { units: [] } : JSON.parse(JSON.stringify(oldCalendar));

                // 2. Apply BaseTemplate if provided (replaces existing base if specified)
                if (params.baseTemplate) {
                    const baseCal = getCalendar(params.baseTemplate);
                    if (!baseCal) {
                        throw new RejectedCallError(`Base template '${params.baseTemplate}' not found.`);
                    }
                    // Merge template into our target
                    targetCalendar = { ...targetCalendar, ...JSON.parse(JSON.stringify(baseCal)) };
                }

                // 3. Apply Overrides
                targetCalendar.id = params.id;
                if (params.displayName) targetCalendar.displayName = params.displayName;
                if (params.units) targetCalendar.units = params.units;
                if (params.epochOffset !== undefined) targetCalendar.epochOffset = params.epochOffset;
                if (params.conversionFactor !== undefined) targetCalendar.conversionFactor = params.conversionFactor;
                if (params.notes !== undefined) targetCalendar.notes = params.notes;
                if (params.abbreviation) targetCalendar.abbreviation = params.abbreviation;

                // 4. Resolve relative lengths and sort by size (Largest to Smallest)
                if (targetCalendar.units) {
                    resolveLengths(targetCalendar.units);
                    targetCalendar.units.sort((a, b) => (b.lengthInBase || 0) - (a.lengthInBase || 0));
                }

                // 5. Validation
                if (isNew) {
                    const { Validator } = await import('./infra/schema.js');
                    const v = new Validator('Validation failed for new calendar');

                    v.require(targetCalendar.displayName, 'displayName is required for new calendars');
                    v.require(targetCalendar.abbreviation, 'abbreviation is required for new calendars');
                    v.require(targetCalendar.units && targetCalendar.units.length > 0, 'units or a valid baseTemplate are required for new calendars');

                    v.throwIfErrors();

                    state.calendars.push(targetCalendar);
                } else {
                    state.calendars[existingIndex] = targetCalendar;
                }

                saveChatState();

                const { generateChangelog } = await import('../formatter.js');
                const changes = isNew ? [] : generateChangelog(oldCalendar, targetCalendar);

                return JSON.stringify({
                    status: 'ok',
                    error: false,
                    message: `Calendar '${targetCalendar.displayName}' ${isNew ? 'created' : 'updated'}.` + (changes.length > 0 ? ` Changes: ${changes.join('; ')}` : ''),
                    calendarId: targetCalendar.id,
                    isNew: isNew,
                    changes: changes
                }, null, 2);
            } finally {
                provideDependency('calendar', params.id);
            }
        },

    });
}


