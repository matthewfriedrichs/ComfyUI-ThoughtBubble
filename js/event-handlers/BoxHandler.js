export class BoxHandler {
    constructor(worldEl, stateManager, renderer, setActiveOperation, getCanvasMousePos, getWorldMouseCoords) {
        this.worldEl = worldEl;
        this.stateManager = stateManager;
        this.renderer = renderer;
        this.setActiveOperation = setActiveOperation;
        this.getCanvasMousePos = getCanvasMousePos;
        this.getWorldMouseCoords = getWorldMouseCoords;

        worldEl.addEventListener('mousedown', this.handleMouseDown.bind(this));
        worldEl.addEventListener('dblclick', this.handleTitleDblClick.bind(this));
        worldEl.addEventListener('focusout', this.handleTitleBlur.bind(this));
        worldEl.addEventListener('keydown', this.handleTitleKeyDown.bind(this));
    }

    handleMouseDown(e) {
        const boxEl = e.target.closest('.thought-bubble-box');
        if (!boxEl) return;

        e.stopPropagation(); 
        const box = this.stateManager.getBoxById(boxEl.dataset.boxId);
        if (!box) return;

        if (e.target.classList.contains('thought-bubble-box-resize-handle')) {
            this.startResize(e, box, boxEl);
        } else if (e.target.closest('.thought-bubble-box-header')) {
            if (e.target.closest('button')) {
                this.handleHeaderButtonClick(e, box);
            } else {
                const titleInput = boxEl.querySelector('.thought-bubble-box-title');
                if (titleInput?.readOnly) {
                    this.startDrag(e, box, boxEl);
                }
            }
        }
    }
    
    startDrag(e, box, boxEl) {
        if (e.button !== 0 || box.displayState === 'maximized') return;
        
        const canvasMouse = this.getCanvasMousePos(e);
        const worldMouse = this.getWorldMouseCoords(canvasMouse);

        this.setActiveOperation({
            type: 'drag', handler: this, box, boxEl, isDragging: false,
            startMouse: canvasMouse,
            offset: { x: worldMouse.x - box.x, y: worldMouse.y - box.y }
        });
    }

    startResize(e, box, boxEl) {
        if (e.button !== 0) return;
        this.setActiveOperation({
            type: 'resize', handler: this, box, boxEl,
            startMouse: this.getCanvasMousePos(e),
            startSize: { w: box.width, h: box.height }
        });
    }

    handleMouseMove(e, op) {
        const mouse = this.getCanvasMousePos(e);
        const { box, boxEl } = op;

        switch(op.type) {
            case 'drag':
                if (!op.isDragging) {
                    const dx = mouse.x - op.startMouse.x;
                    const dy = mouse.y - op.startMouse.y;
                    if (Math.sqrt(dx * dx + dy * dy) > 3) {
                        op.isDragging = true;
                        boxEl.style.zIndex = 10;
                    }
                }
                if (op.isDragging) {
                    const worldMouse = this.getWorldMouseCoords(mouse);
                    box.x = worldMouse.x - op.offset.x;
                    box.y = worldMouse.y - op.offset.y;
                    boxEl.style.left = box.x + 'px';
                    boxEl.style.top = box.y + 'px';
                }
                break;
            case 'resize':
                const { zoom } = this.stateManager.state;
                const dx = (mouse.x - op.startMouse.x) / zoom;
                const dy = (mouse.y - op.startMouse.y) / zoom;
                let minWidth = 150, minHeight = 80;
                switch(box.type) {
                    case 'area': minWidth = 500; minHeight = 500; break;
                    case 'controls': minWidth = 300; minHeight = 200; break;
                    case 'text': default: minWidth = 200; minHeight = 100; break;
                }
                box.width = Math.max(minWidth, op.startSize.w + dx);
                box.height = Math.max(minHeight, op.startSize.h + dy);
                boxEl.style.width = box.width + 'px';
                boxEl.style.height = box.height + 'px';
                break;
        }
    }

    handleMouseUp(e, op) {
        const { box, boxEl, isDragging } = op;
        switch(op.type) {
            case 'drag':
                if (isDragging) {
                    box.x = this.stateManager.snapToGrid(box.x);
                    box.y = this.stateManager.snapToGrid(box.y);
                    boxEl.style.zIndex = 1;
                    this.stateManager.save();
                    this.renderer.render();
                }
                break;
            case 'resize':
                box.width = this.stateManager.snapToGrid(box.width);
                box.height = this.stateManager.snapToGrid(box.height);
                this.stateManager.save();
                this.renderer.render();
                break;
        }
    }

    handleHeaderButtonClick(e, box) {
        e.stopPropagation();
        switch (e.target.title) {
            case 'Minimize':
                if (box.displayState === "minimized") {
                    box.displayState = "normal";
                } else {
                    if (box.displayState === "maximized") this.stateManager.unmaximize(box);
                    box.displayState = "minimized";
                }
                break;
            case 'Maximize':
                if (box.displayState === "maximized") {
                    this.stateManager.unmaximize(box);
                    box.displayState = "normal";
                } else {
                    if (box.displayState === 'normal') box.old = { x: box.x, y: box.y, width: box.width, height: box.height };
                    if (!this.stateManager.state.savedView) this.stateManager.state.savedView = { pan: { ...this.stateManager.state.pan }, zoom: this.stateManager.state.zoom };
                    box.displayState = "maximized";
                }
                break;
            case 'Close':
                this.stateManager.deleteBox(box.id);
                break;
        }
        this.stateManager.save();
        this.renderer.render();
    }

    handleTitleDblClick(e) {
        const titleInput = e.target;
        if (!titleInput.classList.contains('thought-bubble-box-title')) return;
        e.stopPropagation();
        titleInput.readOnly = false;
        titleInput.focus();
        titleInput.select();
    }

    handleTitleBlur(e) {
        const titleInput = e.target;
        if (!titleInput.classList.contains('thought-bubble-box-title')) return;
        
        titleInput.readOnly = true;
        const boxEl = titleInput.closest('.thought-bubble-box');
        const box = this.stateManager.getBoxById(boxEl.dataset.boxId);
        if (box && box.title !== titleInput.value) {
            box.title = titleInput.value;
            this.stateManager.save();
        }
    }
    
    handleTitleKeyDown(e) {
        if (e.key === "Enter" && e.target.classList.contains('thought-bubble-box-title')) {
            e.preventDefault();
            e.target.blur();
        }
    }
}