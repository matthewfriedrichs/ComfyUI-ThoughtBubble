import { ThoughtBubbleModal } from "./utils.js";
import { DEFAULT_THEME } from "./themeManager.js";

export class ThemeEditor {
    constructor(stateManager, themeManager) {
        this.stateManager = stateManager;
        this.themeManager = themeManager;
        this.modal = new ThoughtBubbleModal();
    }

    show() {
        const body = this.createEditorBody();
        const footerButtons = this.createFooterButtons();
        this.modal.show("Theme Editor", body, footerButtons);
    }

    createEditorBody() {
        const container = document.createElement('div');
        container.className = 'thought-bubble-theme-editor';

        const currentTheme = this.stateManager.state.theme || {};

        for (const key in DEFAULT_THEME) {
            const row = document.createElement('div');
            row.className = 'theme-editor-row';

            const label = document.createElement('label');
            label.textContent = key.replace('--tb-', '').replace(/-/g, ' ');

            const isColor = key.toLowerCase().includes('color');
            const input = document.createElement('input');
            input.type = isColor ? 'color' : 'text';
            input.value = currentTheme[key] || DEFAULT_THEME[key];

            const textInput = isColor ? document.createElement('input') : null;
            if (isColor) {
                textInput.type = 'text';
                textInput.value = input.value;
                input.addEventListener('input', () => textInput.value = input.value);
                textInput.addEventListener('change', () => input.value = textInput.value);
            }

            const liveUpdate = (e) => {
                if (!this.stateManager.state.theme) this.stateManager.state.theme = {};
                this.stateManager.state.theme[key] = e.target.value;
                this.themeManager.updateTheme(this.stateManager.state.theme);
                this.stateManager.save();
            };

            input.addEventListener('input', liveUpdate);
            if (textInput) textInput.addEventListener('change', liveUpdate);

            row.append(label, input);
            if (textInput) row.appendChild(textInput);
            container.appendChild(row);
        }
        return container;
    }

    createFooterButtons() {
        const saveButton = document.createElement('button');
        saveButton.textContent = "Save Theme";
        saveButton.onclick = () => this.handleSaveTheme();

        const loadButton = document.createElement('button');
        loadButton.textContent = "Load Theme";
        loadButton.onclick = () => this.handleLoadTheme();

        const defaultButton = document.createElement('button');
        defaultButton.textContent = "Set as Default";
        defaultButton.onclick = () => this.handleSetDefault();

        const resetButton = document.createElement('button');
        resetButton.textContent = "Reset";
        resetButton.onclick = () => {
            this.stateManager.state.theme = this.themeManager.resetToDefault();
            this.stateManager.save();
            this.modal.close();
            this.show(); // Re-open to show reset values
        };

        return [resetButton, loadButton, saveButton, defaultButton];
    }

    async handleSaveTheme() {
        const filename = prompt("Enter a name for your theme (e.g., 'my-theme'). It will be saved as a .json file in your user folder.");
        if (!filename) return;

        try {
            const response = await fetch('/thoughtbubble/themes/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: `${filename}.json`, content: this.stateManager.state.theme }),
            });
            if (!response.ok) throw new Error((await response.json()).error);
            alert("Theme saved successfully!");
        } catch (error) {
            console.error("Failed to save theme:", error);
            alert(`Error: ${error.message}`);
        }
    }

    async handleLoadTheme() {
        const loadModal = new ThoughtBubbleModal();
        try {
            // --- MODIFIED: Fetch from both user and default theme endpoints ---
            const [userThemesRes, defaultThemesRes] = await Promise.all([
                fetch('/thoughtbubble/themes/list'),
                fetch('/thoughtbubble/themes/list_default') // The new endpoint
            ]);

            if (!userThemesRes.ok || !defaultThemesRes.ok) throw new Error('Failed to fetch theme lists.');

            const userThemes = await userThemesRes.json();
            const defaultThemes = await defaultThemesRes.json();

            const listContainer = document.createElement('div');

            // Helper to create a theme item in the list
            const createItem = (file) => {
                const item = document.createElement('div');
                item.textContent = file.replace('.json', '');
                item.className = 'thought-bubble-file-item';
                item.onclick = async () => {
                    // The /load endpoint now checks both locations, so this works as-is
                    const loadResponse = await fetch(`/thoughtbubble/themes/load?filename=${file}`);
                    const themeData = await loadResponse.json();
                    this.stateManager.state.theme = themeData;
                    this.themeManager.updateTheme(themeData);
                    this.stateManager.save();
                    loadModal.close();
                    this.modal.close(); // Also close the main editor
                };
                listContainer.appendChild(item);
            };

            // --- MODIFIED: Display themes in categorized sections ---

            // Display User Themes
            if (userThemes.length > 0) {
                const header = document.createElement('div');
                header.className = 'thought-bubble-theme-header';
                header.textContent = 'Your Themes';
                listContainer.appendChild(header);
                userThemes.forEach(createItem);
            }

            // Display Default Themes
            if (defaultThemes.length > 0) {
                if (userThemes.length > 0) {
                    // Add a separator if both lists have content
                    listContainer.appendChild(document.createElement('hr'));
                }
                const header = document.createElement('div');
                header.className = 'thought-bubble-theme-header';
                header.textContent = 'Default Themes';
                listContainer.appendChild(header);
                defaultThemes.forEach(createItem);
            }

            // Handle case where no themes are found at all
            if (userThemes.length === 0 && defaultThemes.length === 0) {
                listContainer.textContent = "No themes found. Save a theme to get started!";
            }

            loadModal.show('Load Theme', listContainer);

        } catch (error) {
            console.error("Failed to load themes:", error);
            alert(`Error: ${error.message}`);
        }
    }

    async handleSetDefault() {
        const themeToSave = this.stateManager.state.theme;
        try {
            const response = await fetch('/thoughtbubble/themes/default/set', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(themeToSave),
            });
            if (!response.ok) throw new Error('Failed to set default theme.');
            alert("Current theme set as default for new nodes.");
        } catch (error) {
            console.error("Failed to set default theme:", error);
            alert(`Error: ${error.message}`);
        }
    }
}