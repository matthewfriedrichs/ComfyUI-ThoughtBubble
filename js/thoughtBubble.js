// custom_nodes/ThoughtBubble/js/thoughtBubble.js

import { app } from "../../../scripts/app.js";

function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

const TITLE_HEIGHT = 26;
const TOOLBAR_HEIGHT = 30;

let LORA_LIST_CACHE = null;

async function getLoraList() {
    if (LORA_LIST_CACHE) {
        return LORA_LIST_CACHE;
    }
    try {
        const response = await fetch("/loras");
        const data = await response.json();
        LORA_LIST_CACHE = data.map(name => name.replace(/\.[^/.]+$/, ""));
        return LORA_LIST_CACHE;
    } catch (error) {
        console.error("Failed to fetch LoRA list:", error);
        return [];
    }
}

app.registerExtension({
    name: "Comfy.Widget.ThoughtBubble",
    
    async setup(app) {
        getLoraList();
        const style = document.createElement("style");
        style.textContent = `
            .thought-bubble-widget-container { width: 100%; box-sizing: border-box; }
            .thought-bubble-widget { width: 100%; height: 100%; background-color: #222; border: 1px solid #444; border-radius: 4px; position: relative; overflow: hidden; cursor: crosshair; user-select: none; }
            .thought-bubble-world { position: absolute; top: 0; left: 0; width: 100%; height: 100%; transform-origin: 0 0; background-color: transparent; }
            .thought-bubble-grid { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; background-color: #222; }
            .thought-bubble-toolbar { position: absolute; top: 0; left: 0; width: 100%; height: ${TOOLBAR_HEIGHT}px; background-color: #353535; z-index: 10; padding: 0 5px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; }
            .thought-bubble-toolbar button, .thought-bubble-toolbar select { padding: 4px 8px; }
            .thought-bubble-toolbar label { color: #ddd; font-size: 12px; }
            .thought-bubble-box { position: absolute; background-color: #353535; border: 1px solid #555; border-radius: 4px; display: flex; flex-direction: column; box-shadow: 2px 2px 10px rgba(0,0,0,0.5); min-width: 150px; min-height: 80px; z-index: 1; }
            .thought-bubble-box.maximized { z-index: 100; }
            .thought-bubble-box.minimized { height: 28px !important; min-height: 28px; overflow: hidden; }
            .thought-bubble-box-header { background-color: #4a4a4a; color: #ddd; padding: 4px; cursor: move; display: flex; justify-content: space-between; align-items: center; height: 28px; box-sizing: border-box; }
            .thought-bubble-box-title { background: none; border: none; color: #ddd; font-weight: bold; width: 100%; cursor: move; padding: 0; }
            .thought-bubble-box-title:not([readonly]) { cursor: text; }
            .thought-bubble-box-controls { display: flex; }
            .thought-bubble-box-controls button { background: none; border: none; color: #ddd; cursor: pointer; font-size: 14px; padding: 0 4px; }
            .thought-bubble-box-content { flex-grow: 1; padding: 5px; box-sizing: border-box; }
            .thought-bubble-box-content textarea { width: 100%; height: 100%; background-color: #282828; color: #ccc; border: none; resize: none; }
            .thought-bubble-box-resize-handle { position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; cursor: se-resize; background: #888; clip-path: polygon(100% 0, 100% 100%, 0 100%); }
            .lora-autocomplete-dropdown { position: absolute; background-color: #2d2d2d; border: 1px solid #555; border-radius: 4px; max-height: 200px; overflow-y: auto; z-index: 1000; color: #ccc; }
            .lora-autocomplete-item { padding: 5px 10px; cursor: pointer; }
            .lora-autocomplete-item:hover, .lora-autocomplete-item.selected { background-color: #4a4a4a; }
        `;
        document.head.appendChild(style);
    },

    async nodeCreated(node) {
        if (node.comfyClass !== "ThoughtBubbleNode") {
            return;
        }

        const dataWidget = node.widgets.find(w => w.name === "canvas_data");
        dataWidget.hidden = true;
        
        const widgetContainer = document.createElement("div");
        widgetContainer.className = "thought-bubble-widget-container";
        const canvasWidget = node.addDOMWidget("thought_bubble", "div", widgetContainer);
        
        let state;
        let lastKnownValue = dataWidget.value;
        let lastKnownNodeHeight = node.size[1];

        const canvasEl = document.createElement("div");
        canvasEl.className = "thought-bubble-widget";
        const worldEl = document.createElement("div");
        worldEl.className = "thought-bubble-world";
        const gridEl = document.createElement("div");
        gridEl.className = "thought-bubble-grid";
        const toolbarEl = document.createElement("div");
        toolbarEl.className = "thought-bubble-toolbar";
        const fitViewButton = document.createElement("button");
        fitViewButton.textContent = "Fit View";
        toolbarEl.appendChild(fitViewButton);
        const gridLabel = document.createElement("label");
        gridLabel.textContent = "Grid:";
        toolbarEl.appendChild(gridLabel);
        const gridSelect = document.createElement("select");
        const gridOptions = [0, 10, 20, 50, 100, 200, 400];
        gridOptions.forEach(size => {
            const option = document.createElement("option");
            option.value = size;
            option.textContent = size === 0 ? "Off" : `${size}px`;
            gridSelect.appendChild(option);
        });
        toolbarEl.appendChild(gridSelect);
        const toggleGridButton = document.createElement("button");
        toggleGridButton.textContent = "Hide Grid";
        toolbarEl.appendChild(toggleGridButton);
        canvasEl.append(gridEl, worldEl, toolbarEl);
        widgetContainer.appendChild(canvasEl);
        node.size = [600, 600];
        
        let render, syncStateToValue, updateStateFromValue;
        let isFirstDraw = true;

        const originalOnDrawForeground = node.onDrawForeground;
        node.onDrawForeground = function() {
            originalOnDrawForeground?.apply(this, arguments);

            if (canvasWidget) {
                const actualTop = Math.round(canvasWidget.last_y);
                const desiredTop = 160;
                const correction = desiredTop - actualTop;
                widgetContainer.style.transform = `translateY(${correction}px)`;
            }

            if (dataWidget.value !== lastKnownValue) {
                updateStateFromValue();
                render();
            }

            if (node.size[1] !== lastKnownNodeHeight) {
                const availableHeight = Math.round(node.size[1]) - TITLE_HEIGHT - 160;
                widgetContainer.style.height = `${Math.max(0, availableHeight)}px`;
                lastKnownNodeHeight = node.size[1];
            }

            if (isFirstDraw) {
                if (state && state.boxes.some(b => b.displayState === 'maximized')) {
                    setTimeout(() => {
                        render();
                    }, 0);
                }
                isFirstDraw = false;
            }
        };
        
        syncStateToValue = () => {
            const newValue = JSON.stringify(state);
            dataWidget.value = newValue;
            lastKnownValue = newValue;
        };
        
        updateStateFromValue = () => {
            try {
                const incoming_data = JSON.parse(dataWidget.value);
                state = incoming_data;
                if (state.boxes === undefined) state.boxes = [];
                if (state.pan === undefined) state.pan = { x: 0, y: 0 };
                if (state.zoom === undefined) state.zoom = 1.0;
                if (state.gridSize === undefined) state.gridSize = 0;
                if (state.showGrid === undefined) state.showGrid = true;
                if (state.savedView === undefined) state.savedView = null;
                gridSelect.value = state.gridSize;
                toggleGridButton.textContent = state.showGrid ? "Hide Grid" : "Show Grid";
                if (state.boxes && state.boxes.some(b => b.isMaximized !== undefined)) {
                    state.boxes.forEach(b => {
                        if (b.isMaximized) b.displayState = "maximized";
                        else if (b.minimized) b.displayState = "minimized";
                        else b.displayState = "normal";
                        delete b.isMaximized;
                        delete b.minimized;
                    });
                }
                lastKnownValue = dataWidget.value;
            } catch (e) {
                const old_loop_state = state?.canvas_loop_state || {};
                state = {
                    boxes: [{
                        id: "default-output-box",
                        title: "output",
                        content: "",
                        x: 100, y: 100, width: 400, height: 300,
                        displayState: "normal",
                    }],
                    pan: { x: 0, y: 0 },
                    zoom: 1.0,
                    gridSize: 100,
                    showGrid: true,
                    savedView: null,
                    canvas_loop_state: old_loop_state
                };
                syncStateToValue();
            }
        };
        
        const snapToGrid = (value) => {
            if (!state || state.gridSize === 0) return value;
            return Math.round(value / state.gridSize) * state.gridSize;
        };
        
        render = () => {
            if (!state) return;
            worldEl.innerHTML = "";
            worldEl.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
            if (state.gridSize > 0 && state.showGrid) {
                const scaledGrid = state.gridSize * state.zoom;
                gridEl.style.backgroundSize = `${scaledGrid}px ${scaledGrid}px`;
                gridEl.style.backgroundImage = `
                    linear-gradient(to right, #404040 1px, transparent 1px),
                    linear-gradient(to bottom, #404040 1px, transparent 1px)
                `;
                gridEl.style.backgroundPosition = `${state.pan.x}px ${state.pan.y}px`;
            } else {
                gridEl.style.backgroundImage = 'none';
            }
            for (const box of state.boxes) {
                let drawX, drawY, drawWidth, drawHeight;
                if (box.displayState === "maximized") {
                    drawX = -state.pan.x / state.zoom;
                    drawY = (-state.pan.y + TOOLBAR_HEIGHT) / state.zoom;
                    drawWidth = canvasEl.clientWidth / state.zoom;
                    drawHeight = (canvasEl.clientHeight - TOOLBAR_HEIGHT) / state.zoom;
                } else {
                    drawX = box.x;
                    drawY = box.y;
                    drawWidth = box.width;
                    drawHeight = box.height;
                }
                const boxEl = document.createElement("div");
                boxEl.className = `thought-bubble-box ${box.displayState || 'normal'}`;
                boxEl.style.cssText = `left: ${drawX}px; top: ${drawY}px; width: ${drawWidth}px; height: ${drawHeight}px;`;
                const header = document.createElement("div");
                header.className = "thought-bubble-box-header";
                const titleInput = document.createElement("input");
                titleInput.type = "text";
                titleInput.className = "thought-bubble-box-title";
                titleInput.value = box.title;
                const boxControls = document.createElement("div");
                boxControls.className = "thought-bubble-box-controls";
                const minButton = document.createElement("button");
                minButton.title = "Minimize";
                minButton.textContent = "—";
                const maxButton = document.createElement("button");
                maxButton.title = "Maximize";
                maxButton.textContent = "🗖";
                const closeButton = document.createElement("button");
                closeButton.title = "Close";
                closeButton.textContent = "✕";
                const content = document.createElement("div");
                content.className = "thought-bubble-box-content";
                const textarea = document.createElement("textarea");
                textarea.value = box.content;
                boxControls.append(minButton, maxButton, closeButton);
                header.append(titleInput, boxControls);
                boxEl.append(header, content);
                content.appendChild(textarea);
                worldEl.appendChild(boxEl);

                let autocompleteDropdown = null;
                const closeAutocomplete = () => {
                    if (autocompleteDropdown) {
                        autocompleteDropdown.remove();
                        autocompleteDropdown = null;
                    }
                };
                
                textarea.addEventListener('click', closeAutocomplete);
                textarea.addEventListener('blur', closeAutocomplete);
                textarea.addEventListener('input', async (e) => {
                    const text = textarea.value;
                    const cursorPos = textarea.selectionStart;
                    const textBeforeCursor = text.slice(0, cursorPos);
                    
                    const match = textBeforeCursor.match(/\blora\(\s*([\w\s-\\]*)$/i);
                    
                    if (match) {
                        const loraPrefix = match[1];
                        const allLoras = await getLoraList();
                        const filteredLoras = allLoras.filter(l => l.toLowerCase().includes(loraPrefix.toLowerCase()));
                        if (filteredLoras.length > 0) {
                            if (!autocompleteDropdown) {
                                autocompleteDropdown = document.createElement('div');
                                autocompleteDropdown.className = 'lora-autocomplete-dropdown';
                                document.body.appendChild(autocompleteDropdown);
                            }
                            const rect = textarea.getBoundingClientRect();
                            autocompleteDropdown.style.left = `${rect.left}px`;
                            autocompleteDropdown.style.top = `${rect.bottom}px`;
                            autocompleteDropdown.innerHTML = '';
                            filteredLoras.forEach((lora) => {
                                const item = document.createElement('div');
                                item.className = 'lora-autocomplete-item';
                                item.textContent = lora;
                                item.addEventListener('mousedown', (event) => {
                                    event.preventDefault();
                                    const start = match.index;
                                    const newText = text.slice(0, start) + `lora(${lora}:1.0)` + text.slice(cursorPos);
                                    textarea.value = newText;
                                    box.content = newText;
                                    syncStateToValue();
                                    closeAutocomplete();
                                    textarea.focus();
                                });
                                autocompleteDropdown.appendChild(item);
                            });
                        } else {
                            closeAutocomplete();
                        }
                    } else {
                        closeAutocomplete();
                    }
                });

                if (box.displayState === "normal") {
                    const resizeHandle = document.createElement("div");
                    resizeHandle.className = "thought-bubble-box-resize-handle";
                    boxEl.appendChild(resizeHandle);
                    resizeHandle.onmousedown = (e) => {
                        if (e.button === 1) return;
                        e.stopPropagation();
                        const index = state.boxes.findIndex(b => b.id === box.id);
                        if (index < state.boxes.length - 1) {
                            const [item] = state.boxes.splice(index, 1);
                            state.boxes.push(item);
                            worldEl.appendChild(boxEl);
                        }
                        const start = { x: e.clientX, y: e.clientY, w: box.width, h: box.height };
                        const onMouseMove = (moveEvent) => {
                            const dx = (moveEvent.clientX - start.x) / state.zoom;
                            const dy = (moveEvent.clientY - start.y) / state.zoom;
                            box.width = Math.max(150, start.w + dx);
                            box.height = Math.max(80, start.h + dy);
                            render();
                        };
                        const onMouseUp = () => {
                            document.removeEventListener("mousemove", onMouseMove);
                            document.removeEventListener("mouseup", onMouseUp);
                            box.width = snapToGrid(box.width);
                            box.height = snapToGrid(box.height);
                            syncStateToValue();
                            render();
                        };
                        document.addEventListener("mousemove", onMouseMove);
                        document.addEventListener("mouseup", onMouseUp);
                    };
                }
                let clickTimeout = null;
                titleInput.readOnly = true;
                titleInput.onkeydown = (e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        titleInput.blur();
                    }
                };
                titleInput.onblur = () => {
                    titleInput.readOnly = true;
                    if (box.title !== titleInput.value) {
                        box.title = titleInput.value;
                        syncStateToValue();
                    }
                };
                titleInput.ondblclick = (e) => {
                    e.stopPropagation();
                    clearTimeout(clickTimeout);
                    titleInput.readOnly = false;
                    titleInput.focus();
                    titleInput.select();
                };
                header.onmousedown = (e) => {
                    if (e.target.closest('.thought-bubble-box-controls') || !titleInput.readOnly) {
                        return;
                    }
                    if (e.button === 1 || box.displayState === 'maximized') return;
                    e.stopPropagation();
                    clickTimeout = setTimeout(() => {
                        const index = state.boxes.findIndex(b => b.id === box.id);
                        if (index < state.boxes.length - 1) {
                            const [item] = state.boxes.splice(index, 1);
                            state.boxes.push(item);
                            worldEl.appendChild(boxEl);
                        }
                        const rect = canvasEl.getBoundingClientRect();
                        const startMouseX = (e.clientX - rect.left - state.pan.x) / state.zoom;
                        const startMouseY = (e.clientY - rect.top - state.pan.y) / state.zoom;
                        const startOffsetX = startMouseX - box.x;
                        const startOffsetY = startMouseY - box.y;
                        const onMouseMove = (moveEvent) => {
                            const currentMouseX = (moveEvent.clientX - rect.left - state.pan.x) / state.zoom;
                            const currentMouseY = (moveEvent.clientY - rect.top - state.pan.y) / state.zoom;
                            box.x = currentMouseX - startOffsetX;
                            box.y = currentMouseY - startOffsetY;
                            render();
                        };
                        const onMouseUp = () => {
                            document.removeEventListener("mousemove", onMouseMove);
                            document.removeEventListener("mouseup", onMouseUp);
                            box.x = snapToGrid(box.x);
                            box.y = snapToGrid(box.y);
                            syncStateToValue();
                            render();
                        };
                        document.addEventListener("mousemove", onMouseMove);
                        document.addEventListener("mouseup", onMouseUp);
                    }, 100);
                };
                header.onmouseup = (e) => {
                    clearTimeout(clickTimeout);
                };
                textarea.oninput = () => {
                    box.content = textarea.value;
                    syncStateToValue();
                };
                minButton.onclick = (e) => {
                    e.stopPropagation();
                    const index = state.boxes.findIndex(b => b.id === box.id);
                    if (index < state.boxes.length - 1) {
                        const [item] = state.boxes.splice(index, 1);
                        state.boxes.push(item);
                        worldEl.appendChild(boxEl);
                    }
                    if (box.displayState === "minimized") {
                        box.displayState = "normal";
                    } else {
                        if (box.displayState === "maximized") {
                            if (state.savedView) {
                                state.pan = state.savedView.pan;
                                state.zoom = state.savedView.zoom;
                                state.savedView = null;
                            }
                            if (box.old) {
                                box.x = box.old.x;
                                box.y = box.old.y;
                                box.width = box.old.width;
                                box.height = box.old.height;
                                box.old = null;
                            }
                        }
                        box.displayState = "minimized";
                    }
                    syncStateToValue();
                    render();
                };
                maxButton.onclick = (e) => {
                    e.stopPropagation();
                    const index = state.boxes.findIndex(b => b.id === box.id);
                    if (index < state.boxes.length - 1) {
                        const [item] = state.boxes.splice(index, 1);
                        state.boxes.push(item);
                        worldEl.appendChild(boxEl);
                    }
                    if (box.displayState === "maximized") {
                        if (box.old) {
                            box.x = box.old.x;
                            box.y = box.old.y;
                            box.width = box.old.width;
                            box.height = box.old.height;
                            box.old = null;
                        }
                        if (state.savedView) {
                            state.pan = state.savedView.pan;
                            state.zoom = state.savedView.zoom;
                            state.savedView = null;
                        }
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
                    syncStateToValue();
                    render();
                };
                closeButton.onclick = (e) => {
                    e.stopPropagation();
                    if (box.displayState === 'maximized' && state.savedView) {
                        state.pan = state.savedView.pan;
                        state.zoom = state.savedView.zoom;
                        state.savedView = null;
                    }
                    state.boxes = state.boxes.filter(b => b.id !== box.id);
                    syncStateToValue();
                    render();
                };
            }
        };
        gridSelect.onchange = () => {
            state.gridSize = parseInt(gridSelect.value, 10);
            syncStateToValue();
            render();
        };
        toggleGridButton.onclick = () => {
            state.showGrid = !state.showGrid;
            toggleGridButton.textContent = state.showGrid ? "Hide Grid" : "Show Grid";
            syncStateToValue();
            render();
        };
        let isPanning = false;
        let startCoords = { x: 0, y: 0 };
        canvasEl.onmousedown = (e) => {
            if (e.target.closest('.thought-bubble-toolbar') || e.target.closest('.thought-bubble-box')) return;
            if (state.boxes.some(b => b.displayState === 'maximized') && (e.button === 1 || e.button === 2)) return;
            if (e.button === 0) {
                if (state.boxes.some(b => b.displayState === 'maximized')) return;
                const rect = canvasEl.getBoundingClientRect();
                startCoords = { x: (e.clientX - rect.left - state.pan.x) / state.zoom, y: (e.clientY - rect.top - state.pan.y) / state.zoom };
                const selectionBoxEl = document.createElement('div');
                selectionBoxEl.style.cssText = `position: absolute; border: 1px dashed #fff; left: ${startCoords.x}px; top: ${startCoords.y}px;`;
                worldEl.appendChild(selectionBoxEl);
                const onMouseMove = (moveEvent) => {
                    const current = { x: (moveEvent.clientX - rect.left - state.pan.x) / state.zoom, y: (moveEvent.clientY - rect.top - state.pan.y) / state.zoom };
                    const box = { x: Math.min(startCoords.x, current.x), y: Math.min(startCoords.y, current.y), w: Math.abs(startCoords.x - current.x), h: Math.abs(startCoords.y - current.y) };
                    selectionBoxEl.style.cssText += `width: ${box.w}px; height: ${box.h}px; left: ${box.x}px; top: ${box.y}px;`;
                };
                const onMouseUp = (upEvent) => {
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                    worldEl.removeChild(selectionBoxEl);
                    const end = { x: (upEvent.clientX - rect.left - state.pan.x) / state.zoom, y: (upEvent.clientY - rect.top - state.pan.y) / state.zoom };
                    let width = Math.abs(startCoords.x - end.x);
                    let height = Math.abs(startCoords.y - end.y);
                    if (width > 20 && height > 20) {
                        const newBox = {
                            id: uuidv4(),
                            title: "New Box",
                            content: "",
                            x: snapToGrid(Math.min(startCoords.x, end.x)),
                            y: snapToGrid(Math.min(startCoords.y, end.y)),
                            width: snapToGrid(width),
                            height: snapToGrid(height),
                            displayState: "normal",
                        };
                        state.boxes.push(newBox);
                        syncStateToValue();
                        render();
                    }
                };
                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
            } else if (e.button === 1 || e.button === 2) {
                isPanning = true;
                startCoords = { x: e.clientX, y: e.clientY };
                canvasEl.style.cursor = 'grabbing';
                const onMouseMove = (moveEvent) => {
                    const dx = moveEvent.clientX - startCoords.x;
                    const dy = moveEvent.clientY - startCoords.y;
                    state.pan.x += dx;
                    state.pan.y += dy;
                    startCoords = { x: moveEvent.clientX, y: moveEvent.clientY };
                    render();
                };
                const onMouseUp = () => {
                    document.removeEventListener("mousemove", onMouseMove);
                    document.removeEventListener("mouseup", onMouseUp);
                    isPanning = false;
                    canvasEl.style.cursor = 'crosshair';
                    syncStateToValue();
                };
                document.addEventListener("mousemove", onMouseMove);
                document.addEventListener("mouseup", onMouseUp);
            }
        };
        canvasEl.onwheel = (e) => {
            e.preventDefault();
            const rect = canvasEl.getBoundingClientRect();
            const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            const zoomFactor = 1 - e.deltaY * 0.001;
            if (state.boxes.some(b => b.displayState === 'maximized')) {
                const tempZoom = state.zoom * zoomFactor;
                state.zoom = Math.max(0.1, Math.min(5, tempZoom));
            } else {
                const oldZoom = state.zoom;
                state.zoom = Math.max(0.1, Math.min(5, oldZoom * zoomFactor));
                state.pan.x = mouse.x - (mouse.x - state.pan.x) * (state.zoom / oldZoom);
                state.pan.y = mouse.y - (mouse.y - state.pan.y) * (state.zoom / oldZoom);
            }
            syncStateToValue();
            render();
        };
        fitViewButton.onclick = () => {
            if (state.boxes.length === 0) return;
            const bounds = state.boxes.reduce((b, box) => ({
                minX: Math.min(b.minX, box.x),
                minY: Math.min(b.minY, box.y),
                maxX: Math.max(b.maxX, box.x + box.width),
                maxY: Math.max(b.maxY, box.y + box.height),
            }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
            const contentW = bounds.maxX - bounds.minX;
            const contentH = bounds.maxY - bounds.minY;
            const viewW = canvasEl.clientWidth;
            const viewH = canvasEl.clientHeight;
            const padding = 50;
            const zoom = Math.min((viewW - padding * 2) / contentW, (viewH - padding * 2) / contentH, 1.5);
            state.zoom = zoom;
            state.pan.x = -bounds.minX * zoom + (viewW - contentW * zoom) / 2;
            state.pan.y = -bounds.minY * zoom + (viewH - contentH * zoom) / 2;
            syncStateToValue();
            render();
        };
        canvasEl.oncontextmenu = (e) => e.preventDefault();
        updateStateFromValue();
        render();
    }
});