// js/canvasRenderer.js

import { boxTypeRegistry, TOOLBAR_HEIGHT } from "./utils.js";

export class CanvasRenderer {
    constructor(canvasEl, worldEl, gridEl, contextMenu, stateManager) {
        this.canvasEl = canvasEl;
        this.worldEl = worldEl;
        this.gridEl = gridEl;
        this.contextMenu = contextMenu;
        this.stateManager = stateManager;
        this.lastActiveTextarea = null;
    }

    render() {
        const state = this.stateManager.state;
        if (!state) return;

        this.worldEl.innerHTML = "";
        this.worldEl.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
        
        this.drawGrid();

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
                setLastActiveTextarea: (textarea) => { this.lastActiveTextarea = textarea; }
            });
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
}
