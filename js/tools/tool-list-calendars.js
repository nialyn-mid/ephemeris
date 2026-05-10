import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { getActiveCalendars } from '../calendar-manager.js';
import { formatCalendarDetails } from '../formatter.js';

export function registerListCalendarsTool() {
    const { registerFunctionTool } = getContext();

    registerFunctionTool({
        name: 'eph_list_calendars',
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
                return JSON.stringify({
                    status: 'ok',
                    error: false,
                    message: 'No calendars defined.',
                    calendars: []
                });
            }

            const schemas = calendars.map(c => ({
                id: c.id,
                displayName: c.displayName,
                abbreviation: c.abbreviation,
                units: c.units,
                notes: c.notes,
                conversionFactor: c.conversionFactor,
                epochOffset: c.epochOffset
            }));

            let details = undefined;
            if (params.includeDetails) {
                details = calendars.map(c => formatCalendarDetails(c)).join('\n\n');
            }

            return JSON.stringify({
                status: 'ok',
                error: false,
                calendars: schemas,
                details: details
            }, null, 2);
        },
    });
}
