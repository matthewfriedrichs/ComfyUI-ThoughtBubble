// js/box-types/listBox.js

import { BaseBox } from "./baseBox.js";
import { ThoughtBubbleModal } from "../utils.js";

/**
 * ListBox
 * A box type for managing line-separated lists, with a toolbar for common list operations.
 * Intended to be used by i() or w() commands by referencing the box title.
 */
export class ListBox extends BaseBox {
    constructor(options) {
        super(options);
        // We can reuse the setLastActiveTextarea to track focus, which
        // the main toolbar uses to determine save/load behavior.
        this.setLastActiveTextarea = options.setLastActiveTextarea;
        this.isLoading = false; // Internal loading state for append
    }

    render(contentEl) {
        contentEl.className = "thought-bubble-box-content list-box";

        const toolbar = document.createElement("div");
        toolbar.className = "list-box-toolbar";

        // --- Toolbar Buttons ---
        const shuffleButton = document.createElement("button");
        shuffleButton.title = "Shuffle Lines";
        shuffleButton.textContent = "Shuffle";
        shuffleButton.addEventListener("click", () => this.shuffleList());

        const removeDupesButton = document.createElement("button");
        removeDupesButton.title = "Remove Duplicate Lines (Keeps one of each)";
        removeDupesButton.textContent = "Unique";
        removeDupesButton.addEventListener("click", () => this.removeDuplicates());

        const weightsButton = document.createElement("button");
        weightsButton.title = "Parse & Edit Item Weights (from item:weight syntax)";
        weightsButton.textContent = "Weights";
        weightsButton.addEventListener("click", () => this.showWeightEditor(true)); // Always parses syntax

        const sortButton = document.createElement("button");
        sortButton.title = "Sort List";
        sortButton.textContent = "Sort";
        sortButton.addEventListener("click", () => this.showSortModal());

        this.appendButton = document.createElement("button");
        this.appendButton.title = "Append (merge) a file to this list";
        this.appendButton.textContent = "Append";
        this.appendButton.addEventListener("click", () => this.showAppendModal());

        toolbar.append(shuffleButton, removeDupesButton, weightsButton, sortButton, this.appendButton);

        // --- Text Area ---
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

        // Add toolbar and textarea to the box
        contentEl.append(toolbar, textarea);
    }

    // --- List Operation Logic ---

    /** Sets the textarea content from an array of strings. */
    _setList(list) {
        this.textarea.value = list.join('\n');
        this.boxData.content = this.textarea.value;
        this.requestSave();
    }

    /** Gets a clean list of non-empty, trimmed lines from the textarea. */
    _getCurrentList(trim = true) {
        let lines = this.textarea.value.split('\n');
        if (trim) {
            lines = lines.map(l => l.trim());
        }
        return lines.filter(l => l.length > 0);
    }

    /** Shuffles the lines in the textarea. (Shuffles all lines, including empty ones) */
    shuffleList() {
        let list = this.textarea.value.split('\n');

        // Fisher-Yates shuffle
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }

        this._setList(list);
    }

    /** Removes duplicate lines, preserving order of first appearance. */
    removeDuplicates() {
        // This function *should* use the clean list
        let uniqueList = [...new Set(this._getCurrentList(true))];
        this._setList(uniqueList);
    }

    /** Sorts the list alphabetically */
    sortList(ascending = true) {
        let list = this.textarea.value.split('\n');

        // Separate content lines from empty lines
        const contentLines = list.filter(l => l.trim().length > 0);
        const emptyLines = list.filter(l => l.trim().length === 0);

        // Sort content lines case-insensitively
        if (ascending) {
            contentLines.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
        } else {
            contentLines.sort((a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' }));
        }

        // Re-combine with empty lines at the bottom
        const newList = contentLines.concat(emptyLines);
        this._setList(newList);
    }

    /** Opens the Sort modal */
    showSortModal() {
        const modal = new ThoughtBubbleModal();
        const body = document.createElement("div");
        body.className = "thought-bubble-sort-modal-body";

        const sortAscButton = document.createElement("button");
        sortAscButton.textContent = "Sort A-Z (Ascending)";
        sortAscButton.onclick = () => {
            this.sortList(true);
            modal.close();
        };

        const sortDescButton = document.createElement("button");
        sortDescButton.textContent = "Sort Z-A (Descending)";
        sortDescButton.onclick = () => {
            this.sortList(false);
            modal.close();
        };

        body.append(sortAscButton, sortDescButton);

        // Show modal with no extra footer buttons (only the default "Close")
        modal.show("Sort List", body);
    }

    /** Opens the weight editor modal, with parsing logic */
    showWeightEditor(parseSyntax = false) {
        const modal = new ThoughtBubbleModal();
        const body = document.createElement("div");
        body.className = "thought-bubble-weight-editor-body";

        const itemCounts = new Map();
        const uniqueItems = []; // Preserves order of appearance
        const seen = new Set();

        const currentList = this.textarea.value.split('\n');

        for (const line of currentList) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            let item = trimmedLine;
            let count = 1;

            if (parseSyntax) {
                const lastColon = trimmedLine.lastIndexOf(':');
                if (lastColon > -1) {
                    const textPart = trimmedLine.substring(0, lastColon).trim();
                    const numPart = trimmedLine.substring(lastColon + 1).trim();
                    const parsedNum = parseInt(numPart, 10);

                    if (!isNaN(parsedNum) && parsedNum.toString() === numPart && parsedNum > 0) {
                        item = textPart;
                        count = parsedNum;
                    } else {
                        item = trimmedLine;
                        count = 1;
                    }
                }
            }

            if (!seen.has(item)) {
                uniqueItems.push(item);
                seen.add(item);
            }

            if (parseSyntax) {
                itemCounts.set(item, (itemCounts.get(item) || 0) + count);
            } else {
                itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
            }
        }

        const itemInputs = new Map();

        if (uniqueItems.length === 0) {
            body.textContent = "The list is empty. Add items to the list box to set their weights.";
        }

        for (const item of uniqueItems) {
            const row = document.createElement("div");
            row.className = "weight-editor-row";

            const label = document.createElement("label");
            label.textContent = item;
            label.title = item;

            const input = document.createElement("input");
            input.type = "number";
            input.min = "0";
            input.value = itemCounts.get(item) || 0;
            input.className = "weight-editor-input";

            itemInputs.set(item, input);
            row.append(label, input);
            body.appendChild(row);
        }

        const applySyntaxButton = document.createElement("button");
        applySyntaxButton.textContent = "Apply (as Syntax)";
        applySyntaxButton.title = "Writes a new, unique list with weights (e.g., item:3)";
        applySyntaxButton.onclick = () => {
            const newList = [];
            for (const item of uniqueItems) {
                const input = itemInputs.get(item);
                if (!input) continue;

                const count = parseInt(input.value, 10);

                if (!isNaN(count) && count > 0) {
                    newList.push(count === 1 ? item : `${item}:${count}`);
                }
            }
            this._setList(newList);
            modal.close();
        };

        const applyDuplicatesButton = document.createElement("button");
        applyDuplicatesButton.textContent = "Apply (as Duplicates)";
        applyDuplicatesButton.title = "Writes a new list with duplicates (e.g., item, item, item)";
        applyDuplicatesButton.onclick = () => {
            const newList = [];
            for (const item of uniqueItems) {
                const input = itemInputs.get(item);
                if (!input) continue;

                const count = parseInt(input.value, 10);

                if (!isNaN(count) && count > 0) {
                    for (let i = 0; i < count; i++) {
                        newList.push(item);
                    }
                }
            }

            this._setList(newList);
            modal.close();
        };

        modal.show("Set Item Weights", body, [applySyntaxButton, applyDuplicatesButton]);
    }

    /** --- MODIFIED: Opens the Append from File modal --- */
    async showAppendModal() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.appendButton.textContent = "Loading...";

        const modal = new ThoughtBubbleModal();

        try {
            const body = document.createElement('div');
            const fileList = document.createElement('div');
            fileList.className = 'thought-bubble-file-list';

            // --- MODIFIED: Options Container ---
            const optionsContainer = document.createElement('div');
            optionsContainer.className = 'append-modal-options';

            // --- NEW: Position Group ---
            const positionGroup = document.createElement('div');
            positionGroup.className = 'append-option-group';

            const positionLabel = document.createElement('span');
            positionLabel.textContent = 'Add to:';

            const prependRadio = document.createElement('input');
            prependRadio.type = 'radio';
            prependRadio.id = 'tb-prepend-radio';
            prependRadio.name = 'tb-position-radio';
            prependRadio.value = 'prepend';

            const prependLabel = document.createElement('label');
            prependLabel.textContent = 'Beginning';
            prependLabel.setAttribute('for', 'tb-prepend-radio');

            const appendRadio = document.createElement('input');
            appendRadio.type = 'radio';
            appendRadio.id = 'tb-append-radio';
            appendRadio.name = 'tb-position-radio';
            appendRadio.value = 'append';
            appendRadio.checked = true; // Default to 'End'

            const appendLabel = document.createElement('label');
            appendLabel.textContent = 'End';
            appendLabel.setAttribute('for', 'tb-append-radio');

            positionGroup.append(
                positionLabel,
                prependRadio, prependLabel,
                appendRadio, appendLabel
            );

            // --- NEW: Dedupe Group ---
            const dedupeGroup = document.createElement('div');
            dedupeGroup.className = 'append-option-group';

            const dedupeCheckbox = document.createElement('input');
            dedupeCheckbox.type = 'checkbox';
            dedupeCheckbox.id = 'tb-dedupe-checkbox';

            const dedupeLabel = document.createElement('label');
            dedupeLabel.textContent = 'Merge & Deduplicate';
            dedupeLabel.setAttribute('for', 'tb-dedupe-checkbox');

            dedupeGroup.append(dedupeCheckbox, dedupeLabel);

            // --- MODIFIED: Assembly ---
            optionsContainer.append(positionGroup, dedupeGroup);
            body.append(optionsContainer, fileList);

            // Helper to add files to the list
            const addFilesToList = async (endpoint, title, fileType) => {
                let fileCount = 0;
                try {
                    const response = await fetch(endpoint);
                    if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
                    const files = await response.json();
                    if (files.error) throw new Error(files.error);

                    if (files.length > 0) {
                        fileCount = files.length;
                        const header = document.createElement('div');
                        header.className = 'thought-bubble-theme-header'; // Reuse theme header style
                        header.textContent = title;
                        fileList.appendChild(header);

                        files.forEach(filename => {
                            const fileItem = document.createElement('div');
                            fileItem.className = 'thought-bubble-file-item';
                            fileItem.textContent = filename;
                            fileItem.onclick = () => {
                                const position = prependRadio.checked ? 'prepend' : 'append';
                                this.appendFileContent(filename, fileType, dedupeCheckbox.checked, position, modal);
                            };
                            fileList.appendChild(fileItem);
                        });
                    }
                } catch (e) {
                    console.error(`Failed to load file list from ${endpoint}:`, e);
                }
                return fileCount;
            };

            let totalFiles = 0;
            totalFiles += await addFilesToList('/thoughtbubble/wildcards', 'Wildcards (user/wildcards)', 'wildcard');
            totalFiles += await addFilesToList('/thoughtbubble/textfiles', 'Text Files (user/textfiles)', 'textfile');

            if (totalFiles === 0) {
                fileList.textContent = "No files found in 'user/textfiles' or 'user/wildcards'.";
            }

            modal.show("Append from File", body);

        } catch (error) {
            console.error("Failed to list files:", error);
            // Show error in a new modal
            const errorModal = new ThoughtBubbleModal();
            errorModal.show("Error", document.createTextNode(`Failed to list files: ${error.message}`));
        } finally {
            this.isLoading = false;
            this.appendButton.textContent = "Append";
        }
    }

    /** Handles fetching and appending file content */
    async appendFileContent(filename, fileType = 'textfile', shouldDeduplicate, position = 'append', modal) {
        if (this.isLoading) return;
        this.isLoading = true;
        this.appendButton.textContent = "Appending...";

        let loadEndpoint = '/thoughtbubble/load'; // Default
        if (fileType === 'wildcard') {
            loadEndpoint = '/thoughtbubble/load_wildcard';
        }

        try {
            const response = await fetch(`${loadEndpoint}?filename=${encodeURIComponent(filename)}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            const existingContent = this.textarea.value.trim();
            const newContent = data.content.trim();

            let combinedContent = "";

            // Combine based on position
            if (position === 'prepend') {
                if (existingContent && newContent) {
                    combinedContent = newContent + '\n' + existingContent;
                } else {
                    combinedContent = newContent || existingContent;
                }
            } else { // 'append' is default
                if (existingContent && newContent) {
                    combinedContent = existingContent + '\n' + newContent;
                } else {
                    combinedContent = existingContent || newContent;
                }
            }

            this.textarea.value = combinedContent;
            this.boxData.content = combinedContent;
            this.requestSave();

            if (shouldDeduplicate) {
                this.removeDuplicates(); // This will also save
            }

            modal.close();
        } catch (error) {
            console.error("Failed to load file content:", error);
            // Show error in a new modal
            const errorModal = new ThoughtBubbleModal();
            errorModal.show("Error", document.createTextNode(`Error loading file: ${error.message}`));
        } finally {
            this.isLoading = false;
            this.appendButton.textContent = "Append";
        }
    }

    static createDefaultState(x, y, width, height) {
        return {
            title: "new_list",
            content: "item 1\nitem 2\nitem 3",
            type: "list",
            commandLinks: {}, // Include for consistency
            x, y, width, height,
        };
    }
}