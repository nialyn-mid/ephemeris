import { logger } from '../logger.js';
import { registerListCalendarsTool } from './tool-list-calendars.js';
import { registerUpdateCalendarTool } from './tool-update-calendar.js';
import { registerGetTimeTool } from './tool-get-time.js';
import { registerUpdateTimeTool } from './tool-update-time.js';
import { registerAddEventTool } from './tool-add-event.js';
import { registerGetTimelineTool } from './tool-get-timeline.js';

/**
 * Registers all Ephemeris tools with SillyTavern.
 */
export function registerEphemerisTools() {
    logger.info('Registering Ephemeris agentic tools...');

    registerListCalendarsTool();
    registerUpdateCalendarTool();
    registerGetTimeTool();
    registerUpdateTimeTool();
    registerAddEventTool();
    registerGetTimelineTool();

    logger.info('All Ephemeris tools registered.');
}
