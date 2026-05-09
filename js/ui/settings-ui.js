import { logger } from '../logger.js';
import { settings, saveSettings, updateSetting, defaultSettings } from '../settings.js';
import { attachTimePreview } from './time-preview.js';
import { openCalendarPopup } from './calendar-editor.js';
import { openEventPopup } from './event-editor.js';
import { Popup, POPUP_TYPE, POPUP_RESULT } from '/scripts/popup.js';

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

    const bindSlider = (id, obj, field) => {
        const $slider = $(`#${id}`);
        const $input = $(`#${id}_value`);
        if (!$slider.length || !$input.length) return;

        $slider.val(obj[field]);
        $input.val(obj[field]);

        $slider.off('input change').on('input change', (e) => {
            const val = Number(e.target.value);
            $input.val(val).trigger('input'); // Notify the number input's listeners
            obj[field] = val;
            saveSettings();
        });

        $input.off('input change').on('input change', (e) => {
            const val = Number(e.target.value);
            $slider.val(val); // Sliders don't usually need the event triggered for this use case, but we can do it for consistency
            obj[field] = val;
            saveSettings();
        });
    };

    // Bind Helpers
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
            <div class="ephemeris-slider-row" style="margin-bottom: 8px;">
                <div class="alignitemscenter flex-container flexFlowColumn flexGrow flexShrink gap0 flexBasis48p">
                    <small><span style="font-weight: bold; margin-bottom: 2px; display: block;">Sig ${i}</span></small>
                    <input class="neo-range-slider" type="range" id="${id}" min="0" max="315360000" step="3600">
                    <input class="neo-range-input" type="number" id="${id}_value" data-for="${id}" min="0" max="315360000" step="3600">
                </div>
            </div>
        `);
        bindSlider(id, settings.injection.significanceDistances, i);
        attachTimePreview(id);
    }

    bindSlider('ephemeris-range-backward', settings.injection, 'timeRangeBackward');
    bindSlider('ephemeris-range-forward', settings.injection, 'timeRangeForward');

    bindToggle('ephemeris-reminders-enabled', settings.injection, 'remindersEnabled');
    bindSlider('ephemeris-reminders-distance', settings.injection, 'remindersDistance');

    bindToggle('ephemeris-notices-enabled', settings.injection, 'completedNoticesEnabled');
    bindSlider('ephemeris-notices-duration', settings.injection, 'completedNoticesDuration');
    bindSlider('ephemeris-significance-multiplier', settings.injection, 'significanceMultiplier');

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
            settings.globalCalendars = JSON.parse(JSON.stringify(defaultSettings.globalCalendars));
            saveSettings();
            toastr.success('Global calendars reset to default.');
        }
    });
}
