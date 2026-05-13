import { getContext } from '/scripts/extensions.js';
import { logger, setLogLevel } from './logger.js';
import { eventSource } from '/scripts/events.js';

export const MODULE_NAME = 'ephemeris';

export const defaultSettings = {
    logLevel: 2,
    baseTime: 0,
    requireShortFormat: true,
    showFormattedInSchedule: false,
    globalCalendars: [
        {
            id: 'gregorian',
            displayName: 'IRL International Standard',
            abbreviation: 'ISO 8601',
            units: [
                { name: 'Year', type: 'number', lengthInSubUnits: { 'Day': 365 }, startValue: 1970, formatChar: 'Y' },
                {
                    name: 'Month',
                    type: 'variable',
                    formatChar: 'M',
                    values: [
                        { name: 'January', lengthInSubUnits: { 'Day': 31 } },
                        { name: 'February', lengthInSubUnits: { 'Day': 28 } },
                        { name: 'March', lengthInSubUnits: { 'Day': 31 } },
                        { name: 'April', lengthInSubUnits: { 'Day': 30 } },
                        { name: 'May', lengthInSubUnits: { 'Day': 31 } },
                        { name: 'June', lengthInSubUnits: { 'Day': 30 } },
                        { name: 'July', lengthInSubUnits: { 'Day': 31 } },
                        { name: 'August', lengthInSubUnits: { 'Day': 31 } },
                        { name: 'September', lengthInSubUnits: { 'Day': 30 } },
                        { name: 'October', lengthInSubUnits: { 'Day': 31 } },
                        { name: 'November', lengthInSubUnits: { 'Day': 30 } },
                        { name: 'December', lengthInSubUnits: { 'Day': 31 } }
                    ]
                },
                { name: 'Day', type: 'number', lengthInSubUnits: { 'Hour': 24 }, startAtOne: true, formatChar: 'D', superUnit: 'Month' },
                {
                    name: 'Weekday',
                    type: 'cyclic',
                    lengthInSubUnits: { 'Day': 1 },
                    offset: 4, // Epoch 0 is a Thursday. Offset 4 maps to index 4 (Thursday) if list starts at Sunday.
                    values: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
                    formatChar: 'W'
                },
                { name: 'Hour', type: 'number', lengthInSubUnits: { 'Minute': 60 }, formatChar: 'H' },
                { name: 'Minute', type: 'number', lengthInSubUnits: { 'Second': 60 }, formatChar: 'm' },
                { name: 'Second', type: 'number', lengthInBase: 1, formatChar: 's' }
            ],
            timeFormat: 'YYYY-MM-DD HH:mm:ss (WWWW)',
            epochOffset: 0,
            conversionFactor: 1.0,
            notes: "The mathematical representation of this standard calendar approximates all years to exactly 365 days (ignoring leap years), and sets Epoch 0 to January 1, 1970. Hours are 24-hour format (0-23); you may suffix the first 12 hours as AM and suffix the last 12 hours - subtracting 12 - with PM for dialogue (e.g. the 13th hour in a day is 1 PM). You may also just state the hour in 24-hour format according to the preference of the user. Years follow ISO 8601 logic where Year 0 is 1 BCE, and Year -1 is 2 BCE."
        }
    ],
    // Injection settings
    injection: {
        enabled: true,
        injectEvents: true,
        injectFormattedInPrompt: false,
        injectCalendarDetails: 'none',
        injectCalendarDetailsFrequency: 'every', // 'every' | 'turn' | 'chat'
        timeRangeBackward: 3600 * 24, // 1 day
        timeRangeForward: 3600 * 24 * 7, // 1 week
        summarizationStrategy: 'significant', // 'all' | 'significant'
        significanceDistances: {
            1: 43200,      // 12 hours
            2: 86400,      // 1 day
            3: 259200,     // 3 days
            4: 604800,     // 1 week
            5: 2592000,    // 1 month (30 days)
            6: 15552000,   // 6 months
            7: 63072000,   // 2 years
            8: 473040000,  // 15 years
            9: 3153600000, // 100 years
            10: 315360000000 // 1000 years
        },
        remindersEnabled: true,
        remindersDistance: 86400, // 1 day
        completedNoticesEnabled: true,
        completedNoticesDuration: 3600 * 12, // 12 hours
        significanceMultiplier: 0,
    }
};

export let settings = JSON.parse(JSON.stringify(defaultSettings));

export function loadSettings() {
    const context = getContext();
    logger.debug('Attempting to load settings from context...');
    if (context.extensionSettings[MODULE_NAME]) {
        logger.debug('Found existing settings in context:', context.extensionSettings[MODULE_NAME]);
        settings = Object.assign(settings, context.extensionSettings[MODULE_NAME]);
    } else {
        logger.debug('No settings found in context, using defaults.');
    }
    setLogLevel(settings.logLevel);
    logger.debug('Settings final state after load:', settings);
}

export function saveSettings() {
    const context = getContext();
    logger.debug('Saving settings to context:', settings);
    context.extensionSettings[MODULE_NAME] = settings;

    if (typeof context.saveSettings === 'function') {
        logger.debug('Calling context.saveSettings()...');
        context.saveSettings();
    } else if (typeof context.saveSettingsDebounced === 'function') {
        context.saveSettingsDebounced();
    }
    eventSource.emit('ephemeris-settings-changed');
    logger.debug('Settings saved.');
}

export function updateSetting(key, value) {
    settings[key] = value;
    saveSettings();
}

// Re-export UI initialization
export { initSettingsUI } from './ui/settings-ui.js';
