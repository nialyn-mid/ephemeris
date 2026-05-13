import { getContext } from '/scripts/extensions.js';
import { eventSource, event_types } from '/scripts/events.js';
import { logger } from './logger.js';
import { MODULE_NAME, settings } from './settings.js';

/**
 * Ephemeris State Management
 * Handles per-chat data (calendars, current time, events).
 */

export const state = {
    settings: {
        enabled: true,
        injectTime: true,
        injectEvents: true,
        requireShortFormat: true,
        showFormattedInSchedule: false,
        injectFormattedInPrompt: false,
        summarizationStrategy: 'significant',
        logLevel: 2, // 0: Error, 1: Warn, 2: Info, 3: Debug
        injectionFrequency: 'turn', // 'every', 'turn', 'chat'
        injectCalendarDetails: 'both', // 'none', 'both', 'chat', 'global'
        rangeBackward: 3600 * 24 * 7, // 1 week
        rangeForward: 3600 * 24 * 30, // 30 days
        remindersEnabled: true,
        remindersDistance: 3600 * 24, // 1 day
        noticesEnabled: true,
        noticesDuration: 3600 * 24, // 1 day
        significanceMultiplier: 1.0,
    },
    chatId: null,
    calendars: [],
    currentTime: 0,
    events: [],
    detailsConsumedInChat: false,
};

export function loadChatState() {
    const context = getContext();
    const chatId = context.chatId;

    if (!chatId) {
        logger.debug('No active chat ID, using default state.');
        return;
    }

    if (state.chatId === chatId) {
        logger.debug(`State for chat ${chatId} already loaded.`);
        return;
    }

    state.chatId = chatId;

    // In SillyTavern, we often store per-chat extension data in a dedicated object 
    // within extensionSettings, keyed by chatId.
    const allStates = context.extensionSettings[MODULE_NAME]?.chatStates || {};
    const chatState = allStates[chatId] || {};

    state.calendars = chatState.calendars || [];
    state.currentTime = chatState.currentTime || 0;
    state.events = chatState.events || [];
    state.detailsConsumedInChat = chatState.detailsConsumedInChat || false;

    logger.info(`[STATE] Loaded chat ${chatId}. Calendars: ${state.calendars.length}, Events: ${state.events.length}`);
    if (state.calendars.length > 0) {
        logger.debug(`[STATE] Chat calendars: ${state.calendars.map(c => c.id).join(', ')}`);
    }
}

// Add listener to handle chat switching automatically
eventSource.on(event_types.CHAT_CHANGED, () => {
    logger.debug('Chat changed, reloading state...');
    loadChatState();
});
eventSource.on(event_types.CHARACTER_CHANGED, () => {
    logger.debug('Character changed, reloading state...');
    loadChatState();
});

export function saveChatState() {
    const context = getContext();
    const chatId = state.chatId || context.chatId;

    if (!chatId) return;

    // Ensure parent objects exist in extensionSettings
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = {};
    }
    if (!context.extensionSettings[MODULE_NAME].chatStates) {
        context.extensionSettings[MODULE_NAME].chatStates = {};
    }

    const chatState = {
        calendars: state.calendars,
        currentTime: state.currentTime,
        events: state.events,
        detailsConsumedInChat: state.detailsConsumedInChat,
    };

    context.extensionSettings[MODULE_NAME].chatStates[chatId] = chatState;

    // Sync back to the global settings object to ensure consistency
    if (settings) {
        if (!settings.chatStates) settings.chatStates = {};
        settings.chatStates[chatId] = chatState;
        logger.debug(`[STATE] Synced chat state to global settings object.`);
    }

    if (typeof context.saveSettings === 'function') {
        context.saveSettings();
    } else if (typeof context.saveSettingsDebounced === 'function') {
        context.saveSettingsDebounced();
    }

    logger.info(`[STATE] Saved chat ${chatId}. Calendars: ${state.calendars.length}`);
    eventSource.emit('ephemeris-state-changed');
}



export function getChatCalendars() {
    return state.calendars;
}

