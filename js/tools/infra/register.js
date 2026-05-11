import { logger } from '../../logger.js';
import { registerListCalendarsTool } from '../tool-list-calendars.js';
import { registerUpdateCalendarTool } from '../tool-update-calendar.js';
import { registerGetTimeTool } from '../tool-get-time.js';
import { registerUpdateTimeTool } from '../tool-update-time.js';
import { registerUpdateEventTool } from '../tool-update-event.js';
import { registerListEventsTool } from '../tool-list-events.js';

/**
 * Registers all Ephemeris tools with SillyTavern.
 */
export function registerEphemerisTools() {
    logger.info('Registering Ephemeris agentic tools...');

    registerListCalendarsTool();
    registerUpdateCalendarTool();
    registerGetTimeTool();
    registerUpdateTimeTool();
    registerUpdateEventTool();
    registerListEventsTool();

    logger.info('All Ephemeris tools registered.');
}
