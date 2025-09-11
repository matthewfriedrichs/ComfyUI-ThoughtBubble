// js/box-types/textBox.js

import { BaseBox } from "./baseBox.js";

let LORA_LIST_CACHE = null;
async function getLoraList() {
    if (LORA_LIST_CACHE) return LORA_LIST_CACHE;
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

export class TextBox extends BaseBox {
    constructor(options) {
        super(options);
        // This callback is specific to TextBox for save/load functionality
        this.setLastActiveTextarea = options.setLastActiveTextarea;
    }

    render(contentEl) {
        contentEl.className = "thought-bubble-box-content";
        const textarea = document.createElement("textarea");
        textarea.value = this.boxData.content;

        textarea.addEventListener('focus', () => {
            if(this.setLastActiveTextarea) {
                this.setLastActiveTextarea(textarea);
            }
        });

        textarea.addEventListener('input', () => {
            this.boxData.content = textarea.value;
            this.requestSave();
            this.handleLoraAutocomplete(textarea);
        });
        
        textarea.addEventListener('click', () => this.handleLoraAutocomplete(textarea));
        textarea.addEventListener('keyup', () => this.handleLoraAutocomplete(textarea));
        textarea.addEventListener('blur', () => this.closeAutocomplete());

        contentEl.appendChild(textarea);
    }
    
    async handleLoraAutocomplete(textarea) {
        const text = textarea.value;
        const cursorPos = textarea.selectionStart;
        const textBeforeCursor = text.slice(0, cursorPos);
        const match = textBeforeCursor.match(/\blora\(\s*([\w\s-\\]*)$/i);

        this.closeAutocomplete();

        if (match) {
            const loraPrefix = match[1];
            const allLoras = await getLoraList();
            const filteredLoras = allLoras.filter(l => l.toLowerCase().includes(loraPrefix.toLowerCase())).slice(0, 20);

            if (filteredLoras.length > 0) {
                const dropdown = document.createElement('div');
                dropdown.className = 'lora-autocomplete-dropdown';
                this.autocompleteDropdown = dropdown;
                document.body.appendChild(dropdown);

                const rect = textarea.getBoundingClientRect();
                dropdown.style.left = `${rect.left}px`;
                dropdown.style.top = `${rect.bottom}px`;

                filteredLoras.forEach((lora) => {
                    const item = document.createElement('div');
                    item.className = 'lora-autocomplete-item';
                    item.textContent = lora;
                    item.addEventListener('mousedown', (event) => {
                        event.preventDefault();
                        const start = match.index;
                        const newText = text.slice(0, start) + `lora(${lora}:1.0)` + text.slice(cursorPos);
                        textarea.value = newText;
                        this.boxData.content = newText;
                        this.requestSave();
                        this.closeAutocomplete();
                        textarea.focus();
                    });
                    dropdown.appendChild(item);
                });
            }
        }
    }

    closeAutocomplete() {
        if (this.autocompleteDropdown) {
            this.autocompleteDropdown.remove();
            this.autocompleteDropdown = null;
        }
    }

    static createDefaultState(x, y, width, height) {
        return {
            title: "New Box",
            content: "",
            type: "text",
            x, y, width, height,
        };
    }
}
