import { boxTypeRegistry } from "./utils.js";

function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

export class StateManager {
    constructor(dataWidget) {
        this.dataWidget = dataWidget;
        this.state = {};
        this.lastKnownValue = this.dataWidget.value;
        this.lastSelectedBoxType = 'text';

        // --- ROBUSTNESS: Rate Limiting State ---
        this.saveTimer = null;           // Timer for pending saves
        this.lastSaveTimestamp = 0;      // When we last actually wrote to the widget
        this.MIN_SAVE_INTERVAL_MS = 250; // Hard limit: Max ~4 saves per second

        this.load();
    }

    load() {
        const defaultState = {
            boxes: [{
                id: "default-output-box", title: "output", content: "", type: "text",
                x: 100, y: 100, width: 400, height: 300, displayState: "normal",
            }],
            pan: { x: 0, y: 0 }, zoom: 1.0, gridSize: 100, showGrid: true, savedView: null,
            iterator: 0,
            theme: {},
            periodIsBreak: true,
            showMinimap: false,
        };
        try {
            const loadedState = JSON.parse(this.dataWidget.value);
            this.state = Object.assign({}, defaultState, loadedState);
        } catch (e) {
            this.state = defaultState;
            console.error("Failed to parse ThoughtBubble state, resetting to default:", e);
        }
        // Initial load should be immediate
        this.save(true);
    }

    /**
     * ROBUST SAVE METHOD
     * @param {boolean} forceImmediate - If true, bypasses rate limiting (use for critical events like 'Queue Prompt')
     */
    save(forceImmediate = false) {
        // 1. If forced, cancel any pending timers and commit instantly
        if (forceImmediate) {
            if (this.saveTimer) {
                clearTimeout(this.saveTimer);
                this.saveTimer = null;
            }
            this._commitState();
            return;
        }

        // 2. If a save is already scheduled, we don't need to do anything.
        // The pending timer will capture the latest state when it fires.
        if (this.saveTimer) return;

        // 3. Rate Limit Check
        const now = Date.now();
        const timeSinceLast = now - this.lastSaveTimestamp;

        if (timeSinceLast >= this.MIN_SAVE_INTERVAL_MS) {
            // Safe to save immediately
            this._commitState();
        } else {
            // Too soon! Schedule a save for the remaining cooldown time.
            const waitTime = this.MIN_SAVE_INTERVAL_MS - timeSinceLast;
            this.saveTimer = setTimeout(() => {
                this.saveTimer = null;
                this._commitState();
            }, waitTime);
        }
    }

    /**
     * Helper for UX events (like "Wait until user stops zooming")
     */
    saveDebounced(delay = 500) {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this._commitState();
        }, delay);
    }

    /**
     * Internal method to actually write data. Do not call directly.
     */
    _commitState() {
        this.lastSaveTimestamp = Date.now();

        const replacer = (key, value) => {
            if (key === 'instance') return undefined;
            return value;
        };

        const newValue = JSON.stringify(this.state, replacer);
        this.dataWidget.value = newValue;
        this.lastKnownValue = newValue;
    }

    getBoxById(boxId) {
        return this.state.boxes.find(b => b.id === boxId);
    }

    snapToGrid(value) {
        if (!this.state || this.state.gridSize === 0) return value;
        return Math.round(value / this.state.gridSize) * this.state.gridSize;
    }

    createNewBox(boxType, worldX, worldY, width, height) {
        const BoxClass = boxTypeRegistry.get(boxType);
        if (!BoxClass) return;

        const w = this.snapToGrid(width || 300);
        const h = this.snapToGrid(height || 200);
        const x = this.snapToGrid(worldX);
        const y = this.snapToGrid(worldY);

        let newBoxState = BoxClass.createDefaultState(x, y, w, h);

        const newBox = { id: uuidv4(), ...newBoxState, displayState: "normal" };
        this.state.boxes.push(newBox);
        this.save();
    }

    deleteBox(boxId) {
        const box = this.state.boxes.find(b => b.id === boxId);
        if (box && box.displayState === 'maximized' && this.state.savedView) {
            this.unmaximize(box);
        }
        this.state.boxes = this.state.boxes.filter(b => b.id !== boxId);
        this.save();
    }

    unmaximize(box) {
        if (box.old) {
            Object.assign(box, { x: box.old.x, y: box.old.y, width: box.old.width, height: box.old.height });
            delete box.old;
        }
        if (this.state.savedView) {
            this.state.pan = this.state.savedView.pan;
            this.state.zoom = this.state.savedView.zoom;
            this.state.savedView = null;
        }
    }
}