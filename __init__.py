"""
ComfyUI Universal Image Loader - Node Registration

This module registers the ImageLoader custom node with ComfyUI.
"""

from .imgloader_node import ImageLoader

# Node class mappings for ComfyUI
NODE_CLASS_MAPPINGS = {
    "ImageLoader": ImageLoader
}

# Display name mappings for the UI
NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageLoader": "Image Loader (Universal)"
}

# Path to JavaScript files
WEB_DIRECTORY = "./js"

# Export the required variables
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']
