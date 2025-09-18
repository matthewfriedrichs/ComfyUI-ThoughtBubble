export const DEFAULT_THEME = {
    '--tb-font-family': 'sans-serif',
    '--tb-font-size': '14px',
    '--tb-bg-color': '#222',
    '--tb-grid-color': '#404040',
    '--tb-toolbar-bg-color': '#353535',
    '--tb-box-bg-color': '#353535',
    '--tb-box-border-color': '#555',
    '--tb-box-shadow-color': 'rgba(0,0,0,0.5)',
    '--tb-header-bg-color': '#4a4a4a',
    '--tb-header-text-color': '#ddd',
    '--tb-text-color': '#ccc',
    '--tb-textarea-bg-color': '#282828',
    '--tb-button-bg-color': '#444',
    '--tb-button-text-color': '#ddd',
    '--tb-accent-color': '#5c5',
};

export class ThemeManager {
    constructor(nodeId, defaultThemeData = {}) {
        this.nodeId = nodeId;
        this.styleTagId = `thoughtbubble-theme-${nodeId}`;
        this.themeData = { ...DEFAULT_THEME, ...defaultThemeData };
        this.applyTheme();
    }

    applyTheme() {
        let styleTag = document.getElementById(this.styleTagId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = this.styleTagId;
            document.head.appendChild(styleTag);
        }

        const cssProperties = Object.entries(this.themeData)
            .map(([key, value]) => `${key}: ${value};`)
            .join('\n');

        // Apply the theme variables to the specific widget container
        styleTag.textContent = `
            .thought-bubble-widget-container[data-node-id="${this.nodeId}"] {
                ${cssProperties}
            }
        `;
    }

    updateTheme(newThemeData) {
        this.themeData = { ...this.themeData, ...newThemeData };
        this.applyTheme();
    }

    getTheme() {
        return { ...this.themeData };
    }

    resetToDefault() {
        this.themeData = { ...DEFAULT_THEME };
        this.applyTheme();
        return this.getTheme();
    }
}