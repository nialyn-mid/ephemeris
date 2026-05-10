import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToBaseTime } from '../time-engine.js';
import { addEvent } from '../event-manager.js';
import { settings } from '../settings.js';
import { getActiveCalendars } from '../calendar-manager.js';
import { formatDuration } from '../ui/time-preview.js';

import { calendarIdSchema, timeObjectSchema, significanceSchema } from './schema.js';

export function registerAddEventTool() {
    const { registerFunctionTool } = getContext();

    const calendars = getActiveCalendars();
    const primaryCal = calendars[0] || { units: [{ name: 'second', lengthInBase: 1 }] };
    const s = settings.injection.significanceDistances;

    const sigDescription = `Importance rating (1-10). Determines how far from the event time it's important to know about it. ` +
        `Current thresholds: Sig 1 (${formatDuration(s[1], primaryCal)}), ` +
        `Sig 5 (${formatDuration(s[5], primaryCal)}), ` +
        `Sig 10 (${s[10] >= 31536000000 ? 'Permanent' : formatDuration(s[10], primaryCal)}).`;

    registerFunctionTool({
        name: 'ephemeris_add_event',
        displayName: 'Ephemeris: Add Event',
        description: 'Schedules a new world event.',
        parameters: {
            type: 'object',
            properties: {
                calendarId: calendarIdSchema(),
                timeObject: timeObjectSchema(),
                label: { type: 'string', description: 'Short name of the event' },
                description: { type: 'string', description: 'Detailed description' },
                significance: significanceSchema(sigDescription),
                tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['calendarId', 'timeObject', 'label'],
        },
        action: async (params) => {
            const cal = getCalendar(params.calendarId);
            if (!cal) {
                return `Error: Calendar '${params.calendarId}' not found.`;
            }

            const baseTime = convertToBaseTime(params.timeObject, cal);

            const eventId = addEvent({
                label: params.label,
                description: params.description,
                baseTime: baseTime,
                sourceCalendar: params.calendarId,
                significance: params.significance || 5,
                tags: params.tags || []
            });

            return `Event "${params.label}" successfully scheduled.`;
        },
    });
}
