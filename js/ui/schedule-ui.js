import { getActiveCalendars, getCalendar } from '../calendar-manager.js';
import { getUpcomingEvents, getPastEvents } from '../event-manager.js';
import { formatTimeObject, convertToTimeObject } from '../time-engine.js';
import { groupEventsForSchedule } from '../formatter.js';
import { state } from '../state.js';
import { eventSource } from '/scripts/events.js';

let panelEl = null;
let currentTab = 'upcoming'; // 'upcoming' or 'past'
let currentSearch = '';
let displayCalendarId = null;
let savedBounds = null;

const STORAGE_KEY = 'ephemeris.schedule_bounds';

export async function initScheduleUI() {
    // Load HTML
    const htmlResponse = await fetch('/scripts/extensions/third-party/ephemeris/html/schedule.html');
    const htmlContent = await htmlResponse.text();
    
    // Mount to #movingDivs
    const host = document.getElementById('movingDivs');
    if (!host) {
        console.error('[Ephemeris] Could not find #movingDivs');
        return;
    }

    const template = document.createElement('template');
    template.innerHTML = htmlContent.trim();
    panelEl = template.content.firstChild;
    host.appendChild(panelEl);

    // Initialize state
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            savedBounds = JSON.parse(stored);
        }
    } catch (e) {
        // ignore
    }

    bindEvents();
    clampToBounds();
    
    // Add Wand Menu button
    const menu = document.getElementById('extensionsMenu');
    if (menu) {
        const btn = document.createElement('div');
        btn.className = 'list-group-item flex-container flexGap5 interactable';
        btn.innerHTML = `<i class="fa-solid fa-calendar-alt"></i><span>Ephemeris Schedule</span>`;
        btn.onclick = toggleSchedulePanel;
        menu.appendChild(btn);
    }
}

function bindEvents() {
    // Tabs
    const tabs = panelEl.querySelectorAll('.eph-schedule-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentTab = e.currentTarget.dataset.tab;
            renderList();
        });
    });

    // Close
    panelEl.querySelector('#eph-schedule-close').addEventListener('click', () => {
        panelEl.style.display = 'none';
    });

    // Search
    const searchInput = panelEl.querySelector('#eph-schedule-search');
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase();
        renderList();
    });

    // Calendar Select
    const select = panelEl.querySelector('#eph-schedule-calendar-select');
    select.addEventListener('change', (e) => {
        displayCalendarId = e.target.value;
        renderList();
    });

    // Dragging
    const dragHandle = panelEl.querySelector('#eph-schedule-drag-handle');
    let isDragging = false;
    let dragStartX, dragStartY, startLeft, startTop;

    dragHandle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.eph-schedule-controls')) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = panelEl.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        dragHandle.setPointerCapture(e.pointerId);
    });

    dragHandle.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        panelEl.style.left = `${startLeft + dx}px`;
        panelEl.style.top = `${startTop + dy}px`;
    });

    dragHandle.addEventListener('pointerup', (e) => {
        isDragging = false;
        dragHandle.releasePointerCapture(e.pointerId);
        saveBounds();
        clampToBounds();
    });
    
    dragHandle.addEventListener('pointercancel', (e) => {
        isDragging = false;
        dragHandle.releasePointerCapture(e.pointerId);
    });

    // Resizing
    const resizeHandles = panelEl.querySelectorAll('.eph-panel-resize-handle');
    let isResizing = false;
    let startWidth, startHeight, dir;

    resizeHandles.forEach(handle => {
        handle.addEventListener('pointerdown', (e) => {
            isResizing = true;
            dir = e.currentTarget.dataset.dir;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            const rect = panelEl.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            startWidth = rect.width;
            startHeight = rect.height;
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', (e) => {
            if (!isResizing) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            if (dir.includes('e')) newWidth = startWidth + dx;
            if (dir.includes('s')) newHeight = startHeight + dy;
            if (dir.includes('w')) {
                newWidth = startWidth - dx;
                newLeft = startLeft + dx;
            }
            if (dir.includes('n')) {
                newHeight = startHeight - dy;
                newTop = startTop + dy;
            }

            if (newWidth > 300) {
                panelEl.style.width = `${newWidth}px`;
                if (dir.includes('w')) panelEl.style.left = `${newLeft}px`;
            }
            if (newHeight > 400) {
                panelEl.style.height = `${newHeight}px`;
                if (dir.includes('n')) panelEl.style.top = `${newTop}px`;
            }
        });

        handle.addEventListener('pointerup', (e) => {
            isResizing = false;
            handle.releasePointerCapture(e.pointerId);
            saveBounds();
            clampToBounds();
        });
        
        handle.addEventListener('pointercancel', (e) => {
            isResizing = false;
            handle.releasePointerCapture(e.pointerId);
        });
    });

    // Global Events
    window.addEventListener('resize', clampToBounds);
    eventSource.on('ephemeris-state-changed', () => {
        if (panelEl.style.display !== 'none') {
            updateDropdown();
            renderList();
        }
    });
}

function saveBounds() {
    const rect = panelEl.getBoundingClientRect();
    savedBounds = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedBounds));
}

function clampToBounds() {
    if (!panelEl || panelEl.style.display === 'none') return;
    
    let rect = panelEl.getBoundingClientRect();
    if (savedBounds) {
        panelEl.style.width = `${savedBounds.width}px`;
        panelEl.style.height = `${savedBounds.height}px`;
        panelEl.style.left = `${savedBounds.left}px`;
        panelEl.style.top = `${savedBounds.top}px`;
        rect = panelEl.getBoundingClientRect();
    } else {
        // Center it by default
        const w = Math.min(window.innerWidth * 0.8, 600);
        const h = Math.min(window.innerHeight * 0.8, 800);
        panelEl.style.width = `${w}px`;
        panelEl.style.height = `${h}px`;
        panelEl.style.left = `${(window.innerWidth - w) / 2}px`;
        panelEl.style.top = `${(window.innerHeight - h) / 2}px`;
        rect = panelEl.getBoundingClientRect();
    }

    const margin = 20;
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    
    let nextLeft = Math.max(margin, Math.min(rect.left, maxLeft));
    let nextTop = Math.max(margin, Math.min(rect.top, maxTop));
    
    panelEl.style.left = `${nextLeft}px`;
    panelEl.style.top = `${nextTop}px`;
}

export function toggleSchedulePanel() {
    if (!panelEl) return;
    if (panelEl.style.display === 'none') {
        panelEl.style.display = 'flex';
        updateDropdown();
        clampToBounds();
        renderList();
    } else {
        panelEl.style.display = 'none';
    }
}

function updateDropdown() {
    const select = panelEl.querySelector('#eph-schedule-calendar-select');
    const cals = getActiveCalendars();
    
    if (cals.length === 0) {
        select.innerHTML = '<option value="">No Active Calendars</option>';
        return;
    }

    // Preserve selection
    if (!displayCalendarId || !cals.find(c => c.id === displayCalendarId)) {
        displayCalendarId = cals[0].id;
    }

    select.innerHTML = cals.map(c => 
        `<option value="${c.id}" ${c.id === displayCalendarId ? 'selected' : ''}>${c.displayName}</option>`
    ).join('');
}

function renderList() {
    const container = panelEl.querySelector('#eph-schedule-list');
    
    const cal = getCalendar(displayCalendarId);
    if (!cal) {
        container.innerHTML = `<div class="eph-schedule-empty">No calendar selected.</div>`;
        return;
    }

    // getUpcomingEvents usually filters to events >= current time (inclusive)
    // we should use inclusive so right-now events appear in upcoming
    const allEvents = currentTab === 'upcoming' 
        ? getUpcomingEvents(state.currentTime) 
        : getPastEvents(state.currentTime);
    
    // Filter
    const filtered = allEvents.filter(e => {
        if (!currentSearch) return true;
        const inName = (e.label || '').toLowerCase().includes(currentSearch);
        const inTag = (e.tags || []).some(t => (t || '').toLowerCase().includes(currentSearch));
        return inName || inTag;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="eph-schedule-empty">No ${currentTab} events found.</div>`;
        return;
    }

    // Grouping
    const grouped = groupEventsForSchedule(filtered, cal, state.currentTime);
    
    // Since groupEventsForSchedule sorts ascending, past events might need to be reversed 
    const groupKeys = Object.keys(grouped);
    if (currentTab === 'past') {
        groupKeys.reverse();
    }

    let html = '';
    for (const group of groupKeys) {
        html += `<div class="eph-schedule-group">${group}</div>`;
        
        let evts = grouped[group];
        if (currentTab === 'past') evts = [...evts].reverse();

        for (const evt of evts) {
            const tObj = convertToTimeObject(evt.baseTime, cal);
            
            // Generate structured rows for the UI
            const timeRows = cal.units
                .filter(u => tObj[u.name] !== undefined)
                .map(u => `<div class="eph-time-row"><span class="eph-time-label">${u.name}</span><span class="eph-time-value">${tObj[u.name]}</span></div>`)
                .join('');
            
            const tagsHtml = (evt.tags || []).map(t => `<span class="eph-schedule-tag">${t}</span>`).join('');


            
            html += `
                <div class="eph-schedule-item">
                    <div class="eph-schedule-item-main">
                        <div class="eph-schedule-item-title">${evt.label}</div>
                        ${evt.description ? `<div class="eph-schedule-item-desc">${evt.description}</div>` : ''}
                        ${tagsHtml ? `<div class="eph-schedule-item-tags">${tagsHtml}</div>` : ''}
                    </div>
                    <div class="eph-schedule-item-time">${timeRows}</div>
                </div>
            `;

        }
    }


    container.innerHTML = html;
}
