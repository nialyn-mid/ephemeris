import { getContext } from '/scripts/extensions.js';
import { logger } from '../../logger.js';
import { getCalendar } from '../../calendar-manager.js';

/**
 * Tool Queue / Dependency Registry
 * Synchronizes parallel tool calls that depend on each other.
 */

const registry = new Map();
const announcements = new Set();
const failures = new Set();

/**
 * Announces that a tool is starting and what resource it is creating.
 */
export function announceCreator(type, id) {
    const key = `${type}:${id}`;
    announcements.add(key);
    failures.delete(key);
    logger.debug(`[QUEUE] Creator announced: ${key}`);
}

/**
 * Signals that a tool failed to create a resource.
 */
export function signalFailure(type, id) {
    const key = `${type}:${id}`;
    failures.add(key);
    provideDependency(type, id);
}

/**
 * Returns true if a resource creation attempt just failed.
 */
export function isFailed(type, id) {
    return failures.has(`${type}:${id}`);
}

/**
 * Signals that a dependency is now available.
 */
export function provideDependency(type, id) {
    const key = `${type}:${id}`;
    announcements.delete(key);
    if (registry.has(key)) {
        logger.info(`[QUEUE] Dependency satisfied: ${key} is now available.`);
        registry.get(key).resolve();
        registry.delete(key);
    }
}

/**
 * Awaits a dependency that is expected to be provided by another tool call in the same turn.
 */
export async function waitForDependency(type, id, timeoutMs = 10000) {
    const key = `${type}:${id}`;

    // 1. Check if it already exists in current state
    if (type === 'calendar' && getCalendar(id)) return;
    
    // 2. Grace Period: Wait a tiny bit to allow parallel tools to announce themselves
    // This handles the case where the consumer starts slightly before the creator
    await new Promise(resolve => setTimeout(resolve, 100));

    // 3. Check if any active tool has announced itself as the creator
    if (!announcements.has(key)) {
        logger.debug(`[QUEUE] No active creator announced for ${key}. Proceeding...`);
        return; 
    }

    logger.info(`[QUEUE] Dependency detected: Waiting for ${key} to be satisfied...`);

    if (!registry.has(key)) {
        let res, rej;
        const promise = new Promise((resolve, reject) => {
            res = resolve;
            rej = reject;
        });
        registry.set(key, { promise, resolve: res, reject: rej });
        
        // Safety timeout
        setTimeout(() => {
            if (registry.has(key)) {
                logger.warn(`[QUEUE] Timeout waiting for ${key}`);
                registry.get(key).resolve();
                registry.delete(key);
                announcements.delete(key);
            }
        }, timeoutMs);
    }

    return registry.get(key).promise;
}

