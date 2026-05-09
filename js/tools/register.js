import { logger } from '../logger.js';
import { registerListCalendarsTool } from './tool-list-calendars.js';
import { registerCreateCalendarTool } from './tool-create-calendar.js';
import { registerGetTimeTool } from './tool-get-time.js';
import { registerSetTimeTool } from './tool-set-time.js';
import { registerAddEventTool } from './tool-add-event.js';
import { registerGetTimelineTool } from './tool-get-timeline.js';

/**
 * Registers all Ephemeris tools with SillyTavern.
 */
export function registerEphemerisTools() {
    logger.info('Registering Ephemeris agentic tools...');

    registerListCalendarsTool();
    registerCreateCalendarTool();
    registerGetTimeTool();
    registerSetTimeTool();
    registerAddEventTool();
    registerGetTimelineTool();

    logger.info('All Ephemeris tools registered.');
}
