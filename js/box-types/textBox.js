import { BaseBox } from "./baseBox.js";
import { app } from "../../../../scripts/app.js";

// --- CACHE HELPERS ---

let LORA_LIST_CACHE = null;
async function getLoraList() {
    if (LORA_LIST_CACHE) return LORA_LIST_CACHE;
    try {
        const response = await fetch("/loras");
        const data = await response.json();
        LORA_LIST_CACHE = data;
        return LORA_LIST_CACHE.map(name => name.replace(/\.[^/.]+$/, ""));
    } catch (error) { return []; }
}

let TEXTFILE_LIST_CACHE = null;
async function getTextFileList() {
    if (TEXTFILE_LIST_CACHE) return TEXTFILE_LIST_CACHE;
    try {
        const response = await fetch("/thoughtbubble/textfiles");
        const data = await response.json();
        TEXTFILE_LIST_CACHE = data;
        return TEXTFILE_LIST_CACHE.map(name => name.replace(/\.txt$/, ""));
    } catch (error) { return []; }
}

let EMBEDDING_LIST_CACHE = null;
async function getEmbeddingList() {
    if (EMBEDDING_LIST_CACHE) return EMBEDDING_LIST_CACHE;
    try {
        const response = await fetch("/embeddings");
        const data = await response.json();
        EMBEDDING_LIST_CACHE = data;
        return EMBEDDING_LIST_CACHE.map(name => name.replace(/\.[^/.]+$/, ""));
    } catch (error) { return []; }
}

// --- MAIN CLASS ---

export class TextBox extends BaseBox {
    constructor(options) {
        super(options);
        this.setLastActiveTextarea = options.setLastActiveTextarea;
        this.canvasEl = options.canvasEl;
        this.activeDropdown = null;
        this.lastEvent = null;

        this.activeHighlightEls = new Map();
    }

    render(contentEl) {
        contentEl.className = "thought-bubble-box-content";
        contentEl.style.position = "relative";

        const textarea = document.createElement("textarea");
        textarea.value = this.boxData.content;
        this.textarea = textarea;

        this.highlightContainer = document.createElement("div");
        this.highlightContainer.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden;";
        contentEl.appendChild(this.highlightContainer);

        const eventHandler = (e) => {
            this.lastEvent = e;
            this.handleContextualAutocomplete();
            this.updateVisuals();
        };

        textarea.addEventListener('focus', (e) => {
            if (this.setLastActiveTextarea) this.setLastActiveTextarea(textarea);
            this.updateVisuals();
        });

        textarea.addEventListener('input', (e) => {
            this.boxData.content = textarea.value;
            this.requestSave();
            eventHandler(e);
        });

        textarea.addEventListener('click', eventHandler);
        textarea.addEventListener('keyup', eventHandler);

        textarea.addEventListener('blur', () => {
            this.closeAutocomplete();
            this.updateVisuals();
        });

        textarea.addEventListener('scroll', () => {
            this.updateVisuals();
        });

        contentEl.appendChild(textarea);
    }

    // --- LIFECYCLE CLEANUP ---
    destroy() {
        this.closeAutocomplete();
    }

    // --- VISUAL PARENTHESIS MATCHING ---

    updateVisuals() {
        const text = this.textarea.value;
        const cursorIndex = this.textarea.selectionStart;
        const isFocused = (document.activeElement === this.textarea);

        const analysis = this.analyzeParentheses(text);

        const hasClosingErrors = analysis.unmatchedCloses.size > 0;
        const hasOpeningErrors = analysis.unmatchedOpens.size > 0;
        const shouldBlink = hasClosingErrors || (hasOpeningErrors && !isFocused);

        if (shouldBlink) {
            this.textarea.classList.add('thought-bubble-input-error');
        } else {
            this.textarea.classList.remove('thought-bubble-input-error');
        }

        const desiredHighlights = new Map();

        analysis.unmatchedCloses.forEach(index => {
            desiredHighlights.set(index, { type: 'error', level: 0 });
        });

        if (!isFocused) {
            analysis.unmatchedOpens.forEach(index => {
                desiredHighlights.set(index, { type: 'error', level: 0 });
            });
        }

        for (const pair of analysis.pairs) {
            if (cursorIndex >= pair.open && cursorIndex <= pair.close + 1) {
                desiredHighlights.set(pair.open, { type: 'match', level: pair.depth });
                desiredHighlights.set(pair.close, { type: 'match', level: pair.depth });
            }
        }

        this.renderHighlights(desiredHighlights, text);
    }

    analyzeParentheses(text) {
        const stack = [];
        const pairs = [];
        const unmatchedCloses = new Set();

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '(') {
                stack.push({ index: i, depth: stack.length });
            } else if (char === ')') {
                if (stack.length > 0) {
                    const open = stack.pop();
                    pairs.push({ open: open.index, close: i, depth: open.depth });
                } else {
                    unmatchedCloses.add(i);
                }
            }
        }

        const unmatchedOpens = new Set();
        while (stack.length > 0) {
            unmatchedOpens.add(stack.pop().index);
        }

        return { pairs, unmatchedCloses, unmatchedOpens };
    }

    renderHighlights(desiredHighlights, text) {
        for (const [index, el] of this.activeHighlightEls) {
            if (!desiredHighlights.has(index)) {
                const currentChar = text[index];
                if (currentChar !== el.textContent) {
                    el.remove();
                    this.activeHighlightEls.delete(index);
                } else {
                    el.classList.add('tb-paren-fading-out');
                    el.classList.remove('tb-paren-active');
                    this.activeHighlightEls.delete(index);
                    setTimeout(() => { if (el.parentElement) el.remove(); }, 500);
                }
            }
        }

        const computed = window.getComputedStyle(this.textarea);
        const fontSettings = {
            fontFamily: computed.fontFamily,
            fontSize: computed.fontSize,
            lineHeight: computed.lineHeight,
            letterSpacing: computed.letterSpacing
        };

        for (const [index, data] of desiredHighlights) {
            let el = this.activeHighlightEls.get(index);

            if (el) {
                const currentIsError = el.classList.contains('tb-paren-error');
                const newIsError = data.type === 'error';
                if (currentIsError !== newIsError) { el.remove(); el = null; }
            }

            if (!el) {
                el = document.createElement('div');
                this.highlightContainer.appendChild(el);
                this.activeHighlightEls.set(index, el);

                el.className = 'thought-bubble-paren-match';
                el.style.fontFamily = fontSettings.fontFamily;
                el.style.fontSize = fontSettings.fontSize;
                el.style.lineHeight = fontSettings.lineHeight;
                el.style.letterSpacing = fontSettings.letterSpacing;
                el.textContent = text[index];

                const coords = getCaretCoordinates(this.textarea, index);
                el.style.left = `${coords.left - this.textarea.scrollLeft}px`;
                el.style.top = `${coords.top - this.textarea.scrollTop}px`;

            } else {
                const coords = getCaretCoordinates(this.textarea, index);
                el.style.left = `${coords.left - this.textarea.scrollLeft}px`;
                el.style.top = `${coords.top - this.textarea.scrollTop}px`;
                if (el.textContent !== text[index]) el.textContent = text[index];
            }

            el.classList.remove('tb-paren-level-0', 'tb-paren-level-1', 'tb-paren-level-2', 'tb-paren-level-3', 'tb-paren-error');

            if (data.type === 'error') {
                el.classList.add('tb-paren-error');
            } else {
                const safeDepth = data.level % 4;
                el.classList.add(`tb-paren-level-${safeDepth}`);
            }

            el.classList.remove('tb-paren-fading-out');
            el.classList.add('tb-paren-active');
        }
    }

    // --- AUTOCOMPLETE LOGIC ---

    handleContextualAutocomplete() {
        const text = this.textarea.value;
        const cursorPos = this.textarea.selectionStart;
        const textBeforeCursor = text.slice(0, cursorPos);

        const loraMatch = textBeforeCursor.match(/\blora\(([^)]*)$/i);
        const embedMatch = textBeforeCursor.match(/\bembed\(([^)]*)$/i);
        const commandMatch = textBeforeCursor.match(/\b([iw])\(([^)]*)$/i);
        const openMatch = textBeforeCursor.match(/\bo\(([^)]*)$/i);
        const genericCmdMatch = textBeforeCursor.match(/\b(eq|if|neg|area|h)\($/i);

        this.closeAutocomplete();

        if (loraMatch) this.handleLoraAutocomplete(loraMatch);
        else if (embedMatch) this.handleEmbeddingAutocomplete(embedMatch);
        else if (commandMatch) this.showVariableDropdown(commandMatch);
        else if (openMatch) this.handleTextFileAutocomplete(openMatch);
        else if (genericCmdMatch) this.showCommandHelp(genericCmdMatch);
    }

    showCommandHelp(match) {
        const cmd = match[1].toLowerCase();
        const templates = {
            'eq': 'eq(val_a|val_b|true_text|false_text)',
            'if': 'if(condition|true_text|false_text)',
            'neg': 'neg(text_to_exclude)',
            'area': 'area(1024x1024)',
            'h': 'h(hidden_text)'
        };

        if (!templates[cmd]) return;

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;

        const header = this.createDropdownHeader(`Syntax Helper`);
        dropdown.appendChild(header);

        const item = this.createDropdownItem(`Insert: ${templates[cmd]}`, () => {
            this.insertAutocompleteText(templates[cmd], match.index);
        });
        dropdown.appendChild(item);
    }

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

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;

        const commandId = commandMatch.index;
        const currentLinkId = this.boxData.commandLinks?.[commandId];
        const commandType = commandMatch[1].toLowerCase();
        const defaultText = commandType === 'i' ? 'Toolbar Run' : 'Node Seed';
        let currentLinkText = `Default (${defaultText})`;

        const allVariables = [];
        variablesByBoxId.forEach(group => allVariables.push(...group.variables));

        if (currentLinkId) {
            const linkedVar = allVariables.find(v => v.id === currentLinkId);
            if (linkedVar) currentLinkText = `${linkedVar.boxTitle} / ${linkedVar.name}`;
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
        if (!this.boxData.commandLinks) this.boxData.commandLinks = {};
        const commandId = commandMatch.index;
        if (variableId) this.boxData.commandLinks[commandId] = variableId;
        else delete this.boxData.commandLinks[commandId];
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

        const selectedLoraName = loraPrefix || 'Select a LoRA...';
        const header = this.createDropdownHeader(`✓ ${selectedLoraName}`);
        dropdown.appendChild(header);

        filteredLoras.forEach(loraName => {
            const item = this.createDropdownItem(loraName, () => {
                const fullText = this.textarea.value;
                const commandStart = match.index;
                this.insertAutocompleteText(`lora(${loraName}:1.0)`, match.index, true);
            });
            dropdown.appendChild(item);
        });
    }

    // --- DROPDOWN HELPERS ---

    createDropdownMenu() {
        const dropdown = document.createElement('div');
        dropdown.className = 'lora-autocomplete-dropdown';
        document.body.appendChild(dropdown);

        const caretCoords = getCaretCoordinates(this.textarea, this.textarea.selectionEnd);
        const rect = this.textarea.getBoundingClientRect();

        // --- FIX: Align X to left edge of box, keep Y dynamic ---
        // Old drifted code: const xPos = rect.left + caretCoords.left - this.textarea.scrollLeft;
        const xPos = rect.left;
        const yPos = rect.top + caretCoords.top + 20 - this.textarea.scrollTop;

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
        const cursorPos = this.textarea.selectionEnd;

        let commandEnd = fullText.indexOf(')', startIndex);
        const distanceToClose = commandEnd - startIndex;
        const isCloseParenFar = distanceToClose > 100 || fullText.slice(startIndex, commandEnd).includes('\n');

        if (commandEnd === -1 || isCloseParenFar) {
            commandEnd = cursorPos;
        } else {
            commandEnd += 1;
        }

        const textBefore = fullText.slice(0, startIndex);
        const textAfter = fullText.slice(commandEnd);

        const newText = textBefore + newCommand + textAfter;
        this.textarea.value = newText;
        this.boxData.content = newText;
        this.requestSave();

        let newCursorPos = (textBefore + newCommand).length - 1;

        if (isLora) {
            const parts = newCommand.split(':');
            newCursorPos = (textBefore + parts[0]).length + 1;
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

// --- UTILITY: Get Caret Coordinates ---
function getCaretCoordinates(element, position) {
    const div = document.createElement('div');
    document.body.appendChild(div);

    const style = div.style;
    const computed = window.getComputedStyle(element);

    style.whiteSpace = 'pre-wrap';
    style.wordWrap = 'break-word';
    style.position = 'absolute';
    style.visibility = 'hidden';

    // Copy font/layout properties exactly
    const properties = [
        'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
        'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
        'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing'
    ];

    properties.forEach(prop => {
        style[prop] = computed[prop];
    });

    if (element.nodeName === 'INPUT') {
        style.overflowX = 'auto';
        style.whiteSpace = 'nowrap';
    } else {
        style.overflowY = 'auto';
    }

    div.textContent = element.value.substring(0, position);

    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);

    const coords = {
        top: span.offsetTop + parseInt(computed['borderTopWidth']),
        left: span.offsetLeft + parseInt(computed['borderLeftWidth']),
        height: parseInt(computed['lineHeight'])
    };

    document.body.removeChild(div);
    return coords;
}