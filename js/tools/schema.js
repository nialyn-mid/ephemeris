/**
 * Shared Tool Schemas
 * Standardizes common input formats for Ephemeris tools.
 */

export const timeObjectSchema = (description) => ({
    type: 'object',
    description: (description ? `${description} ` : '') + 'A structured time object where keys are unit names (e.g. {"Year": 2024, "Month": "January", "Day": 1}).'
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
