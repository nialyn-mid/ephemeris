import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToBaseTime, convertToTimeObject, formatTimeObject } from '../time-engine.js';
import { getEventsInRange } from '../event-manager.js';
import { state } from '../state.js';
import { settings } from '../settings.js';
import { RejectedCallError } from '../errors.js';

import { calendarIdSchema, timeObjectSchema, significanceSchema } from './infra/schema.js';

export function registerListEventsTool() {
    const { registerFunctionTool } = getContext();

    registerFunctionTool({
        name: 'eph_list_events',
        displayName: 'Ephemeris: List Events',
        description: 'Retrieves a list of events in a specified time window, formatted in a specific calendar. Can be used to retrieve the information about a specific event.',
        parameters: {
            type: 'object',
            properties: {
                calendarId: calendarIdSchema('Calendar ID to format output times in.'),
                centerTimeObject: timeObjectSchema('The central time to look around. If omitted, uses current time.'),
                rangeBackwardSeconds: { type: 'number', description: 'Optional: How far back to look in seconds (base time units)' },
                rangeForwardSeconds: { type: 'number', description: 'Optional: How far forward to look in seconds (base time units)' },
                minSignificance: significanceSchema('Optional: Filter events by minimum significance (1-10)'),
                id: { type: 'string', description: 'Optional: Find a specific event by ID. If provided, range filters are ignored.' },
                maxResults: { type: 'number', description: 'Optional: Limit the number of events returned. If limit is reached, events are prioritized by relevance (distance vs significance).' }
            },
            required: ['calendarId'],
        },
        action: async (params) => {
            const cal = getCalendar(params.calendarId);
            if (!cal) {
                throw new RejectedCallError(`Calendar '${params.calendarId}' not found.`);
            }

            // 1. Direct ID lookup
            if (params.id) {
                const event = state.events.find(e => e.id === params.id);
                if (!event) {
                    throw new RejectedCallError(`Event ID '${params.id}' not found.`);
                }
                const eTimeObj = convertToTimeObject(event.baseTime, cal);
                const formatted = {
                    ...event,
                    time: formatTimeObject(eTimeObj, cal),
                    timeObject: eTimeObj
                };
                return JSON.stringify({ status: 'ok', events: [formatted] }, null, 2);
            }

            // 2. Windowed Search
            let centerTime = state.currentTime;
            if (params.centerTimeObject) {
                centerTime = convertToBaseTime(params.centerTimeObject, cal);
            }

            const start = params.rangeBackwardSeconds !== undefined 
                ? centerTime - params.rangeBackwardSeconds 
                : -Infinity;
            const end = params.rangeForwardSeconds !== undefined 
                ? centerTime + params.rangeForwardSeconds 
                : Infinity;

            let events = getEventsInRange(start, end);

            if (params.minSignificance !== undefined) {
                events = events.filter(e => e.significance >= params.minSignificance);
            }

            // 3. Relevance-based Pruning
            if (params.maxResults && events.length > params.maxResults) {
                const distances = settings.injection.significanceDistances;
                
                // Deep copy to avoid mutating state during sorting
                events = JSON.parse(JSON.stringify(events));

                events.forEach(e => {
                    const dist = Math.abs(e.baseTime - centerTime);
                    const threshold = distances[e.significance] || 86400; // Default to 1 day if unknown
                    // Score: smaller is "better" (closer to center relative to its significance)
                    e._relevance = dist / threshold;
                });

                events.sort((a, b) => a._relevance - b._relevance);
                events = events.slice(0, params.maxResults);
                
                // Cleanup temp score
                events.forEach(e => delete e._relevance);
                // Sort back by time
                events.sort((a, b) => a.baseTime - b.baseTime);
            }

            const formattedEvents = events.map(e => {
                const eTimeObj = convertToTimeObject(e.baseTime, cal);
                return {
                    id: e.id,
                    time: formatTimeObject(eTimeObj, cal),
                    timeObject: eTimeObj,
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
                message: events.length === 0 ? 'No events found.' : `Found ${events.length} events.`,
                count: formattedEvents.length,
                events: formattedEvents
            }, null, 2);
        },

    });
}
