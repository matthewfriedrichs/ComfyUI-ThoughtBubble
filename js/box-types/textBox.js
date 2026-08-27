import { BaseBox } from "./baseBox.js";

let LORA_LIST_CACHE = null;
async function getLoraList() {
    if (LORA_LIST_CACHE) return LORA_LIST_CACHE;
    try {
        const res = await fetch("/loras");
        const data = await res.json();
        LORA_LIST_CACHE = data;
        return LORA_LIST_CACHE.map(name => name.replace(/\.[^/.]+$/, ""));
    } catch {
        return [];
    }
}

let TEXTFILE_LIST_CACHE = null;
async function getTextFileList() {
    if (TEXTFILE_LIST_CACHE) return TEXTFILE_LIST_CACHE;
    try {
        const res = await fetch("/thoughtbubble/textfiles");
        TEXTFILE_LIST_CACHE = await res.json();
        return TEXTFILE_LIST_CACHE.map(name => name.replace(/\.txt$/, ""));
    } catch {
        return [];
    }
}

let EMBEDDING_LIST_CACHE = null;
async function getEmbeddingList() {
    if (EMBEDDING_LIST_CACHE) return EMBEDDING_LIST_CACHE;
    try {
        const res = await fetch("/embeddings");
        EMBEDDING_LIST_CACHE = await res.json();
        return EMBEDDING_LIST_CACHE.map(name => name.replace(/\.[^/.]+$/, ""));
    } catch {
        return [];
    }
}

export class TextBox extends BaseBox {
    constructor(options) {
        super(options);
        this.activeDropdown = null;
        this.lastEvent = null;
        this.activeHighlightEls = new Map();
        this._globalClickDismiss = null;
    }

    render(contentEl) {
        contentEl.className = "thought-bubble-box-content";
        contentEl.style.position = "relative";

        const textarea = document.createElement("textarea");
        textarea.value = this.boxData.content || "";
        this.textarea = textarea;

        this.highlightContainer = document.createElement("div");
        this.highlightContainer.style.cssText = "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; overflow: hidden;";
        contentEl.appendChild(this.highlightContainer);

        const eventHandler = (e) => {
            this.lastEvent = e;
            this.handleContextualAutocomplete();
            this.updateVisuals();
        };

        textarea.addEventListener("focus", () => this.updateVisuals());
        textarea.addEventListener("input", (e) => {
            this.boxData.content = textarea.value;
            this.requestSave();
            eventHandler(e);
        });

        textarea.addEventListener("click", eventHandler);
        textarea.addEventListener("keyup", eventHandler);
        textarea.addEventListener("scroll", () => this.updateVisuals());
        textarea.addEventListener("blur", () => {
            setTimeout(() => {
                if (document.activeElement !== this.textarea &&
                    (!this.activeDropdown || !this.activeDropdown.contains(document.activeElement))) {
                    this.closeAutocomplete();
                }
            }, 150);
            this.updateVisuals();
        });

        contentEl.appendChild(textarea);
    }

    setContent(newContent) {
        this.boxData.content = newContent;
        if (this.textarea && this.textarea.value !== newContent) {
            const isFocused = document.activeElement === this.textarea;
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;
            this.textarea.value = newContent;
            if (isFocused) {
                this.textarea.setSelectionRange(start, end);
            }
            this.updateVisuals();
        }
    }

    patchPersisters(updates) {
        if (!updates || updates.length === 0) return;
        let text = this.textarea ? this.textarea.value : (this.boxData.content || "");
        const isFocused = document.activeElement === this.textarea;
        let selStart = this.textarea ? this.textarea.selectionStart : 0;
        let selEnd = this.textarea ? this.textarea.selectionEnd : 0;

        for (const update of updates) {
            const { name, new_value } = update;
            if (!name || new_value === undefined) continue;

            const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`(\\b(?:p|persister)\\(\\s*${escapedName}\\s*\\|)([^)]*)(\\))`, "gi");

            text = text.replace(regex, (match, prefix, oldVal, suffix, offset) => {
                const replacement = `${prefix}${new_value}${suffix}`;
                const diff = replacement.length - match.length;

                if (offset < selStart) {
                    selStart += diff;
                }
                if (offset < selEnd) {
                    selEnd += diff;
                }
                return replacement;
            });
        }

        this.boxData.content = text;
        if (this.textarea && this.textarea.value !== text) {
            this.textarea.value = text;
            if (isFocused) {
                this.textarea.setSelectionRange(selStart, selEnd);
            }
            this.updateVisuals();
        }
        if (typeof this.requestSaveDebounced === "function") {
            this.requestSaveDebounced(200);
        } else {
            this.requestSave();
        }
    }

    destroy() {
        this.closeAutocomplete();
    }

    // --- PARENTHESIS HIGHLIGHTING & MATCHING ---
    updateVisuals() {
        if (!this.textarea) return;
        const text = this.textarea.value;
        const cursorIndex = this.textarea.selectionStart;
        const isFocused = document.activeElement === this.textarea;

        const analysis = this.analyzeParentheses(text);
        const shouldBlink = analysis.unmatchedCloses.size > 0 || (analysis.unmatchedOpens.size > 0 && !isFocused);
        this.textarea.classList.toggle("thought-bubble-input-error", shouldBlink);

        const desiredHighlights = new Map();
        analysis.unmatchedCloses.forEach(idx => desiredHighlights.set(idx, { type: "error", level: 0 }));
        if (!isFocused) {
            analysis.unmatchedOpens.forEach(idx => desiredHighlights.set(idx, { type: "error", level: 0 }));
        }

        for (const pair of analysis.pairs) {
            if (cursorIndex >= pair.open && cursorIndex <= pair.close + 1) {
                desiredHighlights.set(pair.open, { type: "match", level: pair.depth });
                desiredHighlights.set(pair.close, { type: "match", level: pair.depth });
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
            if (char === "(") {
                stack.push({ index: i, depth: stack.length });
            } else if (char === ")") {
                if (stack.length > 0) {
                    const open = stack.pop();
                    pairs.push({ open: open.index, close: i, depth: open.depth });
                } else {
                    unmatchedCloses.add(i);
                }
            }
        }

        const unmatchedOpens = new Set(stack.map(s => s.index));
        return { pairs, unmatchedCloses, unmatchedOpens };
    }

    renderHighlights(desiredHighlights, text) {
        if (!this.highlightContainer || !this.textarea) return;

        for (const [index, el] of this.activeHighlightEls) {
            if (!desiredHighlights.has(index)) {
                if (text[index] !== el.textContent) {
                    el.remove();
                    this.activeHighlightEls.delete(index);
                } else {
                    el.classList.add("tb-paren-fading-out");
                    el.classList.remove("tb-paren-active");
                    this.activeHighlightEls.delete(index);
                    setTimeout(() => el.remove(), 400);
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
            if (!el) {
                el = document.createElement("div");
                this.highlightContainer.appendChild(el);
                this.activeHighlightEls.set(index, el);
                Object.assign(el.style, fontSettings);
            }
            el.textContent = text[index];
            const coords = getCaretCoordinates(this.textarea, index);
            el.style.left = `${coords.left - this.textarea.scrollLeft}px`;
            el.style.top = `${coords.top - this.textarea.scrollTop}px`;
            el.className = `thought-bubble-paren-match tb-paren-active ${data.type === "error" ? "tb-paren-error" : `tb-paren-level-${data.level % 4}`}`;
        }
    }

    // --- CONTEXTUAL AUTOCOMPLETE ---
    handleContextualAutocomplete() {
        const fullText = this.textarea.value;
        const cursorPos = this.textarea.selectionStart;
        const textBeforeCursor = fullText.slice(0, cursorPos);

        const lastLoraIndex = textBeforeCursor.lastIndexOf("lora(");
        if (lastLoraIndex !== -1) {
            const textAfterLora = fullText.slice(lastLoraIndex, cursorPos);
            if (!textAfterLora.includes(")") && !textAfterLora.includes(" ")) {
                const match = fullText.slice(lastLoraIndex).match(/^lora\(([^):\s]*)/i);
                this.handleLoraAutocomplete(match ? match[1].trim() : "", lastLoraIndex);
                return;
            }
        }

        this.closeAutocomplete();

        const embedMatch = textBeforeCursor.match(/\bembed\(([^)]*)$/i);
        const openMatch = textBeforeCursor.match(/\bo\(([^)]*)$/i);

        if (embedMatch) this.handleEmbedAutocomplete(embedMatch);
        else if (openMatch) this.handleTextFileAutocomplete(openMatch);
    }

    async handleLoraAutocomplete(query, startIndex) {
        const allLoras = await getLoraList();
        const searchTerms = query.toLowerCase().split(/[\s_\-]+/).filter(t => t.length > 0);
        const filtered = searchTerms.length > 0
            ? allLoras.filter(l => searchTerms.every(term => l.toLowerCase().includes(term)))
            : allLoras;

        if (filtered.length === 0) return;

        const dropdown = this.createDropdownMenu();
        dropdown.appendChild(this.createDropdownHeader(query ? `LoRAs: ${query}` : "Select a LoRA..."));

        filtered.slice(0, 50).forEach(loraName => {
            dropdown.appendChild(this.createDropdownItem(loraName, () => {
                this.insertAutocompleteText(`lora(${loraName}:1.0)`, startIndex, true);
            }));
        });
    }

    async handleEmbedAutocomplete(match) {
        const prefix = match[1];
        const allEmbeddings = await getEmbeddingList();
        const filtered = allEmbeddings.filter(e => e.toLowerCase().includes(prefix.toLowerCase()));
        if (filtered.length === 0) return;

        const dropdown = this.createDropdownMenu();
        dropdown.appendChild(this.createDropdownHeader(`Embeddings: ${prefix}`));
        filtered.slice(0, 50).forEach(name => {
            dropdown.appendChild(this.createDropdownItem(name, () => {
                this.insertAutocompleteText(`embed(${name})`, match.index);
            }));
        });
    }

    async handleTextFileAutocomplete(match) {
        const prefix = match[1];
        const allFiles = await getTextFileList();
        const filtered = allFiles.filter(f => f.toLowerCase().includes(prefix.toLowerCase()));
        if (filtered.length === 0) return;

        const dropdown = this.createDropdownMenu();
        dropdown.appendChild(this.createDropdownHeader(`Text Files: ${prefix}`));
        filtered.slice(0, 50).forEach(file => {
            dropdown.appendChild(this.createDropdownItem(file, () => {
                this.insertAutocompleteText(`o(${file})`, match.index);
            }));
        });
    }

    createDropdownMenu() {
        this.closeAutocomplete();
        const dropdown = document.createElement("div");
        dropdown.className = "lora-autocomplete-dropdown";
        document.body.appendChild(dropdown);

        const caretCoords = getCaretCoordinates(this.textarea, this.textarea.selectionEnd);
        const rect = this.textarea.getBoundingClientRect();

        dropdown.style.left = `${rect.left}px`;
        dropdown.style.top = `${rect.top + caretCoords.top + 22 - this.textarea.scrollTop}px`;

        this.activeDropdown = dropdown;
        this._globalClickDismiss = (e) => {
            if (this.activeDropdown && !this.activeDropdown.contains(e.target) && e.target !== this.textarea) {
                this.closeAutocomplete();
            }
        };
        document.addEventListener("mousedown", this._globalClickDismiss);
        return dropdown;
    }

    createDropdownHeader(text) {
        const header = document.createElement("div");
        header.className = "lora-autocomplete-item";
        header.textContent = text;
        header.style.cssText = "font-weight: bold; border-bottom: 1px solid var(--tb-box-border-color); opacity: 0.8;";
        return header;
    }

    createDropdownItem(text, onSelect) {
        const item = document.createElement("div");
        item.className = "lora-autocomplete-item";
        item.textContent = text;
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            onSelect();
            this.closeAutocomplete();
        });
        return item;
    }

    insertAutocompleteText(newCommand, startIndex, isLora = false) {
        const fullText = this.textarea.value;
        let commandEnd = fullText.indexOf(")", startIndex);
        if (commandEnd === -1 || commandEnd - startIndex > 100 || fullText.slice(startIndex, commandEnd).includes("\n")) {
            commandEnd = this.textarea.selectionEnd;
        } else {
            commandEnd += 1;
        }

        this.textarea.value = fullText.slice(0, startIndex) + newCommand + fullText.slice(commandEnd);
        this.boxData.content = this.textarea.value;
        this.requestSave();

        const newCursorPos = fullText.slice(0, startIndex).length + (isLora ? newCommand.indexOf(":") : newCommand.length);
        this.textarea.focus();
        this.textarea.setSelectionRange(newCursorPos, newCursorPos);
        this.updateVisuals();
    }

    closeAutocomplete() {
        if (this.activeDropdown) {
            this.activeDropdown.remove();
            this.activeDropdown = null;
        }
        if (this._globalClickDismiss) {
            document.removeEventListener("mousedown", this._globalClickDismiss);
            this._globalClickDismiss = null;
        }
    }

    static createDefaultState(x, y, width, height) {
        return { title: "output", content: "", type: "text", x, y, width, height };
    }
}

function getCaretCoordinates(element, position) {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const style = div.style;
    const computed = window.getComputedStyle(element);

    style.cssText = "white-space: pre-wrap; word-wrap: break-word; position: absolute; visibility: hidden;";
    ["direction", "boxSizing", "width", "height", "overflowX", "overflowY", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontSizeAdjust", "lineHeight", "fontFamily", "textAlign", "textTransform", "textIndent", "textDecoration", "letterSpacing", "wordSpacing"].forEach(prop => style[prop] = computed[prop]);

    div.textContent = element.value.substring(0, position);
    const span = document.createElement("span");
    span.textContent = element.value.substring(position) || ".";
    div.appendChild(span);

    const coords = {
        top: span.offsetTop + parseInt(computed.borderTopWidth || "0", 10),
        left: span.offsetLeft + parseInt(computed.borderLeftWidth || "0", 10),
    };
    div.remove();
    return coords;
}