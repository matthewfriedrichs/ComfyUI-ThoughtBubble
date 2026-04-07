import { BaseBox } from "./baseBox.js";
import { app } from "../../../../scripts/app.js";

// --- SNIPPET API CALLS ---
async function fetchSnippets() {
    try {
        const response = await fetch("/thoughtbubble/snippets/get");
        return await response.json();
    } catch (e) {
        return { Categories: {} };
    }
}

async function saveSnippetsToBackend(snippetsData) {
    try {
        await fetch("/thoughtbubble/snippets/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(snippetsData)
        });
    } catch (e) {
        console.error("Failed to save snippets:", e);
    }
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * A native canvas box that manages, organizes, and spawns drag-and-drop text chips.
 */
export class SnippetBox extends BaseBox {
    constructor(options) {
        super(options);
        this.inspectedSnippet = null;
        this.inspectedCategory = null;
        this.openCategories = new Set(["Uncategorized"]); // Always open by default
        this.tabSearchQuery = "";
    }

    render(contentEl) {
        // --- SINGLETON ENFORCEMENT ---
        const tbNode = app.graph._nodes.find(n => n.type === "ThoughtBubbleNode");
        if (tbNode && tbNode.stateManager) {
            const sm = tbNode.stateManager;
            const otherSnippets = sm.state.boxes.filter(b => b.type === 'snippets' && b.id !== this.boxData.id);
            if (otherSnippets.length > 0) {
                sm.state.boxes = sm.state.boxes.filter(b => b.type !== 'snippets' || b.id === this.boxData.id);
                sm.save(true);
                document.querySelectorAll('.thought-bubble-box-content[data-box-type="snippets"]').forEach(el => {
                    if (el !== contentEl) {
                        const parent = el.closest('.thought-bubble-box');
                        if (parent) parent.remove();
                    }
                });
            }
        }

        contentEl.className = "thought-bubble-box-content";
        contentEl.dataset.boxType = "snippets";

        contentEl.style.cssText = `
            display: flex; flex-direction: column; height: 100%; width: 100%;
            background: var(--tb-bg-color, #1e1e1e); color: var(--tb-text-color, #eee);
            font-family: monospace; overflow: hidden;
        `;

        contentEl.addEventListener('mousedown', (e) => e.stopPropagation());

        // 1. INSPECTOR BAR 
        const inspectorBar = document.createElement('div');
        inspectorBar.style.cssText = `
            padding: 8px; background: rgba(0,0,0,0.25); border-bottom: 1px solid var(--tb-border-color, #444);
            display: flex; flex-wrap: wrap; gap: 6px; align-items: center; min-height: 35px; flex-shrink: 0;
        `;
        this.inspectorBar = inspectorBar;
        contentEl.appendChild(inspectorBar);

        // 2. TAB AREA
        const tabArea = document.createElement('div');
        tabArea.style.cssText = `
            display: flex; flex-direction: column; gap: 6px; padding: 6px 8px; 
            border-bottom: 1px solid var(--tb-border-color, #444); flex-shrink: 0;
        `;
        this.tabArea = tabArea;
        contentEl.appendChild(tabArea);

        // 3. MAIN POOLS AREA
        const poolsArea = document.createElement('div');
        poolsArea.style.cssText = `
            flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px;
        `;
        this.poolsArea = poolsArea;
        contentEl.appendChild(poolsArea);

        this.refreshUI(contentEl);
    }

    async refreshUI(contentEl) {
        const data = await fetchSnippets();

        if (!data.Categories) data.Categories = {};
        if (!data.Categories["Uncategorized"]) {
            data.Categories["Uncategorized"] = { items: {}, track: true };
            await saveSnippetsToBackend(data);
        }

        this.openCategories.add("Uncategorized");

        this.updateInspectorBar(data, contentEl);
        this.renderTabs(data, contentEl);
        this.renderPools(data, contentEl);
    }

    updateInspectorBar(data, contentEl) {
        this.inspectorBar.innerHTML = '';

        if (this.inspectedSnippet) {
            const { uuid, catName, dataObj } = this.inspectedSnippet;

            const label = document.createElement('span');
            label.textContent = 'Chip:';
            label.style.cssText = 'color: #888; font-size: 0.8em; margin-right: 4px;';

            const nameInput = document.createElement('input');
            nameInput.value = dataObj.name || '';
            nameInput.placeholder = 'Name (/cmd)';
            nameInput.style.cssText = `background: rgba(0,0,0,0.3); color: inherit; border: 1px solid var(--tb-border-color); padding: 4px; border-radius: 3px; width: 70px; font-size: 0.9em;`;

            const contentInput = document.createElement('input');
            contentInput.value = dataObj.content || '';
            contentInput.placeholder = 'Text snippet...';
            contentInput.style.cssText = `flex: 1; min-width: 80px; background: rgba(0,0,0,0.3); color: inherit; border: 1px solid var(--tb-border-color); padding: 4px; border-radius: 3px; font-size: 0.9em;`;

            const saveBtn = document.createElement('button');
            saveBtn.textContent = '💾';
            saveBtn.title = "Save Chip";
            saveBtn.style.cssText = `background: transparent; color: #4CAF50; border: 1px solid #4CAF50; padding: 4px 8px; border-radius: 3px; cursor: pointer;`;
            saveBtn.onclick = async () => {
                const freshData = await fetchSnippets();
                if (freshData.Categories[catName] && freshData.Categories[catName].items[uuid]) {
                    freshData.Categories[catName].items[uuid].name = nameInput.value;
                    freshData.Categories[catName].items[uuid].content = contentInput.value;
                    await saveSnippetsToBackend(freshData);

                    this.inspectedSnippet.dataObj = freshData.Categories[catName].items[uuid];
                    this.refreshUI(contentEl);
                }
            };

            const delBtn = document.createElement('button');
            delBtn.textContent = '✖';
            delBtn.title = "Delete Chip";
            delBtn.style.cssText = `background: transparent; color: #d32f2f; border: 1px solid #d32f2f; padding: 4px 8px; border-radius: 3px; cursor: pointer;`;
            delBtn.onclick = async () => {
                const freshData = await fetchSnippets();
                if (freshData.Categories[catName] && freshData.Categories[catName].items[uuid]) {
                    delete freshData.Categories[catName].items[uuid];
                    await saveSnippetsToBackend(freshData);
                    this.inspectedSnippet = null;
                    this.refreshUI(contentEl);
                }
            };

            this.inspectorBar.append(label, nameInput, contentInput, saveBtn, delBtn);
        }
        else if (this.inspectedCategory) {
            const catName = this.inspectedCategory;
            const catData = data.Categories[catName] || {};
            const isUncat = catName === "Uncategorized";

            const label = document.createElement('span');
            label.textContent = 'Cat:';
            label.style.cssText = 'color: #888; font-size: 0.8em; margin-right: 4px;';

            const nameInput = document.createElement('input');
            nameInput.value = catName;
            nameInput.disabled = isUncat;
            if (isUncat) nameInput.title = "The default category cannot be renamed.";
            nameInput.style.cssText = `flex: 1; background: rgba(0,0,0,0.3); color: ${isUncat ? '#888' : 'inherit'}; border: 1px solid var(--tb-border-color); padding: 4px; border-radius: 3px; font-size: 0.9em; font-weight: bold;`;

            const trackLabel = document.createElement('label');
            trackLabel.title = "Allow backend scanning for this category";
            trackLabel.style.cssText = `display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 0.85em;`;
            const trackCheck = document.createElement('input');
            trackCheck.type = 'checkbox';
            trackCheck.checked = catData.track !== false;
            trackLabel.appendChild(trackCheck);
            trackLabel.appendChild(document.createTextNode('Scan'));

            const saveBtn = document.createElement('button');
            saveBtn.textContent = '💾';
            saveBtn.title = "Save Category";
            saveBtn.style.cssText = `background: transparent; color: #4CAF50; border: 1px solid #4CAF50; padding: 4px 8px; border-radius: 3px; cursor: pointer;`;
            saveBtn.onclick = async () => {
                const newName = nameInput.value.trim();
                const freshData = await fetchSnippets();

                if (freshData.Categories[catName]) {
                    freshData.Categories[catName].track = trackCheck.checked;

                    if (!isUncat && newName && newName !== catName) {
                        freshData.Categories[newName] = freshData.Categories[catName];
                        delete freshData.Categories[catName];

                        if (this.openCategories.has(catName)) {
                            this.openCategories.delete(catName);
                            this.openCategories.add(newName);
                        }
                        this.inspectedCategory = newName;
                    }

                    await saveSnippetsToBackend(freshData);
                    this.refreshUI(contentEl);
                }
            };

            this.inspectorBar.append(label, nameInput, trackLabel, saveBtn);

            if (!isUncat) {
                const delBtn = document.createElement('button');
                delBtn.textContent = '✖';
                delBtn.title = "Delete Entire Category";
                delBtn.style.cssText = `background: transparent; color: #d32f2f; border: 1px solid #d32f2f; padding: 4px 8px; border-radius: 3px; cursor: pointer;`;
                delBtn.onclick = async () => {
                    if (confirm(`Delete Category "${catName}" and all its chips?`)) {
                        const freshData = await fetchSnippets();
                        if (freshData.Categories[catName]) {
                            delete freshData.Categories[catName];
                            this.openCategories.delete(catName);
                            this.inspectedCategory = null;
                            await saveSnippetsToBackend(freshData);
                            this.refreshUI(contentEl);
                        }
                    }
                };
                this.inspectorBar.appendChild(delBtn);
            }
        }
        else {
            this.inspectorBar.innerHTML = `<span style="color: #888; font-style: italic; font-size: 0.85em;">Select a chip or tab to edit, or drag text into a pool.</span>`;
        }
    }

    renderTabs(data, contentEl) {
        this.tabArea.innerHTML = '';

        const controlsRow = document.createElement('div');
        controlsRow.style.cssText = `display: flex; gap: 6px;`;

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search Categories...';
        searchInput.value = this.tabSearchQuery;
        searchInput.style.cssText = `flex: 1; background: rgba(0,0,0,0.3); color: inherit; border: 1px solid var(--tb-border-color); padding: 4px 6px; border-radius: 3px; font-size: 0.9em;`;
        searchInput.addEventListener('input', (e) => {
            this.tabSearchQuery = e.target.value.toLowerCase();
            this.renderTabs(data, contentEl);
        });

        const newCatBtn = document.createElement('button');
        newCatBtn.textContent = '+';
        newCatBtn.title = "New Category";
        newCatBtn.style.cssText = `background: rgba(255,255,255,0.1); color: inherit; border: 1px solid var(--tb-border-color); padding: 4px 10px; border-radius: 3px; cursor: pointer;`;
        newCatBtn.onclick = async () => {
            const freshData = await fetchSnippets();
            let baseName = "New Category";
            let name = baseName;
            let count = 1;
            while (freshData.Categories[name]) {
                name = `${baseName} ${count++}`;
            }
            freshData.Categories[name] = { items: {}, track: true };
            this.openCategories.add(name);
            this.inspectedCategory = name;
            this.inspectedSnippet = null;
            await saveSnippetsToBackend(freshData);
            this.refreshUI(contentEl);
        };

        controlsRow.append(searchInput, newCatBtn);
        this.tabArea.appendChild(controlsRow);

        const scrollRow = document.createElement('div');
        scrollRow.style.cssText = `
            display: flex; gap: 4px; overflow-x: auto; padding-bottom: 4px; 
            scrollbar-width: thin;
        `;

        const allCats = Object.keys(data.Categories);
        const sortedCats = ["Uncategorized", ...allCats.filter(c => c !== "Uncategorized")];

        for (const catName of sortedCats) {
            if (this.tabSearchQuery && !catName.toLowerCase().includes(this.tabSearchQuery)) {
                continue;
            }

            const isUncat = catName === "Uncategorized";
            const isOpen = this.openCategories.has(catName);
            const isInspected = this.inspectedCategory === catName;

            const tabBtn = document.createElement('button');
            tabBtn.textContent = catName;

            tabBtn.style.cssText = `
                white-space: nowrap; padding: 4px 10px; border-radius: 12px; cursor: pointer; font-size: 0.85em; transition: all 0.1s;
                background: ${isOpen ? 'rgba(76, 175, 80, 0.2)' : 'rgba(0,0,0,0.3)'};
                color: ${isOpen ? '#fff' : '#aaa'};
                border: 1px solid ${isInspected ? '#4CAF50' : 'var(--tb-border-color)'};
            `;

            if (isUncat) tabBtn.style.fontStyle = 'italic';

            tabBtn.onclick = () => {
                if (isUncat) {
                    this.inspectedCategory = catName;
                    this.inspectedSnippet = null;
                } else {
                    if (isOpen) this.openCategories.delete(catName);
                    else this.openCategories.add(catName);
                    this.inspectedCategory = catName;
                    this.inspectedSnippet = null;
                }
                this.refreshUI(contentEl);
            };

            tabBtn.addEventListener('dragover', (e) => {
                e.preventDefault();
                tabBtn.style.background = 'rgba(76, 175, 80, 0.5)';
            });
            tabBtn.addEventListener('dragleave', () => {
                tabBtn.style.background = isOpen ? 'rgba(76, 175, 80, 0.2)' : 'rgba(0,0,0,0.3)';
            });
            tabBtn.addEventListener('drop', async (e) => {
                e.preventDefault();
                tabBtn.style.background = isOpen ? 'rgba(76, 175, 80, 0.2)' : 'rgba(0,0,0,0.3)';

                const chipDataStr = e.dataTransfer.getData('application/tb-chip');
                if (chipDataStr) {
                    const { cat: oldCat, uuid } = JSON.parse(chipDataStr);
                    if (oldCat !== catName) {
                        const allData = await fetchSnippets();
                        const itemToMove = allData.Categories[oldCat].items[uuid];

                        delete allData.Categories[oldCat].items[uuid];
                        if (!allData.Categories[catName].items) allData.Categories[catName].items = {};
                        allData.Categories[catName].items[uuid] = itemToMove;

                        await saveSnippetsToBackend(allData);

                        if (this.inspectedSnippet && this.inspectedSnippet.uuid === uuid) {
                            this.inspectedSnippet.catName = catName;
                        }
                        this.refreshUI(contentEl);
                    }
                }
            });

            scrollRow.appendChild(tabBtn);
        }

        this.tabArea.appendChild(scrollRow);
    }

    renderPools(data, contentEl) {
        const container = this.poolsArea;
        container.innerHTML = '';
        const categories = data.Categories || {};

        const allCats = Object.keys(categories);
        const normalCats = allCats.filter(c => c !== "Uncategorized");

        const renderSinglePool = (catName) => {
            const catData = categories[catName];
            const poolWrapper = document.createElement('div');
            poolWrapper.style.cssText = `
                background: rgba(0,0,0,0.15); border: 1px solid var(--tb-border-color, #444); 
                border-radius: 4px; padding: 6px; display: flex; flex-direction: column; gap: 6px;
            `;

            const poolHeader = document.createElement('div');
            poolHeader.textContent = catName;
            poolHeader.style.cssText = `font-weight: bold; color: #4CAF50; font-size: 0.9em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px;`;
            poolWrapper.appendChild(poolHeader);

            const chipContainer = document.createElement('div');
            chipContainer.style.cssText = `
                display: flex; flex-wrap: wrap; gap: 6px; min-height: 30px; 
                padding: 6px; background: rgba(0,0,0,0.2); border-radius: 3px; border: 1px dashed transparent;
                transition: all 0.2s;
            `;

            chipContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                chipContainer.style.borderColor = '#4CAF50';
                chipContainer.style.background = 'rgba(76, 175, 80, 0.1)';
            });
            chipContainer.addEventListener('dragleave', () => {
                chipContainer.style.borderColor = 'transparent';
                chipContainer.style.background = 'rgba(0,0,0,0.2)';
            });
            chipContainer.addEventListener('drop', async (e) => {
                e.preventDefault();
                chipContainer.style.borderColor = 'transparent';
                chipContainer.style.background = 'rgba(0,0,0,0.2)';

                const chipDataStr = e.dataTransfer.getData('application/tb-chip');

                if (chipDataStr) {
                    const { cat: oldCat, uuid } = JSON.parse(chipDataStr);
                    if (oldCat !== catName) {
                        const allData = await fetchSnippets();
                        const itemToMove = allData.Categories[oldCat].items[uuid];

                        delete allData.Categories[oldCat].items[uuid];
                        if (!allData.Categories[catName].items) allData.Categories[catName].items = {};
                        allData.Categories[catName].items[uuid] = itemToMove;

                        await saveSnippetsToBackend(allData);

                        if (this.inspectedSnippet && this.inspectedSnippet.uuid === uuid) {
                            this.inspectedSnippet.catName = catName;
                        }
                        this.refreshUI(contentEl);
                    }
                } else {
                    const text = e.dataTransfer.getData('text/plain');
                    if (text && text.trim() !== "") {
                        const allData = await fetchSnippets();
                        const newUuid = generateUUID();
                        if (!allData.Categories[catName].items) allData.Categories[catName].items = {};

                        allData.Categories[catName].items[newUuid] = {
                            name: "",
                            content: text.trim(),
                            uses: 0,
                            track: true
                        };

                        await saveSnippetsToBackend(allData);
                        this.refreshUI(contentEl);
                    }
                }
            });

            const items = catData.items || {};
            let hasItems = false;

            for (const [uuid, itemData] of Object.entries(items)) {
                hasItems = true;
                const chip = document.createElement('div');

                const displayText = itemData.name ? `/${itemData.name}` : (itemData.content.length > 15 ? itemData.content.substring(0, 15) + '...' : itemData.content);
                const isInspected = this.inspectedSnippet && this.inspectedSnippet.uuid === uuid;

                chip.style.cssText = `
                    background: ${isInspected ? '#4CAF50' : 'rgba(255,255,255,0.1)'}; 
                    color: ${isInspected ? '#fff' : 'inherit'}; 
                    padding: 3px 8px; border-radius: 12px; font-size: 0.85em; 
                    cursor: grab; user-select: none; border: 1px solid ${isInspected ? '#fff' : 'rgba(255,255,255,0.2)'};
                    white-space: nowrap; transition: background 0.1s;
                `;
                chip.textContent = displayText;
                chip.draggable = true;
                chip.title = itemData.content;

                chip.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', itemData.content);
                    e.dataTransfer.setData('application/tb-chip', JSON.stringify({ cat: catName, uuid: uuid }));
                    e.dataTransfer.effectAllowed = 'copyMove';
                    e.dataTransfer.setDragImage(chip, 0, 0);
                    e.stopPropagation();

                    // FIX: Delay hides SnippetBox so browser can snapshot drag ghost
                    setTimeout(() => {
                        const myBoxWrapper = contentEl.closest('.thought-bubble-box') || contentEl.parentElement;
                        if (myBoxWrapper) {
                            myBoxWrapper.style.opacity = '0.4';
                            myBoxWrapper.style.pointerEvents = 'none';
                        }
                    }, 50);
                });

                chip.addEventListener('dragend', () => {
                    const myBoxWrapper = contentEl.closest('.thought-bubble-box') || contentEl.parentElement;
                    if (myBoxWrapper) {
                        myBoxWrapper.style.opacity = '';
                        myBoxWrapper.style.pointerEvents = '';
                    }
                });

                chip.addEventListener('click', () => {
                    this.inspectedSnippet = { uuid, catName, dataObj: itemData };
                    this.inspectedCategory = null;
                    this.refreshUI(contentEl);
                });

                chipContainer.appendChild(chip);
            }

            if (!hasItems) {
                const emptyHint = document.createElement('span');
                emptyHint.textContent = "Drop text here";
                emptyHint.style.cssText = "color: rgba(255,255,255,0.3); font-style: italic; font-size: 0.8em; align-self: center;";
                chipContainer.appendChild(emptyHint);
            }

            poolWrapper.appendChild(chipContainer);
            container.appendChild(poolWrapper);
        };

        for (const catName of normalCats) {
            if (this.openCategories.has(catName)) {
                renderSinglePool(catName);
            }
        }

        if (categories["Uncategorized"]) {
            renderSinglePool("Uncategorized");
        }
    }

    static createDefaultState(x, y, width, height) {
        return {
            title: "Chip Pool",
            content: "",
            type: "snippets",
            x, y, width: Math.max(width, 250), height: Math.max(height, 300),
        };
    }
}