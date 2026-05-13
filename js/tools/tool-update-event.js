import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { state } from '../state.js';
import { getCalendar } from '../calendar-manager.js';
import { convertToBaseTime } from '../time-engine.js';
import { addEvent, updateEvent } from '../event-manager.js';
import { settings } from '../settings.js';
import { getActiveCalendars } from '../calendar-manager.js';
import { formatDuration } from '../ui/time-preview.js';
import { RejectedCallError } from '../errors.js';

import { calendarIdSchema, timeObjectSchema, significanceSchema } from './infra/schema.js';

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
        description: 'Creates or updates a world event. If an ID is provided, it attempts to update that event. If the ID does not exist, a new event is created with that ID (requires label and timeObject). If no ID is provided, a new event is created with a generated ID.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'Unique identifier of the event. Provide to update or specify a custom ID on creation.' },
                calendarId: calendarIdSchema(),
                timeObject: timeObjectSchema('Time of the event. Required for new events.'),
                label: { type: 'string', description: 'Short name. Required for new events.' },
                description: { type: 'string', description: 'Description in simple present tense.' },
                significance: significanceSchema(sigDescription),
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags for filtering. E.g. [country name], "holiday", "personal"' },
                responseCalendarId: calendarIdSchema('Optional: Additionally shows the event time according to this calendar in the response.')
            },
            required: ['calendarId'],
        },
        action: async (params) => {
            const { waitForDependency, provideDependency, announceCreator, isFailed } = await import('./infra/tool-queue.js');
            if (params.id) {
                announceCreator('event', params.id);
            }
            try {
                await waitForDependency('calendar', params.calendarId);
                if (isFailed('calendar', params.calendarId)) {
                    throw new RejectedCallError(`Calendar '${params.calendarId}' failed to be created correctly in this turn and cannot be used.`);
                }
            if (params.responseCalendarId) {
                await waitForDependency('calendar', params.responseCalendarId);
                if (isFailed('calendar', params.responseCalendarId)) {
                    throw new RejectedCallError(`Response calendar '${params.responseCalendarId}' failed to be created correctly and cannot be used.`);
                }
            }

            const cal = getCalendar(params.calendarId);
            if (!cal) {
                throw new RejectedCallError(`Calendar '${params.calendarId}' not found.`);
            }

            const eventData = {};
            if (params.id) eventData.id = params.id;
            if (params.timeObject) {
                eventData.baseTime = convertToBaseTime(params.timeObject, cal);
                eventData.sourceCalendar = params.calendarId;
            }
            if (params.label) eventData.label = params.label;
            if (params.description) eventData.description = params.description;
            if (params.significance !== undefined) eventData.significance = params.significance;
            if (params.tags) eventData.tags = params.tags;

            // Check if we are updating
            let existing = null;
            if (params.id) {
                existing = state.events.find(e => e.id === params.id);
            } else if (params.label) {
                const matches = state.events.filter(e => e.label === params.label);
                if (matches.length === 1) {
                    existing = matches[0];
                } else if (matches.length > 1) {
                    const { convertToTimeObject } = await import('../time-engine.js');
                    const { formatTimeObject } = await import('../time-formatter.js');
                    const details = matches.map(m => {
                        const cal = getCalendar(m.sourceCalendar);
                        const tStr = cal ? formatTimeObject(convertToTimeObject(m.baseTime, cal), cal) : `${m.baseTime} (raw)`;
                        const desc = m.description ? ` - "${m.description.substring(0, 100)}${m.description.length > 100 ? '...' : ''}"` : '';
                        return `- ID: ${m.id} [${tStr}]${desc}`;
                    }).join('\n');
                    throw new RejectedCallError(`Multiple events found with label "${params.label}". Please provide a specific 'id' to update:\n${details}`);
                }
            }

            let updatedEvent = null;
            let isNew = !existing;

            if (isNew) {
                // Create mode validation
                const { Validator } = await import('./infra/schema.js');
                const prefix = params.id ? `Event ID '${params.id}' not found. To create it:` : (params.label ? `No existing event found with label "${params.label}". Creating a new one:` : 'Validation failed for new event:');
                const v = new Validator(prefix);

                v.require(params.label, 'label is required for new events');
                v.require(params.timeObject, 'timeObject is required for new events');
                
                v.throwIfErrors();
                
                const eventId = addEvent(eventData);
                updatedEvent = state.events.find(e => e.id === eventId);
            } else {
                // Update mode
                const targetId = params.id || existing.id;
                const oldEvent = JSON.parse(JSON.stringify(existing));
                updatedEvent = updateEvent(targetId, eventData);
            }


            const { convertToTimeObject } = await import('../time-engine.js');
            const { formatTimeObject } = await import('../time-formatter.js');

            // Prepare response calendar info
            let responseCalendarTime = null;
            if (params.responseCalendarId) {
                const respCal = getCalendar(params.responseCalendarId);
                if (respCal) {
                    responseCalendarTime = {
                        calendarId: respCal.id,
                        displayName: respCal.displayName,
                        time: convertToTimeObject(updatedEvent.baseTime, respCal),
                        timeStr: formatTimeObject(convertToTimeObject(updatedEvent.baseTime, respCal), respCal)
                    };
                }
            }

            const { generateChangelog } = await import('../formatter.js');
            const changes = isNew ? [] : generateChangelog(existing, updatedEvent);
            
            const calLabel = cal.abbreviation || cal.displayName || cal.id;
            let message = `Event "${updatedEvent.label}" ${isNew ? 'scheduled' : 'updated'} for eventTime (${calLabel})`;
            
            if (responseCalendarTime) {
                const respCal = getCalendar(responseCalendarTime.calendarId);
                const respLabel = respCal?.abbreviation || respCal?.displayName || respCal?.id || responseCalendarTime.calendarId;
                message += `, which is responseCalendarTime in ${respLabel}`;
            }

            if (changes.length > 0) {
                message += `. Changes: ${changes.join('; ')}`;
            }

            const primaryTimeObj = convertToTimeObject(updatedEvent.baseTime, cal);

            return JSON.stringify({
                status: 'ok',
                error: false,
                message: message,
                eventId: updatedEvent.id,
                eventTime: {
                    calendarId: cal.id,
                    displayName: cal.displayName,
                    time: primaryTimeObj,
                    timeStr: formatTimeObject(primaryTimeObj, cal)
                },
                responseCalendarTime: responseCalendarTime,
                event: updatedEvent,
                changes: changes
            }, null, 2);
            } finally {
                if (params.id) {
                    provideDependency('event', params.id);
                }
            }
        },

    });
}
