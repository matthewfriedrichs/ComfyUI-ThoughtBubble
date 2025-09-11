// js/utils.js

export const TITLE_HEIGHT = 26;
export const TOOLBAR_HEIGHT = 30;

export const boxTypeRegistry = new Map();

/**
 * Converts mouse event screen coordinates to the canvas's internal "world" coordinates.
 * @param {MouseEvent} e The mouse event.
 * @param {HTMLElement} canvasEl The main canvas element.
 * @param {object} state The current state object, containing pan and zoom.
 * @param {number} uiScale The global scale factor of the ComfyUI interface.
 * @returns {{x: number, y: number}} The coordinates in world space.
 */
export function getCanvasCoords(e, canvasEl, state, uiScale = 1) {
    const rect = canvasEl.getBoundingClientRect();
    // Correct the mouse position by the UI scale before converting to world coordinates
    const x = (e.clientX / uiScale) - rect.left;
    const y = (e.clientY / uiScale) - rect.top;
    
    return {
        x: (x - state.pan.x) / state.zoom,
        y: (y - state.pan.y) / state.zoom
    };
}

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
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });
    }
    show(title, bodyContent, footerButtons = []) {
        this.titleElement.textContent = title;
        this.bodyElement.innerHTML = "";
        this.bodyElement.appendChild(bodyContent);
        this.footerElement.querySelectorAll('button:not(:last-child)').forEach(btn => btn.remove());
        footerButtons.forEach(btn => this.footerElement.insertBefore(btn, this.footerElement.lastChild));
        document.body.appendChild(this.overlay);
    }
    close() {
        if (this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    }
}