import { BackgroundHandler } from './event-handlers/BackgroundHandler.js';
import { BoxHandler } from './event-handlers/BoxHandler.js';
import { MenuHandler } from './event-handlers/MenuHandler.js';

export class CanvasEvents {
    constructor(canvasEl, worldEl, renderer, stateManager) {
        this.canvasEl = canvasEl;
        this.renderer = renderer;
        this.stateManager = stateManager;
        this.activeOperation = null;
        this.isSpacePanning = false; // Initialize state

        const getCanvasMousePos = this._getCanvasMousePosition.bind(this);
        const getWorldMouseCoords = this._getWorldMouseCoordinates.bind(this, stateManager);
        const setActiveOperation = (op) => this.activeOperation = op;

        this.backgroundHandler = new BackgroundHandler(stateManager, renderer, setActiveOperation, getCanvasMousePos, getWorldMouseCoords);
        this.boxHandler = new BoxHandler(worldEl, stateManager, renderer, setActiveOperation, getCanvasMousePos, getWorldMouseCoords);
        this.menuHandler = new MenuHandler(renderer.contextMenu, stateManager, renderer, getWorldMouseCoords);

        this._addEventListeners();
    }

    _addEventListeners() {
        this.canvasEl.onmousedown = this._handleCanvasMouseDown.bind(this);
        this.canvasEl.onwheel = this.backgroundHandler.handleWheel.bind(this.backgroundHandler);
        this.canvasEl.ondblclick = this._handleCanvasDblClick.bind(this);

        this.canvasEl.oncontextmenu = (e) => {
            if (!['TEXTAREA', 'INPUT'].includes(e.target.nodeName)) e.preventDefault();
        };

        document.addEventListener('mousemove', this._handleGlobalMouseMove.bind(this));
        document.addEventListener('mouseup', this._handleGlobalMouseUp.bind(this));
        document.addEventListener('keydown', this._handleGlobalKeyDown.bind(this));
        document.addEventListener('keyup', this._handleGlobalKeyUp.bind(this));

        if (this.renderer.minimapEl) {
            this.renderer.minimapEl.onmousedown = this._handleMinimapMouseDown.bind(this);
        }
    }

    _handleCanvasMouseDown(e) {
        // Spacebar Pan Overrides
        if (this.isSpacePanning) {
            this.backgroundHandler.startPan(e);
            return;
        }

        // --- SELECTION LOGIC FIX ---
        if (e.target.closest('.thought-bubble-box, .thought-bubble-toolbar')) {
            const boxEl = e.target.closest('.thought-bubble-box');
            if (boxEl) {
                const newId = boxEl.dataset.boxId;

                // Only act if selection actually changes
                if (this.stateManager.state.selectedBoxId !== newId) {
                    this.stateManager.state.selectedBoxId = newId;

                    // FIX: Manually update visual selection classes instead of calling the missing function
                    this._updateSelectionVisuals(newId);
                }
            }
            return; // Don't trigger background pan
        }

        // Deselect if clicking background
        if (this.stateManager.state.selectedBoxId) {
            this.stateManager.state.selectedBoxId = null;
            this.renderer.lastActiveBoxInfo = null; // Also clear the active text box reference
            this._updateSelectionVisuals(null);
        }

        this.backgroundHandler.handleMouseDown(e);
    }

    // Helper to visually toggle the 'selected' class
    _updateSelectionVisuals(selectedId) {
        // Remove 'selected' from everything
        const allBoxes = this.renderer.worldEl.querySelectorAll('.thought-bubble-box');
        allBoxes.forEach(el => el.classList.remove('selected'));

        // Add 'selected' to the new target
        if (selectedId) {
            const newBox = this.renderer.worldEl.querySelector(`.thought-bubble-box[data-box-id="${selectedId}"]`);
            if (newBox) {
                newBox.classList.add('selected');
            }
        }
    }

    _handleGlobalKeyDown(e) {
        if (e.code === 'Space' && !e.repeat && e.target.nodeName !== 'TEXTAREA' && e.target.nodeName !== 'INPUT') {
            this.canvasEl.style.cursor = 'grab';
            this.isSpacePanning = true;
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && this.stateManager.state.selectedBoxId) {
            const activeTag = document.activeElement.tagName;
            if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
                this.stateManager.deleteBox(this.stateManager.state.selectedBoxId);
                this.stateManager.state.selectedBoxId = null;
                this.renderer.render(); // Deletion requires full render
            }
        }

        if (e.key === 'F2' && this.stateManager.state.selectedBoxId) {
            const boxEl = this.renderer.worldEl.querySelector(`[data-box-id="${this.stateManager.state.selectedBoxId}"]`);
            if (boxEl) {
                const titleInput = boxEl.querySelector('.thought-bubble-box-title');
                if (titleInput) {
                    titleInput.readOnly = false;
                    titleInput.focus();
                    titleInput.select();
                }
            }
        }
    }

    _handleGlobalKeyUp(e) {
        if (e.code === 'Space') {
            this.canvasEl.style.cursor = '';
            this.isSpacePanning = false;
        }
    }

    _handleMinimapMouseDown(e) {
        e.stopPropagation();
        e.preventDefault();

        // Safety check: ensure metrics exist (requires renderer support)
        const metrics = this.renderer.minimapMetrics;
        if (!metrics) return;

        const updatePan = (evt) => {
            const rect = this.renderer.minimapEl.getBoundingClientRect();
            const clickX = evt.clientX - rect.left;
            const clickY = evt.clientY - rect.top;

            const worldX = (clickX - metrics.offsetX) / metrics.scale;
            const worldY = (clickY - metrics.offsetY) / metrics.scale;

            const viewW = this.canvasEl.clientWidth;
            const viewH = this.canvasEl.clientHeight;

            this.stateManager.state.pan.x = -worldX * this.stateManager.state.zoom + viewW / 2;
            this.stateManager.state.pan.y = -worldY * this.stateManager.state.zoom + viewH / 2;

            this.stateManager.save();
            this.renderer.updateView(); // Use the light updateView for smoother minimap panning
        };

        updatePan(e);

        const onMouseMove = (moveE) => updatePan(moveE);
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    _handleCanvasDblClick(e) {
        if (e.target.closest('.thought-bubble-box, .thought-bubble-toolbar')) {
            return;
        }
        this.backgroundHandler.handleDblClick(e);
    }

    _getCanvasMousePosition(e) {
        const rect = this.canvasEl.getBoundingClientRect();
        const scaleX = this.canvasEl.offsetWidth > 0 ? rect.width / this.canvasEl.offsetWidth : 1;
        const scaleY = this.canvasEl.offsetHeight > 0 ? rect.height / this.canvasEl.offsetHeight : 1;
        return {
            x: (e.clientX - rect.left) / scaleX,
            y: (e.clientY - rect.top) / scaleY,
        };
    }

    _getWorldMouseCoordinates(stateManager, canvasPos) {
        const { pan, zoom } = stateManager.state;
        return {
            x: (canvasPos.x - pan.x) / zoom,
            y: (canvasPos.y - pan.y) / zoom
        };
    }

    _handleGlobalMouseMove(e) {
        if (!this.activeOperation) return;
        e.preventDefault();
        e.stopPropagation();
        this.activeOperation.handler.handleMouseMove(e, this.activeOperation);
    }

    _handleGlobalMouseUp(e) {
        if (!this.activeOperation) return;
        e.preventDefault();
        e.stopPropagation();
        this.activeOperation.handler.handleMouseUp(e, this.activeOperation);
        this.activeOperation = null;
    }
}