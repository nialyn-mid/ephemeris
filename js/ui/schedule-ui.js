import { getActiveCalendars, getCalendar } from '../calendar-manager.js';
import { getUpcomingEvents, getPastEvents } from '../event-manager.js';
import { formatTimeObject, convertToTimeObject, convertToBaseTime, calculateDeltaSeconds } from '../time-engine.js';
import { groupEventsForSchedule } from '../formatter.js';
import { state } from '../state.js';
import { eventSource } from '/scripts/events.js';


let panelEl = null;
let currentTab = 'upcoming';
let currentSearch = '';
let displayCalendarId = null;
let savedBounds = null;

const STORAGE_KEY = 'ephemeris.schedule_bounds';
const CHUNK_SIZE = 50;
let loadedCount = 0;
let renderQueue = []; // Flattened list of headers and events

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

export async function initScheduleUI() {
    const htmlResponse = await fetch('/scripts/extensions/third-party/ephemeris/html/schedule.html');
    const htmlContent = await htmlResponse.text();
    
    const host = document.getElementById('movingDivs');
    if (!host) return;

    const template = document.createElement('template');
    template.innerHTML = htmlContent.trim();
    panelEl = template.content.firstChild;
    host.appendChild(panelEl);

    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) savedBounds = JSON.parse(stored);
    } catch (e) { /* ignore */ }

    bindEvents();
    clampToBounds();
    
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
    const tabs = panelEl.querySelectorAll('.eph-schedule-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            tabs.forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentTab = e.currentTarget.dataset.tab;
            renderList();
        });
    });

    panelEl.querySelector('#eph-schedule-close').addEventListener('click', () => {
        panelEl.style.display = 'none';
    });

    const searchInput = panelEl.querySelector('#eph-schedule-search');
    const debouncedRender = debounce(() => renderList(), 250);
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase();
        debouncedRender();
    });

    const wrapper = panelEl.querySelector('.eph-schedule-content-wrapper');
    wrapper.addEventListener('scroll', () => {
        if (loadedCount >= renderQueue.length) return;
        const scrollBottom = wrapper.scrollHeight - wrapper.scrollTop - wrapper.clientHeight;
        if (scrollBottom < 200) renderNextChunk();
    });

    const select = panelEl.querySelector('#eph-schedule-calendar-select');
    select.addEventListener('change', (e) => {
        displayCalendarId = e.target.value;
        updateScrollUnits();
        renderList();
    });

    // Jump to Time
    const jumpInput = panelEl.querySelector('#eph-scroll-value');
    const debouncedJump = debounce(() => jumpToTime(), 500);
    jumpInput.addEventListener('input', () => debouncedJump());
    panelEl.querySelector('#eph-scroll-unit').addEventListener('change', () => jumpToTime());

    setupDragging();
    setupResizing();

    window.addEventListener('resize', clampToBounds);
    eventSource.on('ephemeris-state-changed', () => {
        if (panelEl.style.display !== 'none') {
            updateDropdown();
            updateScrollUnits();
            renderList();
        }
    });
}

function setupDragging() {
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
}

function setupResizing() {
    const resizeHandles = panelEl.querySelectorAll('.eph-panel-resize-handle');
    let isResizing = false;
    let dragStartX, dragStartY, startLeft, startTop, startWidth, startHeight, dir;

    resizeHandles.forEach(handle => {
        handle.addEventListener('pointerdown', (e) => {
            isResizing = true;
            dir = e.currentTarget.dataset.dir;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            const rect = panelEl.getBoundingClientRect();
            startLeft = rect.left; startTop = rect.top;
            startWidth = rect.width; startHeight = rect.height;
            handle.setPointerCapture(e.pointerId);
        });

        handle.addEventListener('pointermove', (e) => {
            if (!isResizing) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;

            let nw = startWidth, nh = startHeight, nl = startLeft, nt = startTop;
            if (dir.includes('e')) nw = startWidth + dx;
            if (dir.includes('s')) nh = startHeight + dy;
            if (dir.includes('w')) { nw = startWidth - dx; nl = startLeft + dx; }
            if (dir.includes('n')) { nh = startHeight - dy; nt = startTop + dy; }

            if (nw > 300) { panelEl.style.width = `${nw}px`; if (dir.includes('w')) panelEl.style.left = `${nl}px`; }
            if (nh > 400) { panelEl.style.height = `${nh}px`; if (dir.includes('n')) panelEl.style.top = `${nt}px`; }
        });

        handle.addEventListener('pointerup', (e) => {
            isResizing = false;
            handle.releasePointerCapture(e.pointerId);
            saveBounds();
            clampToBounds();
        });
    });
}

function saveBounds() {
    const rect = panelEl.getBoundingClientRect();
    savedBounds = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedBounds));
}

function clampToBounds() {
    if (!panelEl || panelEl.style.display === 'none') return;
    if (savedBounds) {
        panelEl.style.width = `${savedBounds.width}px`;
        panelEl.style.height = `${savedBounds.height}px`;
        panelEl.style.left = `${savedBounds.left}px`;
        panelEl.style.top = `${savedBounds.top}px`;
    }
    const rect = panelEl.getBoundingClientRect();
    const margin = 20;
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    panelEl.style.left = `${Math.max(margin, Math.min(rect.left, maxLeft))}px`;
    panelEl.style.top = `${Math.max(margin, Math.min(rect.top, maxTop))}px`;
}

export function toggleSchedulePanel() {
    if (!panelEl) return;
    if (panelEl.style.display === 'none') {
        panelEl.style.display = 'flex';
        updateDropdown();
        updateScrollUnits();
        clampToBounds();
        renderList();
    } else {
        panelEl.style.display = 'none';
    }
}

function updateDropdown() {
    const select = panelEl.querySelector('#eph-schedule-calendar-select');
    const cals = getActiveCalendars();
    if (cals.length === 0) { select.innerHTML = '<option value="">No Active Calendars</option>'; return; }
    if (!displayCalendarId || !cals.find(c => c.id === displayCalendarId)) displayCalendarId = cals[0].id;
    select.innerHTML = cals.map(c => `<option value="${c.id}" ${c.id === displayCalendarId ? 'selected' : ''}>${c.displayName}</option>`).join('');
}

function updateScrollUnits() {
    const select = panelEl.querySelector('#eph-scroll-unit');
    const cal = getCalendar(displayCalendarId);
    if (!cal || !cal.units) { select.innerHTML = ''; return; }
    const units = cal.units.filter(u => u.type === 'number' || u.type === 'variable');
    select.innerHTML = units.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
}

function jumpToTime() {
    const unitName = panelEl.querySelector('#eph-scroll-unit').value;
    const val = panelEl.querySelector('#eph-scroll-value').value;
    const cal = getCalendar(displayCalendarId);
    if (!unitName || !val || !cal) return;

    // In Schedule UI, jumps are relative to current time based on the tab
    const deltaObj = { [unitName]: val };
    const deltaSeconds = calculateDeltaSeconds(deltaObj, cal);
    
    let targetBaseTime;
    if (currentTab === 'upcoming') {
        targetBaseTime = state.currentTime + deltaSeconds;
    } else {
        targetBaseTime = state.currentTime - deltaSeconds;
    }

    const resultingTimeObj = convertToTimeObject(targetBaseTime, cal);
    const targetFormatted = formatTimeObject(resultingTimeObj, cal);
    
    console.log(`[Ephemeris] Jump Offset: ${val} ${unitName} (${currentTab === 'upcoming' ? '+' : '-'})`);
    console.log(`[Ephemeris] Resulting Target: ${targetFormatted} (BaseTime: ${targetBaseTime})`);
    
    let bestIndex = -1;
    let minDiff = Infinity;
    let isOutOfRange = false;

    // Check if target is before first or after last
    if (renderQueue.length > 0) {
        const eventsOnly = renderQueue.filter(r => r.type === 'event');
        if (eventsOnly.length > 0) {
            const firstTime = eventsOnly[0].value.baseTime;
            const lastTime = eventsOnly[eventsOnly.length - 1].value.baseTime;
            
            if (targetBaseTime < firstTime) isOutOfRange = 'BEFORE_START';
            else if (targetBaseTime > lastTime) isOutOfRange = 'AFTER_END';
        }
    }

    console.log(`[Ephemeris] Jump Target: ${targetFormatted} (BaseTime: ${targetBaseTime}) ${isOutOfRange ? `[OUT OF RANGE: ${isOutOfRange}]` : ''}`);

    for (let i = 0; i < renderQueue.length; i++) {
        const item = renderQueue[i];
        if (item.type === 'event') {
            const diff = Math.abs(item.value.baseTime - targetBaseTime);
            if (diff < minDiff) {
                minDiff = diff;
                bestIndex = i;
            }
        }
    }


    if (bestIndex === -1) {
        console.warn('[Ephemeris] No events found to jump to.');
        return;
    }

    const bestEvent = renderQueue[bestIndex].value;
    console.log(`[Ephemeris] Closest match: "${bestEvent.label}" (Diff: ${minDiff}s)`);

    const container = panelEl.querySelector('#eph-schedule-list');
    container.innerHTML = '';
    const startOffset = Math.max(0, bestIndex - 3);
    loadedCount = startOffset;
    renderNextChunk();
    
    const relativeIndex = bestIndex - startOffset;
    const targetEl = container.children[relativeIndex];
    if (targetEl) {
        setTimeout(() => {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.classList.add('highlight');
            setTimeout(() => targetEl.classList.remove('highlight'), 2000);
        }, 50);
    }
}



function renderList() {
    const container = panelEl.querySelector('#eph-schedule-list');
    container.innerHTML = '';
    loadedCount = 0;
    renderQueue = [];

    const cal = getCalendar(displayCalendarId);
    if (!cal) { container.innerHTML = `<div class="eph-schedule-empty">No calendar selected.</div>`; return; }

    const allEvents = currentTab === 'upcoming' ? getUpcomingEvents(state.currentTime) : getPastEvents(state.currentTime);
    const filtered = allEvents.filter(e => {
        if (!currentSearch) return true;
        return (e.label || '').toLowerCase().includes(currentSearch) || (e.tags || []).some(t => (t || '').toLowerCase().includes(currentSearch));
    });

    if (filtered.length === 0) { container.innerHTML = `<div class="eph-schedule-empty">No ${currentTab} events found.</div>`; return; }

    const grouped = groupEventsForSchedule(filtered, cal, state.currentTime);
    const groupKeys = Object.keys(grouped);
    if (currentTab === 'past') groupKeys.reverse();

    for (const group of groupKeys) {
        renderQueue.push({ type: 'header', value: group });
        let evts = grouped[group];
        if (currentTab === 'past') evts = [...evts].reverse();
        for (const evt of evts) renderQueue.push({ type: 'event', value: evt });
    }

    renderNextChunk();
}

function renderNextChunk() {
    const container = panelEl.querySelector('#eph-schedule-list');
    const cal = getCalendar(displayCalendarId);
    const chunk = renderQueue.slice(loadedCount, loadedCount + CHUNK_SIZE);
    if (chunk.length === 0) return;

    let html = '';
    for (const item of chunk) {
        if (item.type === 'header') {
            html += `<div class="eph-schedule-group">${item.value}</div>`;
        } else {
            const evt = item.value;
            const tObj = convertToTimeObject(evt.baseTime, cal);
            const timeRows = cal.units.filter(u => tObj[u.name] !== undefined)
                .map(u => `<div class="eph-time-row"><span class="eph-time-label">${u.name}</span><span class="eph-time-value">${tObj[u.name]}</span></div>`).join('');
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
    container.insertAdjacentHTML('beforeend', html);
    loadedCount += chunk.length;
}
