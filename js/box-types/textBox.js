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
        const commandMatch = textBeforeCursor.match(/\b([iw])\(([^)]*)$/i);
        
        this.closeAutocomplete();

        if (loraMatch) {
            this.handleLoraAutocomplete(loraMatch);
        } else if (commandMatch) {
            this.showVariableDropdown(commandMatch);
        }
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

        const dropdown = document.createElement('div');
        dropdown.className = 'lora-autocomplete-dropdown';
        this.activeDropdown = dropdown;
        document.body.appendChild(dropdown);
        
        const rect = this.textarea.getBoundingClientRect();
        const canvasRect = this.canvasEl.getBoundingClientRect();
        const xPos = Math.max(rect.left, canvasRect.left);
        
        let yPos;
        if (this.lastEvent && typeof this.lastEvent.clientY === 'number') {
            yPos = this.lastEvent.clientY + 20;
        } else {
            const bottomEdge = Math.min(rect.bottom, canvasRect.bottom);
            yPos = bottomEdge - 50;
        }

        dropdown.style.left = `${xPos}px`;
        dropdown.style.top = `${yPos}px`;
        
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
        
        const header = document.createElement('div');
        header.className = 'lora-autocomplete-item';
        header.textContent = `✓ ${currentLinkText}`;
        header.style.fontWeight = 'bold';
        header.style.borderBottom = '1px solid #555';
        dropdown.appendChild(header);

        const defaultOption = document.createElement('div');
        defaultOption.className = 'lora-autocomplete-item';
        defaultOption.textContent = `Default (${defaultText})`;
        defaultOption.addEventListener('mousedown', (e) => {
             e.preventDefault();
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
                const item = document.createElement('div');
                item.className = 'lora-autocomplete-item';
                item.style.paddingLeft = '20px';
                item.textContent = v.name;
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.linkCommandToVariable(commandMatch, v.id);
                    this.closeAutocomplete();
                });
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
        const text = this.textarea.value;
        const cursorPos = this.textarea.selectionStart;
        const commandStartIndex = match.index;
        
        let contentEnd = text.indexOf(')', commandStartIndex);
        if (contentEnd === -1 || contentEnd < cursorPos) { contentEnd = text.length; }
        const commandContent = text.substring(commandStartIndex + "lora(".length, contentEnd);
        const selectedLoraName = commandContent.split(':')[0].trim();
        
        const loraPrefix = match[1].split(':')[0];
        
        this.closeAutocomplete();
        const allLoras = await getLoraList();

        let lorasInFolder = [];
        let otherLoras = [];
        let currentFolder = null;

        if (selectedLoraName && selectedLoraName.includes('/')) {
            currentFolder = selectedLoraName.substring(0, selectedLoraName.lastIndexOf('/'));
        }

        allLoras.forEach(lora => {
            if (currentFolder && lora.startsWith(currentFolder + '/')) {
                lorasInFolder.push(lora);
            } else {
                otherLoras.push(lora);
            }
        });

        const filterFn = l => l.toLowerCase().includes(loraPrefix.toLowerCase());
        lorasInFolder = lorasInFolder.filter(filterFn);
        otherLoras = otherLoras.filter(filterFn);

        if (lorasInFolder.length === 0 && otherLoras.length === 0) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'lora-autocomplete-dropdown';
        this.activeDropdown = dropdown;
        document.body.appendChild(dropdown);

        const rect = this.textarea.getBoundingClientRect();
        const canvasRect = this.canvasEl.getBoundingClientRect();
        const xPos = Math.max(rect.left, canvasRect.left);

        let yPos;
        if (this.lastEvent && typeof this.lastEvent.clientY === 'number') {
            yPos = this.lastEvent.clientY + 20;
        } else {
            const bottomEdge = Math.min(rect.bottom, canvasRect.bottom);
            yPos = bottomEdge - 50;
        }

        dropdown.style.left = `${xPos}px`;
        dropdown.style.top = `${yPos}px`;

        const header = document.createElement('div');
        header.className = 'lora-autocomplete-item';
        header.textContent = selectedLoraName ? `✓ ${selectedLoraName}` : 'Select a LoRA...';
        header.style.fontWeight = 'bold';
        header.style.borderBottom = '1px solid #555';
        dropdown.appendChild(header);

        const addLoraItem = (lora) => {
            const loraName = lora.replace(/\.[^/.]+$/, "");
            if (loraName === selectedLoraName) return;

            const item = document.createElement('div');
            item.className = 'lora-autocomplete-item';
            item.textContent = loraName;
            item.addEventListener('mousedown', (event) => {
                event.preventDefault();

                const fullText = this.textarea.value;
                const commandStart = match.index;
                
                let commandEnd = fullText.indexOf(')', commandStart);
                if (commandEnd === -1) {
                    commandEnd = fullText.length;
                } else {
                    commandEnd += 1; 
                }

                const currentCommandText = fullText.substring(commandStart, commandEnd);
                const strengthMatch = currentCommandText.match(/:[\d.]+\)?$/);
                let strength = strengthMatch ? strengthMatch[0].replace(')','') : ":1.0";
                
                const textBefore = fullText.slice(0, commandStart);
                const textAfter = fullText.slice(commandEnd);
                
                const newCommand = `lora(${loraName}${strength})`;
                const newText = textBefore + newCommand + textAfter;

                this.textarea.value = newText;
                this.boxData.content = newText;
                this.requestSave();
                this.closeAutocomplete();
                
                const newCursorPos = (textBefore + `lora(${loraName}`).length;
                this.textarea.focus();
                this.textarea.setSelectionRange(newCursorPos, newCursorPos);
            });
            dropdown.appendChild(item);
        };

        if (lorasInFolder.length > 0) {
            lorasInFolder.forEach(addLoraItem);
            if (otherLoras.length > 0) {
                const separator = document.createElement('div');
                separator.style.cssText = 'border-top: 1px solid #555; margin: 2px 0;';
                dropdown.appendChild(separator);
            }
        }
        otherLoras.forEach(addLoraItem);
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