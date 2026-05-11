import { logger } from './js/logger.js';
import { loadSettings, initSettingsUI } from './js/settings.js';
import { loadChatState } from './js/state.js';
import { registerEphemerisTools } from './js/tools/infra/register.js';
import { initPromptInjection } from './js/prompt-injection.js';

async function init() {
    logger.info('Initializing Ephemeris extension... (v1.1 - 2026-05-09-2319)');

    // 1. Load settings (Global)
    logger.debug('Init: Loading settings...');
    loadSettings();

    // 2. Load current chat state (Per-Chat)
    logger.debug('Init: Loading chat state...');
    loadChatState();

    // 3. Register AI tools
    registerEphemerisTools();

    // 4. Initialize Prompt Injection
    initPromptInjection();

    // 5. Initialize UI
    await initUI();

    logger.info('Ephemeris extension ready.');
}

async function initUI() {
    const extensionPath = import.meta.url.replace('/index.js', '');
    const settingsHtmlPath = `${extensionPath}/html/settings.html`;

    try {
        const response = await fetch(settingsHtmlPath);
        if (!response.ok) throw new Error(`Failed to load settings HTML: ${response.statusText}`);

        const html = await response.text();
        $('#extensions_settings').append(html);

        // Link logic to UI
        initSettingsUI();
    } catch (err) {
        logger.error('Failed to initialize UI:', err);
    }
}

// Start the extension
init();
