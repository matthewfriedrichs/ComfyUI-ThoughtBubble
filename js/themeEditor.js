import { DEFAULT_THEME } from "./themeManager.js";

export class ThemeEditor {
    constructor(stateManager, themeManager) {
        this.stateManager = stateManager;
        this.themeManager = themeManager;
        this.panel = null;
    }

    show() {
        // --- FIX: Singleton Check ---
        const existing = document.querySelector('.thought-bubble-floating-panel');
        if (existing) {
            // Panel exists: Re-center it and return
            const winW = window.innerWidth;
            const winH = window.innerHeight;
            const panelW = existing.offsetWidth;
            const panelH = existing.offsetHeight;
            existing.style.left = `${(winW - panelW) / 2}px`;
            existing.style.top = `${(winH - panelH) / 2}px`;
            return;
        }
        // ----------------------------

        this.panel = document.createElement('div');
        this.panel.className = 'thought-bubble-floating-panel';

        const header = document.createElement('div');
        header.className = 'floating-panel-header';
        header.innerHTML = '<span>Theme Editor</span>';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'panel-close-btn';
        closeBtn.innerHTML = '×';
        closeBtn.onclick = () => this.close();
        header.appendChild(closeBtn);

        const body = this.createEditorBody();
        const footer = this.createFooterButtons();

        this.panel.append(header, body, footer);
        document.body.appendChild(this.panel);

        const winW = window.innerWidth;
        const winH = window.innerHeight;
        // Force a layout calc so offsetWidth is correct
        const panelW = this.panel.offsetWidth || 320;
        const panelH = this.panel.offsetHeight || 400;

        this.panel.style.left = `${(winW - panelW) / 2}px`;
        this.panel.style.top = `${(winH - panelH) / 2}px`;

        this.makeDraggable(this.panel, header);
    }

    close() {
        if (this.panel) {
            this.panel.remove();
            this.panel = null;
        }
        const existing = document.querySelector('.thought-bubble-floating-panel');
        if (existing) existing.remove();
    }

    makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        handle.onmousedown = (e) => {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = () => {
                document.onmouseup = null;
                document.onmousemove = null;
            };
            document.onmousemove = (e) => {
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                element.style.top = (element.offsetTop - pos2) + "px";
                element.style.left = (element.offsetLeft - pos1) + "px";
            };
        };
    }

    createEditorBody() {
        const container = document.createElement('div');
        container.className = 'floating-panel-body';

        const currentTheme = this.stateManager.state.theme || {};

        for (const key in DEFAULT_THEME) {
            const row = document.createElement('div');
            const isColor = key.toLowerCase().includes('color');
            row.className = `theme-editor-row ${isColor ? 'is-color-row' : 'is-text-row'}`;

            const label = document.createElement('label');
            label.className = 'theme-editor-label';
            label.textContent = key.replace('--tb-', '').replace(/-/g, ' ').toUpperCase();

            const input = document.createElement('input');
            input.type = isColor ? 'color' : 'text';
            input.value = currentTheme[key] || DEFAULT_THEME[key];
            input.className = isColor ? 'theme-editor-input-color' : 'theme-editor-input-text';

            if (isColor) {
                const hexInput = document.createElement('input');
                hexInput.type = 'text';
                hexInput.className = 'theme-editor-input-hex';
                hexInput.value = input.value;
                input.addEventListener('input', () => {
                    hexInput.value = input.value;
                    liveUpdate(input.value);
                });
                hexInput.addEventListener('change', () => {
                    input.value = hexInput.value;
                    liveUpdate(hexInput.value);
                });
                row.append(label, input, hexInput);
            } else {
                input.addEventListener('change', (e) => liveUpdate(e.target.value));
                row.append(label, input);
            }

            const liveUpdate = (val) => {
                if (!this.stateManager.state.theme) this.stateManager.state.theme = {};
                this.stateManager.state.theme[key] = val;
                this.themeManager.updateTheme(this.stateManager.state.theme);
                this.stateManager.save();
            };

            container.appendChild(row);
        }
        return container;
    }

    createFooterButtons() {
        const footer = document.createElement('div');
        footer.className = 'floating-panel-footer';

        const createBtn = (text, onClick) => {
            const btn = document.createElement('button');
            btn.textContent = text;
            btn.onclick = onClick;
            return btn;
        };

        footer.append(
            createBtn("Reset", () => {
                this.stateManager.state.theme = this.themeManager.resetToDefault();
                this.stateManager.save();
                this.close();
                this.show();
            }),
            createBtn("Load", () => this.handleLoadTheme()),
            createBtn("Save", () => this.handleSaveTheme()),
            createBtn("Default", () => this.handleSetDefault())
        );
        return footer;
    }

    async handleSaveTheme() {
        const filename = prompt("Theme Name:");
        if (!filename) return;
        try {
            await fetch('/thoughtbubble/themes/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: `${filename}.json`, content: this.stateManager.state.theme }),
            });
            alert("Saved!");
        } catch (error) { alert(error.message); }
    }

    async handleLoadTheme() {
        const body = this.panel.querySelector('.floating-panel-body');
        body.innerHTML = '<div style="padding:10px">Loading...</div>';

        try {
            const [userRes, defRes] = await Promise.all([
                fetch('/thoughtbubble/themes/list'),
                fetch('/thoughtbubble/themes/list_default')
            ]);
            const userThemes = await userRes.json();
            const defThemes = await defRes.json();

            body.innerHTML = '';
            const list = document.createElement('div');
            list.className = 'thought-bubble-file-list';

            const addHeader = (text) => {
                const h = document.createElement('div');
                h.className = 'thought-bubble-theme-header';
                h.textContent = text;
                list.appendChild(h);
            };

            const addItem = (name) => {
                const item = document.createElement('div');
                item.className = 'thought-bubble-file-item';
                item.textContent = name.replace('.json', '');
                item.onclick = async () => {
                    const r = await fetch(`/thoughtbubble/themes/load?filename=${name}`);
                    const data = await r.json();
                    this.stateManager.state.theme = data;
                    this.themeManager.updateTheme(data);
                    this.stateManager.save();
                    this.close();
                    this.show();
                };
                list.appendChild(item);
            };

            if (userThemes.length) { addHeader("USER"); userThemes.forEach(addItem); }
            if (defThemes.length) { addHeader("PRESETS"); defThemes.forEach(addItem); }

            const backBtn = document.createElement('button');
            backBtn.textContent = "← Back to Editor";
            backBtn.style.cssText = "width:100%; padding:8px; background:none; border:none; color:#ccc; cursor:pointer;";
            backBtn.onclick = () => {
                this.close();
                this.show();
            };

            body.appendChild(backBtn);
            body.appendChild(list);

        } catch (e) {
            body.textContent = "Error loading themes.";
        }
    }

    async handleSetDefault() {
        await fetch('/thoughtbubble/themes/default/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(this.stateManager.state.theme),
        });
        alert("Default Set!");
    }
}