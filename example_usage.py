"""
Example usage script for ComfyUI Universal Image Loader

This script demonstrates how to use the ImageLoader node programmatically.
"""

import base64
import io
from PIL import Image
import torch

# Import the node
from imgloader_node import ImageLoader


def create_test_image():
    """Create a simple test image for demonstration."""
    # Create a simple gradient image
    img = Image.new('RGB', (200, 200))
    pixels = img.load()
    
    for i in range(200):
        for j in range(200):
            pixels[j, i] = (i, j, (i + j) % 255)
    
    return img


def image_to_base64(img):
    """Convert PIL image to base64 string."""
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')


def main():
    """Demonstrate the ImageLoader node functionality."""
    print("ComfyUI Universal Image Loader - Example Usage")
    print("=" * 50)
    
    # Create an instance of the node
    loader = ImageLoader()
    
    # Create a test image
    test_img = create_test_image()
    test_base64 = image_to_base64(test_img)
    test_data_url = f"data:image/png;base64,{test_base64}"
    
    print("1. Testing Base64 Input")
    print("-" * 20)
    
    # Test with base64 string
    image_tensor, mask_tensor = loader.load_image(base64=test_base64)
    print(f"Image tensor shape: {image_tensor.shape}")
    print(f"Mask tensor shape: {mask_tensor.shape}")
    print(f"Image value range: {image_tensor.min():.3f} - {image_tensor.max():.3f}")
    print()
    
    print("2. Testing Data URL Input")
    print("-" * 20)
    
    # Test with data URL
    image_tensor, mask_tensor = loader.load_image(base64=test_data_url)
    print(f"Image tensor shape: {image_tensor.shape}")
    print(f"Mask tensor shape: {mask_tensor.shape}")
    print()
    
    print("3. Testing Input Precedence")
    print("-" * 20)
    
    # Test precedence: filepath should take priority over base64
    image_tensor, mask_tensor = loader.load_image(
        filepath="nonexistent.png",
        base64=test_data_url
    )
    print(f"With multiple inputs, filepath was attempted first (even if it fails):")
    print(f"Image tensor shape: {image_tensor.shape}")
    print(f"Is fallback: {image_tensor.shape == (1, 1, 1, 3)}")
    
    # Test with valid base64 only
    image_tensor, mask_tensor = loader.load_image(base64=test_data_url)
    print(f"With base64 only:")
    print(f"Image tensor shape: {image_tensor.shape}")
    print(f"Success: {image_tensor.shape != (1, 1, 1, 3)}")
    print()
    
    print("4. Testing Empty Input Handling")
    print("-" * 20)
    
    # Test with no inputs
    image_tensor, mask_tensor = loader.load_image()
    print(f"Empty input result:")
    print(f"Image tensor shape: {image_tensor.shape}")
    print(f"Mask tensor shape: {mask_tensor.shape}")
    print(f"Is fallback: {image_tensor.shape == (1, 1, 1, 3)}")
    print()
    
    print("5. Testing Alpha Channel Handling")
    print("-" * 20)
    
    # Create RGBA image with alpha channel
    rgba_img = Image.new('RGBA', (100, 100), (255, 0, 0, 128))
    rgba_base64 = image_to_base64(rgba_img)
    
    image_tensor, mask_tensor = loader.load_image(base64=rgba_base64)
    print(f"RGBA image processing:")
    print(f"Image tensor shape: {image_tensor.shape}")
    print(f"Mask tensor shape: {mask_tensor.shape}")
    print(f"Alpha values (should be ~0.5): {mask_tensor.mean():.3f}")
    print()
    
    print("6. Node Configuration Info")
    print("-" * 20)
    
    # Display node configuration
    input_types = ImageLoader.INPUT_TYPES()
    print(f"Node category: {ImageLoader.CATEGORY}")
    print(f"Return types: {ImageLoader.RETURN_TYPES}")
    print(f"Return names: {ImageLoader.RETURN_NAMES}")
    print(f"Function name: {ImageLoader.FUNCTION}")
    print(f"Optional inputs: {list(input_types['optional'].keys())}")
    print()
    
    print("Example completed successfully!")
    print("The ImageLoader node is ready for use in ComfyUI workflows.")


if __name__ == "__main__":
    main()
