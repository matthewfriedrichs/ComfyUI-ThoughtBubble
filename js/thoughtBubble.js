import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { StateManager } from "./stateManager.js";
import { CanvasRenderer } from "./canvasRenderer.js";
import { CanvasEvents } from "./canvasEvents.js";
import { Toolbar } from "./toolbar.js";
import { boxTypeRegistry } from "./utils.js";
import { TextBox } from "./box-types/textBox.js";
import { ThemeManager } from "./themeManager.js";

const HIDDEN_WIDGET_TYPE = "converted-widget";
const MIN_NODE_WIDTH = 800;
const MIN_NODE_HEIGHT = 600;

function hideSourceWidget(node, widget) {
    if (widget.__thoughtBubbleHidden) return;
    widget.__thoughtBubbleHidden = true;
    widget.origType = widget.type;
    widget.origComputeSize = widget.computeSize;
    widget.origSerializeValue = widget.serializeValue;
    widget.type = HIDDEN_WIDGET_TYPE;
    widget.computeSize = () => [0, -4];
    widget.hidden = true;
    widget.serializeValue = () => widget.value;

    const container = node?.widgets_start_y !== undefined ? node.graph?.canvas?.canvas?.parentElement : document.body;
    const observerRoot = container || document.body;

    const stomp = () => {
        const el = widget.inputEl || widget.element;
        if (el) {
            el.style.setProperty("display", "none", "important");
            if (el.parentElement) {
                el.parentElement.style.setProperty("display", "none", "important");
            }
        }
    };

    stomp();
    requestAnimationFrame(stomp);

    if (!widget.__thoughtBubbleObserver) {
        const observer = new MutationObserver(() => stomp());
        observer.observe(observerRoot, { childList: true, subtree: true });
        widget.__thoughtBubbleObserver = observer;

        const originalOnRemoved = node.onRemoved;
        node.onRemoved = function () {
            observer.disconnect();
            originalOnRemoved?.apply(this, arguments);
        };
    }
}

app.registerExtension({
    name: "Comfy.Widget.ThoughtBubble",
    async setup(app) {
        boxTypeRegistry.set("text", TextBox);

        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = new URL("./thoughtbubble.css", import.meta.url).href;
        document.head.appendChild(link);

        // Real-time diff-driven persister synchronization listener
        api.addEventListener("thoughtbubble-persister-update", (event) => {
            const { node_id, box_id, content, persister_updates, canvas_data } = event.detail || {};
            const targetId = String(node_id);
            const node = (app.graph && app.graph.getNodeById)
                ? (app.graph.getNodeById(node_id) || app.graph._nodes?.find(n => String(n.id) === targetId))
                : app.graph._nodes?.find(n => String(n.id) === targetId);

            if (!node || !node.stateManager) return;

            if (persister_updates && persister_updates.length > 0 && box_id) {
                node.stateManager.patchPersisters(box_id, persister_updates);
            } else if (box_id && content !== undefined) {
                node.stateManager.updateBoxContent(box_id, content);
            } else if (canvas_data) {
                const dataWidget = node.widgets?.find(w => w.name === "canvas_data");
                if (dataWidget) {
                    dataWidget.value = canvas_data;
                    node.stateManager.lastKnownValue = canvas_data;
                }
                node.stateManager.load(canvas_data);
                if (node.renderer) {
                    node.renderer.render();
                }
            }
            app.canvas.draw(true, true);
        });

        // Ensure canvas state commits synchronously BEFORE ComfyUI serializes graph for prompt execution
        const originalGraphToPrompt = app.graphToPrompt;
        app.graphToPrompt = async function () {
            const thoughtBubbleNodes = (app.graph?._nodes || []).filter(
                node => (node.type === "ThoughtBubbleNode" || node.comfyClass === "ThoughtBubbleNode") && node.mode !== 2 && node.mode !== 4
            );
            for (const node of thoughtBubbleNodes) {
                if (node.stateManager) {
                    node.stateManager.save(true);
                }
            }
            return await originalGraphToPrompt.apply(this, arguments);
        };
    },

    async nodeCreated(node) {
        if (node.comfyClass !== "ThoughtBubbleNode" && node.type !== "ThoughtBubbleNode") return;

        // Automatically clean up stale input slots (like old control_net or seed widgets)
        const validOptionalInputs = ["model", "clip"];
        if (node.inputs) {
            for (let i = node.inputs.length - 1; i >= 0; i--) {
                const input = node.inputs[i];
                if (input.name === "control_net" || (!validOptionalInputs.includes(input.name) && input.type !== -1)) {
                    node.removeInput(i);
                }
            }
        }

        try {
            const response = await fetch("/thoughtbubble/themes/default/get");
            if (response.ok) {
                const defaultTheme = await response.json();
                const dataWidget = node.widgets?.find(w => w.name === "canvas_data");
                if (dataWidget && dataWidget.value) {
                    const data = JSON.parse(dataWidget.value);
                    if (Object.keys(data.theme || {}).length === 0) {
                        data.theme = defaultTheme;
                        dataWidget.value = JSON.stringify(data);
                    }
                }
            }
        } catch (e) {
            console.error("Could not load default ThoughtBubble theme", e);
        }

        const dataWidget = node.widgets?.find(w => w.name === "canvas_data");
        if (dataWidget) {
            hideSourceWidget(node, dataWidget);
        }

        node.size[0] = Math.max(node.size[0] || 0, MIN_NODE_WIDTH);
        node.size[1] = Math.max(node.size[1] || 0, MIN_NODE_HEIGHT);

        const originalOnResize = node.onResize;
        node.onResize = function (size) {
            if (!this.flags?.collapsed) {
                size[0] = Math.max(size[0], MIN_NODE_WIDTH);
                size[1] = Math.max(size[1], MIN_NODE_HEIGHT);
            }
            originalOnResize?.apply(this, arguments);
        };

        const widgetContainer = document.createElement("div");
        widgetContainer.className = "thought-bubble-widget-container";
        widgetContainer.dataset.nodeId = node.id;

        widgetContainer.addEventListener("mousedown", (e) => {
            if (e.button === 1) e.preventDefault();
            e.stopPropagation();
        });

        widgetContainer.addEventListener("wheel", (e) => {
            e.stopPropagation();
        }, { passive: false });

        widgetContainer.addEventListener("contextmenu", (e) => {
            if (["TEXTAREA", "INPUT"].includes(e.target.nodeName)) {
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
        });

        const canvasWidget = node.addDOMWidget("thought_bubble", "div", widgetContainer);

        const canvasEl = document.createElement("div");
        canvasEl.className = "thought-bubble-widget";
        canvasEl.addEventListener("scroll", () => {
            if (canvasEl.scrollTop !== 0 || canvasEl.scrollLeft !== 0) {
                canvasEl.scrollTop = 0;
                canvasEl.scrollLeft = 0;
            }
        });

        const worldEl = document.createElement("div");
        worldEl.className = "thought-bubble-world";

        const gridEl = document.createElement("div");
        gridEl.className = "thought-bubble-grid";

        const toolbarEl = document.createElement("div");
        toolbarEl.className = "thought-bubble-toolbar";

        const contextMenu = document.createElement("div");
        contextMenu.className = "thought-bubble-context-menu";

        const minimapEl = document.createElement("canvas");
        minimapEl.className = "thought-bubble-minimap";

        canvasEl.append(gridEl, worldEl, toolbarEl, contextMenu, minimapEl);
        widgetContainer.appendChild(canvasEl);

        node.stateManager = new StateManager(dataWidget);
        node.themeManager = new ThemeManager(node.id, node.stateManager.state.theme);
        node.renderer = new CanvasRenderer(canvasEl, worldEl, gridEl, contextMenu, node.stateManager, minimapEl);
        const canvasEvents = new CanvasEvents(canvasEl, worldEl, node.renderer, node.stateManager);
        node.toolbar = new Toolbar(toolbarEl, node.stateManager, node.renderer, node.themeManager);

        node.renderer.render();

        const originalOnRemoved = node.onRemoved;
        node.onRemoved = function () {
            canvasEvents.destroy();
            node.themeManager.destroy();
            originalOnRemoved?.apply(this, arguments);
        };

        const originalOnDrawForeground = node.onDrawForeground;
        node.onDrawForeground = function () {
            if (!this.flags?.collapsed) {
                this.size[0] = Math.max(MIN_NODE_WIDTH, this.size[0]);
                this.size[1] = Math.max(MIN_NODE_HEIGHT, this.size[1]);
            }
            originalOnDrawForeground?.apply(this, arguments);

            let sizeChanged = false;
            if (canvasWidget && !this.flags?.collapsed) {
                const headerHeight = (typeof LiteGraph !== "undefined" && LiteGraph.NODE_TITLE_HEIGHT)
                    ? LiteGraph.NODE_TITLE_HEIGHT
                    : 30;
                const topOffset = headerHeight + 6;
                canvasWidget.last_y = topOffset;

                const availableHeight = Math.round(node.size[1]) - topOffset - 12;
                const newHeight = `${Math.max(100, availableHeight)}px`;
                if (widgetContainer.style.height !== newHeight) {
                    widgetContainer.style.height = newHeight;
                    sizeChanged = true;
                }
            }

            const dataChanged = dataWidget && (dataWidget.value !== node.stateManager.lastKnownValue);
            if (dataChanged) {
                node.stateManager.load();
                node.themeManager.updateTheme(node.stateManager.state.theme);
                node.toolbar._init();
            }

            if (dataChanged || sizeChanged) {
                node.renderer.render();
            }
        };

        app.canvas.draw(true, true);
    }
});