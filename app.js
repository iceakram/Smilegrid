/**
 * SmileGrid - Main Application
 * A digital art experience built around human presence
 * 
 * This module handles:
 * - Virtualized grid rendering for performance
 * - Smooth pan & zoom interactions
 * - Image upload flow with auto-crop
 * - Tile animations and effects
 */

// ============================================
// Configuration
// ============================================
const CONFIG = {
    // Grid settings
    TILE_SIZE: 80,
    TILE_GAP: 2,
    GRID_COLS: 100,
    GRID_ROWS: 100,
    
    // Zoom settings
    MIN_ZOOM: 0.3,
    MAX_ZOOM: 3,
    ZOOM_STEP: 0.2,
    ZOOM_SENSITIVITY: 0.001,
    
    // Pan settings
    PAN_FRICTION: 0.92,
    PAN_THRESHOLD: 2,
    
    // Performance
    RENDER_BUFFER: 2, // Extra tiles to render outside viewport
    DEBOUNCE_DELAY: 16, // ~60fps
    
    // Storage
    STORAGE_KEY: 'smilegrid_tiles'
};

// ============================================
// State Management
// ============================================
const state = {
    // Transform state
    zoom: 1,
    panX: 0,
    panY: 0,
    
    // Interaction state
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    lastPanX: 0,
    lastPanY: 0,
    velocityX: 0,
    velocityY: 0,
    lastMoveTime: 0,
    
    // Pinch zoom state
    initialPinchDistance: 0,
    initialZoom: 1,
    
    // Grid state
    tiles: new Map(), // Map of "col,row" -> tile data
    visibleTiles: new Set(), // Currently rendered tile keys
    tileElements: new Map(), // Map of "col,row" -> DOM element
    
    // Counter
    totalSmiles: 0,
    
    // Upload state
    uploadedImage: null,
    newTilePosition: null
};

// ============================================
// DOM References
// ============================================
const elements = {
    gridContainer: null,
    gridCanvas: null,
    header: null,
    smileCounter: null,
    counterNumber: null,
    addSmileBtn: null,
    zoomIn: null,
    zoomOut: null,
    zoomReset: null,
    modal: null,
    modalBackdrop: null,
    modalClose: null,
    dropzone: null,
    fileInput: null,
    previewImage: null,
    backBtn: null,
    publishBtn: null,
    viewSmileBtn: null,
    loading: null
};

// ============================================
// Initialization
// ============================================
function init() {
    // Cache DOM elements
    cacheElements();
    
    // Load saved tiles from storage
    loadTiles();
    
    // Initialize grid position (center)
    centerGrid();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initial render
    requestAnimationFrame(render);
    
    // Update counter
    updateCounter();
    
    console.log('SmileGrid initialized');
}

/**
 * Cache DOM element references
 */
function cacheElements() {
    elements.gridContainer = document.getElementById('grid-container');
    elements.gridCanvas = document.getElementById('grid-canvas');
    elements.header = document.getElementById('header');
    elements.smileCounter = document.getElementById('smile-counter');
    elements.counterNumber = document.querySelector('.counter-number');
    elements.addSmileBtn = document.getElementById('add-smile-btn');
    elements.zoomIn = document.getElementById('zoom-in');
    elements.zoomOut = document.getElementById('zoom-out');
    elements.zoomReset = document.getElementById('zoom-reset');
    elements.modal = document.getElementById('upload-modal');
    elements.modalBackdrop = elements.modal.querySelector('.modal-backdrop');
    elements.modalClose = elements.modal.querySelector('.modal-close');
    elements.dropzone = document.getElementById('dropzone');
    elements.fileInput = document.getElementById('file-input');
    elements.previewImage = document.getElementById('preview-image');
    elements.backBtn = document.getElementById('back-btn');
    elements.publishBtn = document.getElementById('publish-btn');
    elements.viewSmileBtn = document.getElementById('view-smile-btn');
    elements.loading = document.getElementById('loading');
}

/**
 * Center the grid in the viewport
 */
function centerGrid() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gridWidth = CONFIG.GRID_COLS * (CONFIG.TILE_SIZE + CONFIG.TILE_GAP);
    const gridHeight = CONFIG.GRID_ROWS * (CONFIG.TILE_SIZE + CONFIG.TILE_GAP);
    
    // Center the grid
    state.panX = (viewportWidth - gridWidth * state.zoom) / 2;
    state.panY = (viewportHeight - gridHeight * state.zoom) / 2;
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // Pan & zoom events
    elements.gridContainer.addEventListener('mousedown', handlePanStart);
    elements.gridContainer.addEventListener('mousemove', handlePanMove);
    elements.gridContainer.addEventListener('mouseup', handlePanEnd);
    elements.gridContainer.addEventListener('mouseleave', handlePanEnd);
    elements.gridContainer.addEventListener('wheel', handleWheel, { passive: false });
    
    // Touch events
    elements.gridContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
    elements.gridContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    elements.gridContainer.addEventListener('touchend', handleTouchEnd);
    
    // Zoom controls
    elements.zoomIn.addEventListener('click', () => zoomBy(CONFIG.ZOOM_STEP));
    elements.zoomOut.addEventListener('click', () => zoomBy(-CONFIG.ZOOM_STEP));
    elements.zoomReset.addEventListener('click', resetZoom);
    
    // Upload modal
    elements.addSmileBtn.addEventListener('click', openModal);
    elements.modalBackdrop.addEventListener('click', closeModal);
    elements.modalClose.addEventListener('click', closeModal);
    
    // Dropzone
    elements.dropzone.addEventListener('click', () => elements.fileInput.click());
    elements.dropzone.addEventListener('dragover', handleDragOver);
    elements.dropzone.addEventListener('dragleave', handleDragLeave);
    elements.dropzone.addEventListener('drop', handleDrop);
    elements.fileInput.addEventListener('change', handleFileSelect);
    
    // Upload flow buttons
    elements.backBtn.addEventListener('click', goToUploadStep);
    elements.publishBtn.addEventListener('click', publishSmile);
    elements.viewSmileBtn.addEventListener('click', viewNewSmile);
    
    // Keyboard events
    document.addEventListener('keydown', handleKeydown);
    
    // Window resize
    window.addEventListener('resize', debounce(render, 100));
}

// ============================================
// Pan & Zoom Handlers
// ============================================

/**
 * Handle pan start (mouse)
 */
function handlePanStart(e) {
    if (e.button !== 0) return; // Left click only
    
    state.isDragging = true;
    state.dragStartX = e.clientX - state.panX;
    state.dragStartY = e.clientY - state.panY;
    state.lastPanX = state.panX;
    state.lastPanY = state.panY;
    state.lastMoveTime = Date.now();
    state.velocityX = 0;
    state.velocityY = 0;
    
    elements.gridContainer.style.cursor = 'grabbing';
}

/**
 * Handle pan move (mouse)
 */
function handlePanMove(e) {
    if (!state.isDragging) return;
    
    const newPanX = e.clientX - state.dragStartX;
    const newPanY = e.clientY - state.dragStartY;
    
    // Calculate velocity for momentum
    const now = Date.now();
    const dt = now - state.lastMoveTime;
    if (dt > 0) {
        state.velocityX = (newPanX - state.lastPanX) / dt * 16;
        state.velocityY = (newPanY - state.lastPanY) / dt * 16;
    }
    
    state.panX = newPanX;
    state.panY = newPanY;
    state.lastPanX = newPanX;
    state.lastPanY = newPanY;
    state.lastMoveTime = now;
    
    requestAnimationFrame(render);
}

/**
 * Handle pan end (mouse)
 */
function handlePanEnd() {
    if (!state.isDragging) return;
    
    state.isDragging = false;
    elements.gridContainer.style.cursor = 'grab';
    
    // Apply momentum
    if (Math.abs(state.velocityX) > CONFIG.PAN_THRESHOLD || 
        Math.abs(state.velocityY) > CONFIG.PAN_THRESHOLD) {
        applyMomentum();
    }
}

/**
 * Apply momentum scrolling
 */
function applyMomentum() {
    if (Math.abs(state.velocityX) < CONFIG.PAN_THRESHOLD && 
        Math.abs(state.velocityY) < CONFIG.PAN_THRESHOLD) {
        return;
    }
    
    state.panX += state.velocityX;
    state.panY += state.velocityY;
    state.velocityX *= CONFIG.PAN_FRICTION;
    state.velocityY *= CONFIG.PAN_FRICTION;
    
    requestAnimationFrame(() => {
        render();
        applyMomentum();
    });
}

/**
 * Handle wheel zoom
 */
function handleWheel(e) {
    e.preventDefault();
    
    const delta = -e.deltaY * CONFIG.ZOOM_SENSITIVITY;
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    zoomAt(mouseX, mouseY, delta);
}

/**
 * Zoom at a specific point
 */
function zoomAt(x, y, delta) {
    const newZoom = Math.max(CONFIG.MIN_ZOOM, 
                            Math.min(CONFIG.MAX_ZOOM, state.zoom + delta));
    
    if (newZoom === state.zoom) return;
    
    // Adjust pan to zoom towards mouse position
    const zoomRatio = newZoom / state.zoom;
    state.panX = x - (x - state.panX) * zoomRatio;
    state.panY = y - (y - state.panY) * zoomRatio;
    state.zoom = newZoom;
    
    requestAnimationFrame(render);
}

/**
 * Zoom by a fixed amount
 */
function zoomBy(amount) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    zoomAt(centerX, centerY, amount);
}

/**
 * Reset zoom and center grid
 */
function resetZoom() {
    state.zoom = 1;
    centerGrid();
    requestAnimationFrame(render);
}

// ============================================
// Touch Handlers
// ============================================

/**
 * Handle touch start
 */
function handleTouchStart(e) {
    if (e.touches.length === 1) {
        // Single touch - pan
        const touch = e.touches[0];
        state.isDragging = true;
        state.dragStartX = touch.clientX - state.panX;
        state.dragStartY = touch.clientY - state.panY;
        state.lastPanX = state.panX;
        state.lastPanY = state.panY;
        state.lastMoveTime = Date.now();
    } else if (e.touches.length === 2) {
        // Two fingers - pinch zoom
        e.preventDefault();
        state.isDragging = false;
        state.initialPinchDistance = getPinchDistance(e.touches);
        state.initialZoom = state.zoom;
    }
}

/**
 * Handle touch move
 */
function handleTouchMove(e) {
    if (e.touches.length === 1 && state.isDragging) {
        const touch = e.touches[0];
        const newPanX = touch.clientX - state.dragStartX;
        const newPanY = touch.clientY - state.dragStartY;
        
        // Calculate velocity
        const now = Date.now();
        const dt = now - state.lastMoveTime;
        if (dt > 0) {
            state.velocityX = (newPanX - state.lastPanX) / dt * 16;
            state.velocityY = (newPanY - state.lastPanY) / dt * 16;
        }
        
        state.panX = newPanX;
        state.panY = newPanY;
        state.lastPanX = newPanX;
        state.lastPanY = newPanY;
        state.lastMoveTime = now;
        
        requestAnimationFrame(render);
    } else if (e.touches.length === 2) {
        e.preventDefault();
        
        // Pinch zoom
        const currentDistance = getPinchDistance(e.touches);
        const pinchCenter = getPinchCenter(e.touches);
        const scale = currentDistance / state.initialPinchDistance;
        const newZoom = Math.max(CONFIG.MIN_ZOOM, 
                                Math.min(CONFIG.MAX_ZOOM, state.initialZoom * scale));
        
        // Zoom towards pinch center
        const zoomRatio = newZoom / state.zoom;
        state.panX = pinchCenter.x - (pinchCenter.x - state.panX) * zoomRatio;
        state.panY = pinchCenter.y - (pinchCenter.y - state.panY) * zoomRatio;
        state.zoom = newZoom;
        
        requestAnimationFrame(render);
    }
}

/**
 * Handle touch end
 */
function handleTouchEnd(e) {
    if (e.touches.length === 0) {
        state.isDragging = false;
        
        // Apply momentum
        if (Math.abs(state.velocityX) > CONFIG.PAN_THRESHOLD || 
            Math.abs(state.velocityY) > CONFIG.PAN_THRESHOLD) {
            applyMomentum();
        }
    } else if (e.touches.length === 1) {
        // Transition from pinch to pan
        const touch = e.touches[0];
        state.isDragging = true;
        state.dragStartX = touch.clientX - state.panX;
        state.dragStartY = touch.clientY - state.panY;
    }
}

/**
 * Get distance between two touch points
 */
function getPinchDistance(touches) {
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get center point between two touches
 */
function getPinchCenter(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

// ============================================
// Keyboard Handlers
// ============================================
function handleKeydown(e) {
    // Close modal on Escape
    if (e.key === 'Escape' && elements.modal.getAttribute('aria-hidden') === 'false') {
        closeModal();
    }
    
    // Zoom shortcuts
    if (e.key === '+' || e.key === '=') {
        zoomBy(CONFIG.ZOOM_STEP);
    } else if (e.key === '-') {
        zoomBy(-CONFIG.ZOOM_STEP);
    } else if (e.key === '0') {
        resetZoom();
    }
}

// ============================================
// Grid Rendering (Virtualized)
// ============================================

/**
 * Main render function - updates visible tiles
 */
function render() {
    const viewport = getViewport();
    const visibleRange = getVisibleTileRange(viewport);
    const newVisibleTiles = new Set();
    
    // Apply transform to canvas
    elements.gridCanvas.style.transform = 
        `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.zoom})`;
    
    // Determine which tiles should be visible
    for (let row = visibleRange.startRow; row <= visibleRange.endRow; row++) {
        for (let col = visibleRange.startCol; col <= visibleRange.endCol; col++) {
            const key = `${col},${row}`;
            newVisibleTiles.add(key);
            
            // Create tile if not exists
            if (!state.tileElements.has(key)) {
                createTileElement(col, row);
            }
        }
    }
    
    // Remove tiles that are no longer visible
    for (const key of state.visibleTiles) {
        if (!newVisibleTiles.has(key)) {
            removeTileElement(key);
        }
    }
    
    state.visibleTiles = newVisibleTiles;
}

/**
 * Get current viewport dimensions
 */
function getViewport() {
    return {
        width: window.innerWidth,
        height: window.innerHeight
    };
}

/**
 * Calculate which tiles are visible in the viewport
 */
function getVisibleTileRange(viewport) {
    const tileUnit = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;
    
    // Convert viewport to grid coordinates
    const startCol = Math.max(0, Math.floor(-state.panX / (tileUnit * state.zoom)) - CONFIG.RENDER_BUFFER);
    const startRow = Math.max(0, Math.floor(-state.panY / (tileUnit * state.zoom)) - CONFIG.RENDER_BUFFER);
    const endCol = Math.min(CONFIG.GRID_COLS - 1, 
                           Math.ceil((viewport.width - state.panX) / (tileUnit * state.zoom)) + CONFIG.RENDER_BUFFER);
    const endRow = Math.min(CONFIG.GRID_ROWS - 1, 
                           Math.ceil((viewport.height - state.panY) / (tileUnit * state.zoom)) + CONFIG.RENDER_BUFFER);
    
    return { startCol, startRow, endCol, endRow };
}

/**
 * Create a tile DOM element
 */
function createTileElement(col, row) {
    const key = `${col},${row}`;
    const tileData = state.tiles.get(key);
    
    const tile = document.createElement('div');
    tile.className = 'tile' + (tileData ? '' : ' empty');
    tile.style.left = `${col * (CONFIG.TILE_SIZE + CONFIG.TILE_GAP)}px`;
    tile.style.top = `${row * (CONFIG.TILE_SIZE + CONFIG.TILE_GAP)}px`;
    tile.dataset.col = col;
    tile.dataset.row = row;
    
    if (tileData) {
        const img = document.createElement('img');
        img.src = tileData.src;
        img.alt = 'Smile';
        img.loading = 'lazy';
        img.onload = () => img.classList.add('loaded');
        img.onerror = () => {
            // On error, show as empty tile
            tile.classList.add('empty');
            img.remove();
        };
        tile.appendChild(img);
    }
    
    elements.gridCanvas.appendChild(tile);
    state.tileElements.set(key, tile);
}

/**
 * Remove a tile DOM element
 */
function removeTileElement(key) {
    const tile = state.tileElements.get(key);
    if (tile) {
        tile.remove();
        state.tileElements.delete(key);
    }
}

// ============================================
// Upload Modal
// ============================================

/**
 * Open upload modal
 */
function openModal() {
    elements.modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    goToUploadStep();
}

/**
 * Close upload modal
 */
function closeModal() {
    elements.modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.uploadedImage = null;
    
    // Reset file input
    elements.fileInput.value = '';
}

/**
 * Navigate to upload step
 */
function goToUploadStep() {
    showStep('upload');
    state.uploadedImage = null;
}

/**
 * Navigate to preview step
 */
function goToPreviewStep() {
    showStep('preview');
}

/**
 * Navigate to success step
 */
function goToSuccessStep() {
    showStep('success');
}

/**
 * Show a specific step and hide others
 */
function showStep(stepName) {
    const steps = elements.modal.querySelectorAll('.upload-step');
    steps.forEach(step => {
        step.hidden = step.dataset.step !== stepName;
    });
}

// ============================================
// File Upload Handlers
// ============================================

/**
 * Handle drag over
 */
function handleDragOver(e) {
    e.preventDefault();
    elements.dropzone.classList.add('dragover');
}

/**
 * Handle drag leave
 */
function handleDragLeave(e) {
    e.preventDefault();
    elements.dropzone.classList.remove('dragover');
}

/**
 * Handle file drop
 */
function handleDrop(e) {
    e.preventDefault();
    elements.dropzone.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

/**
 * Handle file selection
 */
function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

/**
 * Process uploaded file
 */
function processFile(file) {
    // Validate file type
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file.');
        return;
    }
    
    // Read and process image
    const reader = new FileReader();
    reader.onload = (e) => {
        cropToSquare(e.target.result).then(croppedImage => {
            state.uploadedImage = croppedImage;
            elements.previewImage.src = croppedImage;
            goToPreviewStep();
        });
    };
    reader.readAsDataURL(file);
}

/**
 * Crop image to square (centered)
 */
function cropToSquare(imageSrc) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Determine crop dimensions
            const size = Math.min(img.width, img.height);
            const offsetX = (img.width - size) / 2;
            const offsetY = (img.height - size) / 2;
            
            // Set canvas size (optimize for tile display)
            const outputSize = 200;
            canvas.width = outputSize;
            canvas.height = outputSize;
            
            // Draw cropped image
            ctx.drawImage(
                img,
                offsetX, offsetY, size, size,
                0, 0, outputSize, outputSize
            );
            
            // Return as data URL
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = imageSrc;
    });
}

/**
 * Publish the smile to the grid
 */
function publishSmile() {
    if (!state.uploadedImage) return;
    
    // Find an empty tile position (procedural placement)
    const position = findEmptyTilePosition();
    if (!position) {
        showToast('The grid is full! Thank you for your smile.');
        closeModal();
        return;
    }
    
    // Add tile data
    const key = `${position.col},${position.row}`;
    state.tiles.set(key, {
        src: state.uploadedImage,
        timestamp: Date.now()
    });
    
    // Save to storage
    saveTiles();
    
    // Update counter
    state.totalSmiles++;
    updateCounter();
    
    // Store new tile position for navigation
    state.newTilePosition = position;
    
    // Go to success step
    goToSuccessStep();
}

/**
 * Find an empty position for a new tile (procedural placement)
 */
function findEmptyTilePosition() {
    // Start from center and spiral outward
    const centerCol = Math.floor(CONFIG.GRID_COLS / 2);
    const centerRow = Math.floor(CONFIG.GRID_ROWS / 2);
    
    // Spiral search pattern
    let col = centerCol;
    let row = centerRow;
    let direction = 0; // 0=right, 1=down, 2=left, 3=up
    let stepsInDirection = 1;
    let stepsTaken = 0;
    let turnsAtCurrentLength = 0;
    
    for (let i = 0; i < CONFIG.GRID_COLS * CONFIG.GRID_ROWS; i++) {
        const key = `${col},${row}`;
        if (!state.tiles.has(key) && 
            col >= 0 && col < CONFIG.GRID_COLS && 
            row >= 0 && row < CONFIG.GRID_ROWS) {
            return { col, row };
        }
        
        // Move in current direction
        switch (direction) {
            case 0: col++; break;
            case 1: row++; break;
            case 2: col--; break;
            case 3: row--; break;
        }
        
        stepsTaken++;
        
        // Turn if needed
        if (stepsTaken >= stepsInDirection) {
            stepsTaken = 0;
            direction = (direction + 1) % 4;
            turnsAtCurrentLength++;
            
            if (turnsAtCurrentLength >= 2) {
                turnsAtCurrentLength = 0;
                stepsInDirection++;
            }
        }
    }
    
    return null;
}

/**
 * Navigate to and highlight the new smile
 */
function viewNewSmile() {
    closeModal();
    
    if (!state.newTilePosition) return;
    
    const { col, row } = state.newTilePosition;
    const key = `${col},${row}`;
    
    // Calculate target position (center tile in viewport)
    const tileUnit = CONFIG.TILE_SIZE + CONFIG.TILE_GAP;
    const tileCenterX = col * tileUnit + CONFIG.TILE_SIZE / 2;
    const tileCenterY = row * tileUnit + CONFIG.TILE_SIZE / 2;
    
    const targetPanX = window.innerWidth / 2 - tileCenterX * state.zoom;
    const targetPanY = window.innerHeight / 2 - tileCenterY * state.zoom;
    
    // Animate to target position
    animatePan(targetPanX, targetPanY, () => {
        // Re-render to ensure tile is created
        requestAnimationFrame(() => {
            render();
            
            // Highlight the tile
            setTimeout(() => {
                const tileElement = state.tileElements.get(key);
                if (tileElement) {
                    tileElement.classList.add('new', 'highlight');
                    
                    // Remove classes after animation
                    setTimeout(() => {
                        tileElement.classList.remove('new', 'highlight');
                    }, 2500);
                }
            }, 100);
        });
    });
}

/**
 * Animate pan to target position
 */
function animatePan(targetX, targetY, callback) {
    const startX = state.panX;
    const startY = state.panY;
    const duration = 800;
    const startTime = performance.now();
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out cubic)
        const eased = 1 - Math.pow(1 - progress, 3);
        
        state.panX = startX + (targetX - startX) * eased;
        state.panY = startY + (targetY - startY) * eased;
        
        render();
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else if (callback) {
            callback();
        }
    }
    
    requestAnimationFrame(animate);
}

// ============================================
// Counter
// ============================================
function updateCounter() {
    elements.counterNumber.textContent = state.totalSmiles.toLocaleString();
    
    // Animate counter update
    elements.counterNumber.style.transform = 'scale(1.1)';
    setTimeout(() => {
        elements.counterNumber.style.transform = 'scale(1)';
    }, 200);
}

// ============================================
// Storage
// ============================================

/**
 * Save tiles to localStorage
 */
function saveTiles() {
    try {
        const tilesArray = Array.from(state.tiles.entries());
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(tilesArray));
    } catch (e) {
        console.warn('Failed to save tiles to localStorage:', e);
    }
}

/**
 * Load tiles from localStorage
 */
function loadTiles() {
    try {
        const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (stored) {
            const tilesArray = JSON.parse(stored);
            state.tiles = new Map(tilesArray);
            state.totalSmiles = state.tiles.size;
        }
    } catch (e) {
        console.warn('Failed to load tiles from localStorage:', e);
    }
}

// ============================================
// Utilities
// ============================================

/**
 * Debounce function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {number} duration - Duration in milliseconds (default: 3000)
 */
function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Remove toast after duration
    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

// ============================================
// Initialize on DOM Ready
// ============================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
