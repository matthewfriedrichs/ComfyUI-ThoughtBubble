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

// --- SNIPPET API CALL ---
async function fetchSnippets() {
    try {
        const response = await fetch("/thoughtbubble/snippets/get");
        return await response.json();
    } catch (e) {
        return { Categories: {} };
    }
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
        this._globalClickDismiss = null;
    }

    render(contentEl) {
        contentEl.className = "thought-bubble-box-content";
        contentEl.style.position = "relative";

        const textarea = document.createElement("textarea");
        textarea.value = this.boxData.content;
        this.textarea = textarea;

        // --- ENHANCED DRAG FOR TEXT (Z-Index Smart Sort) ---
        textarea.addEventListener('dragstart', (e) => {
            const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
            if (selectedText) {
                e.dataTransfer.setData('text/plain', selectedText);

                // FIX: 50ms delay stops the SnippetBox from stealing focus instantly and aborting the drag!
                setTimeout(() => {
                    const snippetEl = this.getSnippetBoxElement();
                    if (snippetEl) {
                        snippetEl.style.zIndex = '10000';
                        snippetEl.style.boxShadow = '0 0 15px rgba(76, 175, 80, 0.6)';
                        snippetEl.style.transition = 'box-shadow 0.2s ease-in-out';
                    }
                }, 50);
            }
        });

        textarea.addEventListener('dragend', () => {
            const snippetEl = this.getSnippetBoxElement();
            if (snippetEl) {
                snippetEl.style.zIndex = '';
                snippetEl.style.boxShadow = '';
            }
        });

        // --- NATIVE PLACEMENT WITH SMART SPACING ---
        textarea.addEventListener('dragenter', (e) => e.stopPropagation());

        textarea.addEventListener('dragover', (e) => {
            e.stopPropagation(); // Hide from ComfyUI Canvas, but let browser track the caret natively
        });

        textarea.addEventListener('drop', (e) => {
            e.stopPropagation(); // Hide from ComfyUI Canvas

            // Check if this drop came from our Chip Pool
            if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('application/tb-chip')) {
                e.preventDefault(); // Stop native paste so we can inject smart spaces

                const textToInsert = e.dataTransfer.getData('text/plain');
                if (textToInsert) {
                    const insertPos = textarea.selectionStart;
                    const fullText = textarea.value;

                    let prefix = "";
                    let suffix = "";

                    // Add space before if the left character is not a space/newline
                    if (insertPos > 0) {
                        const charLeft = fullText[insertPos - 1];
                        if (charLeft !== ' ' && charLeft !== '\n') {
                            prefix = " ";
                        }
                    }

                    // Add space after if the right character is not a space/newline
                    if (insertPos < fullText.length) {
                        const charRight = fullText[insertPos];
                        if (charRight !== ' ' && charRight !== '\n') {
                            suffix = " ";
                        }
                    }

                    const textBefore = fullText.slice(0, insertPos);
                    const textAfter = fullText.slice(textarea.selectionEnd); // Clears highlighted text if dropping onto a selection

                    const finalInsertion = prefix + textToInsert + suffix;
                    textarea.value = textBefore + finalInsertion + textAfter;
                    this.boxData.content = textarea.value;
                    this.requestSave();

                    // Advance the cursor to the end of the newly pasted chip text
                    const newCursorPos = textBefore.length + prefix.length + textToInsert.length;
                    textarea.focus();
                    textarea.setSelectionRange(newCursorPos, newCursorPos);

                    if (this.lastEvent) this.updateVisuals();
                }
            } else {
                // Regular text drops from outside sources (no smart spacing)
                setTimeout(() => {
                    this.boxData.content = textarea.value;
                    this.requestSave();
                    this.updateVisuals();
                }, 10);
            }
        });

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

        // --- SPAWN / MOVE SNIPPET BOX HOTKEY ---
        textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault();
                this.spawnOrMoveSnippetBox();
            }
        });

        textarea.addEventListener('blur', () => {
            setTimeout(() => {
                if (document.activeElement !== this.textarea &&
                    (!this.activeDropdown || !this.activeDropdown.contains(document.activeElement))) {
                    this.closeAutocomplete();
                }
            }, 150);
            this.updateVisuals();
        });

        textarea.addEventListener('scroll', () => {
            this.updateVisuals();
        });

        contentEl.appendChild(textarea);
    }

    destroy() {
        this.closeAutocomplete();
    }

    // --- SNIPPET BOX UTILITIES ---
    getSnippetBoxElement() {
        const contentEl = document.querySelector('.thought-bubble-box-content[data-box-type="snippets"]');
        if (contentEl) {
            return contentEl.closest('.thought-bubble-box') || contentEl.parentElement;
        }
        return null;
    }

    spawnOrMoveSnippetBox() {
        const tbNode = app.graph._nodes.find(n => n.type === "ThoughtBubbleNode");
        if (!tbNode || !tbNode.stateManager) return;
        const sm = tbNode.stateManager;

        const gap = 20;
        const newX = this.boxData.x + this.boxData.width + gap;
        const newY = this.boxData.y;

        // Find and destroy all existing snippet boxes globally
        const existingSnippets = sm.state.boxes.filter(b => b.type === 'snippets');
        if (existingSnippets.length > 0) {
            sm.state.boxes = sm.state.boxes.filter(b => b.type !== 'snippets');
            document.querySelectorAll('.thought-bubble-box-content[data-box-type="snippets"]').forEach(el => {
                const parent = el.closest('.thought-bubble-box');
                if (parent) parent.remove();
            });
        }

        // Spawn exactly ONE fresh instance next to the text box
        sm.createNewBox('snippets', newX, newY, 300, 400);
        sm.save(true);

        if (tbNode.toolbar && tbNode.toolbar.renderer) {
            tbNode.toolbar.renderer.render();
        }
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

        if (shouldBlink) this.textarea.classList.add('thought-bubble-input-error');
        else this.textarea.classList.remove('thought-bubble-input-error');

        const desiredHighlights = new Map();
        analysis.unmatchedCloses.forEach(index => desiredHighlights.set(index, { type: 'error', level: 0 }));
        if (!isFocused) analysis.unmatchedOpens.forEach(index => desiredHighlights.set(index, { type: 'error', level: 0 }));

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
            if (char === '(') stack.push({ index: i, depth: stack.length });
            else if (char === ')') {
                if (stack.length > 0) {
                    const open = stack.pop();
                    pairs.push({ open: open.index, close: i, depth: open.depth });
                } else unmatchedCloses.add(i);
            }
        }
        const unmatchedOpens = new Set();
        while (stack.length > 0) unmatchedOpens.add(stack.pop().index);
        return { pairs, unmatchedCloses, unmatchedOpens };
    }

    renderHighlights(desiredHighlights, text) {
        for (const [index, el] of this.activeHighlightEls) {
            if (!desiredHighlights.has(index)) {
                if (text[index] !== el.textContent) {
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
        const fontSettings = { fontFamily: computed.fontFamily, fontSize: computed.fontSize, lineHeight: computed.lineHeight, letterSpacing: computed.letterSpacing };

        for (const [index, data] of desiredHighlights) {
            let el = this.activeHighlightEls.get(index);
            if (el) {
                if (el.classList.contains('tb-paren-error') !== (data.type === 'error')) { el.remove(); el = null; }
            }
            if (!el) {
                el = document.createElement('div');
                this.highlightContainer.appendChild(el);
                this.activeHighlightEls.set(index, el);
                el.className = 'thought-bubble-paren-match';
                Object.assign(el.style, fontSettings);
                el.textContent = text[index];
            } else if (el.textContent !== text[index]) {
                el.textContent = text[index];
            }

            const coords = getCaretCoordinates(this.textarea, index);
            el.style.left = `${coords.left - this.textarea.scrollLeft}px`;
            el.style.top = `${coords.top - this.textarea.scrollTop}px`;

            el.className = `thought-bubble-paren-match tb-paren-active ${data.type === 'error' ? 'tb-paren-error' : `tb-paren-level-${data.level % 4}`}`;
        }
    }


    // --- UNIFIED AUTOCOMPLETE LOGIC ---
    handleContextualAutocomplete() {
        const fullText = this.textarea.value;
        const cursorPos = this.textarea.selectionStart;
        const textBeforeCursor = fullText.slice(0, cursorPos);

        const lastLoraIndex = textBeforeCursor.lastIndexOf('lora(');
        let insideLora = false;
        let loraQuery = "";

        if (lastLoraIndex !== -1) {
            const textAfterLoraStart = fullText.slice(lastLoraIndex, cursorPos);
            if (!textAfterLoraStart.includes(')') && !textAfterLoraStart.includes(' ')) {
                insideLora = true;
                const remainingText = fullText.slice(lastLoraIndex);
                const loraInnerMatch = remainingText.match(/^lora\(([^):\s]*)/i);
                if (loraInnerMatch) {
                    loraQuery = loraInnerMatch[1].trim();
                }
            }
        }

        if (insideLora) {
            this.handleUnifiedLoraMenu(loraQuery, lastLoraIndex);
            return;
        }

        this.closeAutocomplete();

        const embedMatch = textBeforeCursor.match(/\bembed\(([^)]*)$/i);
        const commandMatch = textBeforeCursor.match(/\b([iw])\(([^)]*)$/i);
        const openMatch = textBeforeCursor.match(/\bo\(([^)]*)$/i);
        const genericCmdMatch = textBeforeCursor.match(/\b(eq|if|neg|area|h)\($/i);

        const slashMatch = textBeforeCursor.match(/(?:^|\s)\/([a-zA-Z0-9_\-]*)$/);

        if (slashMatch) this.handleSnippetMenu(slashMatch);
        else if (embedMatch) this.handleEmbeddingAutocomplete(embedMatch);
        else if (commandMatch) this.showVariableDropdown(commandMatch);
        else if (openMatch) this.handleTextFileAutocomplete(openMatch);
        else if (genericCmdMatch) this.showCommandHelp(genericCmdMatch);
    }

    // --- SNIPPET LOAD MENU (/ command) ---
    async handleSnippetMenu(match) {
        const query = match[1].toLowerCase();
        this.closeAutocomplete();

        const snippetsData = await fetchSnippets();
        const categories = snippetsData.Categories || {};

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;

        dropdown.style.maxHeight = '350px';
        dropdown.style.width = '300px';
        dropdown.style.overflowY = 'auto';

        const header = this.createDropdownHeader(`Snippet Load`);
        dropdown.appendChild(header);

        let allSnippets = [];
        for (const [catName, catData] of Object.entries(categories)) {
            const items = catData.items || {};
            for (const [uuid, data] of Object.entries(items)) {
                if (data.name && data.name.trim() !== "") {
                    allSnippets.push({
                        category: catName,
                        name: data.name,
                        content: data.content,
                        uses: data.uses || 0,
                        uuid: uuid
                    });
                }
            }
        }

        allSnippets.sort((a, b) => {
            const nameCmp = a.name.localeCompare(b.name);
            if (nameCmp !== 0) return nameCmp;
            return b.uses - a.uses;
        });

        let hasResults = false;
        allSnippets.forEach(s => {
            if (query && !s.name.toLowerCase().includes(query)) return;
            hasResults = true;

            const item = document.createElement('div');
            item.className = 'lora-autocomplete-item';

            item.innerHTML = `<span>/${s.name}</span> <span style="font-size:0.8em; color:#666; float:right;">★ ${s.uses}</span>`;

            item.addEventListener('mousedown', async (event) => {
                event.preventDefault();
                this.replaceSlashCommand(s.content, match.index, match[0].length);
                this.closeAutocomplete();
            });
            dropdown.appendChild(item);
        });

        if (!hasResults) {
            const noRes = document.createElement('div');
            noRes.className = 'lora-autocomplete-item';
            noRes.textContent = query ? "No matching named snippets." : "Drag text into a SnippetBox and give it a name to see it here!";
            noRes.style.color = '#888';
            dropdown.appendChild(noRes);
        }
    }

    replaceSlashCommand(newContent, startIndex, matchLength) {
        const fullText = this.textarea.value;
        const spaceOffset = fullText[startIndex] === ' ' ? 1 : 0;
        const insertPos = startIndex + spaceOffset;

        const textToKeepBefore = fullText.slice(0, insertPos);
        const textAfter = fullText.slice(startIndex + matchLength);

        const newText = textToKeepBefore + newContent + textAfter;
        this.textarea.value = newText;
        this.boxData.content = newText;
        this.requestSave();

        const newCursorPos = textToKeepBefore.length + newContent.length;
        this.textarea.focus();
        this.textarea.setSelectionRange(newCursorPos, newCursorPos);

        if (this.lastEvent) this.updateVisuals();
    }


    // --- EXISTING LORA LOGIC ---
    async handleUnifiedLoraMenu(query, startIndex) {
        const allLoras = await getLoraList();
        const exactMatch = allLoras.find(l => l.toLowerCase() === query.toLowerCase());

        if (exactMatch) {
            if (this.activeDropdown && this.activeDropdown.dataset.target === exactMatch && this.activeDropdown.dataset.menuType === 'tags') return;
            this.showLoraTagsMenu(exactMatch, startIndex);
        } else {
            if (this.activeDropdown && this.activeDropdown.dataset.query === query && this.activeDropdown.dataset.menuType === 'list') return;
            this.showLoraListMenu(query, startIndex, allLoras);
        }
    }

    showLoraListMenu(query, startIndex, allLoras) {
        this.closeAutocomplete();
        const searchTerms = query.toLowerCase().split(/[\s_\-]+/).filter(t => t.length > 0);
        let filteredLoras = allLoras;
        if (searchTerms.length > 0) {
            filteredLoras = allLoras.filter(l => {
                const lowerPath = l.toLowerCase();
                return searchTerms.every(term => lowerPath.includes(term));
            });
        }
        if (filteredLoras.length === 0) return;

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;
        dropdown.dataset.menuType = 'list';
        dropdown.dataset.query = query;
        dropdown.style.maxHeight = '300px';
        dropdown.style.overflowY = 'auto';

        const header = this.createDropdownHeader(query ? `Search: ${query}` : `Select a LoRA...`);
        dropdown.appendChild(header);

        filteredLoras.slice(0, 150).forEach(loraName => {
            dropdown.appendChild(this.createDropdownItem(loraName, () => this.replaceLoraBlock(loraName, startIndex)));
        });
    }

    replaceLoraBlock(loraName, startIndex) {
        const fullText = this.textarea.value;
        let boundaries = [fullText.indexOf(')', startIndex), fullText.indexOf(' ', startIndex), fullText.indexOf('\n', startIndex)].filter(i => i > -1);
        let commandEnd = boundaries.length > 0 ? Math.min(...boundaries) : fullText.length;
        const textBefore = fullText.slice(0, startIndex);
        let textAfter = (commandEnd < fullText.length && fullText[commandEnd] === ')') ? fullText.slice(commandEnd + 1) : fullText.slice(commandEnd);

        this.textarea.value = textBefore + `lora(${loraName}:1.0)` + textAfter;
        this.boxData.content = this.textarea.value;
        this.requestSave();

        const newCursorPos = textBefore.length + `lora(${loraName}`.length;
        this.textarea.focus();
        this.textarea.setSelectionRange(newCursorPos, newCursorPos);
        if (this.lastEvent) this.updateVisuals();
        setTimeout(() => this.handleContextualAutocomplete(), 50);
    }

    async showLoraTagsMenu(loraName, loraStartIndex = -1) {
        try {
            const response = await fetch(`/thoughtbubble/lora_tags?name=${encodeURIComponent(loraName)}`);
            const data = await response.json();
            if (!data.tags || data.tags.length === 0) return;

            this.closeAutocomplete();
            const dropdown = this.createDropdownMenu();
            this.activeDropdown = dropdown;
            dropdown.dataset.menuType = 'tags';
            dropdown.dataset.target = loraName;

            // Appending individual styles rather than using cssText ensures 
            // the top/left coordinates defined in createDropdownMenu() are kept intact!
            dropdown.style.maxHeight = '400px';
            dropdown.style.width = '300px';
            dropdown.style.display = 'flex';
            dropdown.style.flexDirection = 'column';

            dropdown.appendChild(this.createDropdownHeader(`${loraName.split('/').pop()} Tags`));

            const controlsDiv = document.createElement('div');
            controlsDiv.style.cssText = `padding: 5px; display: flex; gap: 5px; border-bottom: 1px solid #444;`;
            const searchInput = document.createElement('input');
            searchInput.placeholder = 'Search tags...';
            searchInput.style.cssText = `flex: 1; background: #222; color: #fff; border: 1px solid #555; border-radius: 3px; padding: 4px 8px;`;
            searchInput.addEventListener('keydown', e => e.stopPropagation());

            let sortMode = 'count';
            const sortBtn = document.createElement('button');
            sortBtn.textContent = '⇅ Count';
            sortBtn.style.cssText = `background: #333; color: #fff; border: 1px solid #555; border-radius: 3px; cursor: pointer;`;

            controlsDiv.appendChild(searchInput);
            controlsDiv.appendChild(sortBtn);
            dropdown.appendChild(controlsDiv);

            const listContainer = document.createElement('div');
            listContainer.style.cssText = `overflow-y: auto; flex: 1;`;
            dropdown.appendChild(listContainer);

            let searchQuery = '';
            const renderList = () => {
                listContainer.innerHTML = '';
                let filtered = data.tags.filter(t => t.name.toLowerCase().includes(searchQuery));
                filtered.sort((a, b) => sortMode === 'count' ? b.count - a.count : a.name.localeCompare(b.name));
                filtered.forEach(t => {
                    const item = document.createElement('div');
                    item.className = 'lora-autocomplete-item';
                    item.textContent = `+ ${t.name} (${t.count})`;
                    item.addEventListener('mousedown', (event) => {
                        event.preventDefault();
                        this.insertTagSmart(t.name, loraStartIndex);
                    });
                    listContainer.appendChild(item);
                });
            };

            searchInput.addEventListener('input', (e) => { searchQuery = e.target.value.toLowerCase(); renderList(); });
            sortBtn.addEventListener('click', (e) => {
                e.preventDefault();
                sortMode = sortMode === 'count' ? 'alpha' : 'count';
                sortBtn.textContent = sortMode === 'count' ? '⇅ Count' : '⇅ A-Z';
                renderList();
            });
            renderList();
        } catch (e) { console.error("ThoughtBubble: Failed to fetch LoRA tags:", e); }
    }

    insertTagSmart(tag, loraStartIndex) {
        let fullText = this.textarea.value;
        let insertPos = this.textarea.selectionEnd;

        if (loraStartIndex !== -1 && insertPos > loraStartIndex) {
            let boundaries = [fullText.indexOf(')', loraStartIndex), fullText.indexOf(' ', loraStartIndex), fullText.indexOf('\n', loraStartIndex)].filter(i => i > -1);
            let commandEnd = boundaries.length > 0 ? Math.min(...boundaries) : fullText.length;

            if (insertPos <= commandEnd) {
                if (commandEnd < fullText.length && fullText[commandEnd] === ')') {
                    insertPos = commandEnd + 1;
                } else {
                    fullText = fullText.slice(0, commandEnd) + ')' + fullText.slice(commandEnd);
                    this.textarea.value = fullText;
                    insertPos = commandEnd + 1;
                }
            }
        }

        const textBefore = fullText.slice(0, insertPos);
        const prefix = (textBefore.length > 0 && ![' ', '\n', ','].includes(textBefore[textBefore.length - 1])) ? ", " : (textBefore.endsWith(',') ? " " : "");
        this.textarea.value = textBefore + prefix + tag + fullText.slice(insertPos);
        this.boxData.content = this.textarea.value;
        this.requestSave();
        const newCursorPos = textBefore.length + (prefix + tag).length;
        this.textarea.focus();
        this.textarea.setSelectionRange(newCursorPos, newCursorPos);
        if (this.lastEvent) this.updateVisuals();
    }

    showCommandHelp(match) {
        const cmd = match[1].toLowerCase();
        const templates = { 'eq': 'eq(val_a|val_b|true_text|false_text)', 'if': 'if(condition|true_text|false_text)', 'neg': 'neg(text_to_exclude)', 'area': 'area(1024x1024)', 'h': 'h(hidden_text)' };
        if (!templates[cmd]) return;
        this.closeAutocomplete();
        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;
        dropdown.appendChild(this.createDropdownHeader(`Syntax Helper`));
        dropdown.appendChild(this.createDropdownItem(`Insert: ${templates[cmd]}`, () => this.insertAutocompleteText(templates[cmd], match.index)));
    }

    async handleEmbeddingAutocomplete(match) {
        const prefix = match[1];
        this.closeAutocomplete();
        const allEmbeddings = await getEmbeddingList();
        const filteredEmbeddings = allEmbeddings.filter(e => e.toLowerCase().includes(prefix.toLowerCase()));
        if (filteredEmbeddings.length === 0) return;

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;
        dropdown.appendChild(this.createDropdownHeader(`✓ ${prefix}` || 'Select an embedding...'));
        filteredEmbeddings.forEach(embeddingName => dropdown.appendChild(this.createDropdownItem(embeddingName, () => this.insertAutocompleteText(`embed(${embeddingName})`, match.index))));
    }

    async handleTextFileAutocomplete(match) {
        const prefix = match[1];
        this.closeAutocomplete();
        const allFiles = await getTextFileList();
        const filteredFiles = allFiles.filter(f => f.toLowerCase().includes(prefix.toLowerCase()));
        if (filteredFiles.length === 0) return;

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;
        dropdown.appendChild(this.createDropdownHeader(`✓ ${prefix}` || 'Select a file...'));
        filteredFiles.forEach(filename => dropdown.appendChild(this.createDropdownItem(filename, () => this.insertAutocompleteText(`o(${filename})`, match.index))));
    }

    showVariableDropdown(commandMatch) {
        this.closeAutocomplete();
        const variablesByBoxId = new Map();

        app.graph._nodes.forEach(node => {
            if (node.type === "ThoughtBubbleNode") {
                node.stateManager.state.boxes.forEach(box => {
                    if (box.type === 'controls' && box.variables && box.variables.length > 0) {
                        if (!variablesByBoxId.has(box.id)) variablesByBoxId.set(box.id, { title: box.title, variables: [] });
                        box.variables.forEach(v => variablesByBoxId.get(box.id).variables.push({ id: v.id, name: v.name, boxTitle: box.title }));
                    }
                });
            }
        });

        const dropdown = this.createDropdownMenu();
        this.activeDropdown = dropdown;
        const commandId = commandMatch.index;
        const currentLinkId = this.boxData.commandLinks?.[commandId];
        let currentLinkText = `Default (${commandMatch[1].toLowerCase() === 'i' ? 'Toolbar Run' : 'Node Seed'})`;

        const allVariables = [];
        variablesByBoxId.forEach(group => allVariables.push(...group.variables));
        if (currentLinkId) {
            const linkedVar = allVariables.find(v => v.id === currentLinkId);
            if (linkedVar) currentLinkText = `${linkedVar.boxTitle} / ${linkedVar.name}`;
        }

        dropdown.appendChild(this.createDropdownHeader(`✓ ${currentLinkText}`));
        dropdown.appendChild(this.createDropdownItem(`Default`, () => { this.linkCommandToVariable(commandMatch, null); this.closeAutocomplete(); }));

        for (const [boxId, group] of variablesByBoxId.entries()) {
            const groupHeader = document.createElement('div');
            groupHeader.className = 'lora-autocomplete-item';
            groupHeader.textContent = group.title;
            groupHeader.style.cssText = `font-weight: bold; color: #aaa; pointer-events: none;`;
            dropdown.appendChild(groupHeader);
            group.variables.forEach(v => {
                const item = this.createDropdownItem(v.name, () => { this.linkCommandToVariable(commandMatch, v.id); this.closeAutocomplete(); });
                item.style.paddingLeft = '20px';
                dropdown.appendChild(item);
            });
        }
    }

    linkCommandToVariable(commandMatch, variableId) {
        if (!this.boxData.commandLinks) this.boxData.commandLinks = {};
        if (variableId) this.boxData.commandLinks[commandMatch.index] = variableId;
        else delete this.boxData.commandLinks[commandMatch.index];
        this.requestSave();
    }

    // --- DROPDOWN HELPERS ---
    createDropdownMenu() {
        this.closeAutocomplete();
        const dropdown = document.createElement('div');
        dropdown.className = 'lora-autocomplete-dropdown';
        document.body.appendChild(dropdown);

        const caretCoords = getCaretCoordinates(this.textarea, this.textarea.selectionEnd);
        const rect = this.textarea.getBoundingClientRect();

        // RESTORED ORIGINAL STABLE POSITIONING
        const xPos = rect.left;
        const yPos = rect.top + caretCoords.top + 20 - this.textarea.scrollTop;

        dropdown.style.left = `${xPos}px`;
        dropdown.style.top = `${yPos}px`;

        this._globalClickDismiss = (e) => {
            if (this.activeDropdown && !this.activeDropdown.contains(e.target) && e.target !== this.textarea) this.closeAutocomplete();
        };
        document.addEventListener('mousedown', this._globalClickDismiss);
        return dropdown;
    }

    createDropdownHeader(text) {
        const header = document.createElement('div');
        header.className = 'lora-autocomplete-item';
        header.textContent = text;
        header.style.cssText = `font-weight: bold; border-bottom: 1px solid #555;`;
        return header;
    }

    createDropdownItem(text, onSelect) {
        const item = document.createElement('div');
        item.className = 'lora-autocomplete-item';
        item.textContent = text;
        item.addEventListener('mousedown', (event) => { event.preventDefault(); onSelect(); this.closeAutocomplete(); });
        return item;
    }

    insertAutocompleteText(newCommand, startIndex, isLora = false) {
        const fullText = this.textarea.value;
        let commandEnd = fullText.indexOf(')', startIndex);
        if (commandEnd === -1 || (commandEnd - startIndex) > 100 || fullText.slice(startIndex, commandEnd).includes('\n')) commandEnd = this.textarea.selectionEnd;
        else commandEnd += 1;

        this.textarea.value = fullText.slice(0, startIndex) + newCommand + fullText.slice(commandEnd);
        this.boxData.content = this.textarea.value;
        this.requestSave();

        const newCursorPos = fullText.slice(0, startIndex).length + (isLora ? newCommand.split(':')[0].length + 1 : newCommand.length - 1);
        this.textarea.focus();
        this.textarea.setSelectionRange(newCursorPos, newCursorPos);
    }

    closeAutocomplete() {
        if (this.activeDropdown) { this.activeDropdown.remove(); this.activeDropdown = null; }
        if (this._globalClickDismiss) { document.removeEventListener('mousedown', this._globalClickDismiss); this._globalClickDismiss = null; }
    }

    static createDefaultState(x, y, width, height) { return { title: "New Box", content: "", type: "text", commandLinks: {}, x, y, width, height }; }
}

function getCaretCoordinates(element, position) {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const style = div.style;
    const computed = window.getComputedStyle(element);
    style.cssText = `white-space: pre-wrap; word-wrap: break-word; position: absolute; visibility: hidden;`;
    ['direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing'].forEach(prop => style[prop] = computed[prop]);
    if (element.nodeName === 'INPUT') { style.overflowX = 'auto'; style.whiteSpace = 'nowrap'; } else style.overflowY = 'auto';
    div.textContent = element.value.substring(0, position);
    const span = document.createElement('span');
    span.textContent = element.value.substring(position) || '.';
    div.appendChild(span);
    const coords = { top: span.offsetTop + parseInt(computed['borderTopWidth']), left: span.offsetLeft + parseInt(computed['borderLeftWidth']), height: parseInt(computed['lineHeight']) };
    document.body.removeChild(div);
    return coords;
}