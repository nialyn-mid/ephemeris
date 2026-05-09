import { getContext } from '/scripts/extensions.js';
import { logger, setLogLevel } from './logger.js';

export const MODULE_NAME = 'ephemeris';

export const defaultSettings = {
    logLevel: 2,
    baseTime: 0,
    globalCalendars: [
        {
            id: 'gregorian',
            displayName: 'IRL International Standard',
            abbreviation: 'ISO 8601',
            units: [
                { name: 'Year', type: 'number', lengthInBase: 31536000, startAtOne: false },
                {
                    name: 'Month',
                    type: 'variable',
                    values: [
                        { name: 'January', lengthInBase: 2678400 },
                        { name: 'February', lengthInBase: 2419200 },
                        { name: 'March', lengthInBase: 2678400 },
                        { name: 'April', lengthInBase: 2592000 },
                        { name: 'May', lengthInBase: 2678400 },
                        { name: 'June', lengthInBase: 2592000 },
                        { name: 'July', lengthInBase: 2678400 },
                        { name: 'August', lengthInBase: 2678400 },
                        { name: 'September', lengthInBase: 2592000 },
                        { name: 'October', lengthInBase: 2678400 },
                        { name: 'November', lengthInBase: 2592000 },
                        { name: 'December', lengthInBase: 2678400 }
                    ]
                },
                { name: 'Day', type: 'number', lengthInBase: 86400, startAtOne: true },
                {
                    name: 'Weekday',
                    type: 'cyclic',
                    lengthInBase: 86400,
                    offset: 4, // Epoch 0 is a Thursday. Offset 4 maps to index 4 (Thursday) if list starts at Sunday.
                    values: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
                },
                { name: 'Hour', type: 'number', lengthInBase: 3600 },
                { name: 'Minute', type: 'number', lengthInBase: 60 },
                { name: 'Second', type: 'number', lengthInBase: 1 }
            ],
            epochOffset: 0,
            conversionFactor: 1.0
        }
    ],
    // Injection settings
    injection: {
        enabled: true,
        injectEvents: true,
        injectCalendarDetails: 'none',
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
    logger.debug('Settings saved.');
}

export function updateSetting(key, value) {
    settings[key] = value;
    saveSettings();
}

// Re-export UI initialization
export { initSettingsUI } from './ui/settings-ui.js';
