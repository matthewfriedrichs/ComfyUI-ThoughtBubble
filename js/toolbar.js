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
        
        const iteratorControl = this._createIteratorControl();

        this.toolbarEl.append(this.saveButton, this.loadButton, fitViewButton, themeButton, gridLabel, gridSelect, toggleGridButton, iteratorControl);
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

            switch(box.type) {
                case 'area':
                    effectiveWidth = Math.max(box.width, 500);
                    effectiveHeight = Math.max(box.height, 500);
                    break;
                case 'controls':
                    effectiveWidth = Math.max(box.width, 300);
                    effectiveHeight = Math.max(box.height, 200);
                    break;
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
        if (!this.renderer.lastActiveTextarea) {
            this._showError("Save Error", "Please click inside a text box to select it for saving.");
            return;
        }

        const body = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'my_prompt.txt';
        body.appendChild(input);

        const confirmSaveButton = this._createButton("Save", async () => {
            const filename = input.value.trim();
            
            const invalidChars = /[\\/:\*\?"<>\|]|\.\./;
            if (!filename || !filename.endsWith('.txt') || invalidChars.test(filename)) {
                this._showError("Validation Error", "Filename must be valid and end with .txt");
                return;
            }

            this._setLoading(true);
            try {
                const response = await fetch('/thoughtbubble/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename, content: this.renderer.lastActiveTextarea.value }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Unknown server error");
                this.modal.close();
            } catch (error) {
                console.error("Failed to save file:", error);
                this._showError("Save Failed", `Error saving file: ${error.message}`);
            } finally {
                this._setLoading(false);
            }
        });

        this.modal.show("Save Content to File", body, [confirmSaveButton]);
        input.focus();
    }
    
    async handleLoad() {
        if (this._isLoading) return;
        if (!this.renderer.lastActiveTextarea) {
            this._showError("Load Error", "Please click inside a text box to select it for loading.");
            return;
        }

        this._setLoading(true);
        this.loadButton.textContent = "Loading...";

        try {
            const response = await fetch('/thoughtbubble/textfiles');
            if (!response.ok) throw new Error(`Server error: ${response.statusText}`);
            const files = await response.json();
            if (files.error) throw new Error(files.error);
            
            const body = document.createElement('div');
            if (files.length === 0) {
                body.textContent = "No text files found in the 'user/textfiles' folder.";
            } else {
                const fileList = document.createElement('div');
                fileList.className = 'thought-bubble-file-list';
                files.forEach(filename => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'thought-bubble-file-item';
                    fileItem.textContent = filename;
                    fileItem.onclick = () => this.loadFileContent(filename);
                    fileList.appendChild(fileItem);
                });
                body.appendChild(fileList);
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

    async loadFileContent(filename) {
        if (this._isLoading) return;
        this._setLoading(true);
        this.loadButton.textContent = "Loading...";
        
        try {
            const response = await fetch(`/thoughtbubble/load?filename=${encodeURIComponent(filename)}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            this.renderer.lastActiveTextarea.value = data.content;
            this.renderer.lastActiveTextarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
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