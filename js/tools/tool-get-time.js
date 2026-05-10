import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { state } from '../state.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToTimeObject } from '../time-engine.js';

import { calendarIdSchema, timeObjectSchema } from './schema.js';

export function registerGetTimeTool() {
    const { registerFunctionTool } = getContext();

    registerFunctionTool({
        name: 'ephemeris_get_time',
        displayName: 'Ephemeris: Get Time',
        description: 'Gets the world time in specified calendar formats. If inputTime and sourceCalendarId are provided, converts that time to the requested calendars. Otherwise, returns the current world time.',
        parameters: {
            type: 'object',
            properties: {
                calendarIds: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'List of calendar IDs to format the output time in.'
                },
                inputTime: timeObjectSchema('Optional: A time object to convert. If omitted, uses current world time.'),
                sourceCalendarId: calendarIdSchema('Optional: The ID of the calendar system the inputTime belongs to. Required if inputTime is provided.')
            },
            required: ['calendarIds']
        },
        action: async (params) => {
            const { convertToBaseTime } = await import('../time-engine.js');
            
            let targetBaseTime = state.currentTime;

            if (params.inputTime && params.sourceCalendarId) {
                const sourceCal = getCalendar(params.sourceCalendarId);
                if (!sourceCal) {
                    return `Error: Source calendar '${params.sourceCalendarId}' not found.`;
                }
                targetBaseTime = convertToBaseTime(params.inputTime, sourceCal);
            }

            const results = {};
            for (const id of params.calendarIds) {
                const cal = getCalendar(id);
                if (cal) {
                    results[id] = convertToTimeObject(targetBaseTime, cal);
                } else {
                    results[id] = { error: `Calendar ${id} not found.` };
                }
            }
            return JSON.stringify(results, null, 2);
        },
    });
}
