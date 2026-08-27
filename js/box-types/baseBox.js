export class BaseBox {
    constructor({ boxData, requestSave, requestSaveDebounced, fullState, canvasEl }) {
        if (!boxData || !requestSave) {
            throw new Error("BaseBox requires 'boxData' and 'requestSave'.");
        }
        this.boxData = boxData;
        this.requestSave = requestSave;
        this.requestSaveDebounced = requestSaveDebounced;
        this.fullState = fullState;
        this.canvasEl = canvasEl;
    }

    render(contentEl) {
        throw new Error(`Subclass ${this.constructor.name} must implement render().`);
    }

    destroy() {}

    static createDefaultState(x, y, width, height) {
        throw new Error(`Subclass ${this.constructor.name} must implement createDefaultState().`);
    }
}