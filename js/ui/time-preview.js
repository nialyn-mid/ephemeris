import { getActiveCalendars } from '../calendar-manager.js';

/**
 * Decomposes seconds into units for a specific calendar.
 * @param {number} seconds 
 * @param {object} cal 
 * @returns {string}
 */
export function formatDuration(seconds, cal) {
    if (seconds <= 0) return '0 seconds';
    const parts = [];
    let remaining = seconds;
    const sortedUnits = [...cal.units].sort((a, b) => b.lengthInBase - a.lengthInBase);

    sortedUnits.forEach(unit => {
        const count = Math.floor(remaining / unit.lengthInBase);
        if (count > 0) {
            parts.push(`${count} ${unit.name.toLowerCase()}${count > 1 ? 's' : ''}`);
            remaining %= unit.lengthInBase;
        }
    });

    if (parts.length === 0) {
        parts.push(`< 1 ${sortedUnits[sortedUnits.length - 1].name.toLowerCase()}`);
    }
    return parts.join(', ');
}

/**
 * Creates a time duration preview element.
 * @param {number} seconds - The duration in base time seconds.
 * @returns {string} - HTML string for the preview.
 */
export function createTimePreview(seconds) {
    if (!seconds || seconds <= 0) return '<small style="opacity:0.5">0 seconds</small>';

    const calendars = getActiveCalendars();
    let html = '<div class="ephemeris-time-preview" style="display:flex; flex-direction:column; gap:2px;">';

    calendars.forEach(cal => {
        const durationStr = formatDuration(seconds, cal);
        html += `<div class="ephemeris-time-preview-row">
            <small style="font-size: 0.8em;"><b style="color:var(--grey40)">${cal.displayName} (${cal.abbreviation}):</b> ${durationStr}</small>
        </div>`;
    });

    html += '</div>';
    return html;
}

/**
 * Attaches a time preview to an input.
 * @param {string} inputId - The ID of the number input.
 */
export function attachTimePreview(inputId) {
    const $input = $(`#${inputId}`);
    const previewId = `${inputId}-preview`;

    // Create the preview container if it doesn't exist
    if ($(`#${previewId}`).length === 0) {
        const $container = $(`<div class="ephemeris-time-preview-wrapper" style="width:100%; margin-top: 2px;"></div>`);
        const $toggle = $(`
            <div class="ephemeris-preview-toggle" style="cursor:pointer; display:flex; align-items:center; justify-content:space-between; padding: 2px 8px; background: rgba(0,0,0,0.1); border-radius: 4px; font-size: 0.75em; color: var(--grey40);">
                <span class="ephemeris-toggle-label">Duration</span>
                <i class="fa-solid fa-chevron-down" style="font-size:0.8em; opacity:0.5;"></i>
            </div>
        `);
        const $content = $(`<div id="${previewId}" class="ephemeris-time-preview-content" style="display:none; padding: 6px 8px; background: rgba(0,0,0,0.15); border-radius: 0 0 4px 4px; border-top: 1px solid rgba(255,255,255,0.05);"></div>`);

        $container.append($toggle).append($content);
        
        // Find a suitable insertion point - either after setup-item or simply after the input's container
        const $setupItem = $input.closest('.setup-item');
        if ($setupItem.length) {
            $setupItem.after($container);
        } else {
            $input.parent().after($container);
        }

        $toggle.on('click', () => {
            const isOpen = $content.is(':visible');
            $content.slideToggle(150);
            $toggle.find('i').toggleClass('fa-chevron-down', isOpen).toggleClass('fa-chevron-up', !isOpen);
            $toggle.css('border-radius', isOpen ? '4px' : '4px 4px 0 0');
        });
    }

    const update = () => {
        const val = Number($input.val());
        const calendars = getActiveCalendars();
        const primary = calendars[0];
        const $wrapper = $(`#${previewId}`).closest('.ephemeris-time-preview-wrapper');

        if (primary && val > 0) {
            const label = primary.abbreviation || primary.displayName;
            const shortDur = formatDuration(val, primary);
            $wrapper.find('.ephemeris-toggle-label').text(`Duration: (${label}: ${shortDur})`);
        } else {
            $wrapper.find('.ephemeris-toggle-label').text('Duration');
        }

        $(`#${previewId}`).html(createTimePreview(val));
    };

    $input.on('input change', update);

    // If there's a paired slider/input (e.g. id and id_value), listen to both
    const baseId = inputId.endsWith('_value') ? inputId.replace('_value', '') : inputId;
    const pairedId = inputId.endsWith('_value') ? baseId : `${baseId}_value`;
    const $paired = $(`#${pairedId}`);
    if ($paired.length) {
        $paired.on('input change', update);
    }

    update();
}
