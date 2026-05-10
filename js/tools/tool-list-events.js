import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToBaseTime, convertToTimeObject, formatTimeObject } from '../time-engine.js';
import { getEventsInRange } from '../event-manager.js';
import { state } from '../state.js';
import { RejectedCallError } from '../errors.js';

import { calendarIdSchema, timeObjectSchema, significanceSchema } from './schema.js';

export function registerListEventsTool() {
    const { registerFunctionTool } = getContext();

    registerFunctionTool({
        name: 'eph_list_events',
        displayName: 'Ephemeris: List Events',
        description: 'Retrieves a list of events in a specified time window, formatted in a specific calendar.',
        parameters: {
            type: 'object',
            properties: {
                calendarId: calendarIdSchema('Calendar ID to format output times in.'),
                centerTimeObject: timeObjectSchema('The central time to look around. If omitted, uses current time.'),
                rangeBackwardSeconds: { type: 'number', description: 'How far back to look in seconds (base time units)' },
                rangeForwardSeconds: { type: 'number', description: 'How far forward to look in seconds (base time units)' },
                minSignificance: significanceSchema('Filter events by minimum significance (1-10)')
            },
            required: ['calendarId', 'rangeBackwardSeconds', 'rangeForwardSeconds'],
        },
        action: async (params) => {
            const cal = getCalendar(params.calendarId);
            if (!cal) {
                throw new RejectedCallError(`Calendar '${params.calendarId}' not found.`);
            }

            let centerTime = state.currentTime;
            if (params.centerTimeObject) {
                centerTime = convertToBaseTime(params.centerTimeObject, cal);
            }

            const start = centerTime - params.rangeBackwardSeconds;
            const end = centerTime + params.rangeForwardSeconds;
            
            let events = getEventsInRange(start, end);
            
            if (params.minSignificance !== undefined) {
                events = events.filter(e => e.significance >= params.minSignificance);
            }

            const formattedEvents = events.map(e => {
                const eTimeObj = convertToTimeObject(e.baseTime, cal);
                const timeStr = formatTimeObject(eTimeObj, cal);
                return {
                    id: e.id,
                    time: timeStr,
                    label: e.label,
                    significance: e.significance,
                    description: e.description,
                    tags: e.tags,
                    baseTime: e.baseTime
                };
            });

            return JSON.stringify({
                status: 'ok',
                error: false,
                message: events.length === 0 ? 'No events found in this range.' : `Found ${events.length} events.`,
                events: formattedEvents
            }, null, 2);
        },
    });
}
