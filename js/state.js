import { getContext } from '/scripts/extensions.js';
import { eventSource, event_types } from '/scripts/events.js';
import { logger } from './logger.js';
import { MODULE_NAME, settings } from './settings.js';

/**
 * Ephemeris State Management
 * Handles per-chat data (calendars, current time, events).
 */

export const state = {
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

    logger.debug(`Loaded state for chat ${chatId}`);
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
    }

    if (typeof context.saveSettings === 'function') {
        context.saveSettings();
    } else if (typeof context.saveSettingsDebounced === 'function') {
        context.saveSettingsDebounced();
    }

    logger.debug(`Saved state for chat ${chatId}`);
}


export function getActiveCalendars() {
    return state.calendars;
}

