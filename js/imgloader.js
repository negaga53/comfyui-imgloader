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

// Note: app is available globally in ComfyUI context

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
        this.widgets.image = this.node.widgets?.find(w => w.name === "image");
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
        // Image widget (file picker) change handler
        if (this.widgets.image) {
            const originalCallback = this.widgets.image.callback;
            this.widgets.image.callback = (value) => {
                if (value && value.trim()) {
                    this.clearOtherInputs('image');
                    this.updatePreview('image', value);
                }
                return originalCallback?.call(this.node, value);
            };
        }

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

        // Global paste handler for clipboard images
        const globalPasteHandler = (event) => this.handlePaste(event);
        document.addEventListener('paste', globalPasteHandler);
        this.eventListeners.push({
            element: document,
            type: 'paste',
            handler: globalPasteHandler
        });
    }

    /**
     * Setup drag and drop functionality
     */
    setupDragAndDrop() {
        // Add drag and drop to the node itself
        const nodeElement = this.node;
        if (!nodeElement) return;

        // Store original handlers to avoid conflicts
        const originalOnDragOver = nodeElement.onDragOver;
        const originalOnDragLeave = nodeElement.onDragLeave;  
        const originalOnDrop = nodeElement.onDrop;

        nodeElement.onDragOver = (event) => {
            if (this.hasImageFiles(event.dataTransfer)) {
                event.preventDefault();
                event.stopPropagation();
                event.dataTransfer.dropEffect = 'copy';
                this.setDragState(true);
                return true;
            }
            return originalOnDragOver?.call(nodeElement, event);
        };

        nodeElement.onDragLeave = (event) => {
            this.setDragState(false);
            return originalOnDragLeave?.call(nodeElement, event);
        };

        nodeElement.onDrop = (event) => {
            if (this.hasImageFiles(event.dataTransfer)) {
                event.preventDefault();
                event.stopPropagation();
                this.setDragState(false);
                this.handleDrop(event);
                return true;
            }
            return originalOnDrop?.call(nodeElement, event);
        };
    }

    /**
     * Setup image preview functionality
     */
    setupPreview() {
        // For ComfyUI nodes, we'll create a preview that appears when hovering or when an image is loaded
        // The preview will be positioned relative to the node
        this.previewElement = document.createElement('div');
        this.previewElement.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            width: ${CONFIG.MAX_PREVIEW_SIZE}px;
            max-height: ${CONFIG.MAX_PREVIEW_SIZE}px;
            border: 2px solid #4CAF50;
            border-radius: 8px;
            background: #fff;
            display: none;
            z-index: 9999;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            pointer-events: none;
        `;
        
        // Add to document body for better positioning
        document.body.appendChild(this.previewElement);
        
        // Store reference for cleanup
        this.node._imageLoaderPreview = this.previewElement;
    }

    /**
     * Handle clipboard paste events
     */
    handlePaste(event) {
        // Only handle if this node is focused or selected
        if (!this.isNodeActive()) {
            return;
        }

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
     * Check if this node is currently active/selected
     */
    isNodeActive() {
        // Check if the node is selected in the graph
        if (this.node.graph && this.node.graph.canvas) {
            return this.node.graph.canvas.selected_nodes && 
                   this.node.graph.canvas.selected_nodes[this.node.id];
        }
        return false;
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
     * Clear inputs other than the specified active one based on precedence rules
     * 
     * Precedence order:
     * 1. Clipboard paste (highest) - clears all others
     * 2. File path - clears image upload and base64
     * 3. Base64 - clears image upload and filepath  
     * 4. Image upload (lowest) - clears filepath and base64
     */
    clearOtherInputs(activeInput) {
        // Define what each input type should clear
        const clearingRules = {
            'paste': ['image', 'filepath', 'base64'],          // Paste clears everything else
            'filepath': ['image', 'base64'],                   // Filepath clears image upload and base64
            'base64': ['image', 'filepath'],                   // Base64 clears image upload and filepath
            'image': ['filepath', 'base64']                    // Image upload clears filepath and base64
        };
        
        const inputsToClear = clearingRules[activeInput] || [];
        
        inputsToClear.forEach(inputName => {
            const widget = inputName === 'paste' ? this.widgets.pasted : this.widgets[inputName];
            if (widget && widget.value !== '') {
                const oldValue = widget.value;
                widget.value = '';
                
                // Trigger change event to update the node
                if (widget.callback) {
                    widget.callback('');
                }
                
                // Log the clearing action for debugging
                console.info(`ImageLoader: Cleared ${inputName} (was: "${oldValue.substring(0, 50)}${oldValue.length > 50 ? '...' : ''}")`);
            }
        });
        
        // Update preview for new active input
        this.hidePreview();
        if (activeInput !== 'paste') {
            // For non-paste inputs, update preview after a short delay
            setTimeout(() => {
                if (activeInput === 'image' && this.widgets.image?.value) {
                    this.updatePreview('image', this.widgets.image.value);
                } else if (activeInput === 'filepath' && this.widgets.filepath?.value) {
                    this.updatePreview('filepath', this.widgets.filepath.value);
                } else if (activeInput === 'base64' && this.widgets.base64?.value) {
                    this.updatePreview('base64', this.widgets.base64.value);
                }
            }, 100);
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
        
        if (source === 'filepath' || source === 'image') {
            // For file paths, try to create a preview URL
            if (value && value.trim()) {
                // Try to load the image for preview
                this.loadImagePreview(value);
                return;
            }
        } else if (source === 'base64' || source === 'paste') {
            imageUrl = value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
        }

        if (imageUrl) {
            this.showPreview(imageUrl);
        } else {
            this.hidePreview();
        }
    }

    /**
     * Load image preview from file path
     */
    async loadImagePreview(filePath) {
        try {
            // For ComfyUI, we can try to access the image through the input directory
            const imageUrl = `/view?filename=${encodeURIComponent(filePath)}&type=input`;
            
            // Test if the image loads
            const img = new Image();
            img.onload = () => {
                this.showPreview(imageUrl);
            };
            img.onerror = () => {
                // If direct access fails, show a placeholder
                this.showPreviewPlaceholder(filePath);
            };
            img.src = imageUrl;
        } catch (error) {
            this.showPreviewPlaceholder(filePath);
        }
    }

    /**
     * Show image preview
     */
    showPreview(imageUrl) {
        if (!this.previewElement) return;
        
        this.previewElement.innerHTML = `
            <img src="${imageUrl}" 
                 style="width: 100%; height: auto; max-height: ${CONFIG.MAX_PREVIEW_SIZE}px; object-fit: contain; display: block;" 
                 alt="Preview" 
                 onerror="this.parentElement.innerHTML='<div style=\\'padding: 10px; text-align: center; color: #666;\\'>Preview not available</div>'" />
        `;
        this.previewElement.style.display = 'block';
    }

    /**
     * Show preview placeholder for file paths
     */
    showPreviewPlaceholder(fileName) {
        if (!this.previewElement) return;
        
        const baseName = fileName.split(/[\\/]/).pop() || fileName;
        this.previewElement.innerHTML = `
            <div style="padding: 10px; text-align: center; color: #666; font-size: 12px; background: #f5f5f5; border-radius: 4px;">
                📁 ${baseName}<br>
                <small>File selected</small>
            </div>
        `;
        this.previewElement.style.display = 'block';
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
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #4CAF50;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: bold;
            z-index: 10000;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: fadeInOut 2s ease-in-out;
        `;
        
        // Add animation keyframes if not already present
        if (!document.getElementById('pasteIndicatorStyles')) {
            const style = document.createElement('style');
            style.id = 'pasteIndicatorStyles';
            style.textContent = `
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                    20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                    100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                }
            `;
            document.head.appendChild(style);
        }
        
        document.body.appendChild(indicator);
        
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, CONFIG.PASTE_INDICATOR_DURATION);
    }

    /**
     * Set drag state visual feedback
     */
    setDragState(isDragging) {
        this.isDragging = isDragging;
        
        if (this.node) {
            if (isDragging) {
                // Store original colors
                this.originalColors = {
                    bgcolor: this.node.bgcolor,
                    color: this.node.color
                };
                
                // Set drag state colors
                this.node.bgcolor = "rgba(76, 175, 80, 0.2)";
                this.node.color = "#4CAF50";
                
                // Force redraw
                if (this.node.graph && this.node.graph.canvas) {
                    this.node.graph.canvas.draw(true, true);
                }
            } else {
                // Restore original colors
                if (this.originalColors) {
                    this.node.bgcolor = this.originalColors.bgcolor;
                    this.node.color = this.originalColors.color;
                    this.originalColors = null;
                }
                
                // Force redraw
                if (this.node.graph && this.node.graph.canvas) {
                    this.node.graph.canvas.draw(true, true);
                }
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

        // Remove preview element from document body
        if (this.previewElement?.parentNode) {
            this.previewElement.parentNode.removeChild(this.previewElement);
        }

        // Clear drag state
        this.setDragState(false);

        // Clear node reference
        if (this.node._imageLoaderPreview) {
            delete this.node._imageLoaderPreview;
        }
    }
}

// Initialize and register the extension
const imageLoaderExtension = new ImageLoaderExtension();
imageLoaderExtension.register();
