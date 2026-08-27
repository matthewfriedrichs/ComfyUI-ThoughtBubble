import { boxTypeRegistry, TOOLBAR_HEIGHT } from "./utils.js";

export class CanvasRenderer {
    constructor(canvasEl, worldEl, gridEl, contextMenu, stateManager, minimapEl) {
        this.canvasEl = canvasEl;
        this.worldEl = worldEl;
        this.gridEl = gridEl;
        this.contextMenu = contextMenu;
        this.stateManager = stateManager;
        this.minimapEl = minimapEl;
        this.minimapCtx = minimapEl ? minimapEl.getContext("2d") : null;
        this.minimapPadding = 8;
    }

    updateView() {
        const state = this.stateManager.state;
        if (!state) return;
        this.worldEl.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
        this.drawGrid();

        if (state.showMinimap && this.minimapEl) {
            this.minimapEl.style.display = "block";
            this.drawMinimap();
        } else if (this.minimapEl) {
            this.minimapEl.style.display = "none";
        }
    }

    render() {
        const state = this.stateManager.state;
        if (!state || !state.boxes) return;

        for (const box of state.boxes) {
            if (box.instance && typeof box.instance.destroy === "function") {
                box.instance.destroy();
            }
            box.instance = null;
        }

        this.worldEl.innerHTML = "";
        this.updateView();

        for (const box of state.boxes) {
            this.drawBox(box);
        }
    }

    updateBoxContent(boxId, content) {
        const box = this.stateManager.getBoxById(boxId);
        if (box) {
            box.content = content;
            if (box.instance && typeof box.instance.setContent === "function") {
                box.instance.setContent(content);
            } else {
                this.render();
            }
        }
    }

    drawGrid() {
        const state = this.stateManager.state;
        if (state.gridSize > 0 && state.showGrid) {
            const scaled = state.gridSize * state.zoom;
            this.gridEl.style.backgroundSize = `${scaled}px ${scaled}px`;
            this.gridEl.style.backgroundImage = `linear-gradient(to right, var(--tb-grid-color) 1px, transparent 1px), linear-gradient(to bottom, var(--tb-grid-color) 1px, transparent 1px)`;
            this.gridEl.style.backgroundPosition = `${state.pan.x}px ${state.pan.y}px`;
        } else {
            this.gridEl.style.backgroundImage = "none";
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
        boxEl.className = `thought-bubble-box ${displayState || "normal"} ${box.type || "text"}-box`;
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
        titleInput.value = box.title || "prompt";
        titleInput.readOnly = true;

        const controls = document.createElement("div");
        controls.className = "thought-bubble-box-controls";

        const minBtn = document.createElement("button");
        minBtn.title = "Minimize";
        minBtn.textContent = "−";

        const maxBtn = document.createElement("button");
        maxBtn.title = "Maximize";
        maxBtn.textContent = "□";

        const closeBtn = document.createElement("button");
        closeBtn.title = "Close";
        closeBtn.textContent = "×";

        controls.append(minBtn, maxBtn, closeBtn);
        header.append(titleInput, controls);
        return header;
    }

    createBoxContent(box) {
        const contentEl = document.createElement("div");
        const BoxClass = boxTypeRegistry.get(box.type || "text") || boxTypeRegistry.get("text");
        if (BoxClass) {
            const instance = new BoxClass({
                boxData: box,
                fullState: this.stateManager.state,
                requestSave: () => this.stateManager.save(),
                requestSaveDebounced: (delay) => this.stateManager.saveDebounced(delay),
                canvasEl: this.canvasEl
            });
            box.instance = instance;
            instance.render(contentEl);
        }
        return contentEl;
    }

    showCreationMenu(x, y) {
        this.contextMenu.innerHTML = "";
        const item = document.createElement("div");
        item.className = "thought-bubble-context-menu-item";
        item.textContent = "+ Create Text Box";
        item.dataset.boxType = "text";
        this.contextMenu.appendChild(item);

        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.style.display = "block";
    }

    hideCreationMenu() {
        this.contextMenu.style.display = "none";
    }

    drawMinimap() {
        const state = this.stateManager.state;
        if (!this.minimapCtx || !this.minimapEl || !state.boxes || state.boxes.length === 0) {
            if (this.minimapCtx) this.minimapCtx.clearRect(0, 0, this.minimapEl.width, this.minimapEl.height);
            return;
        }

        const bounds = state.boxes.reduce((b, box) => ({
            minX: Math.min(b.minX, box.x),
            minY: Math.min(b.minY, box.y),
            maxX: Math.max(b.maxX, box.x + box.width),
            maxY: Math.max(b.maxY, box.y + box.height)
        }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

        const contentW = bounds.maxX - bounds.minX;
        const contentH = bounds.maxY - bounds.minY;
        if (contentW <= 0 || contentH <= 0 || !isFinite(contentW)) return;

        const mapW = this.minimapEl.width - this.minimapPadding * 2;
        const mapH = this.minimapEl.height - this.minimapPadding * 2;
        const scale = Math.min(mapW / contentW, mapH / contentH);

        const offsetX = (this.minimapEl.width - contentW * scale) / 2 - bounds.minX * scale;
        const offsetY = (this.minimapEl.height - contentH * scale) / 2 - bounds.minY * scale;

        this.minimapCtx.clearRect(0, 0, this.minimapEl.width, this.minimapEl.height);

        // Boxes
        this.minimapCtx.fillStyle = "rgba(200, 200, 200, 0.5)";
        for (const box of state.boxes) {
            this.minimapCtx.fillRect(
                box.x * scale + offsetX,
                box.y * scale + offsetY,
                box.width * scale,
                box.height * scale
            );
        }

        // Viewport outline
        const viewW = this.canvasEl.clientWidth / state.zoom;
        const viewH = (this.canvasEl.clientHeight - TOOLBAR_HEIGHT) / state.zoom;
        const viewX = -state.pan.x / state.zoom;
        const viewY = (-state.pan.y + TOOLBAR_HEIGHT) / state.zoom;

        this.minimapCtx.strokeStyle = "#50fa7b";
        this.minimapCtx.lineWidth = 1.5;
        this.minimapCtx.strokeRect(
            viewX * scale + offsetX,
            viewY * scale + offsetY,
            viewW * scale,
            viewH * scale
        );
    }
}