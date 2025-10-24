// js/box-types/listBox.js

import { BaseBox } from "./baseBox.js";

/**
 * ListBox
 * A simple box type that displays a textarea for line-separated items.
 * The content is intended to be used by i() or w() commands by referencing the box title.
 */
export class ListBox extends BaseBox {
    constructor(options) {
        super(options);
        // We can reuse the setLastActiveTextarea to track focus, even though
        // this box doesn't have complex autocomplete.
        this.setLastActiveTextarea = options.setLastActiveTextarea;
    }

    render(contentEl) {
        contentEl.className = "thought-bubble-box-content";
        const textarea = document.createElement("textarea");
        textarea.value = this.boxData.content;
        textarea.placeholder = "item 1\nitem 2\nitem 3...";
        this.textarea = textarea;

        // When focused, notify the renderer
        textarea.addEventListener('focus', () => {
            if (this.setLastActiveTextarea) {
                this.setLastActiveTextarea(textarea);
            }
        });

        // On input, save the content to the box data
        textarea.addEventListener('input', () => {
            this.boxData.content = textarea.value;
            this.requestSave();
        });

        contentEl.appendChild(textarea);
    }

    static createDefaultState(x, y, width, height) {
        return {
            title: "new_list",
            content: "item 1\nitem 2\nitem 3",
            type: "list",
            commandLinks: {}, // Include for consistency, though unused here
            x, y, width, height,
        };
    }
}
