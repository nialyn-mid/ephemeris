export const logLevels = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
};

let currentLogLevel = logLevels.INFO;

export function setLogLevel(level) {
    currentLogLevel = level;
}

export const logger = {
    error: (...args) => {
        if (currentLogLevel >= logLevels.ERROR) console.error('[Ephemeris]', ...args);
    },
    warn: (...args) => {
        if (currentLogLevel >= logLevels.WARN) console.warn('[Ephemeris]', ...args);
    },
    info: (...args) => {
        if (currentLogLevel >= logLevels.INFO) console.info('[Ephemeris]', ...args);
    },
    debug: (...args) => {
        if (currentLogLevel >= logLevels.DEBUG) console.debug('[Ephemeris]', ...args);
    },
};
