/**
 * ComfyUI Universal Image Loader - Frontend JavaScript
 * 
 * Provides enhanced UI interactions for the ImageLoader node:
 * - Drag & drop image support
 * - Clipboard paste handling
 * - Input validation and clearing
 * - Visual feedback for different input methods
 * - Preview functionality
 */

import { app } from "/scripts/app.js";

// Configuration constants
const CONFIG = {
    NODE_NAME: "ImageLoader",
    PASTE_INDICATOR_DURATION: 2000,
    MAX_PREVIEW_SIZE: 200,
    SUPPORTED_IMAGE_TYPES: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp']
};

class ImageLoaderExtension {
    constructor() {
        this.activeNodes = new Set();
    }

    /**
     * Register the extension with ComfyUI
     */
    register() {
        app.registerExtension({
            name: "Comfy.ImageLoader.Universal",
            
            async beforeRegisterNodeDef(nodeType, nodeData, app) {
                if (nodeData.name === CONFIG.NODE_NAME) {
                    this.enhanceNodeType(nodeType);
                }
            }
        });
    }

    /**
     * Enhance the node type with custom functionality
     */
    enhanceNodeType(nodeType) {
        const originalOnNodeCreated = nodeType.prototype.onNodeCreated;
        
        nodeType.prototype.onNodeCreated = function() {
            // Call original creation logic
            originalOnNodeCreated?.apply(this, arguments);
            
            // Apply our enhancements
            this.imageLoaderExtension = new ImageLoaderNodeHandler(this);
            this.imageLoaderExtension.initialize();
        };

        // Add cleanup when node is removed
        const originalOnRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function() {
            this.imageLoaderExtension?.cleanup();
            originalOnRemoved?.apply(this, arguments);
        };
    }
}

class ImageLoaderNodeHandler {
    constructor(node) {
        this.node = node;
        this.widgets = {};
        this.eventListeners = [];
        this.isDragging = false;
        this.previewElement = null;
    }

    /**
     * Initialize the node handler
     */
    initialize() {
        this.findWidgets();
        this.setupWidgets();
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupPreview();
    }

    /**
     * Find and store widget references
     */
    findWidgets() {
        this.widgets.filepath = this.node.widgets?.find(w => w.name === "filepath");
        this.widgets.base64 = this.node.widgets?.find(w => w.name === "base64");
        this.widgets.pasted = this.node.widgets?.find(w => w.name === "pasted_base64");

        // Validate required widgets exist
        if (!this.widgets.pasted) {
            console.warn("ImageLoader: pasted_base64 widget not found");
        }
    }

    /**
     * Setup widget configurations and styling
     */
    setupWidgets() {
        // Hide the pasted_base64 widget input element
        if (this.widgets.pasted?.inputEl) {
            this.widgets.pasted.inputEl.style.display = 'none';
        }

        // Add placeholder improvements
        if (this.widgets.base64?.inputEl) {
            this.widgets.base64.inputEl.placeholder = "Paste base64 image data here, or paste an image directly onto the node...";
            this.widgets.base64.inputEl.style.minHeight = "60px";
        }

        // Style improvements for filepath widget
        if (this.widgets.filepath?.inputEl) {
            this.widgets.filepath.inputEl.placeholder = "Select an image file...";
        }
    }

    /**
     * Setup event listeners for input handling
     */
    setupEventListeners() {
        // Filepath widget change handler
        if (this.widgets.filepath) {
            const originalCallback = this.widgets.filepath.callback;
            this.widgets.filepath.callback = (value) => {
                if (value && value.trim()) {
                    this.clearOtherInputs('filepath');
                    this.updatePreview('filepath', value);
                }
                return originalCallback?.call(this.node, value);
            };
        }

        // Base64 widget input handler
        if (this.widgets.base64?.inputEl) {
            const inputHandler = (event) => {
                const value = event.target.value;
                if (value && value.trim()) {
                    this.clearOtherInputs('base64');
                    this.validateBase64Input(value);
                }
            };

            this.widgets.base64.inputEl.addEventListener('input', inputHandler);
            this.widgets.base64.inputEl.addEventListener('paste', (event) => {
                // Handle text paste in base64 field
                setTimeout(() => inputHandler(event), 10);
            });

            this.eventListeners.push({
                element: this.widgets.base64.inputEl,
                type: 'input',
                handler: inputHandler
            });
        }

        // Clipboard paste handler for the entire node
        const pasteHandler = (event) => this.handlePaste(event);
        
        // Add paste listener to node element and its container
        if (this.node.canvas) {
            this.node.canvas.addEventListener('paste', pasteHandler);
            this.eventListeners.push({
                element: this.node.canvas,
                type: 'paste',
                handler: pasteHandler
            });
        }

        // Also listen on the node's DOM element if available
        if (this.node.element) {
            this.node.element.addEventListener('paste', pasteHandler);
            this.eventListeners.push({
                element: this.node.element,
                type: 'paste',
                handler: pasteHandler
            });
        }
    }

    /**
     * Setup drag and drop functionality
     */
    setupDragAndDrop() {
        const nodeElement = this.node.element || this.node.canvas;
        if (!nodeElement) return;

        const dragOverHandler = (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Check if dragged items include images
            if (this.hasImageFiles(event.dataTransfer)) {
                event.dataTransfer.dropEffect = 'copy';
                this.setDragState(true);
            }
        };

        const dragLeaveHandler = (event) => {
            event.preventDefault();
            event.stopPropagation();
            
            // Only clear drag state if leaving the node entirely
            if (!nodeElement.contains(event.relatedTarget)) {
                this.setDragState(false);
            }
        };

        const dropHandler = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.setDragState(false);
            
            this.handleDrop(event);
        };

        // Add drag and drop listeners
        nodeElement.addEventListener('dragover', dragOverHandler);
        nodeElement.addEventListener('dragleave', dragLeaveHandler);
        nodeElement.addEventListener('drop', dropHandler);

        this.eventListeners.push(
            { element: nodeElement, type: 'dragover', handler: dragOverHandler },
            { element: nodeElement, type: 'dragleave', handler: dragLeaveHandler },
            { element: nodeElement, type: 'drop', handler: dropHandler }
        );
    }

    /**
     * Setup image preview functionality
     */
    setupPreview() {
        // Create preview container (initially hidden)
        this.previewElement = document.createElement('div');
        this.previewElement.style.cssText = `
            position: absolute;
            top: -10px;
            right: -10px;
            width: ${CONFIG.MAX_PREVIEW_SIZE}px;
            max-height: ${CONFIG.MAX_PREVIEW_SIZE}px;
            border: 2px solid #4CAF50;
            border-radius: 4px;
            background: #fff;
            display: none;
            z-index: 1000;
            overflow: hidden;
        `;
        
        if (this.node.element) {
            this.node.element.style.position = 'relative';
            this.node.element.appendChild(this.previewElement);
        }
    }

    /**
     * Handle clipboard paste events
     */
    handlePaste(event) {
        const items = (event.clipboardData || event.originalEvent?.clipboardData)?.items;
        if (!items) return;

        for (const item of items) {
            if (item.kind === 'file' && this.isValidImageType(item.type)) {
                event.preventDefault();
                event.stopPropagation();
                
                const file = item.getAsFile();
                this.processImageFile(file, 'paste');
                
                // Show visual feedback
                this.showPasteIndicator();
                return;
            }
        }
    }

    /**
     * Handle drag and drop events
     */
    handleDrop(event) {
        const files = Array.from(event.dataTransfer.files);
        const imageFiles = files.filter(file => this.isValidImageType(file.type));
        
        if (imageFiles.length > 0) {
            // Use the first image file
            this.processImageFile(imageFiles[0], 'drop');
            
            if (imageFiles.length > 1) {
                console.info(`ImageLoader: Multiple images dropped, using first: ${imageFiles[0].name}`);
            }
        }
    }

    /**
     * Process an image file (from paste or drop)
     */
    processImageFile(file, source) {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            
            // Set the pasted widget value
            if (this.widgets.pasted) {
                this.widgets.pasted.value = dataUrl;
                
                // Clear other inputs
                this.clearOtherInputs('paste');
                
                // Update preview
                this.updatePreview('paste', dataUrl);
                
                // Trigger node update
                this.node.onWidgetChanged?.(this.widgets.pasted.name, dataUrl, this.widgets.pasted);
                
                console.info(`ImageLoader: Image loaded from ${source}: ${file.name || 'clipboard'}`);
            }
        };
        
        reader.onerror = () => {
            console.error(`ImageLoader: Failed to read image file from ${source}`);
        };
        
        reader.readAsDataURL(file);
    }

    /**
     * Clear inputs other than the specified active one
     */
    clearOtherInputs(activeInput) {
        const inputs = ['filepath', 'base64', 'paste'];
        
        inputs.forEach(input => {
            if (input !== activeInput) {
                const widget = input === 'paste' ? this.widgets.pasted : this.widgets[input];
                if (widget && widget.value !== '') {
                    widget.value = '';
                }
            }
        });
        
        // Hide preview if clearing
        if (activeInput !== 'paste') {
            this.hidePreview();
        }
    }

    /**
     * Validate base64 input format
     */
    validateBase64Input(value) {
        try {
            // Basic validation for base64 format
            if (value.startsWith('data:image/')) {
                // Data URL format
                const [header, data] = value.split(',');
                if (data && data.length > 0) {
                    this.updatePreview('base64', value);
                    return true;
                }
            } else {
                // Raw base64 - try to decode
                atob(value.substring(0, 100)); // Test decode first 100 chars
                this.updatePreview('base64', `data:image/png;base64,${value}`);
                return true;
            }
        } catch (error) {
            console.warn('ImageLoader: Invalid base64 format');
            this.hidePreview();
            return false;
        }
    }

    /**
     * Update image preview
     */
    updatePreview(source, value) {
        if (!this.previewElement) return;

        let imageUrl = '';
        
        if (source === 'filepath') {
            // For file paths, we can't show preview without loading the file
            this.hidePreview();
            return;
        } else if (source === 'base64' || source === 'paste') {
            imageUrl = value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
        }

        if (imageUrl) {
            this.previewElement.innerHTML = `
                <img src="${imageUrl}" 
                     style="width: 100%; height: auto; max-height: ${CONFIG.MAX_PREVIEW_SIZE}px; object-fit: contain;" 
                     alt="Preview" />
            `;
            this.previewElement.style.display = 'block';
        }
    }

    /**
     * Hide image preview
     */
    hidePreview() {
        if (this.previewElement) {
            this.previewElement.style.display = 'none';
        }
    }

    /**
     * Show visual feedback for paste operation
     */
    showPasteIndicator() {
        const indicator = document.createElement('div');
        indicator.textContent = '📋 Image Pasted!';
        indicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #4CAF50;
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1001;
            pointer-events: none;
        `;
        
        if (this.node.element) {
            this.node.element.appendChild(indicator);
            
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, CONFIG.PASTE_INDICATOR_DURATION);
        }
    }

    /**
     * Set drag state visual feedback
     */
    setDragState(isDragging) {
        this.isDragging = isDragging;
        
        if (this.node.element) {
            if (isDragging) {
                this.node.element.style.outline = '2px dashed #4CAF50';
                this.node.element.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
            } else {
                this.node.element.style.outline = '';
                this.node.element.style.backgroundColor = '';
            }
        }
    }

    /**
     * Check if drag event contains image files
     */
    hasImageFiles(dataTransfer) {
        if (!dataTransfer?.types) return false;
        
        return dataTransfer.types.includes('Files') && 
               Array.from(dataTransfer.items || []).some(item => 
                   item.kind === 'file' && this.isValidImageType(item.type)
               );
    }

    /**
     * Check if file type is a supported image format
     */
    isValidImageType(type) {
        return CONFIG.SUPPORTED_IMAGE_TYPES.includes(type.toLowerCase());
    }

    /**
     * Clean up event listeners and elements
     */
    cleanup() {
        // Remove event listeners
        this.eventListeners.forEach(({ element, type, handler }) => {
            element?.removeEventListener(type, handler);
        });
        this.eventListeners = [];

        // Remove preview element
        if (this.previewElement?.parentNode) {
            this.previewElement.parentNode.removeChild(this.previewElement);
        }

        // Clear drag state
        this.setDragState(false);
    }
}

// Initialize and register the extension
const imageLoaderExtension = new ImageLoaderExtension();
imageLoaderExtension.register();
