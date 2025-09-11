// js/thoughtbubble.js

import { app } from "../../../scripts/app.js";
import { StateManager } from "./stateManager.js";
import { CanvasRenderer } from "./canvasRenderer.js";
import { CanvasEvents } from "./canvasEvents.js";
import { Toolbar } from "./toolbar.js";
import { boxTypeRegistry, TITLE_HEIGHT, TOOLBAR_HEIGHT } from "./utils.js";
import { TextBox } from "./box-types/textBox.js";
import { AreaConditioningBox } from "./box-types/areaBox.js";

app.registerExtension({
    name: "Comfy.Widget.ThoughtBubble",
    
    async setup(app) {
        boxTypeRegistry.set("text", TextBox);
        boxTypeRegistry.set("area", AreaConditioningBox);

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
            .thought-bubble-box.maximized { z-index: 100; }
            .thought-bubble-box.minimized { height: 28px !important; min-height: 28px; overflow: hidden; }
            .thought-bubble-box-header { background-color: #4a4a4a; color: #ddd; padding: 4px; cursor: move; display: flex; justify-content: space-between; align-items: center; height: 28px; box-sizing: border-box; }
            .thought-bubble-box-title { background: none; border: none; color: #ddd; font-weight: bold; width: 100%; cursor: move; padding: 0; }
            .thought-bubble-box-title:not([readonly]) { cursor: text; }
            .thought-bubble-box-controls { display: flex; }
            .thought-bubble-box-controls button { background: none; border: none; color: #ddd; cursor: pointer; font-size: 14px; padding: 0 4px; }
            .thought-bubble-box-content { flex-grow: 1; box-sizing: border-box; display: flex; flex-direction: column; }
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
            /* New CSS for Area Conditioning Box */
            .area-conditioning { padding: 4px; gap: 4px; }
            .area-box { min-width: 500px; min-height: 500px; } /* <<< CORRECTED THIS RULE */
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
    },

    async nodeCreated(node) {
        if (node.comfyClass !== "ThoughtBubbleNode") return;

        const dataWidget = node.widgets.find(w => w.name === "canvas_data");
        dataWidget.hidden = true;
        
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
        
        const stateManager = new StateManager(dataWidget);
        const renderer = new CanvasRenderer(canvasEl, worldEl, gridEl, contextMenu, stateManager);
        new CanvasEvents(canvasEl, worldEl, renderer, stateManager);
        new Toolbar(toolbarEl, stateManager, renderer);

        node.size = [600, 600];
        renderer.render();

        let lastKnownNodeHeight = node.size[1];
        const originalOnDrawForeground = node.onDrawForeground;
        node.onDrawForeground = function() {
            originalOnDrawForeground?.apply(this, arguments);
            
            if (canvasWidget) {
                const desiredTop = 160;
                const actualTop = Math.round(canvasWidget.last_y);
                const correction = desiredTop - actualTop;
                widgetContainer.style.transform = `translateY(${correction}px)`;
            }

            if (dataWidget.value !== stateManager.lastKnownValue) {
                stateManager.load();
                renderer.render();
            }
            if (node.size[1] !== lastKnownNodeHeight) {
                const availableHeight = Math.round(node.size[1]) - TITLE_HEIGHT - 160;
                widgetContainer.style.height = `${Math.max(0, availableHeight)}px`;
                lastKnownNodeHeight = node.size[1];
                renderer.render();
            }
        };
    }
});