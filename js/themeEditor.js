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
        const container = document.createElement("div");
        container.className = "thought-bubble-theme-editor";
        const currentTheme = this.stateManager.state.theme || {};

        for (const key in DEFAULT_THEME) {
            const row = document.createElement("div");
            row.className = "theme-editor-row";

            const label = document.createElement("label");
            label.textContent = key.replace("--tb-", "").replace(/-/g, " ");

            const isColor = key.toLowerCase().includes("color");
            const input = document.createElement("input");
            input.type = isColor ? "color" : "text";
            input.value = currentTheme[key] || DEFAULT_THEME[key];

            const previewUpdate = (e) => {
                const newVal = e.target.value;
                if (!this.stateManager.state.theme) this.stateManager.state.theme = {};
                this.stateManager.state.theme[key] = newVal;
                this.themeManager.updateTheme(this.stateManager.state.theme);
            };

            const commitUpdate = (val) => {
                if (!this.stateManager.state.theme) this.stateManager.state.theme = {};
                this.stateManager.state.theme[key] = val;
                this.stateManager.save();
            };

            input.addEventListener("input", previewUpdate);
            input.addEventListener("change", (e) => commitUpdate(e.target.value));

            row.append(label, input);
            container.appendChild(row);
        }
        return container;
    }

    createFooterButtons() {
        const resetButton = document.createElement("button");
        resetButton.textContent = "Reset";
        resetButton.onclick = () => {
            this.stateManager.state.theme = this.themeManager.resetToDefault();
            this.stateManager.save();
            this.modal.close();
            this.show();
        };

        const loadButton = document.createElement("button");
        loadButton.textContent = "Load Theme";
        loadButton.onclick = () => this.handleLoadTheme();

        const saveButton = document.createElement("button");
        saveButton.textContent = "Save Theme";
        saveButton.onclick = () => this.handleSaveTheme();

        const defaultButton = document.createElement("button");
        defaultButton.textContent = "Set Default";
        defaultButton.onclick = () => this.handleSetDefault();

        return [resetButton, loadButton, saveButton, defaultButton];
    }

    async handleSaveTheme() {
        const filename = prompt("Enter a name for your theme (e.g. 'amber'):");
        if (!filename) return;

        const cleanName = filename.trim().replace(/\.json$/i, "");
        if (!cleanName) return;

        try {
            const response = await fetch("/thoughtbubble/themes/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: `${cleanName}.json`,
                    content: this.stateManager.state.theme || {},
                }),
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || "Failed to save theme.");
            }
            alert(`Theme '${cleanName}' saved successfully!`);
        } catch (err) {
            console.error("Theme save error:", err);
            alert(`Error saving theme: ${err.message}`);
        }
    }

    async handleLoadTheme() {
        const loadModal = new ThoughtBubbleModal();
        try {
            const [userRes, defaultRes] = await Promise.all([
                fetch("/thoughtbubble/themes/list"),
                fetch("/thoughtbubble/themes/list_default"),
            ]);

            const userThemes = userRes.ok ? await userRes.json() : [];
            const defaultThemes = defaultRes.ok ? await defaultRes.json() : [];

            const container = document.createElement("div");
            const list = document.createElement("div");
            list.className = "thought-bubble-file-list";
            container.appendChild(list);

            const addItem = (filename, isDefault = false) => {
                const item = document.createElement("div");
                item.className = "thought-bubble-file-item";
                const themeName = filename.replace(/\.json$/i, "");
                item.textContent = isDefault ? `${themeName} (Built-in)` : themeName;
                item.onclick = async () => {
                    try {
                        const res = await fetch(`/thoughtbubble/themes/load?filename=${encodeURIComponent(filename)}`);
                        if (!res.ok) throw new Error("Could not load theme file.");
                        const themeData = await res.json();
                        this.stateManager.state.theme = themeData;
                        this.themeManager.updateTheme(themeData);
                        this.stateManager.save();
                        loadModal.close();
                        this.modal.close();
                        this.show(); // Refresh editor inputs with newly loaded colors
                    } catch (e) {
                        alert(`Error loading theme: ${e.message}`);
                    }
                };
                list.appendChild(item);
            };

            if (userThemes.length > 0) {
                const header = document.createElement("div");
                header.className = "thought-bubble-theme-header";
                header.textContent = "Your Themes";
                list.appendChild(header);
                userThemes.forEach(f => addItem(f, false));
            }

            if (defaultThemes.length > 0) {
                const header = document.createElement("div");
                header.className = "thought-bubble-theme-header";
                header.textContent = "Default Themes";
                list.appendChild(header);
                defaultThemes.forEach(f => addItem(f, true));
            }

            if (userThemes.length === 0 && defaultThemes.length === 0) {
                list.textContent = "No saved or built-in themes found.";
            }

            loadModal.show("Load Theme", container);
        } catch (err) {
            console.error("Theme list error:", err);
            alert(`Error loading themes: ${err.message}`);
        }
    }

    async handleSetDefault() {
        try {
            const response = await fetch("/thoughtbubble/themes/default/set", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(this.stateManager.state.theme || {}),
            });

            if (!response.ok) throw new Error("Failed to set default theme.");
            alert("Current theme set as default for new nodes!");
        } catch (err) {
            console.error("Set default theme error:", err);
            alert(`Error setting default theme: ${err.message}`);
        }
    }
}