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
        if (e.target.closest('.thought-bubble-box') === null) return;
        const boxEl = e.target.closest('.thought-bubble-box');
        if (!boxEl) return;

        const box = this.stateManager.getBoxById(boxEl.dataset.boxId);
        if (!box) return;

        if (e.target.classList.contains('thought-bubble-box-resize-handle')) {
            e.stopPropagation();
            this.startResize(e, box, boxEl);
        } else if (e.target.closest('.thought-bubble-box-header')) {
            if (e.target.closest('button')) {
                this.handleHeaderButtonClick(e, box);
            } else {
                const titleInput = boxEl.querySelector('.thought-bubble-box-title');
                if (titleInput && titleInput.readOnly) {
                    e.stopPropagation();
                    this.startDrag(e, box, boxEl);
                }
            }
        }
    }

    startDrag(e, box, boxEl) {
        if (e.button !== 0 || box.displayState === 'maximized') return;

        let targetBox = box;
        let targetEl = boxEl;

        // Clone on Alt+Drag
        if (e.altKey) {
            const newBoxData = JSON.parse(JSON.stringify(box));
            newBoxData.id = crypto.randomUUID ? crypto.randomUUID() : `box-${Date.now()}-${Math.random()}`;
            newBoxData.x += 20;
            newBoxData.y += 20;
            this.stateManager.state.boxes.push(newBoxData);
            this.stateManager.save();
            this.renderer.render();
            targetBox = newBoxData;
            targetEl = this.renderer.worldEl.querySelector(`[data-box-id="${newBoxData.id}"]`);
        }

        const canvasMouse = this.getCanvasMousePos(e);
        const worldMouse = this.getWorldMouseCoords(canvasMouse);

        this.setActiveOperation({
            type: 'drag', handler: this, box: targetBox, boxEl: targetEl, isDragging: false,
            startMouse: canvasMouse,
            offset: { x: worldMouse.x - targetBox.x, y: worldMouse.y - targetBox.y }
        });
    }

    startResize(e, box, boxEl) {
        if (e.button !== 0) return;
        // --- FIX: Prevent resizing if minimized ---
        if (box.displayState === 'minimized') return;
        // ------------------------------------------

        this.setActiveOperation({
            type: 'resize', handler: this, box, boxEl,
            startMouse: this.getCanvasMousePos(e),
            startSize: { w: box.width, h: box.height }
        });
    }

    handleMouseMove(e, op) {
        const mouse = this.getCanvasMousePos(e);
        const { box, boxEl } = op;

        switch (op.type) {
            case 'drag':
                if (!op.isDragging) {
                    const dx = mouse.x - op.startMouse.x;
                    const dy = mouse.y - op.startMouse.y;
                    if (Math.sqrt(dx * dx + dy * dy) > 3) {
                        op.isDragging = true;
                        boxEl.style.zIndex = 100; // Float above others
                    }
                }

                if (op.isDragging) {
                    const worldMouse = this.getWorldMouseCoords(mouse);
                    const rawX = worldMouse.x - op.offset.x;
                    const rawY = worldMouse.y - op.offset.y;

                    this.clearGuides();

                    // 1. Smooth Drag: Always follow mouse exactly during drag
                    box.x = rawX;
                    box.y = rawY;

                    // 2. Visual Feedback: Calculate potential snaps to show Green Lines
                    if (!e.shiftKey) {
                        const snap = this.calculateSnap(rawX, rawY, box.width, box.height, box.id);
                        this.drawGuides(snap.guides);
                    }

                    boxEl.style.left = box.x + 'px';
                    boxEl.style.top = box.y + 'px';

                    // Optional: Redraw connections for smoothness
                    if (this.renderer.connectionsEl) {
                        this.renderer.drawConnections(this.stateManager.state.boxes, 0, 0);
                    }
                }
                break;

            case 'resize':
                const { zoom } = this.stateManager.state;
                const dx = (mouse.x - op.startMouse.x) / zoom;
                const dy = (mouse.y - op.startMouse.y) / zoom;

                let minWidth = 200, minHeight = 100;
                if (box.type === 'area') { minWidth = 100; minHeight = 100; }

                let w = Math.max(minWidth, op.startSize.w + dx);
                let h = Math.max(minHeight, op.startSize.h + dy);

                // Snap resize immediately (users usually prefer stepped resize)
                if (!e.shiftKey) {
                    w = this.stateManager.snapToGrid(w);
                    h = this.stateManager.snapToGrid(h);
                }

                box.width = w;
                box.height = h;
                boxEl.style.width = box.width + 'px';
                boxEl.style.height = box.height + 'px';
                break;
        }
    }

    handleMouseUp(e, op) {
        const { box, boxEl, isDragging } = op;
        this.clearGuides();

        switch (op.type) {
            case 'drag':
                if (isDragging) {
                    // --- HYBRID SNAP LOGIC ---
                    if (!e.shiftKey) {
                        // 1. Calculate Smart Snaps (Magnets)
                        const snap = this.calculateSnap(box.x, box.y, box.width, box.height, box.id);

                        // 2. Decide X Axis: Smart > Grid
                        if (snap.snappedX) {
                            box.x = snap.x;
                        } else {
                            box.x = this.stateManager.snapToGrid(box.x);
                        }

                        // 3. Decide Y Axis: Smart > Grid
                        if (snap.snappedY) {
                            box.y = snap.y;
                        } else {
                            box.y = this.stateManager.snapToGrid(box.y);
                        }
                    }

                    boxEl.style.zIndex = 1;
                    // Render final position to ensure DOM matches state
                    this.stateManager.save();
                    this.renderer.render();
                }
                break;
            case 'resize':
                this.stateManager.save();
                this.renderer.render();
                break;
        }
    }

    // --- SNAP LOGIC ---
    calculateSnap(x, y, w, h, myId) {
        const THRESHOLD = 15;
        const guides = [];
        const myX = { left: x, center: x + w / 2, right: x + w };
        const myY = { top: y, center: y + h / 2, bottom: y + h };

        let bestDx = Infinity;
        let bestDy = Infinity;

        for (const other of this.stateManager.state.boxes) {
            if (other.id === myId) continue;
            const otherX = { left: other.x, center: other.x + other.width / 2, right: other.x + other.width };
            const otherY = { top: other.y, center: other.y + other.height / 2, bottom: other.y + other.height };

            // Find best X snap
            for (const [myType, myVal] of Object.entries(myX)) {
                for (const [otherType, otherVal] of Object.entries(otherX)) {
                    const diff = otherVal - myVal;
                    if (Math.abs(diff) < THRESHOLD && Math.abs(diff) < Math.abs(bestDx)) {
                        bestDx = diff;
                        const top = Math.min(y, other.y);
                        const bottom = Math.max(y + h, other.y + other.height);
                        guides.push({ type: 'vert', x: otherVal, y1: top, y2: bottom });
                    }
                }
            }
            // Find best Y snap
            for (const [myType, myVal] of Object.entries(myY)) {
                for (const [otherType, otherVal] of Object.entries(otherY)) {
                    const diff = otherVal - myVal;
                    if (Math.abs(diff) < THRESHOLD && Math.abs(diff) < Math.abs(bestDy)) {
                        bestDy = diff;
                        const left = Math.min(x, other.x);
                        const right = Math.max(x + w, other.x + other.width);
                        guides.push({ type: 'horz', y: otherVal, x1: left, x2: right });
                    }
                }
            }
        }

        let finalX = x;
        let finalY = y;
        let snappedX = false;
        let snappedY = false;

        // Apply Snap Candidates
        if (bestDx !== Infinity) {
            finalX += bestDx;
            snappedX = true;
        }
        if (bestDy !== Infinity) {
            finalY += bestDy;
            snappedY = true;
        }

        // Filter visible guides for only the applied snaps
        const activeGuides = guides.filter(g => {
            const isRelevantVert = g.type === 'vert' && snappedX && Math.abs(g.x - (finalX + (g.x - (finalX + (g.x - g.x))))) < 2; // Approximate check
            // Simpler check: does the guide align with any of our edges at the new position?
            if (g.type === 'vert' && snappedX) {
                return Math.abs(g.x - finalX) < 1 || Math.abs(g.x - (finalX + w / 2)) < 1 || Math.abs(g.x - (finalX + w)) < 1;
            }
            if (g.type === 'horz' && snappedY) {
                return Math.abs(g.y - finalY) < 1 || Math.abs(g.y - (finalY + h / 2)) < 1 || Math.abs(g.y - (finalY + h)) < 1;
            }
            return false;
        });

        return { x: finalX, y: finalY, guides: activeGuides, snappedX, snappedY };
    }

    drawGuides(guides) {
        if (!guides) return;
        guides.forEach(g => {
            const el = document.createElement('div');
            el.className = 'smart-guide';
            el.style.position = 'absolute';
            el.style.zIndex = 2000;
            el.style.pointerEvents = 'none';

            // Use Accent Color
            el.style.backgroundColor = 'var(--tb-accent-color)';

            if (g.type === 'vert') {
                el.style.width = '1px';
                el.style.left = `${g.x}px`;
                el.style.top = `${g.y1}px`;
                el.style.height = `${g.y2 - g.y1}px`;
                el.style.borderLeft = '1px dashed var(--tb-accent-color)';
                el.style.backgroundColor = 'transparent';
            } else {
                el.style.height = '1px';
                el.style.top = `${g.y}px`;
                el.style.left = `${g.x1}px`;
                el.style.width = `${g.x2 - g.x1}px`;
                el.style.borderTop = '1px dashed var(--tb-accent-color)';
                el.style.backgroundColor = 'transparent';
            }
            this.worldEl.appendChild(el);
        });
    }

    clearGuides() {
        const guides = this.worldEl.querySelectorAll('.smart-guide');
        guides.forEach(el => el.remove());
    }

    handleHeaderButtonClick(e, box) {
        e.stopPropagation();
        const btn = e.target.closest('button');
        if (!btn) return;

        switch (btn.title) {
            case 'Mute':
            case 'Unmute':
                box.muted = !box.muted;
                break;
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

    // ... (Title handlers kept same) ...
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