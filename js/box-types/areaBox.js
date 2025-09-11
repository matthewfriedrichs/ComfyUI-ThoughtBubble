// js/box-types/areaBox.js

import { BaseBox } from "./baseBox.js";

export class AreaConditioningBox extends BaseBox {
    constructor(options) {
        super(options);
        this.data = this.boxData; // Alias for clarity
        this.dom = {}; // To store DOM elements
        this.clickCycle = { region: null, count: 0 }; // Tracks double-click cycles
    }

    render(contentEl) {
        contentEl.className = "thought-bubble-box-content area-conditioning";

        this.dom.topToolbar = document.createElement("div"); this.dom.topToolbar.className = "ac-toolbar";
        this.dom.mainContent = document.createElement("div"); this.dom.mainContent.className = "ac-main-content";
        this.dom.bottomToolbar = document.createElement("div"); this.dom.bottomToolbar.className = "ac-toolbar";

        this.createTopToolbar();
        this.createMainContent();
        this.createBottomToolbar();

        contentEl.append(this.dom.topToolbar, this.dom.mainContent, this.dom.bottomToolbar);

        this.updateInputs();
        this.scheduleDraw();
    }

    createTopToolbar() {
        const wLabel = document.createElement("label"); wLabel.textContent = "Image Width:";
        this.dom.imageWidthInput = document.createElement("input");
        this.dom.imageWidthInput.type = "number";
        this.dom.imageWidthInput.value = this.data.imageWidth;
        this.dom.imageWidthInput.onchange = (e) => this.updateState('imageWidth', parseInt(e.target.value));

        const hLabel = document.createElement("label"); hLabel.textContent = "Image Height:";
        this.dom.imageHeightInput = document.createElement("input");
        this.dom.imageHeightInput.type = "number";
        this.dom.imageHeightInput.value = this.data.imageHeight;
        this.dom.imageHeightInput.onchange = (e) => this.updateState('imageHeight', parseInt(e.target.value));

        this.dom.topToolbar.append(wLabel, this.dom.imageWidthInput, hLabel, this.dom.imageHeightInput);
    }

    createMainContent() {
        this.dom.textarea = document.createElement("textarea");
        this.dom.textarea.value = this.data.content;
        this.dom.textarea.addEventListener('change', () => {
            this.data.content = this.dom.textarea.value;
            this.requestSave();
        });

        this.dom.canvasContainer = document.createElement("div"); this.dom.canvasContainer.className = "ac-canvas-container";
        this.dom.canvas = document.createElement("canvas");
        this.dom.canvasContainer.appendChild(this.dom.canvas);
        
        this.dom.mainContent.append(this.dom.canvasContainer, this.dom.textarea);

        this.ctx = this.dom.canvas.getContext('2d');
        this.addCanvasListeners();
    }

    createBottomToolbar() {
        const xLabel = document.createElement("label"); xLabel.textContent = "X:";
        this.dom.areaXInput = document.createElement("input");
        this.dom.areaXInput.type = "number";
        this.dom.areaXInput.onchange = (e) => this.updateState('areaX', parseInt(e.target.value));

        const yLabel = document.createElement("label"); yLabel.textContent = "Y:";
        this.dom.areaYInput = document.createElement("input");
        this.dom.areaYInput.type = "number";
        this.dom.areaYInput.onchange = (e) => this.updateState('areaY', parseInt(e.target.value));

        const wLabel = document.createElement("label"); wLabel.textContent = "W:";
        this.dom.areaWidthInput = document.createElement("input");
        this.dom.areaWidthInput.type = "number";
        this.dom.areaWidthInput.onchange = (e) => this.updateState('areaWidth', parseInt(e.target.value));

        const hLabel = document.createElement("label"); hLabel.textContent = "H:";
        this.dom.areaHeightInput = document.createElement("input");
        this.dom.areaHeightInput.type = "number";
        this.dom.areaHeightInput.onchange = (e) => this.updateState('areaHeight', parseInt(e.target.value));
        
        const sLabel = document.createElement("label"); sLabel.textContent = "Strength:";
        this.dom.strengthInput = document.createElement("input");
        this.dom.strengthInput.type = "number";
        this.dom.strengthInput.step = "0.1";
        this.dom.strengthInput.onchange = (e) => this.updateState('strength', parseFloat(e.target.value));
        
        this.dom.bottomToolbar.append(xLabel, this.dom.areaXInput, yLabel, this.dom.areaYInput, wLabel, this.dom.areaWidthInput, hLabel, this.dom.areaHeightInput, sLabel, this.dom.strengthInput);
    }
    
    updateState(key, value) {
        this.data[key] = value;
        this.requestSave();
        this.scheduleDraw();
        this.updateInputs();
    }
    
    updateInputs() {
        this.dom.areaXInput.value = this.data.areaX;
        this.dom.areaYInput.value = this.data.areaY;
        this.dom.areaWidthInput.value = this.data.areaWidth;
        this.dom.areaHeightInput.value = this.data.areaHeight;
        this.dom.strengthInput.value = this.data.strength;
    }

    scheduleDraw() { requestAnimationFrame(() => this.draw()); }
    draw() { this.drawCanvas(); this.drawHandle(); }

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
        this.ctx.strokeStyle = "white"; this.ctx.lineWidth = 2;
        this.ctx.strokeRect(offsetX, offsetY, drawW, drawH);
        
        this.ctx.fillStyle = "rgba(100, 150, 255, 0.5)";
        this.ctx.strokeStyle = "rgb(100, 150, 255)"; this.ctx.lineWidth = 1;
        
        const areaX = offsetX + this.data.areaX * this.scale;
        const areaY = offsetY + this.data.areaY * this.scale;
        const areaW = this.data.areaWidth * this.scale;
        const areaH = this.data.areaHeight * this.scale;
        
        this.ctx.fillRect(areaX, areaY, areaW, areaH);
        this.ctx.strokeRect(areaX, areaY, areaW, areaH);
    }

    drawHandle() {
        if (this.dom.handle) this.dom.handle.remove();
        if (!this.imageRect) return;
        const { x: imgX, y: imgY } = this.imageRect;
        const { areaX, areaY, areaWidth, areaHeight } = this.data;
        const x = imgX + (areaX + areaWidth) * this.scale;
        const y = imgY + (areaY + areaHeight) * this.scale;

        this.dom.handle = document.createElement('div');
        this.dom.handle.className = 'ac-resize-handle';
        this.dom.handle.style.cssText = `left: ${x}px; top: ${y}px; transform: translate(-100%, -100%);`;
        this.dom.canvasContainer.appendChild(this.dom.handle);
    }

    addCanvasListeners() {
        const DRAG_THRESHOLD = 5;
        this.activeDrag = null;

        const onMouseDown = (e) => {
            e.stopPropagation();
            const mouse = this.getMousePos(e);
            
            const isResize = e.target.classList.contains('ac-resize-handle');
            const isMove = this.isPointInArea(mouse);

            let type = 'new';
            if (isResize) type = 'resize';
            else if (isMove) type = 'move';

            this.activeDrag = { type, startX: mouse.x, startY: mouse.y, initialState: { ...this.data }, isDragging: false };

            if (type === 'new') {
                Object.assign(this.data, { areaX: mouse.x, areaY: mouse.y, areaWidth: 0, areaHeight: 0 });
                this.scheduleDraw();
                this.updateInputs();
            }
        };

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
            let { areaX, areaY, areaWidth, areaHeight } = initialState;

            switch (this.activeDrag.type) {
                case 'new':
                    areaX = dx > 0 ? this.activeDrag.startX : mouse.x;
                    areaY = dy > 0 ? this.activeDrag.startY : mouse.y;
                    areaWidth = Math.abs(dx);
                    areaHeight = Math.abs(dy);
                    break;
                case 'move':
                    areaX += dx;
                    areaY += dy;
                    break;
                case 'resize':
                    areaWidth += dx;
                    areaHeight += dy;
                    break;
            }

            if (areaX < 0) areaX = 0;
            if (areaY < 0) areaY = 0;
            if (areaWidth < 0) areaWidth = 0;
            if (areaHeight < 0) areaHeight = 0;
            if (areaX + areaWidth > imageWidth) areaX = imageWidth - areaWidth;
            if (areaY + areaHeight > imageHeight) areaY = imageHeight - areaHeight;

            Object.assign(this.data, { 
                areaX: Math.round(areaX), 
                areaY: Math.round(areaY), 
                areaWidth: Math.round(areaWidth), 
                areaHeight: Math.round(areaHeight) 
            });
            this.scheduleDraw();
            this.updateInputs();
        };

        const onMouseUp = (e) => {
            if (!this.activeDrag) return;
            e.stopPropagation();
            if (this.activeDrag.isDragging) {
                this.requestSave();
            }
            this.activeDrag = null;
        };

        this.dom.canvasContainer.onmousedown = onMouseDown;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        this.dom.canvas.ondblclick = (e) => {
            if (!this.activeDrag || !this.activeDrag.isDragging) {
                this.handleCanvasDblClick(e);
            }
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
        this.clickCycle.count = (this.clickCycle.region === newRegion) ? this.clickCycle.count + 1 : 0;
        const cycle = this.clickCycle.count;

        switch (newRegion) {
            case "top-left":
                this.data.areaX = 0; this.data.areaY = 0;
                this.data.areaWidth = Math.round(imageWidth / (cycle % 2 + 2));
                this.data.areaHeight = Math.round(imageHeight / (cycle % 2 + 2));
                break;
            case "top-center":
                this.data.areaX = 0; this.data.areaY = 0;
                this.data.areaWidth = imageWidth;
                this.data.areaHeight = Math.round(imageHeight / (cycle % 3 + 2));
                break;
            case "top-right":
                this.data.areaY = 0;
                this.data.areaWidth = Math.round(imageWidth / (cycle % 2 + 2));
                this.data.areaX = imageWidth - this.data.areaWidth;
                this.data.areaHeight = Math.round(imageHeight / (cycle % 2 + 2));
                break;
            case "middle-left":
                this.data.areaX = 0; this.data.areaY = 0;
                this.data.areaWidth = Math.round(imageWidth / (cycle % 3 + 2));
                this.data.areaHeight = imageHeight;
                break;
            case "center":
                if (cycle === 0) {
                    this.data.areaX = 0; this.data.areaY = 0;
                    this.data.areaWidth = imageWidth; this.data.areaHeight = imageHeight;
                } else {
                    const divisor = (cycle % 2) + 2;
                    this.data.areaWidth = imageWidth;
                    this.data.areaHeight = Math.round(imageHeight / divisor);
                    this.data.areaX = 0;
                    this.data.areaY = Math.round((imageHeight - this.data.areaHeight) / 2);
                }
                break;
            case "middle-right":
                this.data.areaY = 0;
                this.data.areaWidth = Math.round(imageWidth / (cycle % 3 + 2));
                this.data.areaX = imageWidth - this.data.areaWidth;
                this.data.areaHeight = imageHeight;
                break;
            case "bottom-left":
                this.data.areaX = 0;
                this.data.areaWidth = Math.round(imageWidth / (cycle % 2 + 2));
                this.data.areaHeight = Math.round(imageHeight / (cycle % 2 + 2));
                this.data.areaY = imageHeight - this.data.areaHeight;
                break;
            case "bottom-center":
                this.data.areaX = 0;
                this.data.areaWidth = imageWidth;
                this.data.areaHeight = Math.round(imageHeight / (cycle % 3 + 2));
                this.data.areaY = imageHeight - this.data.areaHeight;
                break;
            case "bottom-right":
                this.data.areaWidth = Math.round(imageWidth / (cycle % 2 + 2));
                this.data.areaHeight = Math.round(imageHeight / (cycle % 2 + 2));
                this.data.areaX = imageWidth - this.data.areaWidth;
                this.data.areaY = imageHeight - this.data.areaHeight;
                break;
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
        };
    }
}
