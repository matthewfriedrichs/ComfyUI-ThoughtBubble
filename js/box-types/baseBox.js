/**
 * @typedef {object} BaseBoxOptions
 * @property {object} boxData - The specific data object for this box from the main state.
 * @property {Function} requestSave - A callback function to signal that the state has changed and should be saved.
 * @property {Function} [requestSaveDebounced] - A callback for debounced saving (wait until activity stops).
 * @property {object} [node] - The parent ComfyUI node instance (optional).
 * @property {object} [fullState] - The entire state object of the widget (optional, for context).
 */

export class BaseBox {
    /**
     * @param {BaseBoxOptions} options
     */
    constructor({ boxData, requestSave, requestSaveDebounced, node, fullState }) {
        if (!boxData || !requestSave) {
            throw new Error("BaseBox requires 'boxData' and 'requestSave' in its constructor options.");
        }

        this.boxData = boxData;
        this.requestSave = requestSave;
        this.requestSaveDebounced = requestSaveDebounced;
        this.node = node;
        this.fullState = fullState;
    }

    render(contentEl) {
        throw new Error(`The '${this.constructor.name}' class must implement the render() method.`);
    }

    destroy() {
        // Default no-op
    }

    static createDefaultState(x, y, width, height) {
        throw new Error(`A class extending BaseBox must implement the static createDefaultState() method.`);
    }
}