// js/box-types/areaBox.js

import { BaseBox } from "./baseBox.js";
import { TextBox } from "./textBox.js";

export class AreaConditioningBox extends BaseBox {
    constructor(options) {
        super(options);
        this.data = this.boxData; // Alias for clarity
        this.dom = {}; // To store DOM elements
        this.clickCycle = { region: null, count: 0 }; // Tracks double-click cycles

        // Capture properties needed for the rich text editor
        this.setLastActiveTextarea = options.setLastActiveTextarea;
        this.canvasEl = options.canvasEl;

        // Initialize state for the new features
        if (this.data.verticalSplit === undefined) this.data.verticalSplit = 0.5;
        if (this.data.commandLinks === undefined) this.data.commandLinks = {};
    }

    render(contentEl) {
        contentEl.className = "thought-bubble-box-content area-conditioning";

        this.dom.topToolbar = document.createElement("div"); this.dom.topToolbar.className = "ac-toolbar";
        this.dom.mainContent = document.createElement("div"); this.dom.mainContent.className = "ac-main-content";

        this.createTopToolbar();
        this.createMainContent();

        contentEl.append(this.dom.topToolbar, this.dom.mainContent);

        this.updateInputs();
        this.scheduleDraw();
    }

    createTopToolbar() {
        const createControlGroup = (labelText, inputEl) => {
            const group = document.createElement('div');
            group.className = 'ac-control-group';
            const label = document.createElement("label");
            label.textContent = labelText;
            group.append(label, inputEl);
            return group;
        };

        this.dom.imageWidthInput = document.createElement("input");
        this.dom.imageWidthInput.type = "number";
        this.dom.imageWidthInput.onchange = (e) => this.updateState('imageWidth', parseInt(e.target.value));

        this.dom.imageHeightInput = document.createElement("input");
        this.dom.imageHeightInput.type = "number";
        this.dom.imageHeightInput.onchange = (e) => this.updateState('imageHeight', parseInt(e.target.value));

        this.dom.areaXInput = document.createElement("input");
        this.dom.areaXInput.type = "number";
        this.dom.areaXInput.onchange = (e) => this.updateState('areaX', parseInt(e.target.value));

        this.dom.areaYInput = document.createElement("input");
        this.dom.areaYInput.type = "number";
        this.dom.areaYInput.onchange = (e) => this.updateState('areaY', parseInt(e.target.value));

        this.dom.areaWidthInput = document.createElement("input");
        this.dom.areaWidthInput.type = "number";
        this.dom.areaWidthInput.onchange = (e) => this.updateState('areaWidth', parseInt(e.target.value));

        this.dom.areaHeightInput = document.createElement("input");
        this.dom.areaHeightInput.type = "number";
        this.dom.areaHeightInput.onchange = (e) => this.updateState('areaHeight', parseInt(e.target.value));

        this.dom.strengthInput = document.createElement("input");
        this.dom.strengthInput.type = "number";
        this.dom.strengthInput.step = "0.1";
        this.dom.strengthInput.onchange = (e) => this.updateState('strength', parseFloat(e.target.value));

        this.dom.topToolbar.append(
            createControlGroup("Image Width:", this.dom.imageWidthInput),
            createControlGroup("Image Height:", this.dom.imageHeightInput),
            createControlGroup("X:", this.dom.areaXInput),
            createControlGroup("Y:", this.dom.areaYInput),
            createControlGroup("W:", this.dom.areaWidthInput),
            createControlGroup("H:", this.dom.areaHeightInput),
            createControlGroup("Strength:", this.dom.strengthInput)
        );
    }

    createMainContent() {
        this.dom.canvasContainer = document.createElement("div"); this.dom.canvasContainer.className = "ac-canvas-container";
        this.dom.canvas = document.createElement("canvas");
        this.dom.canvasContainer.appendChild(this.dom.canvas);

        const divider = document.createElement("div"); divider.className = "ac-divider";
        this.addDividerListeners(divider);

        this.dom.textareaContainer = document.createElement("div");
        this.dom.textareaContainer.className = "ac-textarea-container";

        // Set initial panel sizes based on saved state
        const splitPercentage = this.data.verticalSplit * 100;
        this.dom.canvasContainer.style.flexBasis = `${splitPercentage}%`;
        this.dom.textareaContainer.style.flexBasis = `${100 - splitPercentage}%`;

        // Instantiate the full-featured TextBox
        this.textBox = new TextBox({
            boxData: this.data,
            requestSave: this.requestSave,
            setLastActiveTextarea: this.setLastActiveTextarea,
            canvasEl: this.canvasEl
        });
        this.textBox.render(this.dom.textareaContainer);

        this.dom.mainContent.append(this.dom.canvasContainer, divider, this.dom.textareaContainer);

        this.ctx = this.dom.canvas.getContext('2d');
        this.addCanvasListeners();
    }

    // --- LIFECYCLE CLEANUP ---
    destroy() {
        if (this.textBox && typeof this.textBox.destroy === 'function') {
            this.textBox.destroy();
        }
    }

    addDividerListeners(divider) {
        divider.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startCanvasWidth = this.dom.canvasContainer.offsetWidth;
            const totalWidth = this.dom.mainContent.offsetWidth;

            const onMouseMove = (moveE) => {
                const dx = moveE.clientX - startX;
                let newCanvasWidth = startCanvasWidth + dx;

                // --- CAPPING LOGIC ---
                const canvasContainerHeight = this.dom.canvasContainer.offsetHeight;
                if (this.data.imageHeight > 0 && canvasContainerHeight > 0) {
                    const imageAspectRatio = this.data.imageWidth / this.data.imageHeight;
                    const maxUsefulCanvasWidth = canvasContainerHeight * imageAspectRatio;

                    if (newCanvasWidth > maxUsefulCanvasWidth) {
                        newCanvasWidth = maxUsefulCanvasWidth;
                    }
                }

                this.data.verticalSplit = Math.max(0.1, Math.min(0.9, newCanvasWidth / totalWidth));

                const splitPercentage = this.data.verticalSplit * 100;
                this.dom.canvasContainer.style.flexBasis = `${splitPercentage}%`;
                this.dom.textareaContainer.style.flexBasis = `${100 - splitPercentage}%`;
                this.scheduleDraw();
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                this.requestSave();
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    updateState(key, value) {
        this.data[key] = value;
        this.requestSave();
        this.scheduleDraw();
        this.updateInputs();
    }

    updateInputs() {
        this.dom.imageWidthInput.value = this.data.imageWidth;
        this.dom.imageHeightInput.value = this.data.imageHeight;
        this.dom.areaXInput.value = this.data.areaX;
        this.dom.areaYInput.value = this.data.areaY;
        this.dom.areaWidthInput.value = this.data.areaWidth;
        this.dom.areaHeightInput.value = this.data.areaHeight;
        this.dom.strengthInput.value = this.data.strength;
    }

    scheduleDraw() { requestAnimationFrame(() => this.draw()); }

    draw() {
        this.drawCanvas();
        this.adjustSplitOnResize();
        this.drawHandles();
    }

    adjustSplitOnResize() {
        if (!this.dom.mainContent || this.dom.mainContent.offsetWidth === 0) return;

        const totalWidth = this.dom.mainContent.offsetWidth;
        const canvasContainerHeight = this.dom.canvasContainer.offsetHeight;

        if (this.data.imageHeight > 0 && canvasContainerHeight > 0) {
            const imageAspectRatio = this.data.imageWidth / this.data.imageHeight;
            const maxUsefulCanvasWidth = canvasContainerHeight * imageAspectRatio;
            const currentCanvasWidth = this.dom.canvasContainer.offsetWidth;

            if (currentCanvasWidth > maxUsefulCanvasWidth) {
                this.data.verticalSplit = maxUsefulCanvasWidth / totalWidth;
                this.data.verticalSplit = Math.max(0.1, Math.min(0.9, this.data.verticalSplit));

                const splitPercentage = this.data.verticalSplit * 100;
                this.dom.canvasContainer.style.flexBasis = `${splitPercentage}%`;
                this.dom.textareaContainer.style.flexBasis = `${100 - splitPercentage}%`;
            }
        }
    }

    drawCanvas() {
        const canvas = this.dom.canvas;
        const parent = canvas.parentElement;
        if (!parent) return;

        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;

        const imgW = this.data.imageWidth, imgH = this.data.imageHeight;
        if (!imgW || !imgH) return;

        const canvasAspect = canvas.width / canvas.height;
        const imageAspect = imgW / imgH;

        let drawW, drawH, offsetX, offsetY;
        if (canvasAspect > imageAspect) {
            drawH = canvas.height;
            drawW = drawH * imageAspect;
            offsetY = 0; offsetX = (canvas.width - drawW) / 2;
        } else {
            drawW = canvas.width;
            drawH = drawW / imageAspect;
            offsetX = 0; offsetY = (canvas.height - drawH) / 2;
        }

        this.imageRect = { x: offsetX, y: offsetY, w: drawW, h: drawH };
        this.scale = drawW / imgW;

        this.ctx.clearRect(0, 0, canvas.width, canvas.height);
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)"; this.ctx.lineWidth = 1;
        this.ctx.strokeRect(offsetX, offsetY, drawW, drawH);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
        this.ctx.font = "12px sans-serif";
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        this.ctx.fillText(`${imgW} x ${imgH}`, offsetX + 5, offsetY + 5);

        const isActive = this.activeDrag && this.activeDrag.isDragging;
        this.ctx.fillStyle = isActive ? "rgba(150, 200, 255, 0.7)" : "rgba(100, 150, 255, 0.5)";
        this.ctx.strokeStyle = isActive ? "rgb(150, 200, 255)" : "rgb(100, 150, 255)";
        this.ctx.lineWidth = isActive ? 2 : 1;

        const areaX = offsetX + this.data.areaX * this.scale;
        const areaY = offsetY + this.data.areaY * this.scale;
        const areaW = this.data.areaWidth * this.scale;
        const areaH = this.data.areaHeight * this.scale;

        this.ctx.fillRect(areaX, areaY, areaW, areaH);
        this.ctx.strokeRect(areaX, areaY, areaW, areaH);
    }

    drawHandles() {
        this.dom.canvasContainer.querySelectorAll('.ac-resize-handle').forEach(h => h.remove());
        if (!this.imageRect) return;

        const { x: imgX, y: imgY } = this.imageRect;
        const { areaX, areaY, areaWidth, areaHeight } = this.data;

        const scaledX = imgX + areaX * this.scale;
        const scaledY = imgY + areaY * this.scale;
        const scaledW = areaWidth * this.scale;
        const scaledH = areaHeight * this.scale;

        const handlePositions = {
            'nw': { left: scaledX, top: scaledY }, 'n': { left: scaledX + scaledW / 2, top: scaledY },
            'ne': { left: scaledX + scaledW, top: scaledY }, 'e': { left: scaledX + scaledW, top: scaledY + scaledH / 2 },
            'se': { left: scaledX + scaledW, top: scaledY + scaledH }, 's': { left: scaledX + scaledW / 2, top: scaledY + scaledH },
            'sw': { left: scaledX, top: scaledY + scaledH }, 'w': { left: scaledX, top: scaledY + scaledH / 2 },
        };

        for (const [key, pos] of Object.entries(handlePositions)) {
            const handle = document.createElement('div');
            handle.className = `ac-resize-handle ac-handle-${key}`;
            handle.dataset.handle = key;
            handle.style.cssText = `left: ${pos.left}px; top: ${pos.top}px; transform: translate(-50%, -50%);`;
            this.dom.canvasContainer.appendChild(handle);
        }
    }

    addCanvasListeners() {
        const DRAG_THRESHOLD = 5;
        this.activeDrag = null;

        const onMouseMove = (e) => {
            if (!this.activeDrag) return;
            e.stopPropagation();

            const mouse = this.getMousePos(e);
            const dx = mouse.x - this.activeDrag.startX;
            const dy = mouse.y - this.activeDrag.startY;

            if (!this.activeDrag.isDragging && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
                this.activeDrag.isDragging = true;
            }
            if (!this.activeDrag.isDragging) return;

            const { initialState } = this.activeDrag;
            const { imageWidth, imageHeight } = this.data;
            const MIN_SIZE = 8;

            switch (this.activeDrag.type) {
                case 'move':
                    this.data.areaX = initialState.areaX + dx;
                    this.data.areaY = initialState.areaY + dy;
                    break;
                case 'resize':
                    const handle = this.activeDrag.handle;
                    if (handle.includes('e')) {
                        const newWidth = initialState.areaWidth + dx;
                        if (newWidth >= MIN_SIZE) this.data.areaWidth = newWidth;
                    }
                    if (handle.includes('w')) {
                        const newWidth = initialState.areaWidth - dx;
                        if (newWidth >= MIN_SIZE) { this.data.areaWidth = newWidth; this.data.areaX = initialState.areaX + dx; }
                    }
                    if (handle.includes('s')) {
                        const newHeight = initialState.areaHeight + dy;
                        if (newHeight >= MIN_SIZE) this.data.areaHeight = newHeight;
                    }
                    if (handle.includes('n')) {
                        const newHeight = initialState.areaHeight - dy;
                        if (newHeight >= MIN_SIZE) { this.data.areaHeight = newHeight; this.data.areaY = initialState.areaY + dy; }
                    }
                    break;
            }

            this.data.areaX = Math.max(0, this.data.areaX);
            this.data.areaY = Math.max(0, this.data.areaY);
            if (this.data.areaX + this.data.areaWidth > imageWidth) {
                if (this.activeDrag.type === 'move') this.data.areaX = imageWidth - this.data.areaWidth;
                else this.data.areaWidth = imageWidth - this.data.areaX;
            }
            if (this.data.areaY + this.data.areaHeight > imageHeight) {
                if (this.activeDrag.type === 'move') this.data.areaY = imageHeight - this.data.areaHeight;
                else this.data.areaHeight = imageHeight - this.data.areaY;
            }

            Object.assign(this.data, { areaX: Math.round(this.data.areaX), areaY: Math.round(this.data.areaY), areaWidth: Math.round(this.data.areaWidth), areaHeight: Math.round(this.data.areaHeight) });
            this.scheduleDraw();
            this.updateInputs();
        };

        const onMouseUp = (e) => {
            if (!this.activeDrag) return;
            e.stopPropagation();
            if (this.activeDrag.isDragging) this.requestSave();
            this.activeDrag = null;
            this.scheduleDraw();

            // --- CRITICAL FIX: Remove listeners when done dragging ---
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        const onMouseDown = (e) => {
            e.stopPropagation();
            const handle = e.target.dataset.handle;
            const mouse = this.getMousePos(e);
            const isMove = !handle && this.isPointInArea(mouse);

            let type = null;
            if (handle) { type = 'resize'; }
            else if (isMove) { type = 'move'; }

            if (type) {
                this.activeDrag = { type, handle, startX: mouse.x, startY: mouse.y, initialState: { ...this.data }, isDragging: false };

                // --- CRITICAL FIX: Only add listeners on mousedown ---
                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            }
        };

        this.dom.canvasContainer.onmousedown = onMouseDown;
        // --- REMOVED GLOBAL ADDLISTENERS FROM HERE ---

        this.dom.canvas.ondblclick = (e) => {
            if (this.activeDrag && this.activeDrag.isDragging) return;
            this.handleCanvasDblClick(e);
        };
    }

    isPointInArea(point) {
        const { areaX, areaY, areaWidth, areaHeight } = this.data;
        return point.x >= areaX && point.x <= areaX + areaWidth &&
            point.y >= areaY && point.y <= areaY + areaHeight;
    }

    handleCanvasDblClick(e) {
        e.stopPropagation();
        const mouse = this.getMousePos(e);
        const { imageWidth, imageHeight } = this.data;
        const x = mouse.x, y = mouse.y;

        const isTop = y < imageHeight / 3, isVCenter = y >= imageHeight / 3 && y <= imageHeight * 2 / 3;
        const isLeft = x < imageWidth / 3, isHCenter = x >= imageWidth / 3 && x <= imageWidth * 2 / 3;

        let newRegion = "center";
        if (isTop) newRegion = isLeft ? "top-left" : isHCenter ? "top-center" : "top-right";
        else if (isVCenter) newRegion = isLeft ? "middle-left" : isHCenter ? "center" : "middle-right";
        else newRegion = isLeft ? "bottom-left" : isHCenter ? "bottom-center" : "bottom-right";

        this.clickCycle.region = (this.clickCycle.region === newRegion) ? this.clickCycle.region : newRegion;
        this.clickCycle.count = (this.clickCycle.region === newRegion) ? (this.clickCycle.count + 1) % 4 : 0;
        const cycle = this.clickCycle.count;

        switch (newRegion) {
            case "top-left":
                this.data.areaX = 0; this.data.areaY = 0; this.data.areaWidth = Math.round(imageWidth / (cycle % 2 + 2)); this.data.areaHeight = Math.round(imageHeight / (cycle % 2 + 2)); break;
            case "top-center":
                this.data.areaX = 0; this.data.areaY = 0; this.data.areaWidth = imageWidth; this.data.areaHeight = Math.round(imageHeight / (cycle % 3 + 2)); break;
            case "top-right":
                this.data.areaY = 0; this.data.areaWidth = Math.round(imageWidth / (cycle % 2 + 2)); this.data.areaX = imageWidth - this.data.areaWidth; this.data.areaHeight = Math.round(imageHeight / (cycle % 2 + 2)); break;
            case "middle-left":
                this.data.areaX = 0; this.data.areaY = 0; this.data.areaWidth = Math.round(imageWidth / (cycle % 3 + 2)); this.data.areaHeight = imageHeight; break;
            case "center":
                if (cycle === 0) { this.data.areaX = 0; this.data.areaY = 0; this.data.areaWidth = imageWidth; this.data.areaHeight = imageHeight; }
                else if (cycle === 1) { const d = 2; this.data.areaWidth = Math.round(imageWidth / d); this.data.areaHeight = Math.round(imageHeight / d); this.data.areaX = Math.round((imageWidth - this.data.areaWidth) / 2); this.data.areaY = Math.round((imageHeight - this.data.areaHeight) / 2); }
                else { const d = (cycle % 2) + 2; this.data.areaWidth = imageWidth; this.data.areaHeight = Math.round(imageHeight / d); this.data.areaX = 0; this.data.areaY = Math.round((imageHeight - this.data.areaHeight) / 2); }
                break;
            case "middle-right":
                this.data.areaY = 0; this.data.areaWidth = Math.round(imageWidth / (cycle % 3 + 2)); this.data.areaX = imageWidth - this.data.areaWidth; this.data.areaHeight = imageHeight; break;
            case "bottom-left":
                this.data.areaX = 0; this.data.areaWidth = Math.round(imageWidth / (cycle % 2 + 2)); this.data.areaHeight = Math.round(imageHeight / (cycle % 2 + 2)); this.data.areaY = imageHeight - this.data.areaHeight; break;
            case "bottom-center":
                this.data.areaX = 0; this.data.areaWidth = imageWidth; this.data.areaHeight = Math.round(imageHeight / (cycle % 3 + 2)); this.data.areaY = imageHeight - this.data.areaHeight; break;
            case "bottom-right":
                this.data.areaWidth = Math.round(imageWidth / (cycle % 2 + 2)); this.data.areaHeight = Math.round(imageHeight / (cycle % 2 + 2)); this.data.areaX = imageWidth - this.data.areaWidth; this.data.areaY = imageHeight - this.data.areaHeight; break;
        }

        this.requestSave();
        this.scheduleDraw();
        this.updateInputs();
    }


    getMousePos(e) {
        if (!this.imageRect) return { x: 0, y: 0 };
        const rect = this.dom.canvas.getBoundingClientRect();
        const scaleX = this.dom.canvas.offsetWidth > 0 ? rect.width / this.dom.canvas.offsetWidth : 1;
        const scaleY = this.dom.canvas.offsetHeight > 0 ? rect.height / this.dom.canvas.offsetHeight : 1;
        const correctedMouseX = (e.clientX - rect.left) / scaleX;
        const correctedMouseY = (e.clientY - rect.top) / scaleY;
        const imageToCanvasScale = this.data.imageWidth / this.imageRect.w;
        const x = (correctedMouseX - this.imageRect.x) * imageToCanvasScale;
        const y = (correctedMouseY - this.imageRect.y) * imageToCanvasScale;
        return { x: Math.round(Math.max(0, Math.min(this.data.imageWidth, x))), y: Math.round(Math.max(0, Math.min(this.data.imageHeight, y))) };
    }

    static createDefaultState(x, y, width, height) {
        return {
            title: "Area", content: "", type: "area",
            x, y, width, height,
            imageWidth: 512, imageHeight: 512,
            areaX: 64, areaY: 64,
            areaWidth: 256, areaHeight: 256,
            strength: 1.0,
            verticalSplit: 0.5,
            commandLinks: {},
        };
    }
}