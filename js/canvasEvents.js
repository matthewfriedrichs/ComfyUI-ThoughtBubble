const OP_TYPES = {
    PAN: 'pan',
    DRAG: 'drag',
    RESIZE: 'resize',
    DRAG_CREATE: 'drag-create',
};

const SELECTORS = {
    BOX: '.thought-bubble-box',
    HEADER: '.thought-bubble-box-header',
    TITLE: '.thought-bubble-box-title',
    RESIZE_HANDLE: '.thought-bubble-box-resize-handle',
    TOOLBAR: '.thought-bubble-toolbar',
    MENU_ITEM: '.thought-bubble-context-menu-item',
};

export class CanvasEvents {
    constructor(canvasEl, worldEl, renderer, stateManager) {
        this.canvasEl = canvasEl;
        this.worldEl = worldEl;
        this.renderer = renderer;
        this.stateManager = stateManager;
        this.activeOperation = null;

        this.operationHandlers = {
            [OP_TYPES.PAN]: {
                move: this._handlePanMove.bind(this),
                up: this._handleOperationEnd.bind(this),
            },
            [OP_TYPES.DRAG]: {
                move: this._handleDragMove.bind(this),
                up: this._handleDragUp.bind(this),
            },
            [OP_TYPES.RESIZE]: {
                move: this._handleResizeMove.bind(this),
                up: this._handleResizeUp.bind(this),
            },
            [OP_TYPES.DRAG_CREATE]: {
                move: this._handleDragCreateMove.bind(this),
                up: this._handleDragCreateUp.bind(this),
            },
        };
        
        this._init();
    }

    _init() {
        this._addEventListeners();
    }
    
    _addEventListeners() {
        this.canvasEl.onmousedown = this._handleCanvasMouseDown.bind(this);
        this.canvasEl.onwheel = this._handleWheel.bind(this);
        this.canvasEl.ondblclick = this._handleCanvasDblClick.bind(this);
        this.canvasEl.oncontextmenu = (e) => {
            if (!['TEXTAREA', 'INPUT'].includes(e.target.nodeName)) e.preventDefault();
        };

        document.addEventListener('mousemove', this._handleGlobalMouseMove.bind(this));
        document.addEventListener('mouseup', this._handleGlobalMouseUp.bind(this));

        this.worldEl.addEventListener('mousedown', this._handleBoxMouseDown.bind(this));
        this.worldEl.addEventListener('dblclick', this._handleTitleDblClick.bind(this));
        this.worldEl.addEventListener('focusout', this._handleTitleBlur.bind(this));
        this.worldEl.addEventListener('keydown', this._handleTitleKeyDown.bind(this));
        
        this.renderer.contextMenu.addEventListener('mousedown', this._handleMenuClick.bind(this));
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
    
    _getWorldMouseCoordinates(canvasPos) {
        const { pan, zoom } = this.stateManager.state;
        return {
            x: (canvasPos.x - pan.x) / zoom,
            y: (canvasPos.y - pan.y) / zoom
        };
    }

    _handleGlobalMouseMove(e) {
        if (!this.activeOperation) return;
        e.preventDefault();
        e.stopPropagation();
        this.operationHandlers[this.activeOperation.type]?.move(e);
    }
    
    _handleGlobalMouseUp(e) {
        if (!this.activeOperation) return;
        e.preventDefault();
        e.stopPropagation();
        this.operationHandlers[this.activeOperation.type]?.up(e);
    }
    
    _endOperation() {
        this.activeOperation = null;
        this.canvasEl.style.cursor = '';
    }

    _handleCanvasMouseDown(e) {
        this.renderer.hideCreationMenu();
        if (e.target.closest(`${SELECTORS.TOOLBAR}, ${SELECTORS.BOX}`)) return;

        if (e.button === 0) this._startDragCreate(e);
        if (e.button === 1 || e.button === 2) this._startPan(e);
    }
    
    _handleCanvasDblClick(e) {
        if (e.target.closest(`${SELECTORS.TOOLBAR}, ${SELECTORS.BOX}`)) return;
        e.preventDefault();
        const mouse = this._getCanvasMousePosition(e);
        this.renderer.showCreationMenu(mouse.x, mouse.y);
    }

    _handleWheel(e) {
        e.preventDefault();
        const state = this.stateManager.state;
        const mouse = this._getCanvasMousePosition(e);
        
        const mouseWorld = this._getWorldMouseCoordinates(mouse);
    
        const zoomFactor = 1 - e.deltaY * 0.001;
        const newZoom = Math.max(0.1, Math.min(5, state.zoom * zoomFactor));
    
        state.pan.x = mouse.x - mouseWorld.x * newZoom;
        state.pan.y = mouse.y - mouseWorld.y * newZoom;
        state.zoom = newZoom;
    
        this.stateManager.save();
        this.renderer.render();
    }

    _handleBoxMouseDown(e) {
        const boxEl = e.target.closest(SELECTORS.BOX);
        if (!boxEl) return;

        const box = this.stateManager.getBoxById(boxEl.dataset.boxId);
        if (!box) return;

        if (e.target.classList.contains(SELECTORS.RESIZE_HANDLE.substring(1))) {
            this._startResize(e, box, boxEl);
            return;
        }
        
        if (e.target.closest(SELECTORS.HEADER)) {
            
            if (e.target.closest('button')) {
                this._handleHeaderButtonClick(e, box);
            }
            else {
                const titleInput = boxEl.querySelector(SELECTORS.TITLE);
                if (titleInput?.readOnly) {
                    this._startDrag(e, box, boxEl);
                }
            }
        }
    }

    _handleHeaderButtonClick(e, box) {
        e.stopPropagation();
        switch (e.target.title) {
            case 'Minimize':
                this._toggleMinimize(box);
                break;
            case 'Maximize':
                this._toggleMaximize(box);
                break;
            case 'Close':
                this.stateManager.deleteBox(box.id);
                break;
        }
        this.renderer.render();
    }

    _handleMenuClick(e) {
        e.stopPropagation();
        const item = e.target.closest(SELECTORS.MENU_ITEM);
        if (!item) return;

        const boxType = item.dataset.boxType;
        this.stateManager.lastSelectedBoxType = boxType;

        const menuRect = this.renderer.contextMenu.getBoundingClientRect();
        const canvasRect = this.canvasEl.getBoundingClientRect();
        
        const worldCoords = this._getWorldMouseCoordinates({ 
            x: menuRect.left - canvasRect.left, 
            y: menuRect.top - canvasRect.top 
        });
        
        this.stateManager.createNewBox(boxType, worldCoords.x, worldCoords.y);
        this.renderer.hideCreationMenu();
        this.renderer.render();
    }

    _handleTitleDblClick(e) {
        const titleInput = e.target;
        if (!titleInput.classList.contains(SELECTORS.TITLE.substring(1))) return;
        e.stopPropagation();
        titleInput.readOnly = false;
        titleInput.focus();
        titleInput.select();
    }

    _handleTitleBlur(e) {
        const titleInput = e.target;
        if (!titleInput.classList.contains(SELECTORS.TITLE.substring(1))) return;
        
        titleInput.readOnly = true;
        const boxEl = titleInput.closest(SELECTORS.BOX);
        const box = this.stateManager.getBoxById(boxEl.dataset.boxId);
        if (box && box.title !== titleInput.value) {
            box.title = titleInput.value;
            this.stateManager.save();
        }
    }
    
    _handleTitleKeyDown(e) {
        if (e.key === "Enter" && e.target.classList.contains(SELECTORS.TITLE.substring(1))) {
            e.preventDefault();
            e.target.blur();
        }
    }

    _startPan(e) {
        e.stopPropagation();
        this.canvasEl.style.cursor = 'grabbing';
        this.activeOperation = {
            type: OP_TYPES.PAN,
            startMouse: this._getCanvasMousePosition(e),
            startPan: { ...this.stateManager.state.pan }
        };
    }
    
    _startDrag(e, box, boxEl) {
        if (e.button !== 0 || box.displayState === 'maximized') return;
        e.stopPropagation();
        
        const canvasMouse = this._getCanvasMousePosition(e);
        const worldMouse = this._getWorldMouseCoordinates(canvasMouse);

        this.activeOperation = {
            type: OP_TYPES.DRAG, box, boxEl,
            isDragging: false,
            startMouse: canvasMouse,
            offset: { x: worldMouse.x - box.x, y: worldMouse.y - box.y }
        };
    }

    _startResize(e, box, boxEl) {
        if (e.button !== 0) return;
        e.stopPropagation();
        this.activeOperation = {
            type: OP_TYPES.RESIZE, box, boxEl,
            startMouse: this._getCanvasMousePosition(e),
            startSize: { w: box.width, h: box.height }
        };
    }

    _startDragCreate(e) {
        const startCoords = this._getWorldMouseCoordinates(this._getCanvasMousePosition(e));
        
        const selectionBoxEl = document.createElement('div');
        selectionBoxEl.style.cssText = `position: absolute; border: 1px dashed #fff; pointer-events: none; z-index: 100;`;
        this.worldEl.appendChild(selectionBoxEl);
        
        selectionBoxEl.style.left = `${startCoords.x}px`;
        selectionBoxEl.style.top = `${startCoords.y}px`;

        this.activeOperation = { type: OP_TYPES.DRAG_CREATE, startCoords, selectionBoxEl };
    }

    _handlePanMove(e) {
        const { startMouse, startPan } = this.activeOperation;
        const mouse = this._getCanvasMousePosition(e);
        const dx = mouse.x - startMouse.x;
        const dy = mouse.y - startMouse.y;
        
        this.stateManager.state.pan.x = startPan.x + dx;
        this.stateManager.state.pan.y = startPan.y + dy;
        this.renderer.render();
    }

    _handleDragMove(e) {
        const op = this.activeOperation;
        const mouse = this._getCanvasMousePosition(e);
        
        if (!op.isDragging) {
            const dx = mouse.x - op.startMouse.x;
            const dy = mouse.y - op.startMouse.y;
            if (Math.sqrt(dx * dx + dy * dy) > 3) {
                op.isDragging = true;
                op.boxEl.style.zIndex = 10;
            }
        }

        if (op.isDragging) {
            const worldMouse = this._getWorldMouseCoordinates(mouse);
            op.box.x = worldMouse.x - op.offset.x;
            op.box.y = worldMouse.y - op.offset.y;
            op.boxEl.style.left = op.box.x + 'px';
            op.boxEl.style.top = op.box.y + 'px';
        }
    }

    _handleDragUp() {
        const { box, boxEl, isDragging } = this.activeOperation;
        if (isDragging) {
            box.x = this.stateManager.snapToGrid(box.x);
            box.y = this.stateManager.snapToGrid(box.y);
            boxEl.style.zIndex = 1;
            this.stateManager.save();
            this.renderer.render();
        }
        this._endOperation();
    }

    _handleResizeMove(e) {
        const { box, boxEl, startMouse, startSize } = this.activeOperation;
        const mouse = this._getCanvasMousePosition(e);
        const { zoom } = this.stateManager.state;

        const dx = (mouse.x - startMouse.x) / zoom;
        const dy = (mouse.y - startMouse.y) / zoom;
        
        let minWidth = 150;
        let minHeight = 80;

        switch(box.type) {
            case 'area':
                minWidth = 500;
                minHeight = 500;
                break;
            case 'controls':
                minWidth = 300;
                minHeight = 200;
                break;
            case 'text':
            default:
                minWidth = 200;
                minHeight = 100;
                break;
        }
        
        box.width = Math.max(minWidth, startSize.w + dx);
        box.height = Math.max(minHeight, startSize.h + dy);

        boxEl.style.width = box.width + 'px';
        boxEl.style.height = box.height + 'px';
    }

    _handleResizeUp() {
        const { box } = this.activeOperation;
        box.width = this.stateManager.snapToGrid(box.width);
        box.height = this.stateManager.snapToGrid(box.height);
        this.stateManager.save();
        this.renderer.render();
        this._endOperation();
    }

    _handleDragCreateMove(e) {
        const { startCoords, selectionBoxEl } = this.activeOperation;
        const worldMouse = this._getWorldMouseCoordinates(this._getCanvasMousePosition(e));
        
        const box = { 
            x: Math.min(startCoords.x, worldMouse.x), 
            y: Math.min(startCoords.y, worldMouse.y), 
            w: Math.abs(startCoords.x - worldMouse.x), 
            h: Math.abs(startCoords.y - worldMouse.y) 
        };

        selectionBoxEl.style.left = `${box.x}px`;
        selectionBoxEl.style.top = `${box.y}px`;
        selectionBoxEl.style.width = `${box.w}px`;
        selectionBoxEl.style.height = `${box.h}px`;
    }

    _handleDragCreateUp(e) {
        const { startCoords, selectionBoxEl } = this.activeOperation;
        selectionBoxEl.remove();

        const worldMouse = this._getWorldMouseCoordinates(this._getCanvasMousePosition(e));
        const width = Math.abs(startCoords.x - worldMouse.x);
        const height = Math.abs(startCoords.y - worldMouse.y);

        if (width > 20 && height > 20) {
            const worldX = Math.min(startCoords.x, worldMouse.x);
            const worldY = Math.min(startCoords.y, worldMouse.y);
            this.stateManager.createNewBox(this.stateManager.lastSelectedBoxType, worldX, worldY, width, height);
            this.renderer.render();
        }
        this._endOperation();
    }

    _handleOperationEnd() {
        this.stateManager.save();
        this.renderer.render();
        this._endOperation();
    }

    _toggleMinimize(box) {
        if (box.displayState === "minimized") {
            box.displayState = "normal";
        } else {
            if (box.displayState === "maximized") this.stateManager.unmaximize(box);
            box.displayState = "minimized";
        }
        this.stateManager.save();
    }

    _toggleMaximize(box) {
        const state = this.stateManager.state;
        if (box.displayState === "maximized") {
            this.stateManager.unmaximize(box);
            box.displayState = "normal";
        } else {
            if (box.displayState === 'normal') {
                box.old = { x: box.x, y: box.y, width: box.width, height: box.height };
            }
            if (!state.savedView) {
                state.savedView = { pan: { ...state.pan }, zoom: state.zoom };
            }
            box.displayState = "maximized";
        }
        this.stateManager.save();
    }
}