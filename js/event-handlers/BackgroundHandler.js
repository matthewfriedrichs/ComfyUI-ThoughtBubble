export class BackgroundHandler {
    constructor(stateManager, renderer, setActiveOperation, getCanvasMousePos, getWorldMouseCoords) {
        this.stateManager = stateManager;
        this.renderer = renderer;
        this.setActiveOperation = setActiveOperation;
        this.getCanvasMousePos = getCanvasMousePos;
        this.getWorldMouseCoords = getWorldMouseCoords;
    }

    handleMouseDown(e) {
        this.renderer.hideCreationMenu();
        if (e.button === 0) {
            this.startDragCreate(e);
        } else if (e.button === 1 || e.button === 2) {
            this.startPan(e);
        }
    }

    handleDblClick(e) {
        const mouse = this.getCanvasMousePos(e);
        this.renderer.showCreationMenu(mouse.x, mouse.y);
    }

    handleWheel(e) {
        // --- FIX: Respect scrollable elements ---
        if (this.isEventTargetScrollable(e)) {
            // Do NOT preventDefault(); let the browser scroll the element.
            // Do NOT zoom.
            return;
        }

        e.preventDefault();
        const state = this.stateManager.state;
        const mouse = this.getCanvasMousePos(e);
        const mouseWorld = this.getWorldMouseCoords(mouse);

        const zoomFactor = 1 - e.deltaY * 0.001;
        const newZoom = Math.max(0.1, Math.min(5, state.zoom * zoomFactor));

        state.pan.x = mouse.x - mouseWorld.x * newZoom;
        state.pan.y = mouse.y - mouseWorld.y * newZoom;
        state.zoom = newZoom;

        this.stateManager.save();
        this.renderer.updateView();
    }

    // --- NEW: Helper to detect if we should allow scrolling instead of zooming ---
    isEventTargetScrollable(e) {
        let el = e.target;

        // Traverse up the DOM tree from the target to the canvas root
        while (el && el !== this.renderer.canvasEl) {
            // 1. Always scroll standard input elements
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true;

            // 2. Check for generic scrollable containers (divs with overflow)
            const style = window.getComputedStyle(el);
            const isScrollableY = ['auto', 'scroll'].includes(style.overflowY) && el.scrollHeight > el.clientHeight;
            const isScrollableX = ['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth;

            if (isScrollableY || isScrollableX) return true;

            el = el.parentElement;
        }
        return false;
    }

    startPan(e) {
        e.stopPropagation();
        this.renderer.canvasEl.style.cursor = 'grabbing';
        this.setActiveOperation({
            type: 'pan',
            handler: this,
            startMouse: this.getCanvasMousePos(e),
            startPan: { ...this.stateManager.state.pan }
        });
    }

    startDragCreate(e) {
        const startCoords = this.getWorldMouseCoords(this.getCanvasMousePos(e));
        const selectionBoxEl = document.createElement('div');
        selectionBoxEl.style.cssText = `position: absolute; border: 1px dashed #fff; pointer-events: none; z-index: 100;`;
        this.renderer.worldEl.appendChild(selectionBoxEl);
        selectionBoxEl.style.left = `${startCoords.x}px`;
        selectionBoxEl.style.top = `${startCoords.y}px`;

        this.setActiveOperation({ type: 'drag-create', handler: this, startCoords, selectionBoxEl });
    }

    handleMouseMove(e, op) {
        const mouse = this.getCanvasMousePos(e);
        switch (op.type) {
            case 'pan': {
                const dx = mouse.x - op.startMouse.x;
                const dy = mouse.y - op.startMouse.y;
                this.stateManager.state.pan.x = op.startPan.x + dx;
                this.stateManager.state.pan.y = op.startPan.y + dy;
                this.renderer.updateView();
                break;
            }
            case 'drag-create': {
                const worldMouse = this.getWorldMouseCoords(mouse);
                const box = {
                    x: Math.min(op.startCoords.x, worldMouse.x),
                    y: Math.min(op.startCoords.y, worldMouse.y),
                    w: Math.abs(op.startCoords.x - worldMouse.x),
                    h: Math.abs(op.startCoords.y - worldMouse.y)
                };
                op.selectionBoxEl.style.left = `${box.x}px`;
                op.selectionBoxEl.style.top = `${box.y}px`;
                op.selectionBoxEl.style.width = `${box.w}px`;
                op.selectionBoxEl.style.height = `${box.h}px`;
                break;
            }
        }
    }

    handleMouseUp(e, op) {
        this.renderer.canvasEl.style.cursor = '';
        switch (op.type) {
            case 'pan':
                this.stateManager.save();
                this.renderer.updateView();
                break;
            case 'drag-create': {
                op.selectionBoxEl.remove();
                const worldMouse = this.getWorldMouseCoords(this.getCanvasMousePos(e));
                const width = Math.abs(op.startCoords.x - worldMouse.x);
                const height = Math.abs(op.startCoords.y - worldMouse.y);
                if (width > 20 && height > 20) {
                    const worldX = Math.min(op.startCoords.x, worldMouse.x);
                    const worldY = Math.min(op.startCoords.y, worldMouse.y);
                    this.stateManager.createNewBox(this.stateManager.lastSelectedBoxType, worldX, worldY, width, height);
                    this.renderer.render();
                }
                break;
            }
        }
    }
}