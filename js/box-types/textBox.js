// js/box-types/textBox.js

import { BaseBox } from "./baseBox.js";
import { app } from "../../../../scripts/app.js";

let LORA_LIST_CACHE = null;
async function getLoraList() {
    if (LORA_LIST_CACHE) return LORA_LIST_CACHE;
    try {
        const response = await fetch("/loras");
        const data = await response.json();
        LORA_LIST_CACHE = data;
        return LORA_LIST_CACHE.map(name => name.replace(/\.[^/.]+$/, ""));
    } catch (error) {
        console.error("Failed to fetch LoRA list:", error);
        return [];
    }
}

let TEXTFILE_LIST_CACHE = null;
async function getTextFileList() {
    if (TEXTFILE_LIST_CACHE) return TEXTFILE_LIST_CACHE;
    try {
        const response = await fetch("/thoughtbubble/textfiles");
        const data = await response.json();
        TEXTFILE_LIST_CACHE = data;
        return TEXTFILE_LIST_CACHE.map(name => name.replace(/\.txt$/, ""));
    } catch (error) {
        console.error("Failed to fetch text file list:", error);
        return [];
    }
}

// --- NEW: Add embedding list fetching and caching ---
let EMBEDDING_LIST_CACHE = null;
async function getEmbeddingList() {
    if (EMBEDDING_LIST_CACHE) return EMBEDDING_LIST_CACHE;
    try {
        const response = await fetch("/embeddings"); // Assumes an endpoint like /loras
        const data = await response.json();
        EMBEDDING_LIST_CACHE = data;
        return EMBEDDING_LIST_CACHE.map(name => name.replace(/\.[^/.]+$/, ""));
    } catch (error) {
        console.error("Failed to fetch embedding list:", error);
        return [];
    }
}


export class TextBox extends BaseBox {
    constructor(options) {
        super(options);
        this.setLastActiveTextarea = options.setLastActiveTextarea;
        this.canvasEl = options.canvasEl;
        this.activeDropdown = null;
        this.lastEvent = null; // Store the last mouse/key event
    }

    render(contentEl) {
        contentEl.className = "thought-bubble-box-content";
        const textarea = document.createElement("textarea");
        textarea.value = this.boxData.content;
        this.textarea = textarea;

        const eventHandler = (e) => {
            this.lastEvent = e;
            this.handleContextualAutocomplete();
        };

        textarea.addEventListener('focus', (e) => {
            if (this.setLastActiveTextarea) this.setLastActiveTextarea(textarea);
            eventHandler(e);
        });
        textarea.addEventListener('input', (e) => {
            this.boxData.content = textarea.value;
            this.requestSave();
            eventHandler(e);
        });
        textarea.addEventListener('click', eventHandler);
        textarea.addEventListener('keyup', eventHandler);
        textarea.addEventListener('blur', () => this.closeAutocomplete());

        contentEl.appendChild(textarea);
    }

    handleContextualAutocomplete() {
        const text = this.textarea.value;
        const cursorPos = this.textarea.selectionStart;
        const textBeforeCursor = text.slice(0, cursorPos);

        const loraMatch = textBeforeCursor.match(/\blora\(([^)]*)$/i);
        const embedMatch = textBeforeCursor.match(/\bembed\(([^)]*)$/i); // <-- NEW
        const commandMatch = textBeforeCursor.match(/\b([iw])\(([^)]*)$/i);
        const openMatch = textBeforeCursor.match(/\bo\(([^)]*)$/i);

        this.closeAutocomplete();

        if (loraMatch) {
            this.handleLoraAutocomplete(loraMatch);
        } else if (embedMatch) { // <-- NEW
            this.handleEmbeddingAutocomplete(embedMatch);
        } else if (commandMatch) {
            this.showVariableDropdown(commandMatch);
        } else if (openMatch) {
            this.handleTextFileAutocomplete(openMatch);
        }
    }

    // --- NEW: Autocomplete handler for embeddings ---
    async handleEmbeddingAutocomplete(match) {
        const prefix = match[1];
        this.closeAutocomplete();

        const allEmbeddings = await getEmbeddingList();
        const filteredEmbeddings = allEmbeddings.filter(e => e.toLowerCase().includes(prefix.toLowerCase()));
        if (filteredEmbeddings.length === 0) return;

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;

        const header = this.createDropdownHeader(`✓ ${prefix}` || 'Select an embedding...');
        dropdown.appendChild(header);

        filteredEmbeddings.forEach(embeddingName => {
            const item = this.createDropdownItem(embeddingName, () => {
                this.insertAutocompleteText(`embed(${embeddingName})`, match.index);
            });
            dropdown.appendChild(item);
        });
    }


    async handleTextFileAutocomplete(match) {
        const prefix = match[1];
        this.closeAutocomplete();

        const allFiles = await getTextFileList();
        const filteredFiles = allFiles.filter(f => f.toLowerCase().includes(prefix.toLowerCase()));
        if (filteredFiles.length === 0) return;

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;

        const header = this.createDropdownHeader(`✓ ${prefix}` || 'Select a file...');
        dropdown.appendChild(header);

        filteredFiles.forEach(filename => {
            const item = this.createDropdownItem(filename, () => {
                this.insertAutocompleteText(`o(${filename})`, match.index);
            });
            dropdown.appendChild(item);
        });
    }


    showVariableDropdown(commandMatch) {
        const variablesByBoxId = new Map();

        app.graph._nodes.forEach(node => {
            if (node.type === "ThoughtBubbleNode") {
                node.stateManager.state.boxes.forEach(box => {
                    if (box.type === 'controls' && box.variables && box.variables.length > 0) {
                        if (!variablesByBoxId.has(box.id)) {
                            variablesByBoxId.set(box.id, { title: box.title, variables: [] });
                        }
                        box.variables.forEach(v => {
                            variablesByBoxId.get(box.id).variables.push({ id: v.id, name: v.name, boxTitle: box.title });
                        });
                    }
                });
            }
        });

        const allVariables = [];
        variablesByBoxId.forEach(group => allVariables.push(...group.variables));

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;

        const commandId = commandMatch.index;
        const currentLinkId = this.boxData.commandLinks?.[commandId];
        const commandType = commandMatch[1].toLowerCase();
        const defaultText = commandType === 'i' ? 'Toolbar Run' : 'Node Seed';
        let currentLinkText = `Default (${defaultText})`;

        if (currentLinkId) {
            const linkedVar = allVariables.find(v => v.id === currentLinkId);
            if(linkedVar) {
                currentLinkText = `${linkedVar.boxTitle} / ${linkedVar.name}`;
            }
        }

        const header = this.createDropdownHeader(`✓ ${currentLinkText}`);
        dropdown.appendChild(header);

        const defaultOption = this.createDropdownItem(`Default (${defaultText})`, () => {
             this.linkCommandToVariable(commandMatch, null);
             this.closeAutocomplete();
        });
        dropdown.appendChild(defaultOption);

        for (const [boxId, group] of variablesByBoxId.entries()) {
            const groupHeader = document.createElement('div');
            groupHeader.className = 'lora-autocomplete-item';
            groupHeader.textContent = group.title;
            groupHeader.style.fontWeight = 'bold';
            groupHeader.style.color = '#aaa';
            groupHeader.style.pointerEvents = 'none';
            dropdown.appendChild(groupHeader);

            group.variables.forEach(v => {
                const item = this.createDropdownItem(v.name, () => {
                    this.linkCommandToVariable(commandMatch, v.id);
                    this.closeAutocomplete();
                });
                item.style.paddingLeft = '20px';
                dropdown.appendChild(item);
            });
        }
    }

    linkCommandToVariable(commandMatch, variableId) {
        if (!this.boxData.commandLinks) {
            this.boxData.commandLinks = {};
        }

        const commandId = commandMatch.index;

        if (variableId) {
            this.boxData.commandLinks[commandId] = variableId;
        } else {
            delete this.boxData.commandLinks[commandId];
        }

        this.requestSave();
    }

    async handleLoraAutocomplete(match) {
        const loraPrefix = match[1].split(':')[0];
        this.closeAutocomplete();

        const allLoras = await getLoraList();
        const filteredLoras = allLoras.filter(l => l.toLowerCase().includes(loraPrefix.toLowerCase()));
        if (filteredLoras.length === 0) return;

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;
        
        const currentCommandText = this.textarea.value.slice(match.index, this.textarea.selectionStart);
        const selectedLoraName = loraPrefix || 'Select a LoRA...';

        const header = this.createDropdownHeader(`✓ ${selectedLoraName}`);
        dropdown.appendChild(header);

        filteredLoras.forEach(loraName => {
            const item = this.createDropdownItem(loraName, () => {
                const fullText = this.textarea.value;
                const commandStart = match.index;
                let commandEnd = fullText.indexOf(')', commandStart);
                if (commandEnd === -1) commandEnd = fullText.length; else commandEnd += 1;

                const currentFullCommand = fullText.substring(commandStart, commandEnd);
                const strengthMatch = currentFullCommand.match(/:[\d.]+\)?$/);
                const strength = strengthMatch ? strengthMatch[0].replace(')', '') : ":1.0";
                
                this.insertAutocompleteText(`lora(${loraName}${strength})`, match.index, true);
            });
            dropdown.appendChild(item);
        });
    }

    // --- NEW: Helper functions for dropdowns ---
    createDropdownMenu() {
        const dropdown = document.createElement('div');
        dropdown.className = 'lora-autocomplete-dropdown';
        document.body.appendChild(dropdown);

        const rect = this.textarea.getBoundingClientRect();
        const canvasRect = this.canvasEl.getBoundingClientRect();
        const xPos = Math.max(rect.left, canvasRect.left);
        let yPos = (this.lastEvent && typeof this.lastEvent.clientY === 'number') ? this.lastEvent.clientY + 20 : Math.min(rect.bottom, canvasRect.bottom) - 50;

        dropdown.style.left = `${xPos}px`;
        dropdown.style.top = `${yPos}px`;
        return dropdown;
    }

    createDropdownHeader(text) {
        const header = document.createElement('div');
        header.className = 'lora-autocomplete-item';
        header.textContent = text;
        header.style.fontWeight = 'bold';
        header.style.borderBottom = '1px solid #555';
        return header;
    }

    createDropdownItem(text, onSelect) {
        const item = document.createElement('div');
        item.className = 'lora-autocomplete-item';
        item.textContent = text;
        item.addEventListener('mousedown', (event) => {
            event.preventDefault();
            onSelect();
            this.closeAutocomplete();
        });
        return item;
    }

    insertAutocompleteText(newCommand, startIndex, isLora = false) {
        const fullText = this.textarea.value;
        let commandEnd = fullText.indexOf(')', startIndex);
        if (commandEnd === -1) commandEnd = fullText.length; else commandEnd += 1;

        const textBefore = fullText.slice(0, startIndex);
        const textAfter = fullText.slice(commandEnd);

        const newText = textBefore + newCommand + textAfter;
        this.textarea.value = newText;
        this.boxData.content = newText;
        this.requestSave();

        let newCursorPos = (textBefore + newCommand).length - 1;
        if(isLora) {
             newCursorPos = (textBefore + newCommand.split(':')[0]).length;
        }


        this.textarea.focus();
        this.textarea.setSelectionRange(newCursorPos, newCursorPos);
    }


    closeAutocomplete() {
        if (this.activeDropdown) {
            this.activeDropdown.remove();
            this.activeDropdown = null;
        }
    }

    static createDefaultState(x, y, width, height) {
        return {
            title: "New Box",
            content: "",
            type: "text",
            commandLinks: {},
            x, y, width, height,
        };
    }
}
