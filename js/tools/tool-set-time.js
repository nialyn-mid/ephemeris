import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { state, saveChatState } from '../state.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToBaseTime } from '../time-engine.js';
import { calendarIdSchema, timeObjectSchema } from './schema.js';

export function registerSetTimeTool() {
    const { registerFunctionTool } = getContext();

    registerFunctionTool({
        name: 'ephemeris_set_time',
        displayName: 'Ephemeris: Set Time',
        description: 'Updates the current world time.',
        parameters: {
            type: 'object',
            properties: {
                calendarId: calendarIdSchema(),
                timeObject: timeObjectSchema(),
            },
            required: ['calendarId', 'timeObject'],
        },
        action: async (params) => {
            const cal = getCalendar(params.calendarId);
            if (!cal) {
                return `Error: Calendar '${params.calendarId}' not found.`;
            }

            const baseTime = convertToBaseTime(params.timeObject, cal);
            state.currentTime = baseTime;
            saveChatState();
            logger.info(`Time updated to baseTime: ${baseTime}`);
            
            return `Time successfully updated.`;
        },
    });
}
