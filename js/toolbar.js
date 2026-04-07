import { ThoughtBubbleModal } from "./utils.js";
import { ThemeEditor } from "./themeEditor.js";

export class Toolbar {
    constructor(toolbarEl, stateManager, renderer, themeManager) {
        this.toolbarEl = toolbarEl;
        this.stateManager = stateManager;
        this.renderer = renderer;
        this.themeManager = themeManager;
        this.modal = new ThoughtBubbleModal();
        this._isLoading = false;

        this._init();
    }

    _init() {
        this.toolbarEl.innerHTML = '';

        this.saveButton = this._createButton("Save", () => this.handleSave());
        this.loadButton = this._createButton("Load", () => this.handleLoad());
        const fitViewButton = this._createButton("Fit View", () => this.fitViewToContent());
        const themeButton = this._createButton("Theme", () => this.handleTheme());

        const { gridLabel, gridSelect } = this._createGridSizeSelector();
        const toggleGridButton = this._createToggleGridButton();
        const togglePeriodBreakButton = this._createTogglePeriodBreakButton();
        const toggleMinimapButton = this._createToggleMinimapButton(); // <-- NEW

        const iteratorControl = this._createIteratorControl();

        this.toolbarEl.append(this.saveButton, this.loadButton, fitViewButton, themeButton, togglePeriodBreakButton, toggleMinimapButton, gridLabel, gridSelect, toggleGridButton, iteratorControl); // <-- NEW
    }

    handleTheme() {
        const editor = new ThemeEditor(this.stateManager, this.themeManager);
        editor.show();
    }

    _createIteratorControl() {
        const container = document.createElement("div");
        container.style.cssText = "display: flex; align-items: center; gap: 8px; margin-left: auto;";

        this.iteratorDisplay = document.createElement("span");
        this.iteratorDisplay.textContent = `Run: ${this.stateManager.state.iterator || 0}`;
        this.iteratorDisplay.style.color = "var(--tb-text-color)";
        this.iteratorDisplay.style.fontSize = "12px";

        const resetButton = this._createButton("Reset", () => {
            this.stateManager.state.iterator = 0;
            this.stateManager.save();
            this.iteratorDisplay.textContent = `Run: 0`;
        });

        container.append(this.iteratorDisplay, resetButton);
        return container;
    }

    _createButton(text, onClick) {
        const button = document.createElement("button");
        button.textContent = text;
        button.onclick = onClick;
        return button;
    }

    _createGridSizeSelector() {
        const gridLabel = document.createElement("label");
        gridLabel.textContent = "Grid:";

        const gridSelect = document.createElement("select");
        [0, 10, 20, 50, 100, 200, 400].forEach(size => {
            const option = document.createElement("option");
            option.value = size;
            option.textContent = size === 0 ? "Off" : `${size}px`;
            gridSelect.appendChild(option);
        });
        gridSelect.value = this.stateManager.state.gridSize;
        gridSelect.onchange = (e) => {
            this.stateManager.state.gridSize = parseInt(e.target.value, 10);
            this.stateManager.save();
            this.renderer.render();
        };
        return { gridLabel, gridSelect };
    }

    _createToggleGridButton() {
        const button = this._createButton(
            this.stateManager.state.showGrid ? "Hide Grid" : "Show Grid",
            () => {
                this.stateManager.state.showGrid = !this.stateManager.state.showGrid;
                button.textContent = this.stateManager.state.showGrid ? "Hide Grid" : "Show Grid";
                this.stateManager.save();
                this.renderer.render();
            }
        );
        return button;
    }

    _createTogglePeriodBreakButton() {
        const button = this._createButton(
            this.stateManager.state.periodIsBreak ? "Periods = BREAK" : "Periods = .",
            () => {
                this.stateManager.state.periodIsBreak = !this.stateManager.state.periodIsBreak;
                button.textContent = this.stateManager.state.periodIsBreak ? "Periods = BREAK" : "Periods = .";
                this.stateManager.save();
            }
        );
        return button;
    }

    // --- NEW: Add toggle button for minimap ---
    _createToggleMinimapButton() {
        const button = this._createButton(
            this.stateManager.state.showMinimap ? "Hide Map" : "Show Map",
            () => {
                this.stateManager.state.showMinimap = !this.stateManager.state.showMinimap;
                button.textContent = this.stateManager.state.showMinimap ? "Hide Map" : "Show Map";
                this.stateManager.save();
                this.renderer.render(); // Trigger a re-render which will show/hide the map
            }
        );
        return button;
    }

    _setLoading(isLoading) {
        this._isLoading = isLoading;
        this.saveButton.disabled = isLoading;
        this.loadButton.disabled = isLoading;
        this.saveButton.textContent = isLoading ? "Saving..." : "Save";
    }

    _showError(title, message) {
        const body = document.createElement('p');
        body.textContent = message;
        this.modal.show(title, body);
    }

    fitViewToContent() {
        const state = this.stateManager.state;
        const visibleBoxes = state.boxes.filter(box => box.displayState === 'normal' || !box.displayState);

        if (visibleBoxes.length === 0) return;

        const bounds = visibleBoxes.reduce((b, box) => {
            let effectiveWidth = box.width;
            let effectiveHeight = box.height;

            switch (box.type) {
                case 'area':
                    effectiveWidth = Math.max(box.width, 500);
                    effectiveHeight = Math.max(box.height, 500);
                    break;
                case 'controls':
                    effectiveWidth = Math.max(box.width, 300);
                    effectiveHeight = Math.max(box.height, 200);
                    break;
                case 'list': // <-- NEW
                case 'text':
                default:
                    effectiveWidth = Math.max(box.width, 200);
                    effectiveHeight = Math.max(box.height, 100);
                    break;
            }

            return {
                minX: Math.min(b.minX, box.x),
                minY: Math.min(b.minY, box.y),
                maxX: Math.max(b.maxX, box.x + effectiveWidth),
                maxY: Math.max(b.maxY, box.y + effectiveHeight)
            };
        }, { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

        const contentW = bounds.maxX - bounds.minX;
        const contentH = bounds.maxY - bounds.minY;
        if (contentW === 0 || contentH === 0) return;

        const viewW = this.renderer.canvasEl.clientWidth;
        const viewH = this.renderer.canvasEl.clientHeight;
        const padding = 50;
        const zoom = Math.min((viewW - padding * 2) / contentW, (viewH - padding * 2) / contentH, 1.5);

        state.zoom = zoom;
        state.pan.x = -bounds.minX * zoom + (viewW - contentW * zoom) / 2;
        state.pan.y = -bounds.minY * zoom + (viewH - contentH * zoom) / 2;

        this.stateManager.save();
        this.renderer.render();
    }

    async handleSave() {
        if (this._isLoading) return;

        // --- MODIFIED: Check for lastActiveBoxInfo ---
        if (!this.renderer.lastActiveBoxInfo) {
            this._showError("Save Error", "Please click inside a text box or list box to select it for saving.");
            return;
        }

        const body = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'my_file.txt';
        body.appendChild(input);

        // --- MODIFIED: Get box type and content ---
        const { box, textarea } = this.renderer.lastActiveBoxInfo;
        const contentToSave = textarea.value;

        // --- MODIFIED: Determine endpoint based on box type ---
        let saveEndpoint = '/thoughtbubble/save'; // Default for text/area
        let folderName = 'textfiles';
        if (box.type === 'list') {
            saveEndpoint = '/thoughtbubble/save_wildcard';
            folderName = 'wildcards';
            input.placeholder = 'my_wildcard.txt';
        }

        const confirmSaveButton = this._createButton("Save", async () => {
            const filename = input.value.trim();

            const invalidChars = /[\\/:\*\?"<>\|]|\.\./;
            if (!filename || !filename.endsWith('.txt') || invalidChars.test(filename)) {
                this._showError("Validation Error", "Filename must be valid and end with .txt");
                return;
            }

            this._setLoading(true);
            try {
                // --- MODIFIED: Use dynamic endpoint ---
                const response = await fetch(saveEndpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, content: contentToSave }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Unknown server error");
                this.modal.close();
            } catch (error) {
                console.error(`Failed to save file to ${folderName}:`, error);
                this._showError("Save Failed", `Error saving file: ${error.message}`);
            } finally {
                this._setLoading(false);
            }
        });

        this.modal.show(`Save Content to user/${folderName}`, body, [confirmSaveButton]);
        input.focus();
    }

    async handleLoad() {
        if (this._isLoading) return;

        // --- MODIFIED: Check for lastActiveBoxInfo ---
        if (!this.renderer.lastActiveBoxInfo) {
            this._showError("Load Error", "Please click inside a text box or list box to select it for loading.");
            return;
        }

        this._setLoading(true);
        this.loadButton.textContent = "Loading...";

        // --- MODIFIED: Get box type ---
        const { box } = this.renderer.lastActiveBoxInfo;

        try {
            const body = document.createElement('div');
            const fileList = document.createElement('div');
            fileList.className = 'thought-bubble-file-list';
            body.appendChild(fileList);

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
                            // --- MODIFIED: Pass fileType to loadFileContent ---
                            fileItem.onclick = () => this.loadFileContent(filename, fileType);
                            fileList.appendChild(fileItem);
                        });
                    }
                } catch (e) {
                    console.error(`Failed to load file list from ${endpoint}:`, e);
                }
                return fileCount;
            };

            let totalFiles = 0;

            // --- MODIFIED: Load different files based on box type ---
            if (box.type === 'list') {
                // For list, load both, wildcards first
                totalFiles += await addFilesToList('/thoughtbubble/wildcards', 'Wildcards (user/wildcards)', 'wildcard');
                totalFiles += await addFilesToList('/thoughtbubble/textfiles', 'Text Files (user/textfiles)', 'textfile');
            } else {
                // For text/area, just load textfiles
                totalFiles += await addFilesToList('/thoughtbubble/textfiles', 'Text Files (user/textfiles)', 'textfile');
            }

            if (totalFiles === 0) {
                body.textContent = "No text files found in the 'user/textfiles' folder.";
                if (box.type === 'list') body.textContent = "No files found in 'user/textfiles' or 'user/wildcards'.";
            }

            this.modal.show("Load Content from File", body);

        } catch (error) {
            console.error("Failed to list files:", error);
            this._showError("Load Failed", `Error listing files: ${error.message}`);
        } finally {
            this._setLoading(false);
            this.loadButton.textContent = "Load";
        }
    }

    // --- MODIFIED: Added fileType parameter ---
    async loadFileContent(filename, fileType = 'textfile') {
        if (this._isLoading) return;
        this._setLoading(true);
        this.loadButton.textContent = "Loading...";

        // --- MODIFIED: Determine endpoint based on fileType ---
        let loadEndpoint = '/thoughtbubble/load'; // Default
        if (fileType === 'wildcard') {
            loadEndpoint = '/thoughtbubble/load_wildcard';
        }

        try {
            const response = await fetch(`${loadEndpoint}?filename=${encodeURIComponent(filename)}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            // --- MODIFIED: Use lastActiveBoxInfo ---
            const textarea = this.renderer.lastActiveBoxInfo.textarea;
            textarea.value = data.content;
            textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            this.modal.close();
        } catch (error) {
            console.error("Failed to load file content:", error);
            this._showError("Load Failed", `Error loading file: ${error.message}`);
        } finally {
            this._setLoading(false);
            this.loadButton.textContent = "Load";
        }
    }
}