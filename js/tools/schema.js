/**
 * Shared Tool Schemas
 * Standardizes common input formats for Ephemeris tools.
 */

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
