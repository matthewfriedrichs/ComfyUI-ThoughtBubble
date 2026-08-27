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
        // Isolate all wheel events from ComfyUI's canvas
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Allow textarea/input scrollbars to scroll naturally without zooming the canvas
        if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") {
            const hasScroll = e.target.scrollHeight > e.target.clientHeight;
            if (hasScroll) return;
        }

        const state = this.stateManager.state;
        const mouse = this.getCanvasMousePos(e);
        const mouseWorld = this.getWorldMouseCoords(mouse);

        const zoomFactor = 1 - e.deltaY * 0.001;
        const newZoom = Math.max(0.1, Math.min(4.0, state.zoom * zoomFactor));

        state.pan.x = mouse.x - mouseWorld.x * newZoom;
        state.pan.y = mouse.y - mouseWorld.y * newZoom;
        state.zoom = newZoom;

        this.stateManager.saveDebounced(300);
        this.renderer.updateView();
    }

    startPan(e) {
        e.stopPropagation();
        this.renderer.canvasEl.style.cursor = "grabbing";
        this.setActiveOperation({
            type: "pan",
            handler: this,
            startMouse: this.getCanvasMousePos(e),
            startPan: { ...this.stateManager.state.pan }
        });
    }

    startDragCreate(e) {
        const startCoords = this.getWorldMouseCoords(this.getCanvasMousePos(e));
        const selectionBoxEl = document.createElement("div");
        selectionBoxEl.style.cssText = "position: absolute; border: 1px dashed var(--tb-accent-color); pointer-events: none; z-index: 100;";
        this.renderer.worldEl.appendChild(selectionBoxEl);

        selectionBoxEl.style.left = `${startCoords.x}px`;
        selectionBoxEl.style.top = `${startCoords.y}px`;
        this.setActiveOperation({ type: "drag-create", handler: this, startCoords, selectionBoxEl });
    }

    handleMouseMove(e, op) {
        const mouse = this.getCanvasMousePos(e);
        if (op.type === "pan") {
            const dx = mouse.x - op.startMouse.x;
            const dy = mouse.y - op.startMouse.y;
            this.stateManager.state.pan.x = op.startPan.x + dx;
            this.stateManager.state.pan.y = op.startPan.y + dy;
            this.renderer.updateView();
        } else if (op.type === "drag-create") {
            const worldMouse = this.getWorldMouseCoords(mouse);
            op.selectionBoxEl.style.left = `${Math.min(op.startCoords.x, worldMouse.x)}px`;
            op.selectionBoxEl.style.top = `${Math.min(op.startCoords.y, worldMouse.y)}px`;
            op.selectionBoxEl.style.width = `${Math.abs(op.startCoords.x - worldMouse.x)}px`;
            op.selectionBoxEl.style.height = `${Math.abs(op.startCoords.y - worldMouse.y)}px`;
        }
    }

    handleMouseUp(e, op) {
        this.renderer.canvasEl.style.cursor = "";
        if (op.type === "pan") {
            this.stateManager.save();
            this.renderer.updateView();
        } else if (op.type === "drag-create") {
            op.selectionBoxEl.remove();
            const worldMouse = this.getWorldMouseCoords(this.getCanvasMousePos(e));
            const width = Math.abs(op.startCoords.x - worldMouse.x);
            const height = Math.abs(op.startCoords.y - worldMouse.y);

            if (width > 30 && height > 30) {
                const worldX = Math.min(op.startCoords.x, worldMouse.x);
                const worldY = Math.min(op.startCoords.y, worldMouse.y);
                this.stateManager.createNewBox("text", worldX, worldY, width, height);
                this.renderer.render();
            }
        }
    }
}