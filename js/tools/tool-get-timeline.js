import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToBaseTime, convertToTimeObject, formatTimeObject } from '../time-engine.js';
import { getEventsInRange } from '../event-manager.js';
import { state } from '../state.js';

export function registerGetTimelineTool() {
    const { registerFunctionTool } = getContext();

    registerFunctionTool({
        name: 'ephemeris_get_timeline',
        displayName: 'Ephemeris: Get Timeline',
        description: 'Retrieves a list of events in a specified time window, formatted in a specific calendar.',
        parameters: {
            type: 'object',
            properties: {
                calendarId: { type: 'string', description: 'Calendar ID to format output times in' },
                centerTimeObject: { type: 'object', description: 'The central time to look around. If omitted, uses current time.' },
                rangeBackwardSeconds: { type: 'number', description: 'How far back to look in seconds (base time units)' },
                rangeForwardSeconds: { type: 'number', description: 'How far forward to look in seconds (base time units)' },
                minSignificance: { type: 'number', description: 'Filter events by minimum significance (1-10)' }
            },
            required: ['calendarId', 'rangeBackwardSeconds', 'rangeForwardSeconds'],
        },
        action: async (params) => {
            const cal = getCalendar(params.calendarId);
            if (!cal) {
                return `Error: Calendar '${params.calendarId}' not found.`;
            }

            let centerTime = state.currentTime;
            if (params.centerTimeObject) {
                // Determine center time from calendar of the same ID (assuming the input object matches the requested format)
                centerTime = convertToBaseTime(params.centerTimeObject, cal);
            }

            const start = centerTime - params.rangeBackwardSeconds;
            const end = centerTime + params.rangeForwardSeconds;
            
            let events = getEventsInRange(start, end);
            
            if (params.minSignificance !== undefined) {
                events = events.filter(e => e.significance >= params.minSignificance);
            }

            if (events.length === 0) {
                return 'Timeline: No events found in this range.';
            }

            const formattedEvents = events.map(e => {
                const eTimeObj = convertToTimeObject(e.baseTime, cal);
                const timeStr = formatTimeObject(eTimeObj, cal);
                return `[${timeStr}] ${e.label} (Significance: ${e.significance}): ${e.description}`;
            });

            return `Timeline:\n${formattedEvents.join('\n')}`;
        },
    });
}
