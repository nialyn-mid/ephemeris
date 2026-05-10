import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { state, saveChatState } from '../state.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToBaseTime } from '../time-engine.js';
import { RejectedCallError } from '../errors.js';
import { calendarIdSchema, timeObjectSchema, timeDeltaSchema } from './schema.js';

export function registerUpdateTimeTool() {
    const { registerFunctionTool } = getContext();

    registerFunctionTool({
        name: 'ephemeris_update_time',
        displayName: 'Ephemeris: Update Time',
        description: 'Updates the current world time, either by setting an absolute time or applying a relative delta. You may specify any input calendar for the given time values.',
        parameters: {
            type: 'object',
            properties: {
                calendarId: calendarIdSchema(),
                timeObject: timeObjectSchema('Absolute time to set. If omitted, applies timeDelta to current time.'),
                timeDelta: timeDeltaSchema('Negative numbers decrement.')
            },
            required: ['calendarId'],
        },
        action: async (params) => {
            const cal = getCalendar(params.calendarId);
            if (!cal) {
                throw new RejectedCallError(`Calendar '${params.calendarId}' not found.`);
            }

            const { calculateDeltaSeconds, convertToTimeObject, formatTimeObject } = await import('../time-engine.js');

            const oldTime = state.currentTime;
            let targetBaseTime = oldTime;

            if (params.timeObject) {
                targetBaseTime = convertToBaseTime(params.timeObject, cal);
            }

            if (params.timeDelta !== undefined) {
                const delta = calculateDeltaSeconds(params.timeDelta, cal);
                targetBaseTime += delta;
            }

            state.currentTime = targetBaseTime;
            saveChatState();

            const oldTimeObj = convertToTimeObject(oldTime, cal);
            const newTimeObj = convertToTimeObject(targetBaseTime, cal);

            const oldTimeStr = formatTimeObject(oldTimeObj, cal);
            const newTimeStr = formatTimeObject(newTimeObj, cal);

            logger.info(`Time updated from ${oldTime} to ${targetBaseTime}`);

            return JSON.stringify({
                status: 'ok',
                error: false,
                message: `Time updated from [${oldTimeStr}] to [${newTimeStr}]`,
                oldTime: oldTimeObj,
                newTime: newTimeObj,
                baseTime: targetBaseTime
            }, null, 2);
        },
    });
}
