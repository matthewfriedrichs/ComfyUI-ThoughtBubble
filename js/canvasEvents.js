import { BackgroundHandler } from './event-handlers/BackgroundHandler.js';
import { BoxHandler } from './event-handlers/BoxHandler.js';
import { MenuHandler } from './event-handlers/MenuHandler.js';

export class CanvasEvents {
    constructor(canvasEl, worldEl, renderer, stateManager) {
        this.canvasEl = canvasEl;
        this.activeOperation = null;

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
    }

    _handleCanvasMouseDown(e) {
        // this.renderer.hideCreationMenu(); <-- REMOVE THIS LINE
        if (e.target.closest('.thought-bubble-box, .thought-bubble-toolbar')) {
            return;
        }
        
        this.backgroundHandler.handleMouseDown(e);
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