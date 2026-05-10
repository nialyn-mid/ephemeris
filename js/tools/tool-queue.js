import { getContext } from '/scripts/extensions.js';
import { logger } from '../logger.js';
import { getCalendar } from '../calendar-manager.js';

/**
 * Tool Queue / Dependency Registry
 * Synchronizes parallel tool calls that depend on each other.
 */

const registry = new Map();

/**
 * Scans the current Turn's tool calls to see if a specific resource is scheduled for creation.
 * This prevents deadlocks by ensuring we only wait for things that are actually being made.
 */
function isCreatorPlanned(type, id) {
    const context = getContext();
    const chat = context.chat || [];
    if (chat.length === 0) return false;

    // In SillyTavern, the tool_calls for the current turn are in the last message
    const lastMessage = chat[chat.length - 1];
    if (!lastMessage || !lastMessage.tool_calls) {
        logger.debug('[QUEUE] No tool calls found in last message for planning check.');
        return false;
    }

    for (const call of lastMessage.tool_calls) {
        try {
            const args = typeof call.function.arguments === 'string' 
                ? JSON.parse(call.function.arguments) 
                : call.function.arguments;
            
            const toolName = call.function.name;
            
            if (type === 'calendar' && toolName === 'eph_update_calendar') {
                if (args.id === id) return true;
            }
            if (type === 'event' && toolName === 'eph_update_event') {
                if (args.id === id) return true;
            }
        } catch (e) {
            logger.warn('[QUEUE] Error parsing planned tool call arguments:', e);
        }
    }
    
    logger.debug(`[QUEUE] No creator planned for ${type} '${id}' in current turn.`);
    return false;
}

/**
 * Awaits a dependency that is expected to be provided by another tool call in the same turn.
 */
export async function waitForDependency(type, id, timeoutMs = 10000) {
    // 1. Check if it already exists in current state
    if (type === 'calendar' && getCalendar(id)) return;
    
    // 2. If not found, see if another tool in this turn is supposed to create it
    if (!isCreatorPlanned(type, id)) {
        // If no one is making it, we proceed and let the standard "Not Found" error handle it
        return; 
    }

    logger.info(`[QUEUE] Dependency detected: Waiting for ${type} '${id}' to be created...`);

    const key = `${type}:${id}`;
    if (!registry.has(key)) {
        let res, rej;
        const promise = new Promise((resolve, reject) => {
            res = resolve;
            rej = reject;
        });
        registry.set(key, { promise, resolve: res, reject: rej });
        
        // Safety timeout to prevent infinite hangs
        setTimeout(() => {
            if (registry.has(key)) {
                logger.warn(`[QUEUE] Timeout waiting for ${type} '${id}'`);
                registry.get(key).resolve(); // Resolve anyway to allow standard error handling
                registry.delete(key);
            }
        }, timeoutMs);
    }

    return registry.get(key).promise;
}

/**
 * Signals that a dependency is now available.
 */
export function provideDependency(type, id) {
    const key = `${type}:${id}`;
    if (registry.has(key)) {
        logger.info(`[QUEUE] Dependency satisfied: ${type} '${id}' is now available.`);
        registry.get(key).resolve();
        registry.delete(key);
    }
}
