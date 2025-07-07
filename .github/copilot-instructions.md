# Copilot Instructions for ComfyUI Image Loader

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project Context
This is a ComfyUI custom node project written in Python with JavaScript frontend components.

## Key Guidelines
- Follow ComfyUI custom node conventions and patterns
- Use proper tensor handling for IMAGE and MASK outputs
- Implement robust error handling for image loading operations
- Follow Python PEP 8 style guidelines
- Use modern JavaScript ES6+ features for frontend code
- Maintain compatibility with ComfyUI's widget system
- Handle base64, file path, and clipboard paste image sources
- Implement proper precedence logic for multiple input sources
- Use ComfyUI's folder_paths utilities for file operations
- Convert images to the expected tensor format (NHWC, float32, 0-1 range)
