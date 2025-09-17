// js/thoughtbubble.js

import { app } from "../../../scripts/app.js";
import { StateManager } from "./stateManager.js";
import { CanvasRenderer } from "./canvasRenderer.js";
import { CanvasEvents } from "./canvasEvents.js";
import { Toolbar } from "./toolbar.js";
import { boxTypeRegistry, TITLE_HEIGHT, TOOLBAR_HEIGHT } from "./utils.js";
import { TextBox } from "./box-types/textBox.js";
import { AreaConditioningBox } from "./box-types/areaBox.js";
import { ControlsBox } from "./box-types/controlsBox.js";


app.registerExtension({
    name: "Comfy.Widget.ThoughtBubble",
    
    async setup(app) {
        boxTypeRegistry.set("text", TextBox);
        boxTypeRegistry.set("area", AreaConditioningBox);
        boxTypeRegistry.set("controls", ControlsBox);

        const style = document.createElement("style");
        style.textContent = `
            .thought-bubble-widget-container { width: 100%; box-sizing: border-box; }
            .thought-bubble-widget { width: 100%; height: 100%; background-color: #222; border: 1px solid #444; border-radius: 4px; position: relative; overflow: hidden; user-select: none; }
            .thought-bubble-world { position: absolute; top: 0; left: 0; width: 100%; height: 100%; transform-origin: 0 0; background-color: transparent; }
            .thought-bubble-grid { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; background-color: #222; }
            .thought-bubble-toolbar { position: absolute; top: 0; left: 0; width: 100%; height: ${TOOLBAR_HEIGHT}px; background-color: #353535; z-index: 10; padding: 0 5px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; }
            .thought-bubble-toolbar button, .thought-bubble-toolbar select { padding: 4px 8px; }
            .thought-bubble-toolbar label { color: #ddd; font-size: 12px; }
            .thought-bubble-box { position: absolute; background-color: #353535; border: 1px solid #555; border-radius: 4px; display: flex; flex-direction: column; box-shadow: 2px 2px 10px rgba(0,0,0,0.5); min-width: 150px; min-height: 80px; z-index: 1; }
            .thought-bubble-box.text-box { min-width: 200px; min-height: 100px; }
            .thought-bubble-box.controls-box { min-width: 300px; min-height: 200px; }
            .thought-bubble-box.area-box { min-width: 500px; min-height: 500px; }
            .thought-bubble-box.maximized { z-index: 100; }
            .thought-bubble-box.minimized { height: 28px !important; min-height: 28px; overflow: hidden; }
            .thought-bubble-box-header { background-color: #4a4a4a; color: #ddd; padding: 4px; cursor: move; display: flex; justify-content: space-between; align-items: center; height: 28px; box-sizing: border-box; }
            .thought-bubble-box-title { background: none; border: none; color: #ddd; font-weight: bold; width: 100%; cursor: move; padding: 0; }
            .thought-bubble-box-title:not([readonly]) { cursor: text; }
            .thought-bubble-box-controls { display: flex; }
            .thought-bubble-box-controls button { background: none; border: none; color: #ddd; cursor: pointer; font-size: 14px; padding: 0 4px; }
            .thought-bubble-box-content { flex-grow: 1; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
            .thought-bubble-box-content textarea { width: 100%; height: 100%; background-color: #282828; color: #ccc; border: none; resize: none; padding: 5px; box-sizing: border-box; }
            .thought-bubble-box-resize-handle { position: absolute; bottom: 0; right: 0; width: 10px; height: 10px; cursor: se-resize; background: #888; clip-path: polygon(100% 0, 100% 100%, 0 100%); }
            .lora-autocomplete-dropdown { position: absolute; background-color: #2d2d2d; border: 1px solid #555; border-radius: 4px; max-height: 200px; overflow-y: auto; z-index: 2100; color: #ccc; }
            .lora-autocomplete-item { padding: 5px 10px; cursor: pointer; }
            .lora-autocomplete-item:hover, .lora-autocomplete-item.selected { background-color: #4a4a4a; }
            .thought-bubble-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.7); z-index: 2000; display: flex; align-items: center; justify-content: center; }
            .thought-bubble-modal-content { background-color: #333; border: 1px solid #555; border-radius: 8px; padding: 20px; min-width: 400px; max-width: 90%; box-shadow: 0 5px 15px rgba(0,0,0,0.5); }
            .thought-bubble-modal-title { margin-top: 0; color: #eee; }
            .thought-bubble-modal-body { margin: 20px 0; color: #ccc; }
            .thought-bubble-modal-body input { width: 100%; padding: 8px; box-sizing: border-box; background-color: #222; border: 1px solid #555; color: #ccc; border-radius: 4px; }
            .thought-bubble-modal-footer { text-align: right; }
            .thought-bubble-modal-footer button { margin-left: 10px; }
            .thought-bubble-file-list { max-height: 300px; overflow-y: auto; border: 1px solid #222; padding: 5px; background-color: #282828; }
            .thought-bubble-file-item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #333; }
            .thought-bubble-file-item:hover { background-color: #4a4a4a; }
            .thought-bubble-file-item:last-child { border-bottom: none; }
             .thought-bubble-context-menu {
                display: none;
                position: absolute;
                background-color: #2d2d2d;
                border: 1px solid #555;
                border-radius: 4px;
                min-width: 150px;
                z-index: 2200;
                color: #ccc;
                padding: 5px;
            }
            .thought-bubble-context-menu-item {
                padding: 8px 12px;
                cursor: pointer;
            }
            .thought-bubble-context-menu-item:hover {
                background-color: #4a4a4a;
            }
            .thought-bubble-box-content.controls-box { display: flex; flex-direction: column; gap: 5px; padding: 5px; overflow: hidden; }
            .controls-add-button { width: 100%; padding: 8px; border-radius: 4px; flex-shrink: 0; }
            .controls-variables-container { display: flex; flex-direction: column; gap: 5px; overflow-y: auto; }
            .controls-variable-row { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 5px; align-items: center; }
            .controls-variable-row input, .controls-variable-row select { width: 100%; background-color: #282828; color: #ccc; border: 1px solid #222; border-radius: 4px; padding: 4px; }
            .controls-variable-value { text-align: right; }
            .controls-variable-delete { background: #5c2828; border: 1px solid #a14242; color: #fff; border-radius: 4px; cursor: pointer; width: 28px; height: 28px; }
            .area-conditioning { padding: 4px; gap: 4px; }
            .ac-toolbar { display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap; height: auto; min-height: 30px; }
            .ac-toolbar label { font-size: 12px; }
            .ac-toolbar input { width: 50px; background-color: #282828; border: 1px solid #222; color: #ccc; }
            .ac-main-content { flex-grow: 1; display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
            .ac-main-content textarea { height: 60px; flex-shrink: 0; width: auto; resize: vertical; min-height: 40px; }
            .ac-canvas-container { flex-grow: 1; min-width: 150px; position: relative; min-height: 100px; }
            .ac-canvas-container canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; cursor: crosshair; }
            .ac-resize-handle { position: absolute; width: 12px; height: 12px; background: rgba(255, 255, 255, 0.7); border: 1px solid #111; right: 0; bottom: 0; cursor: se-resize; }
            .ac-resize-handle:hover { background-color: white; }
        `;
        document.head.appendChild(style);

        const originalGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = async function() {
            const prompt = await originalGraphToPrompt.apply(this, arguments);

            const thoughtBubbleNodes = app.graph._nodes.filter(
                node => node.type === "ThoughtBubbleNode" && node.mode !== 2 && node.mode !== 4
            );

            for (const node of thoughtBubbleNodes) {
                if (node.stateManager && node.toolbar) {
                    // Update the default toolbar iterator
                    const currentValue = node.stateManager.state.iterator || 0;
                    const newValue = currentValue + 1;
                    node.stateManager.state.iterator = newValue;
                    node.toolbar.iteratorDisplay.textContent = `Run: ${newValue}`;

                    // --- NEW: Find and update all Controls boxes within this node ---
                    node.stateManager.state.boxes.forEach(box => {
                        if (box.type === 'controls' && box.instance) {
                            box.instance.updateVariables();
                        }
                    });

                    node.stateManager.save();
                }
            }
            return prompt;
        };
    },

    async nodeCreated(node) {
        if (node.comfyClass !== "ThoughtBubbleNode") return;
        
        const dataWidget = node.widgets.find(w => w.name === "canvas_data");
        dataWidget.hidden = true;
        
        dataWidget.computeSize = function(width) { return [width, 0]; }

        const widgetContainer = document.createElement("div");
        widgetContainer.className = "thought-bubble-widget-container";
        const canvasWidget = node.addDOMWidget("thought_bubble", "div", widgetContainer);
        
        const canvasEl = document.createElement("div"); canvasEl.className = "thought-bubble-widget";
        const worldEl = document.createElement("div"); worldEl.className = "thought-bubble-world";
        const gridEl = document.createElement("div"); gridEl.className = "thought-bubble-grid";
        const toolbarEl = document.createElement("div"); toolbarEl.className = "thought-bubble-toolbar";
        const contextMenu = document.createElement("div"); contextMenu.className = "thought-bubble-context-menu";
        
        canvasEl.append(gridEl, worldEl, toolbarEl, contextMenu);
        widgetContainer.appendChild(canvasEl);
        
        node.stateManager = new StateManager(dataWidget);
        const renderer = new CanvasRenderer(canvasEl, worldEl, gridEl, contextMenu, node.stateManager);
        new CanvasEvents(canvasEl, worldEl, renderer, node.stateManager);
        node.toolbar = new Toolbar(toolbarEl, node.stateManager, renderer);

        node.size = [800, 600];
        renderer.render();

        const originalOnDrawForeground = node.onDrawForeground;
        node.onDrawForeground = function() {
            // --- NEW: Enforce minimum node size ---
            this.size[0] = Math.max(800, this.size[0]);
            this.size[1] = Math.max(600, this.size[1]);

            originalOnDrawForeground?.apply(this, arguments);
            
            if (dataWidget.value !== node.stateManager.lastKnownValue) {
                node.stateManager.load();
                node.toolbar._init();
                renderer.render();
            }

            if (canvasWidget) {
                const spaceAboveCanvas = Math.round(canvasWidget.last_y);
                const availableHeight = Math.round(node.size[1]) - spaceAboveCanvas - 15;
                const newHeight = `${Math.max(100, availableHeight)}px`;
                if (widgetContainer.style.height !== newHeight) {
                    widgetContainer.style.height = newHeight;
                }
            }
        };
        
        app.canvas.draw(true, true);
    }
});