import { BackgroundHandler } from "./event-handlers/BackgroundHandler.js";
import { BoxHandler } from "./event-handlers/BoxHandler.js";
import { MenuHandler } from "./event-handlers/MenuHandler.js";

export class CanvasEvents {
    constructor(canvasEl, worldEl, renderer, stateManager) {
        this.canvasEl = canvasEl;
        this.renderer = renderer;
        this.stateManager = stateManager;
        this.activeOperation = null;
        this.isSpacePanning = false;

        const getCanvasMousePos = this._getCanvasMousePosition.bind(this);
        const getWorldMouseCoords = (pos) => ({
            x: (pos.x - stateManager.state.pan.x) / stateManager.state.zoom,
            y: (pos.y - stateManager.state.pan.y) / stateManager.state.zoom
        });
        const setActiveOperation = (op) => this.activeOperation = op;

        this.backgroundHandler = new BackgroundHandler(stateManager, renderer, setActiveOperation, getCanvasMousePos, getWorldMouseCoords);
        this.boxHandler = new BoxHandler(worldEl, stateManager, renderer, setActiveOperation, getCanvasMousePos, getWorldMouseCoords);
        this.menuHandler = new MenuHandler(renderer.contextMenu, stateManager, renderer, getWorldMouseCoords);

        this._addEventListeners();
    }

    _addEventListeners() {
        this.canvasEl.onmousedown = this._handleCanvasMouseDown.bind(this);

        // Non-passive event listener guarantees e.preventDefault() blocks ComfyUI viewport zoom
        this._boundWheel = (e) => this.backgroundHandler.handleWheel(e);
        this.canvasEl.addEventListener("wheel", this._boundWheel, { passive: false });

        this.canvasEl.ondblclick = (e) => {
            if (!e.target.closest(".thought-bubble-box, .thought-bubble-toolbar")) {
                this.backgroundHandler.handleDblClick(e);
            }
        };

        this.canvasEl.oncontextmenu = (e) => {
            if (!["TEXTAREA", "INPUT"].includes(e.target.nodeName)) e.preventDefault();
        };

        this._boundMouseMove = this._handleGlobalMouseMove.bind(this);
        this._boundMouseUp = this._handleGlobalMouseUp.bind(this);
        this._boundKeyDown = this._handleGlobalKeyDown.bind(this);
        this._boundKeyUp = this._handleGlobalKeyUp.bind(this);

        document.addEventListener("mousemove", this._boundMouseMove);
        document.addEventListener("mouseup", this._boundMouseUp);
        document.addEventListener("keydown", this._boundKeyDown);
        document.addEventListener("keyup", this._boundKeyUp);

        if (this.renderer.minimapEl) {
            this.renderer.minimapEl.onmousedown = this._handleMinimapMouseDown.bind(this);
        }
    }

    destroy() {
        if (this._boundWheel) {
            this.canvasEl.removeEventListener("wheel", this._boundWheel);
        }
        document.removeEventListener("mousemove", this._boundMouseMove);
        document.removeEventListener("mouseup", this._boundMouseUp);
        document.removeEventListener("keydown", this._boundKeyDown);
        document.removeEventListener("keyup", this._boundKeyUp);
    }

    _handleCanvasMouseDown(e) {
        if (e.button === 1 || this.isSpacePanning) {
            e.preventDefault();
            this.backgroundHandler.startPan(e);
            return;
        }

        const boxEl = e.target.closest(".thought-bubble-box");
        if (boxEl) {
            this._updateSelectionVisuals(boxEl.dataset.boxId);
            return;
        }

        if (!e.target.closest(".thought-bubble-toolbar, .thought-bubble-context-menu")) {
            this._updateSelectionVisuals(null);
            this.backgroundHandler.handleMouseDown(e);
        }
    }

    _updateSelectionVisuals(selectedId) {
        this.stateManager.state.selectedBoxId = selectedId;
        const allBoxes = this.renderer.worldEl.querySelectorAll(".thought-bubble-box");
        allBoxes.forEach(el => el.classList.toggle("selected", el.dataset.boxId === selectedId));
    }

    _handleGlobalKeyDown(e) {
        if (e.code === "Space" && !e.repeat && !["TEXTAREA", "INPUT"].includes(e.target.nodeName)) {
            this.canvasEl.style.cursor = "grab";
            this.isSpacePanning = true;
        }

        if ((e.key === "Delete" || e.key === "Backspace") && this.stateManager.state.selectedBoxId) {
            if (!["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
                this.stateManager.deleteBox(this.stateManager.state.selectedBoxId);
                this.stateManager.state.selectedBoxId = null;
                this.renderer.render();
            }
        }
    }

    _handleGlobalKeyUp(e) {
        if (e.code === "Space") {
            this.canvasEl.style.cursor = "";
            this.isSpacePanning = false;
        }
    }

    _handleMinimapMouseDown(e) {
        e.stopPropagation();
        e.preventDefault();
        const updatePan = (evt) => {
            const rect = this.renderer.minimapEl.getBoundingClientRect();
            const clickX = evt.clientX - rect.left;
            const clickY = evt.clientY - rect.top;
            const viewW = this.canvasEl.clientWidth;
            const viewH = this.canvasEl.clientHeight;

            this.stateManager.state.pan.x = -(clickX / rect.width) * viewW * this.stateManager.state.zoom + viewW / 2;
            this.stateManager.state.pan.y = -(clickY / rect.height) * viewH * this.stateManager.state.zoom + viewH / 2;
            this.stateManager.saveDebounced(300);
            this.renderer.updateView();
        };

        updatePan(e);
        const onMouseMove = (moveE) => updatePan(moveE);
        const onMouseUp = () => {
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    }

    _getCanvasMousePosition(e) {
        const rect = this.canvasEl.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / (this.canvasEl.offsetWidth > 0 ? rect.width / this.canvasEl.offsetWidth : 1),
            y: (e.clientY - rect.top) / (this.canvasEl.offsetHeight > 0 ? rect.height / this.canvasEl.offsetHeight : 1),
        };
    }

    _handleGlobalMouseMove(e) {
        if (!this.activeOperation) return;
        e.preventDefault();
        this.activeOperation.handler.handleMouseMove(e, this.activeOperation);
    }

    _handleGlobalMouseUp(e) {
        if (!this.activeOperation) return;
        e.preventDefault();
        this.activeOperation.handler.handleMouseUp(e, this.activeOperation);
        this.activeOperation = null;
    }
}