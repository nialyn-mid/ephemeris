import { state } from '../state.js';
import { settings } from '../settings.js';
import { getUpcomingEvents, getPastEvents } from '../event-manager.js';
import { formatDurationApproximation } from '../formatter.js';

/**
 * Builds the Events section (Reminders, Chronicle, and Schedule) for the prompt.
 */
export async function buildEventInjection(calendars) {
    const lines = [];
    const { remindersEnabled, completedNoticesEnabled, injectEvents: injectHistory } = settings.injection;

    if (!injectHistory && !remindersEnabled && !completedNoticesEnabled) return lines;

    // Fetch using the largest required window
    const forwardRange = Math.max(
        injectHistory ? settings.injection.timeRangeForward : 0,
        remindersEnabled ? settings.injection.remindersDistance * 10 : 0
    );
    const backwardRange = Math.max(
        injectHistory ? settings.injection.timeRangeBackward : 0,
        completedNoticesEnabled ? settings.injection.completedNoticesDuration * 10 : 0
    );

    const upcoming = getUpcomingEvents(state.currentTime, forwardRange);
    const past = getPastEvents(state.currentTime, backwardRange);

    // Deduplicate events by ID
    const eventMap = new Map();
    [...past, ...upcoming].forEach(e => eventMap.set(e.id, e));
    const relevantEvents = Array.from(eventMap.values()).sort((a, b) => a.baseTime - b.baseTime);

    if (relevantEvents.length === 0) return lines;

    const filteredEvents = relevantEvents.filter(event => {
        const timeDiff = event.baseTime - state.currentTime;
        const sigMult = 1 + ((event.significance || 1) - 1) * (settings.injection.significanceMultiplier || 0);

        // Check Reminder window
        if (timeDiff > 0 && remindersEnabled) {
            if (timeDiff <= settings.injection.remindersDistance * sigMult) return true;
        }

        // Check Notice window
        if (timeDiff < 0 && completedNoticesEnabled) {
            if (Math.abs(timeDiff) <= settings.injection.completedNoticesDuration * sigMult) return true;
        }

        // Check General Schedule/Chronicle (Significance based)
        if (injectHistory) {
            const maxDist = (settings.injection.summarizationStrategy === 'significant')
                ? (settings.injection.significanceDistances[event.significance] || 0)
                : Infinity;
            if (Math.abs(timeDiff) <= maxDist) return true;
        }

        return false;
    });

    const pastEvents = filteredEvents.filter(e => e.baseTime <= state.currentTime);
    const upcomingEvents = filteredEvents.filter(e => e.baseTime > state.currentTime);

    if (pastEvents.length > 0 || upcomingEvents.length > 0) {
        lines.push(`\n## Events`);

        const formatEventLine = (event) => {
            const timeDiff = event.baseTime - state.currentTime;
            const isFuture = timeDiff >= 0;
            const timeWord = isFuture ? 'in:' : 'ago:';
            const relativeParts = calendars.slice(0, 3).map(c => {
                const approx = formatDurationApproximation(timeDiff, c);
                const label = c.abbreviation || c.displayName || c.id;
                return `${approx} (${label})`;
            }).join('; ');

            return `- ${event.label} (${timeWord} ${relativeParts})`;
        };

        if (pastEvents.length > 0) {
            lines.push(`### Past Events (Already Happened)`);
            pastEvents.forEach(e => lines.push(formatEventLine(e)));
        }

        if (upcomingEvents.length > 0) {
            lines.push(`### Upcoming Schedule`);
            upcomingEvents.forEach(e => lines.push(formatEventLine(e)));
        }
    }

    return lines;
}
