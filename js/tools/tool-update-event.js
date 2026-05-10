import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToBaseTime } from '../time-engine.js';
import { addEvent, updateEvent } from '../event-manager.js';
import { settings } from '../settings.js';
import { getActiveCalendars } from '../calendar-manager.js';
import { formatDuration } from '../ui/time-preview.js';
import { RejectedCallError } from '../errors.js';

import { calendarIdSchema, timeObjectSchema, significanceSchema } from './schema.js';

export function registerUpdateEventTool() {
    const { registerFunctionTool } = getContext();

    const calendars = getActiveCalendars();
    const primaryCal = calendars[0] || { units: [{ name: 'second', lengthInBase: 1 }] };
    const s = settings.injection.significanceDistances;

    const sigDescription = `Importance rating (1-10). Determines how far from the event time it's important to know about it. ` +
        `Current thresholds: Sig 1 (${formatDuration(s[1], primaryCal)}), ` +
        `Sig 5 (${formatDuration(s[5], primaryCal)}), ` +
        `Sig 10 (${s[10] >= 31536000000 ? 'Permanent' : formatDuration(s[10], primaryCal)}).`;

    registerFunctionTool({
        name: 'eph_update_event',
        displayName: 'Ephemeris: Update Event',
        description: 'Creates or updates a world event. If an ID is provided, it patches the existing event. Otherwise, it creates a new one.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Unique identifier of the event to update. Omit to create a new event.' },
                calendarId: calendarIdSchema(),
                timeObject: timeObjectSchema('Time of the event. Required for new events.'),
                label: { type: 'string', description: 'Short name. Required for new events.' },
                description: { type: 'string', description: 'Detailed description' },
                significance: significanceSchema(sigDescription),
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags for filtering.' },
            },
            required: ['calendarId'],
        },
        action: async (params) => {
            const cal = getCalendar(params.calendarId);
            if (!cal) {
                throw new RejectedCallError(`Calendar '${params.calendarId}' not found.`);
            }

            const eventData = {};
            if (params.timeObject) {
                eventData.baseTime = convertToBaseTime(params.timeObject, cal);
                eventData.sourceCalendar = params.calendarId;
            }
            if (params.label) eventData.label = params.label;
            if (params.description) eventData.description = params.description;
            if (params.significance !== undefined) eventData.significance = params.significance;
            if (params.tags) eventData.tags = params.tags;

            if (params.id) {
                // Update mode
                const updated = updateEvent(params.id, eventData);
                if (!updated) {
                    throw new RejectedCallError(`Event with ID '${params.id}' not found.`);
                }
                return JSON.stringify({
                    status: 'ok',
                    error: false,
                    message: `Event "${updated.label}" updated.`,
                    eventId: updated.id,
                    event: updated
                }, null, 2);
            } else {
                // Create mode
                if (!params.label || !params.timeObject) {
                    throw new RejectedCallError('label and timeObject are required for new events.');
                }
                const eventId = addEvent(eventData);
                return JSON.stringify({
                    status: 'ok',
                    error: false,
                    message: `Event "${params.label}" scheduled.`,
                    eventId: eventId,
                    baseTime: eventData.baseTime
                }, null, 2);
            }
        },
    });
}
