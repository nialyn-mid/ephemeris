import { Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { logger } from '../logger.js';
import { state, saveChatState } from '../state.js';

let currentEvents = [];

export async function openEventPopup() {
    currentEvents = [...(state.events || [])];

    const extensionPath = import.meta.url.replace('/js/ui/event-editor.js', '');
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
        const { loadChatState } = await import('../state.js');
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
        if (!lastVal || !currentEvents.find(e => e.id === lastVal)) {
            $select.val(currentEvents[0].id).trigger('change');
        } else {
            $select.trigger('change');
        }
    } else {
        $json.val('');
    }
}
