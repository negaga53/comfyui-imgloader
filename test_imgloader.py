"""
Basic tests for ComfyUI Universal Image Loader

These tests can be run independently or as part of a larger test suite.
"""

import unittest
import torch
import numpy as np
import base64
import io
from PIL import Image

# Import the node (adjust path as needed)
try:
    from imgloader_node import ImageLoader
except ImportError:
    # If running from different directory
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))
    from imgloader_node import ImageLoader


class TestImageLoader(unittest.TestCase):
    """Test cases for the ImageLoader node."""
    
    def setUp(self):
        """Set up test fixtures."""
        self.node = ImageLoader()
        
        # Create a simple test image
        self.test_image = Image.new('RGB', (100, 100), color='red')
        
        # Convert to base64
        buffer = io.BytesIO()
        self.test_image.save(buffer, format='PNG')
        self.test_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        self.test_data_url = f"data:image/png;base64,{self.test_base64}"
    
    def test_input_types(self):
        """Test that input types are properly defined."""
        input_types = ImageLoader.INPUT_TYPES()
        
        self.assertIn('optional', input_types)
        self.assertIn('filepath', input_types['optional'])
        self.assertIn('base64', input_types['optional'])
        self.assertIn('pasted_base64', input_types['optional'])
    
    def test_base64_loading(self):
        """Test loading from base64 string."""
        image_tensor, mask_tensor = self.node.load_image(base64=self.test_base64)
        
        # Check tensor properties
        self.assertIsInstance(image_tensor, torch.Tensor)
        self.assertIsInstance(mask_tensor, torch.Tensor)
        self.assertEqual(len(image_tensor.shape), 4)  # NHWC format
        self.assertEqual(len(mask_tensor.shape), 3)   # NHW format
        
        # Check tensor values are in valid range
        self.assertTrue(torch.all(image_tensor >= 0))
        self.assertTrue(torch.all(image_tensor <= 1))
        self.assertTrue(torch.all(mask_tensor >= 0))
        self.assertTrue(torch.all(mask_tensor <= 1))
    
    def test_data_url_loading(self):
        """Test loading from data URL format."""
        image_tensor, mask_tensor = self.node.load_image(base64=self.test_data_url)
        
        # Should successfully load
        self.assertEqual(image_tensor.shape[0], 1)  # Batch size 1
        self.assertEqual(image_tensor.shape[3], 3)  # RGB channels
    
    def test_pasted_base64_precedence(self):
        """Test that pasted base64 takes precedence over other inputs."""
        # Provide all three inputs
        image_tensor, mask_tensor = self.node.load_image(
            filepath="nonexistent.png",
            base64="invalid_base64",
            pasted_base64=self.test_data_url
        )
        
        # Should use pasted_base64 and succeed
        self.assertEqual(image_tensor.shape[0], 1)
        self.assertEqual(image_tensor.shape[3], 3)
    
    def test_empty_inputs(self):
        """Test behavior with empty inputs."""
        image_tensor, mask_tensor = self.node.load_image()
        
        # Should return empty tensors
        self.assertEqual(image_tensor.shape, (1, 1, 1, 3))
        self.assertEqual(mask_tensor.shape, (1, 1, 1))
    
    def test_invalid_base64(self):
        """Test handling of invalid base64."""
        image_tensor, mask_tensor = self.node.load_image(base64="invalid_base64")
        
        # Should fallback to empty tensors
        self.assertEqual(image_tensor.shape, (1, 1, 1, 3))
        self.assertEqual(mask_tensor.shape, (1, 1, 1))
    
    def test_is_changed_method(self):
        """Test the IS_CHANGED method."""
        # Same inputs should return same hash
        hash1 = ImageLoader.IS_CHANGED(filepath="test.png", base64="")
        hash2 = ImageLoader.IS_CHANGED(filepath="test.png", base64="")
        self.assertEqual(hash1, hash2)
        
        # Different inputs should return different hash
        hash3 = ImageLoader.IS_CHANGED(filepath="test2.png", base64="")
        self.assertNotEqual(hash1, hash3)
    
    def test_alpha_channel_handling(self):
        """Test proper alpha channel extraction."""
        # Create RGBA test image
        rgba_image = Image.new('RGBA', (50, 50), color=(255, 0, 0, 128))
        buffer = io.BytesIO()
        rgba_image.save(buffer, format='PNG')
        rgba_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        image_tensor, mask_tensor = self.node.load_image(base64=rgba_base64)
        
        # Check that alpha was extracted
        self.assertEqual(mask_tensor.shape, (1, 50, 50))
        # Alpha should be approximately 0.5 (128/255)
        self.assertTrue(torch.allclose(mask_tensor, torch.tensor(128/255), atol=0.01))


class TestImageLoaderIntegration(unittest.TestCase):
    """Integration tests for the ImageLoader node."""
    
    def test_node_registration(self):
        """Test that node registration exports are correct."""
        from __init__ import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS, WEB_DIRECTORY
        
        self.assertIn("ImageLoader", NODE_CLASS_MAPPINGS)
        self.assertEqual(NODE_CLASS_MAPPINGS["ImageLoader"], ImageLoader)
        self.assertIn("ImageLoader", NODE_DISPLAY_NAME_MAPPINGS)
        self.assertEqual(WEB_DIRECTORY, "./js")


if __name__ == '__main__':
    # Run tests
    unittest.main(verbosity=2)
