// js/box-types/baseBox.js

/**
 * @typedef {object} BaseBoxOptions
 * @property {object} boxData - The specific data object for this box from the main state.
 * @property {Function} requestSave - A callback function to signal that the state has changed and should be saved.
 * @property {object} [node] - The parent ComfyUI node instance (optional).
 * @property {object} [fullState] - The entire state object of the widget (optional, for context).
 */

/**
 * @abstract
 * Defines the abstract base class for all box types within the ThoughtBubble canvas.
 * This class establishes a contract, ensuring that every box type provides a consistent
 * interface for creation and rendering.
 *
 * Subclasses MUST implement the `render()` instance method and the `createDefaultState()` static method.
 */
export class BaseBox {
    /**
     * The data object for this specific box.
     * @protected
     * @type {object}
     */
    boxData;

    /**
     * A callback to trigger a state save.
     * @protected
     * @type {Function}
     */
    requestSave;

    /**
     * @param {BaseBoxOptions} options - The configuration options for the box instance.
     */
    constructor({ boxData, requestSave, node, fullState }) {
        if (!boxData || !requestSave) {
            throw new Error("BaseBox requires 'boxData' and 'requestSave' in its constructor options.");
        }

        this.boxData = boxData;
        this.requestSave = requestSave;

        // Optional properties for extended context if needed by subclasses
        this.node = node;
        this.fullState = fullState;
    }

    /**
     * Renders the unique UI and content for the box. This method must be overridden by subclasses.
     * The rendered content should be appended to the provided `contentEl`.
     * @abstract
     * @param {HTMLElement} contentEl - The container element where the box's content should be rendered.
     */
    render(contentEl) {
        throw new Error(`The '${this.constructor.name}' class must implement the render() method.`);
    }

    /**
     * Cleans up resources (event listeners, external DOM elements) before the box is removed.
     * Subclasses should override this if they attach global listeners or append elements to document.body.
     */
    destroy() {
        // Optional: Override in subclasses if cleanup is needed.
    }

    /**
     * A static factory method that returns a default state object for a new box of this type.
     * This method must be overridden by subclasses.
     * @abstract
     * @param {number} x - The initial x-coordinate.
     * @param {number} y - The initial y-coordinate.
     * @param {number} width - The initial width.
     * @param {number} height - The initial height.
     * @returns {object} A partial state object representing the new box.
     */
    static createDefaultState(x, y, width, height) {
        throw new Error(`A class extending BaseBox must implement the static createDefaultState() method.`);
    }
}