/**
 * Error thrown when a tool call is rejected due to invalid parameters or state.
 * SillyTavern will catch this and report it back to the LLM.
 */
export class RejectedCallError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RejectedCallError';
    }

    /**
     * Formatting for the LLM tool response.
     */
    toString() {
        return `Error: ${this.message}`;
    }
}
