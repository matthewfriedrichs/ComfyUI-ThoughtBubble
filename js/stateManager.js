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
        this.lastKnownValue = this.dataWidget ? this.dataWidget.value : "";
        this.saveTimer = null;
        this.lastSaveTimestamp = 0;
        this.MIN_SAVE_INTERVAL_MS = 200;
        this.load();
    }

    load(explicitJson = null) {
        const defaultState = {
            boxes: [{
                id: "default-output-box",
                title: "output",
                content: "",
                type: "text",
                x: 100,
                y: 100,
                width: 400,
                height: 300,
                displayState: "normal",
            }],
            pan: { x: 0, y: 0 },
            zoom: 1.0,
            gridSize: 100,
            showGrid: true,
            showMinimap: false,
            theme: {},
        };

        try {
            const raw = explicitJson !== null ? explicitJson : (this.dataWidget ? this.dataWidget.value : "");
            const loaded = JSON.parse(raw);
            this.state = Object.assign({}, defaultState, loaded);
        } catch {
            this.state = defaultState;
        }
        this._commitState();
    }

    save(forceImmediate = false) {
        if (forceImmediate) {
            if (this.saveTimer) {
                clearTimeout(this.saveTimer);
                this.saveTimer = null;
            }
            this._commitState();
            return;
        }

        if (this.saveTimer) return;

        const now = Date.now();
        const elapsed = now - this.lastSaveTimestamp;
        if (elapsed >= this.MIN_SAVE_INTERVAL_MS) {
            this._commitState();
        } else {
            this.saveTimer = setTimeout(() => {
                this.saveTimer = null;
                this._commitState();
            }, this.MIN_SAVE_INTERVAL_MS - elapsed);
        }
    }

    saveDebounced(delay = 400) {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this._commitState();
        }, delay);
    }

    _commitState() {
        this.lastSaveTimestamp = Date.now();
        const replacer = (key, value) => key === "instance" ? undefined : value;
        const newValue = JSON.stringify(this.state, replacer);
        if (this.dataWidget) {
            this.dataWidget.value = newValue;
        }
        this.lastKnownValue = newValue;
    }

    getBoxById(boxId) {
        return (this.state.boxes || []).find(b => b.id === boxId);
    }

    updateBoxContent(boxId, content) {
        const box = this.getBoxById(boxId);
        if (box) {
            box.content = content;
            if (box.instance && typeof box.instance.setContent === "function") {
                box.instance.setContent(content);
            }
            this._commitState();
        }
    }

    patchPersisters(boxId, updates) {
        const box = this.getBoxById(boxId);
        if (!box) return;

        if (box.instance && typeof box.instance.patchPersisters === "function") {
            box.instance.patchPersisters(updates);
        } else {
            let text = box.content || "";
            for (const update of updates) {
                const { name, new_value } = update;
                if (!name || new_value === undefined) continue;
                const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const regex = new RegExp(`(\\b(?:p|persister)\\(\\s*${escapedName}\\s*\\|)([^)]*)(\\))`, "gi");
                text = text.replace(regex, `$1${new_value}$3`);
            }
            box.content = text;
            this._commitState();
        }
    }

    snapToGrid(val) {
        if (!this.state || !this.state.gridSize || this.state.gridSize <= 0) return val;
        return Math.round(val / this.state.gridSize) * this.state.gridSize;
    }

    createNewBox(boxType = "text", worldX = 100, worldY = 100, width = 350, height = 220) {
        const BoxClass = boxTypeRegistry.get(boxType) || boxTypeRegistry.get("text");
        if (!BoxClass) return;

        const w = Math.max(200, this.snapToGrid(width));
        const h = Math.max(100, this.snapToGrid(height));
        const x = this.snapToGrid(worldX);
        const y = this.snapToGrid(worldY);

        const newBoxState = BoxClass.createDefaultState(x, y, w, h);
        const newBox = { id: uuidv4(), ...newBoxState, displayState: "normal" };

        this.state.boxes = this.state.boxes || [];
        this.state.boxes.push(newBox);
        this.save();
    }

    deleteBox(boxId) {
        const box = this.getBoxById(boxId);
        if (box && box.displayState === "maximized") {
            this.unmaximize(box);
        }
        this.state.boxes = (this.state.boxes || []).filter(b => b.id !== boxId);
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