/**
 * ComfyUI Universal Image Loader - Frontend JavaScript
 * 
 * Provides enhanced UI interactions for the ImageLoader node:
 * - Input validation and clearing
 * - Visual feedback for different input methods
 * - Preview functionality
 */

// Note: app is available globally in ComfyUI context

// Configuration constants
const CONFIG = {
    NODE_NAME: "ImageLoader",
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
        this.previewElement = null;
    }

    /**
     * Initialize the node handler
     */
    initialize() {
        this.findWidgets();
        this.setupWidgets();
        this.setupEventListeners();
        this.setupPreview();
    }

    /**
     * Find and store widget references
     */
    findWidgets() {
        this.widgets.image = this.node.widgets?.find(w => w.name === "image");
        this.widgets.filepath = this.node.widgets?.find(w => w.name === "filepath");
        this.widgets.base64 = this.node.widgets?.find(w => w.name === "base64");
    }

    /**
     * Setup widget configurations and styling
     */
    setupWidgets() {
        // Add placeholder improvements
        if (this.widgets.base64?.inputEl) {
            this.widgets.base64.inputEl.placeholder = "Paste base64 image data here...";
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

            this.eventListeners.push({
                element: this.widgets.base64.inputEl,
                type: 'input',
                handler: inputHandler
            });
        }
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
     * Clear inputs other than the specified active one based on precedence rules
     * 
     * Precedence order:
     * 1. File path - clears image upload and base64
     * 2. Base64 - clears image upload and filepath  
     * 3. Image upload (lowest) - clears filepath and base64
     */
    clearOtherInputs(activeInput) {
        // Define what each input type should clear
        const clearingRules = {
            'filepath': ['image', 'base64'],                   // Filepath clears image upload and base64
            'base64': ['image', 'filepath'],                   // Base64 clears image upload and filepath
            'image': ['filepath', 'base64']                    // Image upload clears filepath and base64
        };
        
        const inputsToClear = clearingRules[activeInput] || [];
        
        inputsToClear.forEach(inputName => {
            const widget = this.widgets[inputName];
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
        // Update preview for new active input after a short delay
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
        } else if (source === 'base64') {
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

        // Clear node reference
        if (this.node._imageLoaderPreview) {
            delete this.node._imageLoaderPreview;
        }
    }
}

// Initialize and register the extension
const imageLoaderExtension = new ImageLoaderExtension();
imageLoaderExtension.register();
