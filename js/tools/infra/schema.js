import { RejectedCallError } from '../../errors.js';

/**
 * Shared Tool Schemas
 * Standardizes common input formats for Ephemeris tools.
 */

export class Validator {
    constructor(prefix = 'Validation failed') {
        this.prefix = prefix;
        this.errors = [];
    }

    require(condition, message) {
        if (!condition) {
            this.errors.push(message);
        }
    }

    throwIfErrors() {
        if (this.errors.length > 0) {
            // Append punctuation correctly
            const cleanPrefix = this.prefix.trim();
            const sep = cleanPrefix.endsWith(':') ? ' ' : ': ';
            throw new RejectedCallError(`${cleanPrefix}${sep}${this.errors.join('; ')}.`);
        }
    }
}

export const timeObjectSchema = (description) => ({
    type: 'object',
    description: (description ? `${description} ` : '') + 'A structured absolute time object where keys are unit names (e.g. {"Year": 2024, "Month": "January", "Day": 1}).'
});

export const timeDeltaSchema = (description) => ({
    type: 'object',
    description: (description ? `${description} ` : '') + 'A relative time duration as a structured object (e.g. {"Day": 3, "Hour": 12}). Use the calendar\'s unit names as keys. To bypass units and add raw base seconds directly, use the special key "_baseSeconds" (e.g. {"_baseSeconds": 3600}).'
});

export const calendarIdSchema = (description) => ({
    type: 'string',
    description: description || 'The unique ID of the calendar system used to interpret or format the time.'
});

export const significanceSchema = (description) => ({
    type: 'number',
    minimum: 1,
    maximum: 10,
    description: description || 'Importance rating from 1 (minor) to 10 (world-altering).'
});

export const lengthInSubUnitsSchema = () => ({
    type: 'object',
    description: 'Define length of this unit in terms of another (importantly, smaller!) unit. Example: {"Hour": 28} to define a (larger) Day as 28 (smaller) Hours. The referenced unit must be defined in the same calendar.',
    additionalProperties: { type: 'number' }
});

