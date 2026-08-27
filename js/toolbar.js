import { ThemeEditor } from "./themeEditor.js";

export class Toolbar {
    constructor(toolbarEl, stateManager, renderer, themeManager) {
        this.toolbarEl = toolbarEl;
        this.stateManager = stateManager;
        this.renderer = renderer;
        this.themeManager = themeManager;
        this._init();
    }

    _init() {
        this.toolbarEl.innerHTML = "";

        // 1. Fit View Button
        const fitViewBtn = document.createElement("button");
        fitViewBtn.textContent = "Fit View";
        fitViewBtn.onclick = () => this.fitViewToContent();

        // 2. Zoom Buttons (+ and -)
        const zoomInBtn = document.createElement("button");
        zoomInBtn.textContent = "+";
        zoomInBtn.title = "Zoom In";
        zoomInBtn.style.fontWeight = "bold";
        zoomInBtn.onclick = () => this.adjustZoom(1.2);

        const zoomOutBtn = document.createElement("button");
        zoomOutBtn.textContent = "−";
        zoomOutBtn.title = "Zoom Out";
        zoomOutBtn.style.fontWeight = "bold";
        zoomOutBtn.onclick = () => this.adjustZoom(1 / 1.2);

        // 3. View Map Button
        const mapBtn = document.createElement("button");
        mapBtn.textContent = this.stateManager.state.showMinimap ? "Hide Map" : "View Map";
        mapBtn.onclick = () => {
            this.stateManager.state.showMinimap = !this.stateManager.state.showMinimap;
            mapBtn.textContent = this.stateManager.state.showMinimap ? "Hide Map" : "View Map";
            this.stateManager.save();
            this.renderer.updateView();
        };

        // 4. Theme Editor Button
        const themeBtn = document.createElement("button");
        themeBtn.textContent = "Theme";
        themeBtn.onclick = () => {
            const editor = new ThemeEditor(this.stateManager, this.themeManager);
            editor.show();
        };

        // 5. Grid Size Selector
        const gridLabel = document.createElement("label");
        gridLabel.textContent = "Grid:";

        const gridSelect = document.createElement("select");
        [0, 10, 20, 50, 100, 200, 400].forEach(size => {
            const option = document.createElement("option");
            option.value = size;
            option.textContent = size === 0 ? "Off" : `${size}px`;
            gridSelect.appendChild(option);
        });

        gridSelect.value = this.stateManager.state.gridSize || 0;
        gridSelect.onchange = (e) => {
            const val = parseInt(e.target.value, 10);
            this.stateManager.state.gridSize = val;
            this.stateManager.state.showGrid = val > 0;
            this.stateManager.save();
            this.renderer.updateView();
        };

        this.toolbarEl.append(fitViewBtn, zoomInBtn, zoomOutBtn, mapBtn, themeBtn, gridLabel, gridSelect);
    }

    adjustZoom(factor) {
        const state = this.stateManager.state;
        const currentZoom = state.zoom || 1.0;
        const newZoom = Math.max(0.1, Math.min(4.0, currentZoom * factor));

        // Center zoom on canvas viewport center
        const centerX = this.renderer.canvasEl.clientWidth / 2;
        const centerY = this.renderer.canvasEl.clientHeight / 2;
        const worldCenterX = (centerX - state.pan.x) / currentZoom;
        const worldCenterY = (centerY - state.pan.y) / currentZoom;

        state.pan.x = centerX - worldCenterX * newZoom;
        state.pan.y = centerY - worldCenterY * newZoom;
        state.zoom = newZoom;

        this.stateManager.saveDebounced(300);
        this.renderer.updateView();
    }

    fitViewToContent() {
        const state = this.stateManager.state;
        const visibleBoxes = (state.boxes || []).filter(b => b.displayState === "normal" || !b.displayState);
        if (visibleBoxes.length === 0) return;

        const bounds = visibleBoxes.reduce((b, box) => ({
            minX: Math.min(b.minX, box.x),
            minY: Math.min(b.minY, box.y),
            maxX: Math.max(b.maxX, box.x + Math.max(box.width, 200)),
            maxY: Math.max(b.maxY, box.y + Math.max(box.height, 100))
        }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

        const contentW = bounds.maxX - bounds.minX;
        const contentH = bounds.maxY - bounds.minY;
        if (contentW <= 0 || contentH <= 0) return;

        const viewW = this.renderer.canvasEl.clientWidth;
        const viewH = this.renderer.canvasEl.clientHeight;
        const padding = 60;
        const zoom = Math.min((viewW - padding * 2) / contentW, (viewH - padding * 2) / contentH, 1.5);

        state.zoom = zoom;
        state.pan.x = -bounds.minX * zoom + (viewW - contentW * zoom) / 2;
        state.pan.y = -bounds.minY * zoom + (viewH - contentH * zoom) / 2;

        this.stateManager.save();
        this.renderer.updateView();
    }
}