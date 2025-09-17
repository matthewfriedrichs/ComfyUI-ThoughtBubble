// js/box-types/controlsBox.js

import { BaseBox } from "./baseBox.js";

function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

export class ControlsBox extends BaseBox {
    
    render(contentEl) {
        contentEl.className = "thought-bubble-box-content controls-box";
        this.variablesContainer = document.createElement("div");
        this.variablesContainer.className = "controls-variables-container";

        const addButton = document.createElement("button");
        addButton.textContent = "+ Add Variable";
        addButton.className = "controls-add-button";
        addButton.addEventListener("click", () => {
            this.addVariable();
            this.requestSave();
            this.renderVariables();
        });

        contentEl.append(addButton, this.variablesContainer);
        this.renderVariables();
    }

    renderVariables() {
        this.variablesContainer.innerHTML = "";
        if (!this.boxData.variables) this.boxData.variables = [];

        this.boxData.variables.forEach((variable, index) => {
            const row = document.createElement("div");
            row.className = "controls-variable-row";

            const nameInput = document.createElement("input");
            nameInput.type = "text";
            nameInput.placeholder = "variable_name";
            nameInput.className = "controls-variable-name";
            nameInput.value = variable.name;
            nameInput.addEventListener("change", (e) => {
                variable.name = e.target.value.toLowerCase().replace(/\s+/g, '_');
                e.target.value = variable.name;
                this.requestSave();
            });

            const behaviorSelect = document.createElement("select");
            behaviorSelect.className = "controls-variable-behavior";
            // --- NEW: Added "Fixed" and "Decrement", renamed "Randomize" ---
            ["Increment", "Decrement", "Randomize", "Fixed"].forEach(b => {
                const option = document.createElement("option");
                option.value = b.toLowerCase();
                option.textContent = b;
                behaviorSelect.appendChild(option);
            });
            behaviorSelect.value = variable.behavior;
            behaviorSelect.addEventListener("change", (e) => {
                variable.behavior = e.target.value;
                this.requestSave();
            });
            
            // --- NEW: The value display is now an editable number input ---
            const valueDisplay = document.createElement("input");
            valueDisplay.type = "number"; // Changed from "text"
            valueDisplay.className = "controls-variable-value";
            valueDisplay.value = variable.value;
            // It is no longer readOnly
            valueDisplay.addEventListener("change", (e) => {
                // Parse the value to ensure it's a number before saving
                variable.value = Number(e.target.value);
                this.requestSave();
            });
            variable.element = valueDisplay;

            const deleteButton = document.createElement("button");
            deleteButton.textContent = "✕";
            deleteButton.className = "controls-variable-delete";
            deleteButton.addEventListener("click", () => {
                this.boxData.variables.splice(index, 1);
                this.requestSave();
                this.renderVariables();
            });

            row.append(nameInput, behaviorSelect, valueDisplay, deleteButton);
            this.variablesContainer.appendChild(row);
        });
    }

    addVariable() {
        if (!this.boxData.variables) this.boxData.variables = [];
        this.boxData.variables.push({
            id: uuidv4(),
            name: `var_${this.boxData.variables.length + 1}`,
            behavior: "increment",
            value: 0
        });
    }

    // --- NEW: Update logic now handles Decrement and Fixed behaviors ---
    updateVariables() {
        if (!this.boxData.variables) return;

        this.boxData.variables.forEach(variable => {
            switch(variable.behavior) {
                case 'increment':
                    variable.value = (Number(variable.value) || 0) + 1;
                    break;
                case 'decrement':
                    variable.value = (Number(variable.value) || 0) - 1;
                    break;
                case 'randomize': // Formerly 'seed'
                    variable.value = Math.floor(Math.random() * 1e16);
                    break;
                case 'fixed':
                    // Do nothing
                    break;
            }
            
            if (variable.element) {
                variable.element.value = variable.value;
            }
        });
    }

    static createDefaultState(x, y, width, height) {
        return {
            title: "Controls",
            type: "controls",
            variables: [],
            x, y, width, height,
        };
    }
}