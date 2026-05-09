import { getContext } from '/scripts/extensions.js';
import { eventSource, event_types } from '/scripts/events.js';
import { logger } from './logger.js';
import { settings, MODULE_NAME } from './settings.js';
import { state } from './state.js';
import { getActiveCalendars, getCalendar } from './calendar-manager.js';
import { convertToTimeObject, formatTimeObject } from './time-engine.js';
import { getEventsInRange, getUpcomingEvents, getPastEvents } from './event-manager.js';

/**
 * Prompt Injection
 * Logic for adding time context to character prompts.
 */

export function initPromptInjection() {
    const update = () => updateExtensionPrompt();

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, update);
    eventSource.on(event_types.USER_MESSAGE_RENDERED, update);
    eventSource.on(event_types.CHAT_CHANGED, update);
    
    update();
}

async function updateExtensionPrompt() {
    if (!settings.injection.enabled) {
        const { setExtensionPrompt } = getContext();
        await setExtensionPrompt(MODULE_NAME, '', 1, 0);
        return;
    }

    const context = getContext();
    const { setExtensionPrompt } = context;
    
    const injectionText = await buildInjectionText();
    
    if (injectionText) {
        await setExtensionPrompt(
            MODULE_NAME,
            injectionText,
            1, // IN_CHAT position (or use context.extension_prompt_types.IN_CHAT)
            0, // Depth
            false // Scan
        );
        logger.debug('Prompt injected');
    } else {
        await setExtensionPrompt(MODULE_NAME, '', 1, 0);
    }
}

async function buildInjectionText() {
    const lines = [];
    const calendars = getActiveCalendars();
    
    if (calendars.length === 0) return null; // No calendars active

    // 1. Current Time
    const primaryCal = calendars[0]; // Assume first is primary
    const curTimeObj = convertToTimeObject(state.currentTime, primaryCal);
    lines.push(`## World Time`);
    lines.push(`Current Time (${primaryCal.displayName}): ${formatTimeObject(curTimeObj, primaryCal)}`);

    // Add secondary calendars if available
    for (let i = 1; i < Math.min(3, calendars.length); i++) {
        const cObj = convertToTimeObject(state.currentTime, calendars[i]);
        lines.push(`Alternative (${calendars[i].displayName}): ${formatTimeObject(cObj, calendars[i])}`);
    }

    // 1.5 Calendar Details (Optional)
    if (settings.injection.injectCalendarDetails && settings.injection.injectCalendarDetails !== 'none') {
        const { formatCalendarDetails } = await import('./calendar-manager.js');
        lines.push(`\n## Calendar Systems`);
        
        let targetCalendars = calendars;
        if (settings.injection.injectCalendarDetails === 'chat') {
            targetCalendars = calendars.filter(c => state.calendars.find(sc => sc.id === c.id));
        } else if (settings.injection.injectCalendarDetails === 'global') {
            targetCalendars = calendars.filter(c => settings.globalCalendars.find(gc => gc.id === c.id));
        }
        
        for (const cal of targetCalendars) {
            lines.push(formatCalendarDetails(cal));
        }
    }

    // 2. Reminders & Timeline
    if (settings.injection.injectEvents) {
        const upcoming = getUpcomingEvents(state.currentTime, settings.injection.timeRangeForward);
        const past = getPastEvents(state.currentTime, settings.injection.timeRangeBackward);
        
        const relevantEvents = [...past, ...upcoming].sort((a, b) => a.baseTime - b.baseTime);

        if (relevantEvents.length > 0) {
            lines.push(`\n## Chronicle & Reminders`);
            
            for (const event of relevantEvents) {
                const timeDiff = event.baseTime - state.currentTime;
                
                // Summarization check: if it's far away and low significance, maybe skip?
                // "Summarization Strategy": 'significant' only shows events >= 5 if they are further than 1 day away
                if (settings.injection.summarizationStrategy === 'significant') {
                    const maxDist = settings.injection.significanceDistances[event.significance] || 0;
                    if (Math.abs(timeDiff) > maxDist) {
                        continue; // Skip if beyond the allowed distance for this significance level
                    }
                }

                const eTimeObj = convertToTimeObject(event.baseTime, primaryCal);
                const timeStr = formatTimeObject(eTimeObj, primaryCal);
                
                if (timeDiff > 0 && timeDiff <= settings.injection.remindersDistance && settings.injection.remindersEnabled) {
                    // Reminder
                    lines.push(`[REMINDER] ${timeStr}: "${event.label}" is approaching!`);
                } else if (timeDiff < 0 && Math.abs(timeDiff) <= settings.injection.completedNoticesDuration && settings.injection.completedNoticesEnabled) {
                    // Completed Notice
                    lines.push(`[COMPLETED] ${timeStr}: "${event.label}" has recently passed.`);
                } else {
                    // Standard timeline entry
                    lines.push(`- [${timeStr}] ${event.label}`);
                }
            }
        }
    }

    return `<ephemeris_context>\n${lines.join('\n')}\n</ephemeris_context>`;
}
