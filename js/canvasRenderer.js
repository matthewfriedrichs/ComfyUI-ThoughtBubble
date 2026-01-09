// js/canvasRenderer.js

import { boxTypeRegistry, TOOLBAR_HEIGHT } from "./utils.js";

export class CanvasRenderer {
    constructor(canvasEl, worldEl, gridEl, contextMenu, stateManager, minimapEl) {
        this.canvasEl = canvasEl;
        this.worldEl = worldEl;
        this.gridEl = gridEl;
        this.contextMenu = contextMenu;
        this.stateManager = stateManager;

        this.lastActiveBoxInfo = null;

        // --- SAFEGUARD: Handle missing minimap element gracefully ---
        this.minimapEl = minimapEl;
        if (this.minimapEl) {
            this.minimapCtx = this.minimapEl.getContext("2d");
        } else {
            console.warn("ThoughtBubble: Minimap element not provided to renderer.");
        }
        this.minimapPadding = 10;
    }

    /**
     * LIGHTWEIGHT UPDATE: Use this for Panning and Zooming.
     */
    updateView() {
        const state = this.stateManager.state;
        if (!state) return;

        this.worldEl.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;

        this.drawGrid();

        // Only draw minimap if enabled AND initialized
        if (state.showMinimap && this.minimapCtx) {
            if (this.minimapEl) this.minimapEl.style.display = 'block';
            this.drawMinimap();
        } else if (this.minimapEl) {
            this.minimapEl.style.display = 'none';
        }
    }

    /**
     * HEAVY RENDER: Destroys and rebuilds DOM.
     */
    render() {
        const state = this.stateManager.state;
        if (!state) return;

        // Cleanup existing instances
        if (state.boxes) {
            for (const box of state.boxes) {
                if (box.instance && typeof box.instance.destroy === 'function') {
                    box.instance.destroy();
                }
                box.instance = null;
            }
        }

        this.worldEl.innerHTML = "";

        this.updateView();

        for (const box of state.boxes) {
            this.drawBox(box);
        }
    }

    drawGrid() {
        const state = this.stateManager.state;
        if (state.gridSize > 0 && state.showGrid) {
            const scaledGrid = state.gridSize * state.zoom;
            this.gridEl.style.backgroundSize = `${scaledGrid}px ${scaledGrid}px`;
            this.gridEl.style.backgroundImage = `linear-gradient(to right, #404040 1px, transparent 1px), linear-gradient(to bottom, #404040 1px, transparent 1px)`;
            this.gridEl.style.backgroundPosition = `${state.pan.x}px ${state.pan.y}px`;
        } else {
            this.gridEl.style.backgroundImage = 'none';
        }
    }

    drawBox(box) {
        const state = this.stateManager.state;
        let { x, y, width, height, displayState } = box;

        if (displayState === "maximized") {
            x = -state.pan.x / state.zoom;
            y = (-state.pan.y + TOOLBAR_HEIGHT) / state.zoom;
            width = this.canvasEl.clientWidth / state.zoom;
            height = (this.canvasEl.clientHeight - TOOLBAR_HEIGHT) / state.zoom;
        }

        const boxEl = document.createElement("div");
        boxEl.className = `thought-bubble-box ${displayState || 'normal'} ${box.type || 'text'}-box`;
        boxEl.style.cssText = `left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px;`;
        boxEl.dataset.boxId = box.id;

        const header = this.createBoxHeader(box);
        const content = this.createBoxContent(box);

        boxEl.append(header, content);

        if (displayState === "normal") {
            const resizeHandle = document.createElement("div");
            resizeHandle.className = "thought-bubble-box-resize-handle";
            boxEl.appendChild(resizeHandle);
        }

        this.worldEl.appendChild(boxEl);
    }

    createBoxHeader(box) {
        const header = document.createElement("div");
        header.className = "thought-bubble-box-header";

        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.className = "thought-bubble-box-title";
        titleInput.value = box.title;
        titleInput.readOnly = true;

        const controls = document.createElement("div");
        controls.className = "thought-bubble-box-controls";
        const minButton = document.createElement("button"); minButton.title = "Minimize"; minButton.textContent = "—";
        const maxButton = document.createElement("button"); maxButton.title = "Maximize"; maxButton.textContent = "🗖";
        const closeButton = document.createElement("button"); closeButton.title = "Close"; closeButton.textContent = "✕";
        controls.append(minButton, maxButton, closeButton);

        header.append(titleInput, controls);
        return header;
    }

    createBoxContent(box) {
        const contentEl = document.createElement("div");
        const BoxClass = boxTypeRegistry.get(box.type || "text");
        if (BoxClass) {
            const boxInstance = new BoxClass({
                boxData: box,
                fullState: this.stateManager.state,
                requestSave: () => this.stateManager.save(),
                setLastActiveTextarea: (textarea) => {
                    this.lastActiveBoxInfo = { box: box, textarea: textarea };
                },
                canvasEl: this.canvasEl
            });

            box.instance = boxInstance;
            boxInstance.render(contentEl);
        } else {
            console.warn(`ThoughtBubble: Unknown box type "${box.type}"`);
        }
        return contentEl;
    }

    showCreationMenu(x, y) {
        this.contextMenu.innerHTML = '';
        for (const [type] of boxTypeRegistry.entries()) {
            const item = document.createElement('div');
            item.className = 'thought-bubble-context-menu-item';
            item.textContent = `Create ${type}`;
            item.dataset.boxType = type;
            this.contextMenu.appendChild(item);
        }
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.style.display = 'block';
    }

    hideCreationMenu() {
        this.contextMenu.style.display = 'none';
    }

    drawMinimap() {
        const state = this.stateManager.state;
        // Safety checks
        if (!this.minimapCtx || !this.minimapEl) return;
        if (!state.boxes || state.boxes.length === 0) {
            this.minimapCtx.clearRect(0, 0, this.minimapEl.width, this.minimapEl.height);
            return;
        }

        const style = getComputedStyle(this.canvasEl);
        const boxColor = style.getPropertyValue('--tb-header-text-color') || '#ddd';
        const viewColor = style.getPropertyValue('--tb-accent-color') || '#5c5';

        const bounds = state.boxes.reduce((b, box) => {
            return {
                minX: Math.min(b.minX, box.x),
                minY: Math.min(b.minY, box.y),
                maxX: Math.max(b.maxX, box.x + box.width),
                maxY: Math.max(b.maxY, box.y + box.height)
            };
        }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

        const contentW = bounds.maxX - bounds.minX;
        const contentH = bounds.maxY - bounds.minY;

        // Prevent division by zero or infinity
        if (contentW <= 0 || contentH <= 0 || !isFinite(contentW)) {
            this.minimapCtx.clearRect(0, 0, this.minimapEl.width, this.minimapEl.height);
            return;
        }

        const mapW = this.minimapEl.width - this.minimapPadding * 2;
        const mapH = this.minimapEl.height - this.minimapPadding * 2;

        const scale = Math.min(mapW / contentW, mapH / contentH);

        const offsetX = (this.minimapEl.width - contentW * scale) / 2 - bounds.minX * scale;
        const offsetY = (this.minimapEl.height - contentH * scale) / 2 - bounds.minY * scale;

        this.minimapCtx.clearRect(0, 0, this.minimapEl.width, this.minimapEl.height);

        this.minimapCtx.fillStyle = boxColor;
        for (const box of state.boxes) {
            this.minimapCtx.fillRect(
                box.x * scale + offsetX,
                box.y * scale + offsetY,
                box.width * scale,
                box.height * scale
            );
        }

        const viewW = this.canvasEl.clientWidth / state.zoom;
        const viewH = (this.canvasEl.clientHeight - TOOLBAR_HEIGHT) / state.zoom;
        const viewX = -state.pan.x / state.zoom;
        const viewY = (-state.pan.y + TOOLBAR_HEIGHT) / state.zoom;

        this.minimapCtx.strokeStyle = viewColor;
        this.minimapCtx.lineWidth = 2;
        this.minimapCtx.strokeRect(
            viewX * scale + offsetX,
            viewY * scale + offsetY,
            viewW * scale,
            viewH * scale
        );
    }
}