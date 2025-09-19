export class MenuHandler {
    constructor(menuEl, stateManager, renderer, getWorldMouseCoords) {
        this.menuEl = menuEl;
        this.stateManager = stateManager;
        this.renderer = renderer;
        this.getWorldMouseCoords = getWorldMouseCoords;

        menuEl.addEventListener('mousedown', this.handleMouseDown.bind(this));
    }

    handleMouseDown(e) {
        e.stopPropagation();
        const item = e.target.closest('.thought-bubble-context-menu-item');
        if (!item) return;

        const boxType = item.dataset.boxType;
        this.stateManager.lastSelectedBoxType = boxType;

        const menuRect = this.menuEl.getBoundingClientRect();
        const canvasRect = this.renderer.canvasEl.getBoundingClientRect();
        
        const worldCoords = this.getWorldMouseCoords({ 
            x: menuRect.left - canvasRect.left, 
            y: menuRect.top - canvasRect.top 
        });
        
        this.stateManager.createNewBox(boxType, worldCoords.x, worldCoords.y);
        this.renderer.hideCreationMenu();
        this.renderer.render();
    }
}