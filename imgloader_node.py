"""
ComfyUI Universal Image Loader Node

A versatile image loader that supports loading from:
- File paths (with file picker)
- Base64 encoded strings  
- Clipboard paste operations

Implements proper precedence handling and error recovery.
"""

import torch
import numpy as np
from PIL import Image, ImageOps
import base64
import io
import os
import logging
from typing import Tuple, Optional, Union

# Try to import ComfyUI utilities
try:
    import folder_paths
    from comfy.model_management import soft_empty_cache
except ImportError:
    # Fallback for development/testing
    class MockFolderPaths:
        @staticmethod
        def get_input_directory():
            return "input"
    
    folder_paths = MockFolderPaths()
    
    def soft_empty_cache():
        pass

# Set up logging
logger = logging.getLogger(__name__)


class ImageLoader:
    """
    A universal image loader node for ComfyUI that can load images from multiple sources.
    
    Features:
    - File path loading with proper validation
    - Base64 string decoding with format detection
    - Clipboard paste support via JavaScript integration
    - Input precedence handling for API usage
    - Robust error handling and fallback behavior
    - Proper tensor formatting for ComfyUI
    """
    
    # ComfyUI node configuration
    CATEGORY = "image/loaders"
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "load_image"
    
    # Output node configuration
    OUTPUT_NODE = False
    
    @classmethod
    def INPUT_TYPES(cls):
        """Define the input types and their configurations."""
        return {
            "required": {},
            "optional": {
                "filepath": ("STRING", {
                    "default": "", 
                    "multiline": False,
                    "tooltip": "Path to image file (relative to ComfyUI input directory)"
                }),
                "base64": ("STRING", {
                    "default": "", 
                    "multiline": True,
                    "placeholder": "Paste base64 encoded image data here...",
                    "tooltip": "Base64 encoded image string (with or without data URL prefix)"
                }),
                "pasted_base64": ("STRING", {
                    "default": "", 
                    "multiline": False,
                    "forceInput": True,
                    "tooltip": "Hidden input populated by JavaScript when pasting images"
                }),
            }
        }
    
    @classmethod
    def IS_CHANGED(cls, **kwargs):
        """Force re-execution when inputs change."""
        # Create a hash of all non-empty inputs to detect changes
        inputs = []
        for key, value in kwargs.items():
            if value and str(value).strip():
                inputs.append(f"{key}:{value}")
        return hash(tuple(inputs))
    
    def load_image(self, filepath: str = "", base64: str = "", pasted_base64: str = "") -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Load an image from one of the available sources with precedence handling.
        
        Precedence order:
        1. Pasted image (from clipboard via JavaScript)
        2. File path
        3. Base64 string
        
        Args:
            filepath: Path to image file
            base64: Base64 encoded image string
            pasted_base64: Base64 data from clipboard paste (populated by JS)
            
        Returns:
            Tuple of (image_tensor, mask_tensor)
        """
        try:
            image_data, source_info = self._get_image_data(filepath, base64, pasted_base64)
            
            if image_data is None:
                logger.warning("No valid image source provided")
                return self._create_empty_tensors()
            
            logger.info(f"Loading image from: {source_info}")
            return self._process_image_data(image_data)
            
        except Exception as e:
            logger.error(f"Error loading image: {e}")
            return self._create_empty_tensors()
        finally:
            # Clean up GPU memory
            soft_empty_cache()
    
    def _get_image_data(self, filepath: str, base64_str: str, pasted_base64: str) -> Tuple[Optional[bytes], str]:
        """
        Extract image data from available sources following precedence rules.
        
        Returns:
            Tuple of (image_data_bytes, source_description)
        """
        # 1. Highest precedence: Pasted image from clipboard
        if self._is_valid_input(pasted_base64):
            try:
                data = self._decode_base64_data(pasted_base64)
                if data:
                    return data, "Clipboard Paste"
            except Exception as e:
                logger.warning(f"Failed to decode pasted image: {e}")
        
        # 2. Medium precedence: File path
        if self._is_valid_input(filepath):
            try:
                data = self._load_file_data(filepath)
                if data:
                    return data, f"File: {os.path.basename(filepath)}"
            except Exception as e:
                logger.warning(f"Failed to load file {filepath}: {e}")
        
        # 3. Lowest precedence: Base64 string input
        if self._is_valid_input(base64_str):
            try:
                data = self._decode_base64_data(base64_str)
                if data:
                    return data, "Base64 Input"
            except Exception as e:
                logger.warning(f"Failed to decode base64 string: {e}")
        
        return None, "No valid source"
    
    def _is_valid_input(self, value: str) -> bool:
        """Check if an input value is valid and non-empty."""
        return value and str(value).strip() and str(value).strip().lower() != "null"
    
    def _decode_base64_data(self, base64_str: str) -> Optional[bytes]:
        """
        Decode base64 data, handling both data URLs and raw base64.
        
        Args:
            base64_str: Base64 string, optionally with data URL prefix
            
        Returns:
            Decoded bytes or None if invalid
        """
        try:
            # Handle data URLs (e.g., "data:image/png;base64,iVBORw0KGgo...")
            if "," in base64_str and base64_str.startswith("data:"):
                header, encoded = base64_str.split(",", 1)
                # Validate that it's an image data URL
                if "image/" not in header:
                    raise ValueError(f"Not an image data URL: {header}")
            else:
                encoded = base64_str.strip()
            
            # Decode the base64 data
            return base64.b64decode(encoded)
            
        except Exception as e:
            logger.error(f"Base64 decode error: {e}")
            return None
    
    def _load_file_data(self, filepath: str) -> Optional[bytes]:
        """
        Load image data from a file path.
        
        Args:
            filepath: File path (relative paths are resolved to input directory)
            
        Returns:
            File contents as bytes or None if failed
        """
        try:
            # Resolve relative paths to ComfyUI input directory
            if not os.path.isabs(filepath):
                filepath = os.path.join(folder_paths.get_input_directory(), filepath)
            
            # Validate file exists and is readable
            if not os.path.exists(filepath):
                raise FileNotFoundError(f"File not found: {filepath}")
            
            if not os.path.isfile(filepath):
                raise ValueError(f"Path is not a file: {filepath}")
            
            # Read file data
            with open(filepath, 'rb') as f:
                return f.read()
                
        except Exception as e:
            logger.error(f"File load error: {e}")
            return None
    
    def _process_image_data(self, image_data: bytes) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Process raw image data into ComfyUI tensor format.
        
        Args:
            image_data: Raw image bytes
            
        Returns:
            Tuple of (image_tensor, mask_tensor)
        """
        try:
            # Open image with PIL
            img = Image.open(io.BytesIO(image_data))
            
            # Apply EXIF rotation if present
            img = ImageOps.exif_transpose(img)
            
            # Process RGB image
            image_tensor = self._create_image_tensor(img)
            
            # Process alpha mask
            mask_tensor = self._create_mask_tensor(img)
            
            return image_tensor, mask_tensor
            
        except Exception as e:
            logger.error(f"Image processing error: {e}")
            return self._create_empty_tensors()
    
    def _create_image_tensor(self, img: Image.Image) -> torch.Tensor:
        """
        Convert PIL image to ComfyUI image tensor format.
        
        Args:
            img: PIL Image object
            
        Returns:
            Image tensor in NHWC format, float32, range [0,1]
        """
        # Convert to RGB (handles all color modes)
        img_rgb = img.convert("RGB")
        
        # Convert to numpy array and normalize to [0,1]
        img_array = np.array(img_rgb).astype(np.float32) / 255.0
        
        # Convert to tensor and add batch dimension (NHWC format)
        image_tensor = torch.from_numpy(img_array)[None, ...]
        
        return image_tensor
    
    def _create_mask_tensor(self, img: Image.Image) -> torch.Tensor:
        """
        Create mask tensor from image alpha channel.
        
        Args:
            img: PIL Image object
            
        Returns:
            Mask tensor in NHW format, float32, range [0,1]
        """
        if img.mode in ('RGBA', 'LA') or 'transparency' in img.info:
            # Extract alpha channel
            if img.mode == 'RGBA':
                alpha = img.getchannel('A')
            elif img.mode == 'LA':
                alpha = img.getchannel('A')
            else:
                # Handle palette images with transparency
                img_rgba = img.convert('RGBA')
                alpha = img_rgba.getchannel('A')
            
            # Convert to tensor
            mask_array = np.array(alpha).astype(np.float32) / 255.0
            mask_tensor = torch.from_numpy(mask_array)[None, ...]
        else:
            # Create fully opaque mask
            height, width = img.size[1], img.size[0]
            mask_tensor = torch.ones((1, height, width), dtype=torch.float32)
        
        return mask_tensor
    
    def _create_empty_tensors(self) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Create empty fallback tensors when no valid image is found.
        
        Returns:
            Tuple of (empty_image_tensor, empty_mask_tensor)
        """
        # Create 1x1 black pixel as fallback
        empty_image = torch.zeros((1, 1, 1, 3), dtype=torch.float32)
        empty_mask = torch.zeros((1, 1, 1), dtype=torch.float32)
        
        return empty_image, empty_mask


# Node registration information
NODE_CLASS_MAPPINGS = {
    "ImageLoader": ImageLoader
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageLoader": "Image Loader (Universal)"
}
