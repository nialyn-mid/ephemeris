import { getContext } from '/scripts/extensions.js';
import { logger } from './logger.js';
import { MODULE_NAME } from './settings.js';

/**
 * Ephemeris State Management
 * Handles per-chat data (calendars, current time, events).
 */

export const state = {
    chatId: null,
    calendars: [],
    currentTime: 0,
    events: [],
};

export function loadChatState() {
    const context = getContext();
    const chatId = context.chatId;

    if (!chatId) {
        logger.debug('No active chat ID, using default state.');
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

    logger.debug(`Loaded state for chat ${chatId}`);
}

export function saveChatState() {
    const context = getContext();
    const chatId = state.chatId || context.chatId;

    if (!chatId) return;

    if (!context.extensionSettings[MODULE_NAME].chatStates) {
        context.extensionSettings[MODULE_NAME].chatStates = {};
    }

    context.extensionSettings[MODULE_NAME].chatStates[chatId] = {
        calendars: state.calendars,
        currentTime: state.currentTime,
        events: state.events,
    };

    if (typeof context.saveSettings === 'function') {
        context.saveSettings();
    } else if (typeof context.saveSettingsDebounced === 'function') {
        context.saveSettingsDebounced();
    }

    logger.debug(`Saved state for chat ${chatId}`);
}

export function getActiveCalendars() {
    // Combine global templates with per-chat calendars? 
    // Or just per-chat? User said "interactable calendar definitions should be per-chat".
    return state.calendars;
}
