import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { state } from '../state.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToTimeObject } from '../time-engine.js';

export function registerGetTimeTool() {
    const { registerFunctionTool } = getContext();

    registerFunctionTool({
        name: 'ephemeris_get_time',
        displayName: 'Ephemeris: Get Time',
        description: 'Gets the current world time in specified calendar formats as structured JSON.',
        parameters: {
            type: 'object',
            properties: {
                calendarIds: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'List of calendar IDs to format the time in.'
                },
            },
            required: ['calendarIds']
        },
        action: async (params) => {
            const results = {};
            for (const id of params.calendarIds) {
                const cal = getCalendar(id);
                if (cal) {
                    results[id] = convertToTimeObject(state.currentTime, cal);
                } else {
                    results[id] = { error: `Calendar ${id} not found.` };
                }
            }
            return JSON.stringify(results, null, 2);
        },
    });
}
