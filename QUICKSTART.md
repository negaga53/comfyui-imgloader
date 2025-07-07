# ComfyUI Universal Image Loader - Installation & Quick Start

## 🚀 Quick Start Guide

### Installation Steps

1. **Clone into ComfyUI custom_nodes directory:**
   ```bash
   cd /path/to/ComfyUI/custom_nodes/
   git clone <repository-url> comfyui-imgloader
   ```

2. **Restart ComfyUI:**
   - Stop your ComfyUI server
   - Start it again to load the new custom node

3. **Find the node:**
   - In ComfyUI: `Add Node` → `image` → `loaders` → `Image Loader (Universal)`

### First Usage

1. **Add the node** to your workflow
2. **Choose your input method:**
   - **File**: Click the file selector button
   - **Base64**: Paste base64 data in the text area
   - **Clipboard**: Copy an image anywhere, then paste with `Ctrl+V` on the node
   - **Drag & Drop**: Drag an image file onto the node

### Output
- **IMAGE**: Standard ComfyUI image tensor
- **MASK**: Alpha channel mask (or white if no alpha)

## 🔧 API Usage

```json
{
  "ImageLoader": {
    "inputs": {
      "filepath": "input/my_image.png",
      "base64": "iVBORw0KGgoAAAANSUhEUgA...",
      "pasted_base64": "data:image/png;base64,..."
    }
  }
}
```

**Precedence Order:** Pasted > Filepath > Base64

## 🏗️ Project Structure

```
comfyui-imgloader/
├── imgloader_node.py          # Main Python implementation
├── __init__.py                # Node registration
├── js/imgloader.js            # Frontend JavaScript
├── README.md                  # Full documentation
├── setup.py                   # Python packaging
├── requirements.txt           # Dependencies
├── example_usage.py           # Usage examples
├── test_imgloader.py          # Unit tests
└── .github/
    └── copilot-instructions.md # AI assistance config
```

## ✨ Key Features

- **Multi-input support**: File, Base64, Clipboard, Drag & Drop
- **Smart precedence**: Clear handling when multiple inputs provided
- **Visual feedback**: Preview, drag highlights, paste confirmation
- **Robust error handling**: Graceful fallbacks and informative logging
- **EXIF rotation**: Automatic image orientation correction
- **Alpha channel support**: Proper mask extraction
- **Memory efficient**: Automatic GPU cleanup

## 🔍 Troubleshooting

### Common Issues

1. **Node not appearing**: Restart ComfyUI after installation
2. **Paste not working**: Click on the node first, then paste
3. **File not found**: Check file exists in `ComfyUI/input/` directory
4. **Base64 errors**: Ensure proper format with/without data URL prefix

### Debug Mode
```bash
export COMFYUI_IMGLOADER_DEBUG=1
```

## 🧪 Testing

Run the example script to verify installation:
```bash
cd comfyui-imgloader
python3 example_usage.py
```

Run unit tests:
```bash
python3 -m pytest test_imgloader.py -v
```

## 📝 Development

### File Descriptions

- **`imgloader_node.py`**: Core logic, image processing, tensor conversion
- **`js/imgloader.js`**: UI interactions, paste/drag handlers, visual feedback
- **`__init__.py`**: ComfyUI registration and discovery
- **`example_usage.py`**: Demonstrates programmatic usage
- **`test_imgloader.py`**: Unit tests for validation

### Key Improvements Over Original

1. **Enhanced Error Handling**: Comprehensive try-catch with logging
2. **Better UI Feedback**: Visual indicators, previews, animations
3. **Advanced Features**: EXIF rotation, drag-and-drop, better base64 handling
4. **Memory Management**: Proper GPU cleanup and resource management
5. **Extensibility**: Modular design for easy feature additions
6. **Testing**: Unit tests and example scripts
7. **Documentation**: Comprehensive guides and inline comments

### Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

---

**Happy image loading! 🎨**
