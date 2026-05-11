import { getContext } from '/scripts/extensions.js';
import { eventSource, event_types } from '/scripts/events.js';
import { logger } from './logger.js';
import { settings, MODULE_NAME } from './settings.js';
import { state, saveChatState } from './state.js';
import { getActiveCalendars, getCalendar } from './calendar-manager.js';
import { convertToTimeObject, formatTimeObject } from './time-engine.js';
import { getEventsInRange, getUpcomingEvents, getPastEvents } from './event-manager.js';
import { buildTimeInjection } from './injections/time-injection.js';
import { buildEventInjection } from './injections/event-injection.js';

/**
 * Prompt Injection
 * Logic for adding time context to character prompts.
 */

const CONTEXT_MARKER = 'EPHEMERIS_CONTEXT';
let detailsConsumedInTurn = false;
let pendingTaskConsumption = null;

export function initPromptInjection() {
    const update = () => updateExtensionPrompt();

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, update);
    eventSource.on('ephemeris-state-changed', update);
    eventSource.on('ephemeris-settings-changed', update);
    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => {
        detailsConsumedInTurn = false;
        pendingTaskConsumption = null;
        update();
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        detailsConsumedInTurn = false;
        pendingTaskConsumption = null;

        // Reset per-chat flag if we rolled back to the beginning
        const chat = getContext().chat || [];
        const userMessages = chat.filter(m => m.is_user && !m.is_system);
        if (userMessages.length <= 1) {
            state.detailsConsumedInChat = false;
        }

        update();
    });

    // Polyceph Integration: Identify if our context is in a task payload
    eventSource.on('polyceph-task-payload-ready', (generate_data) => {
        const freq = settings.injection.injectCalendarDetailsFrequency;
        if (freq === 'every') return;
        if (freq === 'turn' && detailsConsumedInTurn) return;
        if (freq === 'chat' && state.detailsConsumedInChat) return;

        const payloadStr = JSON.stringify(generate_data);
        if (payloadStr.includes(CONTEXT_MARKER)) {
            const taskId = generate_data.extra?.polyceph_task_id || 'unknown';
            logger.debug(`Polyceph task ${taskId} identified as carrying the Ephemeris context.`);
            pendingTaskConsumption = taskId;
        }
    });

    // Polyceph Integration: Confirm consumption on successful task completion
    eventSource.on('polyceph-task-finished', async (data) => {
        if (pendingTaskConsumption && data.taskId === pendingTaskConsumption && data.success) {
            logger.info(`Polyceph task ${data.taskId} completed successfully. Consuming Ephemeris context.`);

            const freq = settings.injection.injectCalendarDetailsFrequency;
            if (freq === 'turn') {
                detailsConsumedInTurn = true;
            } else if (freq === 'chat') {
                state.detailsConsumedInChat = true;
                saveChatState();
            }

            pendingTaskConsumption = null;
            await updateExtensionPrompt();
        }
    });

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
            1, // IN_CHAT position
            0, // Depth
            false // Scan
        );
        logger.debug('Prompt injected');
    } else {
        await setExtensionPrompt(MODULE_NAME, '', 1, 0);
    }
}

async function buildInjectionText() {
    const calendars = getActiveCalendars();
    if (calendars.length === 0) {
        logger.debug('No active calendars found for injection.');
        return null;
    }

    const context = getContext();
    const chat = context.chat || [];
    const userMessages = chat.filter(m => m.is_user && !m.is_system);
    const isStart = userMessages.length <= 1;

    // 1. Time & Calendar Details
    const { lines: timeLines, consumedDetails } = await buildTimeInjection(calendars, { detailsConsumedInTurn, isStart });
    logger.debug(`Time Injection: ${timeLines.length} lines generated.`);

    if (consumedDetails) {
        detailsConsumedInTurn = true;
        state.detailsConsumedInChat = true;
        saveChatState();
    }

    // 2. Events (Reminders, Chronicle, Schedule)
    const eventLines = await buildEventInjection(calendars);
    logger.debug(`Event Injection: ${eventLines.length} lines generated.`);

    const allLines = [...timeLines, ...eventLines];
    if (allLines.length === 0) {
        logger.debug('No lines generated for injection.');
        return null;
    }

    return `<ephemeris_context>\n<!-- ${CONTEXT_MARKER} -->\n${allLines.join('\n')}\n</ephemeris_context>`;
}

