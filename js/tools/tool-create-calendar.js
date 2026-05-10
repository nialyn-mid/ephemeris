import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { state, saveChatState } from '../state.js';
import { getCalendar } from '../calendar-manager.js';

export function registerCreateCalendarTool() {
    const { registerFunctionTool } = getContext();

    const calendarDescription = `Defines a new custom calendar system for the current chat.
You can specify units from largest to smallest.

Supported Types:
- 'number': Basic division (e.g. Hour = 3600s). Use startAtOne: true for 1-indexed (e.g. Day 1). Use startValue (e.g. 1970) to shift the origin point of a unit without affecting its cycle labels.
- 'variable': For units with varying lengths. Set lengthInBase to 0 and provide 'values' as an array of objects: [{"name": "January", "lengthInBase": 2678400}, {"name": "February", ...}]
- 'cyclic': For repeating units independent of the main hierarchy (e.g. Weekdays). Provide lengthInBase (e.g. 86400), 'values' as an array of strings (e.g. ["Sunday", "Monday"...]), and an optional 'offset' to shift the start day relative to Epoch 0.

Tip: Provide 'baseTemplate': 'gregorian' to copy the standard calendar, allowing you to just send an empty 'units' array or a partial 'units' array to override specific things.`;

    registerFunctionTool({
        name: 'ephemeris_create_calendar',
        displayName: 'Ephemeris: Create Calendar',
        description: calendarDescription,
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Unique identifier without spaces' },
                displayName: { type: 'string' },
                baseTemplate: { type: 'string', description: 'ID of an existing calendar to copy units/settings from (e.g., "gregorian")' },
                units: { 
                    type: 'array', 
                    description: 'Ordered array of units from largest (e.g. Year) to smallest (e.g. Second). Overrides template if provided.',
                    items: { 
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            type: { type: 'string', enum: ['number', 'string', 'variable', 'cyclic'] },
                            lengthInBase: { type: 'number', description: 'Length of this unit in base time seconds. Set to 0 if variable.' },
                            values: { type: 'array', description: 'Array of strings (for string/cyclic) or array of objects with {name, lengthInBase} (for variable)' },
                            offset: { type: 'number', description: 'For cyclic types: shift the starting index' },
                            startAtOne: { type: 'boolean', description: 'True if unit is 1-indexed (like Day 1)'},
                            startValue: { type: 'number', description: 'Initial value of the unit at Epoch 0 (e.g. 1970 for years). Use for timeline anchoring.' }
                        },
                        required: ['name', 'type']
                    } 
                },
                epochOffset: { type: 'number', description: 'Offset from base time 0' },
                conversionFactor: { type: 'number', description: 'Speed relative to base time (default 1.0)' },
                notes: { type: 'string', description: 'Cultural context, historical notes, or narrative flavor for the LLM to remember about this calendar.' },
            },
            required: ['id', 'displayName'],
        },
        action: async (params) => {
            let units = params.units || [];
            let epochOffset = params.epochOffset || 0;
            let conversionFactor = params.conversionFactor || 1.0;
            let notes = params.notes || '';

            if (params.baseTemplate) {
                const baseCal = getCalendar(params.baseTemplate);
                if (baseCal) {
                    if (!params.units || params.units.length === 0) units = JSON.parse(JSON.stringify(baseCal.units));
                    if (params.epochOffset === undefined) epochOffset = baseCal.epochOffset;
                    if (params.conversionFactor === undefined) conversionFactor = baseCal.conversionFactor;
                    if (params.notes === undefined) notes = baseCal.notes || '';
                } else {
                    return `Error: Base template '${params.baseTemplate}' not found.`;
                }
            }

            if (!units || units.length === 0) {
                return 'Error: Must provide units or a valid baseTemplate.';
            }

            const existingIndex = state.calendars.findIndex(c => c.id === params.id);
            const newCalendar = {
                id: params.id,
                displayName: params.displayName,
                units: units,
                epochOffset: epochOffset,
                conversionFactor: conversionFactor,
                notes: notes
            };

            if (existingIndex >= 0) {
                state.calendars[existingIndex] = newCalendar;
                logger.info(`Updated calendar: ${params.id}`);
            } else {
                state.calendars.push(newCalendar);
                logger.info(`Created calendar: ${params.id}`);
            }

            saveChatState();
            return `Calendar '${params.displayName}' successfully created/updated.`;
        },
    });
}
