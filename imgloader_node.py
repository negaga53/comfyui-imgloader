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
import pathlib
from typing import Tuple, Optional, Union

# Try to import ComfyUI utilities
try:
    import folder_paths
    import node_helpers
    from comfy.model_management import soft_empty_cache
    from nodes import PreviewImage, SaveImage
except ImportError:
    # Fallback for development/testing
    class MockFolderPaths:
        @staticmethod
        def get_input_directory():
            return "input"
        
        @staticmethod
        def get_annotated_filepath(filename):
            return os.path.join("input", filename)
        
        @staticmethod
        def exists_annotated_filepath(filename):
            return os.path.exists(os.path.join("input", filename))
    
    class MockNodeHelpers:
        @staticmethod
        def pillow(func, *args, **kwargs):
            return func(*args, **kwargs)
    
    class MockPreviewImage:
        def save_images(self, images, filename_prefix, prompt=None, extra_pnginfo=None):
            return {"ui": {"images": []}}
    
    class MockSaveImage:
        def save_images(self, images, filename_prefix, prompt=None, extra_pnginfo=None):
            return {"ui": {"images": []}}
    
    folder_paths = MockFolderPaths()
    node_helpers = MockNodeHelpers()
    PreviewImage = MockPreviewImage
    SaveImage = MockSaveImage
    
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
        # Get list of supported image files from input directory
        input_dir = folder_paths.get_input_directory()
        files = []
        if os.path.exists(input_dir):
            files = [f.name for f in pathlib.Path(input_dir).iterdir() if f.is_file()]
        
        return {
            "required": {
                "image": (sorted(files), {
                    "image_upload": True,
                    "tooltip": "Select an image file from the input directory"
                })
            },
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
    
    @classmethod
    def VALIDATE_INPUTS(cls, **kwargs):
        """Validate input parameters."""
        image = kwargs.get("image", "")
        if image and image.strip():
            if not folder_paths.exists_annotated_filepath(image):
                return f"Invalid image file: {image}"
        return True
    
    def load_image(self, image: str = "", filepath: str = "", base64: str = "", pasted_base64: str = "") -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Load an image from one of the available sources with precedence handling.
        
        Precedence order:
        1. Pasted image (from clipboard via JavaScript)
        2. Image upload (file picker)
        3. File path
        4. Base64 string
        
        Args:
            image: Image file from file picker
            filepath: Path to image file
            base64: Base64 encoded image string
            pasted_base64: Base64 data from clipboard paste (populated by JS)
            
        Returns:
            Tuple of (image_tensor, mask_tensor)
        """
        try:
            image_data, source_info = self._get_image_data(image, filepath, base64, pasted_base64)
            
            if image_data is None:
                logger.warning("No valid image source provided")
                image_tensor, mask_tensor = self._create_empty_tensors()
            else:
                logger.info(f"Loading image from: {source_info}")
                image_tensor, mask_tensor = self._process_image_data(image_data)
            
            # Show the image in the UI
            results = self.easySave(image_tensor, "imgloader", "Preview", None, None)
            return {"ui": {"images": results},
                    "result": (image_tensor, mask_tensor)}
            
        except Exception as e:
            logger.error(f"Error loading image: {e}")
            image_tensor, mask_tensor = self._create_empty_tensors()
            results = self.easySave(image_tensor, "imgloader", "Preview", None, None)
            return {"ui": {"images": results},
                    "result": (image_tensor, mask_tensor)}
        finally:
            # Clean up GPU memory
            soft_empty_cache()
    
    def _get_image_data(self, image: str, filepath: str, base64_str: str, pasted_base64: str) -> Tuple[Optional[bytes], str]:
        """
        Extract image data from available sources following precedence rules.
        
        Precedence order (higher precedence overrides lower):
        1. Clipboard paste (pasted_base64) - highest precedence
        2. File path input (filepath) - overrides image upload
        3. Base64 string input (base64_str) - overrides image upload  
        4. Image upload (image) - lowest precedence
        
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
        
        # 2. Second precedence: File path input (overrides image upload)
        if self._is_valid_input(filepath):
            try:
                data = self._load_file_data(filepath, use_annotated_path=False)
                if data:
                    return data, f"File Path: {os.path.basename(filepath)}"
            except Exception as e:
                logger.warning(f"Failed to load file {filepath}: {e}")
        
        # 3. Third precedence: Base64 string input (overrides image upload)
        if self._is_valid_input(base64_str):
            try:
                data = self._decode_base64_data(base64_str)
                if data:
                    return data, "Base64 Input"
            except Exception as e:
                logger.warning(f"Failed to decode base64 string: {e}")
        
        # 4. Lowest precedence: Image upload from file picker
        if self._is_valid_input(image):
            try:
                data = self._load_file_data(image, use_annotated_path=True)
                if data:
                    return data, f"File Upload: {os.path.basename(image)}"
            except Exception as e:
                logger.warning(f"Failed to load uploaded image {image}: {e}")
        
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
    
    def _load_file_data(self, filepath: str, use_annotated_path: bool = False) -> Optional[bytes]:
        """
        Load image data from a file path.
        
        Args:
            filepath: File path (relative paths are resolved to input directory)
            use_annotated_path: If True, use ComfyUI's annotated path system (for file picker)
            
        Returns:
            File contents as bytes or None if failed
        """
        try:
            # Handle empty or None filepath
            if not filepath or filepath.strip() == "":
                return None
            
            if use_annotated_path:
                # Use ComfyUI's annotated filepath system for file picker uploads
                full_path = folder_paths.get_annotated_filepath(filepath)
            else:
                # Handle manual file paths
                if not os.path.sep in filepath and not "/" in filepath:
                    # If filepath doesn't contain path separators, it's likely from the dropdown
                    # and should be treated as a filename in the input directory
                    full_path = os.path.join(folder_paths.get_input_directory(), filepath)
                elif not os.path.isabs(filepath):
                    # Resolve relative paths to ComfyUI input directory
                    full_path = os.path.join(folder_paths.get_input_directory(), filepath)
                else:
                    full_path = filepath
            
            # Validate file exists and is readable
            if not os.path.exists(full_path):
                raise FileNotFoundError(f"File not found: {full_path}")
            
            if not os.path.isfile(full_path):
                raise ValueError(f"Path is not a file: {full_path}")
            
            # Read file data
            with open(full_path, 'rb') as f:
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
            # Open image with PIL using node_helpers for better ComfyUI compatibility
            img = node_helpers.pillow(Image.open, io.BytesIO(image_data))
            
            # Apply EXIF rotation if present
            img = node_helpers.pillow(ImageOps.exif_transpose, img)
            
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
    
    def easySave(self, images, filename_prefix, output_type, prompt=None, extra_pnginfo=None):
        """Save or Preview Image"""
        if output_type in ["Hide", "None"]:
            return list()
        elif output_type in ["Preview", "Preview&Choose"]:
            filename_prefix = 'easyPreview'
            results = PreviewImage().save_images(images, filename_prefix, prompt, extra_pnginfo)
            return results['ui']['images']
        else:
            results = SaveImage().save_images(images, filename_prefix, prompt, extra_pnginfo)
            return results['ui']['images']


# Node registration information
NODE_CLASS_MAPPINGS = {
    "ImageLoader": ImageLoader
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageLoader": "Image Loader (Universal)"
}
