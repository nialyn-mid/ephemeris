import { logger } from '../logger.js';
import { state } from '../state.js';
import { settings } from '../settings.js';
import { convertToTimeObject, formatTimeObject } from '../time-engine.js';
import { formatCalendarDetails } from '../formatter.js';

/**
 * Builds the World Time and Calendar Systems section for the prompt.
 */
export async function buildTimeInjection(calendars, { detailsConsumedInTurn, isStart }) {
    const lines = [];
    if (calendars.length === 0) return { lines, consumedDetails: false };

    // 1. Current Time
    const primaryCal = calendars[0];
    const curTimeObj = convertToTimeObject(state.currentTime, primaryCal);
    lines.push(`## World Time`);
    lines.push(`${primaryCal.displayName} [${primaryCal.id}]: ${formatTimeObject(curTimeObj, primaryCal)}`);

    // Add secondary calendars if available
    for (let i = 1; i < Math.min(3, calendars.length); i++) {
        const cObj = convertToTimeObject(state.currentTime, calendars[i]);
        lines.push(`${calendars[i].displayName} [${calendars[i].id}]: ${formatTimeObject(cObj, calendars[i])}`);
    }

    // 2. Calendar Details (Hierarchical structure, notes, etc.)
    const freq = settings.injection.injectCalendarDetailsFrequency;
    let skipReason = null;

    if (freq === 'turn' && detailsConsumedInTurn) {
        skipReason = 'Already consumed in this turn';
    } else if (freq === 'chat' && state.detailsConsumedInChat) {
        skipReason = 'Already consumed in this chat';
    } else if (freq === 'turn' && !isStart && !detailsConsumedInTurn) {
        // If it's turn-based but we aren't at the very start of the chat, 
        // we only show it on the first message or if it's explicitly enabled for every turn.
        // For now, let's allow 'turn' to show if not consumed.
    }

    const mode = settings.injection.injectCalendarDetails;
    const shouldShow = mode && mode !== 'none' && !skipReason;

    if (shouldShow) {
        logger.debug('[INJECTION] Injecting calendar details (mode:', mode, ')');
        lines.push(`\n## Available Calendar Systems`);


        let targetCalendars = calendars;
        if (settings.injection.injectCalendarDetails === 'primary') {
            targetCalendars = [primaryCal];
        }

        for (const cal of targetCalendars) {
            lines.push(formatCalendarDetails(cal));
        }
        
        return { lines, consumedDetails: true };
    } else if (mode && mode !== 'none' && skipReason) {
        logger.debug(`[INJECTION] Skipping calendar details: ${skipReason}`);
    }

    return { lines, consumedDetails: false };
}

