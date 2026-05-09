import { Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { logger } from '../logger.js';
import { settings, saveSettings, loadSettings } from '../settings.js';
import { state, saveChatState } from '../state.js';

let popupMode = 'global'; // 'global' or 'chat'
let currentCalendars = [];

export async function openCalendarPopup(mode) {
    popupMode = mode;
    currentCalendars = mode === 'global'
        ? JSON.parse(JSON.stringify(settings.globalCalendars || []))
        : JSON.parse(JSON.stringify(state.calendars || []));

    const extensionPath = import.meta.url.replace('/js/ui/calendar-editor.js', '');
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
        if (!lastVal || !currentCalendars.find(c => c.id === lastVal)) {
            $select.val(currentCalendars[0].id).trigger('change');
        } else {
            $select.trigger('change');
        }
    } else {
        $json.val('');
    }
}
