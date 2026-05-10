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
        name: 'eph_update_time',
        displayName: 'Ephemeris: Update Time',
        description: 'Updates the current world time, either by setting an absolute time or applying a relative delta. You may specify any input calendar for the given time values.',
        parameters: {
            type: 'object',
            properties: {
                calendarId: calendarIdSchema(),
                timeObject: timeObjectSchema('Absolute time to set. If omitted, applies timeDelta to current time.'),
                timeDelta: timeDeltaSchema('Use to adjust time. Negative numbers decrement.'),
                responseCalendarId: calendarIdSchema('Optional: Request a post-change time response in an additional calendar.')
            },
            required: ['calendarId'],
        },
        action: async (params) => {
            const calId = params.calendarId || params.CalendarId || params.calendar_id;
            const timeObj = params.timeObject || params.TimeObject;
            const timeDelta = params.timeDelta || params.TimeDelta;
            const respCalId = params.responseCalendarId || params.response_calendar_id;

            const cal = getCalendar(calId);
            if (!cal) {
                throw new RejectedCallError(`Calendar '${calId}' not found.`);
            }

            const { calculateDeltaSeconds, convertToTimeObject, formatTimeObject } = await import('../time-engine.js');

            const oldTime = state.currentTime;
            let targetBaseTime = oldTime;

            if (timeObj) {
                targetBaseTime = convertToBaseTime(timeObj, cal);
            }

            if (timeDelta !== undefined) {
                const delta = calculateDeltaSeconds(timeDelta, cal);
                targetBaseTime += delta;
            }

            state.currentTime = targetBaseTime;
            saveChatState();

            const oldTimeObj = convertToTimeObject(oldTime, cal);
            const newTimeObj = convertToTimeObject(targetBaseTime, cal);

            const oldTimeStr = formatTimeObject(oldTimeObj, cal);
            const newTimeStr = formatTimeObject(newTimeObj, cal);

            let responseCalendarTime = undefined;
            if (respCalId) {
                const respCal = getCalendar(respCalId);
                if (respCal) {
                    responseCalendarTime = {
                        calendarId: respCal.id,
                        displayName: respCal.displayName,
                        time: convertToTimeObject(targetBaseTime, respCal),
                        timeStr: formatTimeObject(convertToTimeObject(targetBaseTime, respCal), respCal)
                    };
                }
            }

            logger.info(`Time updated from ${oldTime} to ${targetBaseTime}`);

            return JSON.stringify({
                status: 'ok',
                error: false,
                message: `Time updated from [oldTime] to [newTime]`,
                oldTime: oldTimeObj,
                newTime: newTimeObj,
                baseTime: targetBaseTime,
                responseCalendarTime: responseCalendarTime
            }, null, 2);
        },

    });
}
