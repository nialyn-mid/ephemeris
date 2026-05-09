import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { getActiveCalendars, formatCalendarDetails } from '../calendar-manager.js';

export function registerListCalendarsTool() {
    const { registerFunctionTool } = getContext();

    registerFunctionTool({
        name: 'ephemeris_list_calendars',
        displayName: 'Ephemeris: List Calendars',
        description: 'Lists all configured calendar systems for the current chat.',
        parameters: {
            type: 'object',
            properties: {
                includeDetails: { type: 'boolean', description: 'If true, provides a detailed text description of each calendar including unit lengths, cycles, and variable values. Useful for learning calendar structures.' }
            },
        },
        action: async (params) => {
            const calendars = getActiveCalendars();
            if (calendars.length === 0) {
                return 'No calendars defined.';
            }

            if (params.includeDetails) {
                return calendars.map(c => formatCalendarDetails(c)).join('\n\n');
            }

            // Provide a clean view of the calendar schemas
            const schemas = calendars.map(c => {
                return {
                    id: c.id,
                    displayName: c.displayName,
                    units: c.units.map(u => ({
                        name: u.name,
                        type: u.type,
                        ...(u.values ? { values: u.values } : {})
                    }))
                };
            });

            return JSON.stringify(schemas, null, 2);
        },
    });
}
