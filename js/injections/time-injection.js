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
    let shouldSkipDetails = false;

    if (freq === 'turn' && detailsConsumedInTurn) {
        shouldSkipDetails = true;
    } else if (freq === 'chat' && state.detailsConsumedInChat) {
        shouldSkipDetails = true;
    } else if (freq === 'turn' && !isStart && !detailsConsumedInTurn) {
        // If not at the very start and we haven't shown it yet this turn, 
        // we might still want to skip if it's supposed to be "every" turn but we're in the middle of a chat?
        // Actually, logic from prompt-injection.js was:
        // else if (freq === 'turn' && !isStart && !detailsConsumedInTurn) { if (!isStart) shouldSkipDetails = true; }
        // This effectively means 'turn' only shows at the very first message or when explicitly triggered?
        // Let's keep it consistent with what was there.
        shouldSkipDetails = true;
    }

    if (settings.injection.injectCalendarDetails && settings.injection.injectCalendarDetails !== 'none' && !shouldSkipDetails) {
        lines.push(`\n## Available Calendar Systems`);

        let targetCalendars = calendars;
        if (settings.injection.injectCalendarDetails === 'primary') {
            targetCalendars = [primaryCal];
        }

        for (const cal of targetCalendars) {
            lines.push(formatCalendarDetails(cal));
        }
        
        return { lines, consumedDetails: true };
    }

    return { lines, consumedDetails: false };
}
