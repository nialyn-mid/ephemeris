import { state, saveChatState } from '../state.js';
import { getActiveCalendars, getCalendar } from '../calendar-manager.js';
import { convertToTimeObject, convertToBaseTime } from '../time-engine.js';
import { formatTimeObject } from '../time-formatter.js';
import { Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';
import { logger } from '../logger.js';

/**
 * Time Editor Popup
 * Allows manual adjustment of the current world time using any active calendar.
 */

export async function openTimePopup() {
    const calendars = getActiveCalendars();
    if (calendars.length === 0) {
        toastr.warning('No calendars defined. Cannot edit time.');
        return;
    }

    let selectedCal = calendars[0];
    let workingBaseTime = state.currentTime;

    const generateCalendarOptions = () => {
        return calendars.map(c => `<option value="${c.id}" ${c.id === selectedCal.id ? 'selected' : ''}>${c.displayName}</option>`).join('');
    };

    const generateUnitInputs = (cal, baseTime) => {
        const timeObj = convertToTimeObject(baseTime, cal);
        // We'll show all units for the selected calendar that are number, variable, or cyclic
        return cal.units
            .filter(u => u.type !== 'string')
            .map(u => {
                const val = timeObj[u.name] || 0;
                return `
                    <div class="setup-item">
                        <small><b>${u.name}</b></small>
                        <input type="number" class="text_pole ephemeris-time-unit-input" 
                               data-unit="${u.name}" value="${val}">
                    </div>
                `;
            }).join('');
    };

    const html = `
        <div id="ephemeris-time-editor">
            <div class="setup-item">
                <small><b>Select Calendar</b></small>
                <select id="ephemeris-time-calendar-select" class="text_pole">
                    ${generateCalendarOptions()}
                </select>
            </div>
            <hr>
            <div id="ephemeris-time-unit-container" class="ephemeris-time-inputs" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                ${generateUnitInputs(selectedCal, workingBaseTime)}
            </div>
            <hr>
            <div class="setup-item">
                <small><b>Base Time (Seconds)</b></small>
                <input type="number" id="ephemeris-time-base-input" class="text_pole" value="${workingBaseTime}">
            </div>
            <p id="ephemeris-time-preview" style="margin-top: 10px; font-family: monospace; font-size: 0.9em; opacity: 0.8;">
                Preview: ${formatTimeObject(convertToTimeObject(workingBaseTime, selectedCal), selectedCal)}
            </p>
        </div>
    `;

    const popup = new Popup(html, POPUP_TYPE.CONFIRM);
    
    // We'll use a small interval to keep the UI in sync since Popup doesn't easily expose 'onRender' after show
    const interval = setInterval(() => {
        const $dlg = $('#ephemeris-time-editor');
        if ($dlg.length === 0) {
            clearInterval(interval);
            return;
        }

        const $baseInput = $('#ephemeris-time-base-input');
        const $calSelect = $('#ephemeris-time-calendar-select');
        const $unitContainer = $('#ephemeris-time-unit-container');
        const $preview = $('#ephemeris-time-preview');

        const updatePreview = () => {
            const timeObj = convertToTimeObject(workingBaseTime, selectedCal);
            $preview.text(`Preview: ${formatTimeObject(timeObj, selectedCal)}`);
        };

        const syncUnitInputs = () => {
            const timeObj = convertToTimeObject(workingBaseTime, selectedCal);
            $unitContainer.find('.ephemeris-time-unit-input').each(function() {
                const unit = $(this).data('unit');
                $(this).val(timeObj[unit] || 0);
            });
        };

        // Calendar Change
        $calSelect.off('change').on('change', function() {
            const newId = $(this).val();
            selectedCal = getCalendar(newId);
            $unitContainer.html(generateUnitInputs(selectedCal, workingBaseTime));
            updatePreview();
            bindUnitEvents();
        });

        // Base Time Change
        $baseInput.off('input').on('input', function() {
            workingBaseTime = Number($(this).val());
            syncUnitInputs();
            updatePreview();
        });

        const bindUnitEvents = () => {
            $unitContainer.find('.ephemeris-time-unit-input').off('input').on('input', function() {
                const newTimeObj = {};
                $unitContainer.find('.ephemeris-time-unit-input').each(function() {
                    newTimeObj[$(this).data('unit')] = Number($(this).val());
                });
                workingBaseTime = convertToBaseTime(newTimeObj, selectedCal);
                $baseInput.val(workingBaseTime);
                updatePreview();
            });
        };

        bindUnitEvents();

    }, 200);

    const result = await popup.show();

    if (result === POPUP_RESULT.AFFIRMATIVE) {
        const finalBaseTime = Number($('#ephemeris-time-base-input').val());
        logger.info(`Manually updating chat time to ${finalBaseTime}`);
        state.currentTime = finalBaseTime;
        saveChatState();
        toastr.success('Chat time updated.');
    }
}
