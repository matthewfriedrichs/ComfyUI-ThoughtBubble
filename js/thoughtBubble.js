import { app } from "../../../scripts/app.js";
import { StateManager } from "./stateManager.js";
import { CanvasRenderer } from "./canvasRenderer.js";
import { CanvasEvents } from "./canvasEvents.js";
import { Toolbar } from "./toolbar.js";
import { boxTypeRegistry } from "./utils.js";
import { TextBox } from "./box-types/textBox.js";
import { AreaConditioningBox } from "./box-types/areaBox.js";
import { ControlsBox } from "./box-types/controlsBox.js";
import { ThemeManager } from "./themeManager.js";
import { ListBox } from "./box-types/listBox.js";

app.registerExtension({
    name: "Comfy.Widget.ThoughtBubble",

    async setup(app) {
        boxTypeRegistry.set("text", TextBox);
        boxTypeRegistry.set("area", AreaConditioningBox);
        boxTypeRegistry.set("controls", ControlsBox);
        boxTypeRegistry.set("list", ListBox);

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = "extensions/ComfyUI-ThoughtBubble/thoughtbubble.css";
        document.head.appendChild(link);

        const originalGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = async function () {
            const prompt = await originalGraphToPrompt.apply(this, arguments);

            const thoughtBubbleNodes = app.graph._nodes.filter(
                node => node.type === "ThoughtBubbleNode" && node.mode !== 2 && node.mode !== 4
            );

            for (const node of thoughtBubbleNodes) {
                if (node.stateManager && node.toolbar) {
                    const currentValue = node.stateManager.state.iterator || 0;
                    const newValue = currentValue + 1;
                    node.stateManager.state.iterator = newValue;
                    node.toolbar.iteratorDisplay.textContent = `Run: ${newValue}`;
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

        try {
            const response = await fetch('/thoughtbubble/themes/default/get');
            if (response.ok) {
                const defaultTheme = await response.json();
                const data = JSON.parse(node.widgets.find(w => w.name === "canvas_data").value);
                if (Object.keys(data.theme || {}).length === 0) {
                    data.theme = defaultTheme;
                    node.widgets.find(w => w.name === "canvas_data").value = JSON.stringify(data);
                }
            }
        } catch (e) { console.error("Could not load default ThoughtBubble theme", e); }

        const dataWidget = node.widgets.find(w => w.name === "canvas_data");
        dataWidget.hidden = true;

        dataWidget.computeSize = function (width) { return [width, 0]; }

        const widgetContainer = document.createElement("div");
        widgetContainer.className = "thought-bubble-widget-container";
        widgetContainer.dataset.nodeId = node.id;

        // Stop mouse events from propagating to the main ComfyUI canvas
        widgetContainer.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        const canvasWidget = node.addDOMWidget("thought_bubble", "div", widgetContainer);

        const canvasEl = document.createElement("div"); canvasEl.className = "thought-bubble-widget";

        // --- FIX: Scroll Lock ---
        // Prevents the browser from scrolling the container when the text cursor moves off-screen.
        // This keeps the Toolbar and Grid locked in place.
        canvasEl.addEventListener('scroll', () => {
            if (canvasEl.scrollTop !== 0 || canvasEl.scrollLeft !== 0) {
                canvasEl.scrollTop = 0;
                canvasEl.scrollLeft = 0;
            }
        });

        const worldEl = document.createElement("div"); worldEl.className = "thought-bubble-world";
        const gridEl = document.createElement("div"); gridEl.className = "thought-bubble-grid";
        const toolbarEl = document.createElement("div"); toolbarEl.className = "thought-bubble-toolbar";
        const contextMenu = document.createElement("div"); contextMenu.className = "thought-bubble-context-menu";
        const minimapEl = document.createElement("canvas"); minimapEl.className = "thought-bubble-minimap";

        canvasEl.append(gridEl, worldEl, toolbarEl, contextMenu, minimapEl);
        widgetContainer.appendChild(canvasEl);

        node.stateManager = new StateManager(dataWidget);
        const themeManager = new ThemeManager(node.id, node.stateManager.state.theme);
        const renderer = new CanvasRenderer(canvasEl, worldEl, gridEl, contextMenu, node.stateManager, minimapEl);

        new CanvasEvents(canvasEl, worldEl, renderer, node.stateManager);

        node.toolbar = new Toolbar(toolbarEl, node.stateManager, renderer, themeManager);

        renderer.render();

        const originalOnDrawForeground = node.onDrawForeground;
        node.onDrawForeground = function () {
            this.size[0] = Math.max(800, this.size[0]);
            this.size[1] = Math.max(600, this.size[1]);

            originalOnDrawForeground?.apply(this, arguments);

            let sizeChanged = false;
            if (canvasWidget) {
                const spaceAboveCanvas = Math.round(canvasWidget.last_y);
                const availableHeight = Math.round(node.size[1]) - spaceAboveCanvas - 15;
                const newHeight = `${Math.max(100, availableHeight)}px`;
                if (widgetContainer.style.height !== newHeight) {
                    widgetContainer.style.height = newHeight;
                    sizeChanged = true;
                }
            }

            const dataChanged = dataWidget.value !== node.stateManager.lastKnownValue;

            if (dataChanged) {
                node.stateManager.load();
                themeManager.updateTheme(node.stateManager.state.theme);
                node.toolbar._init();
            }

            if (dataChanged || sizeChanged) {
                renderer.render();
            }
        };

        app.canvas.draw(true, true);
    }
});