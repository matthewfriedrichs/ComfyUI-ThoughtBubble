export const TITLE_HEIGHT = 28;
export const TOOLBAR_HEIGHT = 36;
export const boxTypeRegistry = new Map();

/**
 * Converts screen coordinates to internal canvas world coordinates.
 */
export function getCanvasCoords(e, canvasEl, state) {
    const rect = canvasEl.getBoundingClientRect();
    const scaleX = canvasEl.offsetWidth > 0 ? rect.width / canvasEl.offsetWidth : 1;
    const scaleY = canvasEl.offsetHeight > 0 ? rect.height / canvasEl.offsetHeight : 1;
    const canvasX = (e.clientX - rect.left) / scaleX;
    const canvasY = (e.clientY - rect.top) / scaleY;

    return {
        x: (canvasX - state.pan.x) / state.zoom,
        y: (canvasY - state.pan.y) / state.zoom
    };
}

/**
 * Reusable modal dialog for Theme Editor and alert prompts.
 */
export class ThoughtBubbleModal {
    constructor() {
        this.overlay = document.createElement("div");
        this.overlay.className = "thought-bubble-modal-overlay";

        this.content = document.createElement("div");
        this.content.className = "thought-bubble-modal-content";

        this.titleElement = document.createElement("h2");
        this.titleElement.className = "thought-bubble-modal-title";

        this.bodyElement = document.createElement("div");
        this.bodyElement.className = "thought-bubble-modal-body";

        this.footerElement = document.createElement("div");
        this.footerElement.className = "thought-bubble-modal-footer";

        const closeButton = document.createElement("button");
        closeButton.textContent = "Close";
        closeButton.onclick = () => this.close();
        this.footerElement.appendChild(closeButton);

        this.content.append(this.titleElement, this.bodyElement, this.footerElement);
        this.overlay.appendChild(this.content);

        this.overlay.addEventListener("mousedown", (e) => {
            if (e.target === this.overlay) this.close();
        });
    }

    show(title, bodyContent, footerButtons = []) {
        this.titleElement.textContent = title;
        this.bodyElement.innerHTML = "";
        this.bodyElement.appendChild(bodyContent);

        this.footerElement.querySelectorAll("button:not(:last-child)").forEach(btn => btn.remove());
        footerButtons.forEach(btn => this.footerElement.insertBefore(btn, this.footerElement.lastChild));

        document.body.appendChild(this.overlay);
    }

    close() {
        if (this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
        }
    }
}