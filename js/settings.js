import { getContext } from '/scripts/extensions.js';
import { logger, setLogLevel } from './logger.js';
import { state, saveChatState } from './state.js';

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

import { attachTimePreview } from './ui/time-preview.js';

let popupMode = 'global'; // 'global' or 'chat'
let currentCalendars = [];
let currentEvents = [];

export function initSettingsUI() {
    const $logLevel = $('#ephemeris-log-level');
    $logLevel.val(settings.logLevel);
    $logLevel.on('change', function () {
        updateSetting('logLevel', parseInt($(this).val()));
    });

    // Sub-Drawer Toggle Logic
    $('.ephemeris-drawer-header').off('click').on('click', function () {
        const $drawer = $(this).closest('.ephemeris-drawer');
        const $content = $drawer.children('.ephemeris-drawer-content');
        const $icon = $(this).children('i');

        const isOpen = $drawer.hasClass('active');

        if (isOpen) {
            $content.slideUp(200);
            $drawer.removeClass('active');
            $icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
        } else {
            $content.slideDown(200);
            $drawer.addClass('active');
            $icon.removeClass('fa-chevron-down').addClass('fa-chevron-up');
        }
    });

    // Bind Injection Settings
    const bindToggle = (id, obj, field) => {
        const $el = $(`#${id}`);
        $el.prop('checked', obj[field]);
        $el.off('change').on('change', () => {
            obj[field] = !!$el.prop('checked');
            saveSettings();
        });
    };

    const bindInput = (id, obj, field, type = 'string') => {
        const $el = $(`#${id}`);
        $el.val(obj[field]);
        $el.off('input change').on('input change', () => {
            let val = $el.val();
            if (type === 'number') val = Number(val);
            obj[field] = val;
            saveSettings();
        });
    };

    bindToggle('ephemeris-injection-enabled', settings.injection, 'enabled');
    bindToggle('ephemeris-inject-events', settings.injection, 'injectEvents');
    bindInput('ephemeris-inject-calendar-details', settings.injection, 'injectCalendarDetails');

    const $summarizationStrategy = $('#ephemeris-summarization-strategy');
    const updateLodVisibility = () => {
        const $drawer = $('#ephemeris-lod-drawer');
        const $content = $('#ephemeris-lod-distances-list');
        const $icon = $drawer.find('.ephemeris-drawer-header i');

        if ($summarizationStrategy.val() === 'significant') {
            $drawer.show(200);
            // Ensure it starts collapsed if not already active
            if (!$drawer.hasClass('active')) {
                $content.hide();
                $icon.removeClass('fa-chevron-up').addClass('fa-chevron-down');
            }
        } else {
            $drawer.hide(200);
        }
    };

    $summarizationStrategy.val(settings.injection.summarizationStrategy);
    $summarizationStrategy.off('change').on('change', () => {
        settings.injection.summarizationStrategy = $summarizationStrategy.val();
        saveSettings();
        updateLodVisibility();
    });
    updateLodVisibility();

    // Bind Significance Distances
    const $lodList = $('#ephemeris-lod-distances-list');
    $lodList.empty();
    for (let i = 1; i <= 10; i++) {
        const id = `ephemeris-lod-dist-${i}`;
        $lodList.append(`
            <div class="setup-item" style="margin-bottom: 8px;">
                <small>Sig ${i}</small>
                <input type="number" id="${id}" class="text_pole" min="0" style="width: 120px;">
            </div>
        `);
        const $el = $(`#${id}`);
        $el.val(settings.injection.significanceDistances[i]);
        $el.on('input change', () => {
            settings.injection.significanceDistances[i] = Number($el.val());
            saveSettings();
        });
        attachTimePreview(id);
    }

    bindInput('ephemeris-range-backward', settings.injection, 'timeRangeBackward', 'number');
    bindInput('ephemeris-range-forward', settings.injection, 'timeRangeForward', 'number');

    bindToggle('ephemeris-reminders-enabled', settings.injection, 'remindersEnabled');
    bindInput('ephemeris-reminders-distance', settings.injection, 'remindersDistance', 'number');

    bindToggle('ephemeris-notices-enabled', settings.injection, 'completedNoticesEnabled');
    bindInput('ephemeris-notices-duration', settings.injection, 'completedNoticesDuration', 'number');

    // Attach Time Previews
    attachTimePreview('ephemeris-range-backward');
    attachTimePreview('ephemeris-range-forward');
    attachTimePreview('ephemeris-reminders-distance');
    attachTimePreview('ephemeris-notices-duration');

    $('#ephemeris-open-global-calendars').on('click', () => {
        openCalendarPopup('global');
    });

    $('#ephemeris-open-chat-calendars').on('click', () => {
        openCalendarPopup('chat');
    });

    $('#ephemeris-open-chat-events').on('click', () => {
        openEventPopup();
    });

    $('#ephemeris-reset-global-calendars').on('click', async () => {
        const confirm = new Popup('Are you sure you want to reset all global calendars to defaults? This will erase any custom global calendars you have defined.', POPUP_TYPE.CONFIRM);
        const result = await confirm.show();
        logger.debug('Reset Global Calendars confirmation result:', result);
        if (result === POPUP_RESULT.AFFIRMATIVE) {
            logger.debug('Resetting global calendars to defaults:', defaultSettings.globalCalendars);
            // Deep copy from defaultSettings to ensure we have a fresh start
            settings.globalCalendars = JSON.parse(JSON.stringify(defaultSettings.globalCalendars));
            saveSettings();

            logger.info('Global calendars reset to default.');
            toastr.success('Global calendars reset to default.');
        }
    });
}

import { Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';

async function openCalendarPopup(mode) {
    popupMode = mode;
    currentCalendars = mode === 'global'
        ? JSON.parse(JSON.stringify(settings.globalCalendars || []))
        : JSON.parse(JSON.stringify(state.calendars || []));

    const extensionPath = import.meta.url.replace('/js/settings.js', '');
    const response = await fetch(`${extensionPath}/html/calendar-editor.html`);
    const html = await response.text();

    const popup = new Popup(html, POPUP_TYPE.TEXT, null, {
        large: true,
        wide: true,
        okButton: 'Save All & Close',
        cancelButton: 'Cancel',
        onOpen: (p) => {
            bindPopupEvents(p.dlg);
            refreshCalendarSelect(p.dlg);
        }
    });

    await popup.show();

    if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
        logger.debug('Calendar editor confirmed. Saving mode:', popupMode, 'Data:', currentCalendars);
        if (popupMode === 'global') {
            settings.globalCalendars = currentCalendars;
            saveSettings();
        } else {
            state.calendars = currentCalendars;
            saveChatState();
        }
        logger.info('Calendar editor closed and changes confirmed.');
    } else {
        logger.debug('Calendar editor cancelled. Reverting to previous settings...');
        // Revert? If we were editing currentCalendars in place, maybe we need to reload.
        loadSettings();
        logger.info('Calendar editor cancelled.');
    }
}

function bindPopupEvents(dlg) {
    const $dlg = $(dlg);
    const $select = $dlg.find('#ephemeris-calendar-select');
    const $json = $dlg.find('#ephemeris-calendar-json');
    const $error = $dlg.find('#ephemeris-calendar-json-error');

    $select.on('change', () => {
        const id = $select.val();
        const cal = currentCalendars.find(c => c.id === id);
        if (cal) {
            $json.val(JSON.stringify(cal, null, 2));
            $error.hide();
        }
    });

    $dlg.on('input change', '#ephemeris-calendar-json', () => {
        try {
            const parsed = JSON.parse($json.val());
            const index = currentCalendars.findIndex(c => c.id === parsed.id);
            if (index >= 0) {
                currentCalendars[index] = parsed;
            } else {
                currentCalendars.push(parsed);
            }

            if (popupMode === 'global') {
                settings.globalCalendars = currentCalendars;
                saveSettings();
            } else {
                state.calendars = currentCalendars;
                saveChatState();
            }
            $error.hide();
        } catch (e) {
            $error.show();
        }
    });

    $dlg.find('#ephemeris-calendar-add').on('click', () => {
        const newCal = {
            id: `new_calendar_${Date.now()}`,
            displayName: "New Calendar",
            units: [{ name: "Day", type: "number", lengthInBase: 86400 }]
        };
        currentCalendars.push(newCal);
        refreshCalendarSelect(dlg);
        $select.val(newCal.id).trigger('change');
    });

    $dlg.find('#ephemeris-calendar-delete').on('click', () => {
        const id = $select.val();
        currentCalendars = currentCalendars.filter(c => c.id !== id);

        if (popupMode === 'global') {
            settings.globalCalendars = currentCalendars;
            saveSettings();
        } else {
            state.calendars = currentCalendars;
            saveChatState();
        }

        refreshCalendarSelect(dlg);
    });
}

function refreshCalendarSelect(dlg) {
    const $dlg = $(dlg || document);
    const $select = $dlg.find('#ephemeris-calendar-select');
    const $json = $dlg.find('#ephemeris-calendar-json');

    $select.empty();
    for (const cal of currentCalendars) {
        $select.append(`<option value="${cal.id}">${cal.displayName} (${cal.id})</option>`);
    }
    if (currentCalendars.length > 0) {
        const lastVal = $select.val();
        // Always trigger change on initial load to populate textarea
        if (!lastVal || !currentCalendars.find(c => c.id === lastVal)) {
            $select.val(currentCalendars[0].id).trigger('change');
        } else {
            $select.trigger('change');
        }
    } else {
        $json.val('');
    }
}

async function openEventPopup() {
    currentEvents = [...(state.events || [])];

    const extensionPath = import.meta.url.replace('/js/settings.js', '');
    const response = await fetch(`${extensionPath}/html/event-editor.html`);
    const html = await response.text();

    const popup = new Popup(html, POPUP_TYPE.TEXT, null, {
        large: true,
        wide: true,
        okButton: 'Save All & Close',
        cancelButton: 'Cancel',
        onOpen: (p) => {
            bindEventPopupEvents(p.dlg);
            refreshEventSelect(p.dlg);
        }
    });

    await popup.show();

    if (popup.result === POPUP_RESULT.AFFIRMATIVE) {
        logger.info('Event editor closed and changes confirmed.');
    } else {
        // Re-load to revert any unsaved in-memory changes
        const { loadChatState } = await import('./state.js');
        loadChatState();
        logger.info('Event editor cancelled.');
    }
}

function bindEventPopupEvents(dlg) {
    const $dlg = $(dlg);
    const $select = $dlg.find('#ephemeris-event-select');
    const $json = $dlg.find('#ephemeris-event-json');
    const $error = $dlg.find('#ephemeris-event-json-error');

    $select.on('change', () => {
        const id = $select.val();
        const event = currentEvents.find(e => e.id === id);
        if (event) {
            $json.val(JSON.stringify(event, null, 2));
            $error.hide();
        }
    });

    $dlg.on('input change', '#ephemeris-event-json', () => {
        try {
            const parsed = JSON.parse($json.val());
            const index = currentEvents.findIndex(e => e.id === parsed.id);
            if (index >= 0) {
                currentEvents[index] = parsed;
            } else {
                currentEvents.push(parsed);
            }

            state.events = currentEvents;
            saveChatState();
            $error.hide();
        } catch (e) {
            $error.show();
        }
    });

    $dlg.find('#ephemeris-event-add').on('click', () => {
        const newEvent = {
            id: `event_${Date.now()}`,
            displayName: "New Event",
            description: "Event Description",
            time: state.currentTime,
            significance: 5
        };
        currentEvents.push(newEvent);
        refreshEventSelect(dlg);
        $select.val(newEvent.id).trigger('change');
    });

    $dlg.find('#ephemeris-event-delete').on('click', () => {
        const id = $select.val();
        currentEvents = currentEvents.filter(e => e.id !== id);
        state.events = currentEvents;
        saveChatState();
        refreshEventSelect(dlg);
    });
}

function refreshEventSelect(dlg) {
    const $dlg = $(dlg || document);
    const $select = $dlg.find('#ephemeris-event-select');
    const $json = $dlg.find('#ephemeris-event-json');

    $select.empty();
    for (const event of currentEvents) {
        $select.append(`<option value="${event.id}">${event.displayName} (${event.id})</option>`);
    }
    if (currentEvents.length > 0) {
        const lastVal = $select.val();
        // Always trigger change on initial load to populate textarea
        if (!lastVal || !currentEvents.find(e => e.id === lastVal)) {
            $select.val(currentEvents[0].id).trigger('change');
        } else {
            $select.trigger('change');
        }
    } else {
        $json.val('');
    }
}



