"""
Setup configuration for ComfyUI Universal Image Loader
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

with open("requirements.txt", "r", encoding="utf-8") as fh:
    requirements = [line.strip() for line in fh if line.strip() and not line.startswith("#")]

setup(
    name="comfyui-imgloader",
    version="1.0.0",
    author="ComfyUI Community",
    author_email="",
    description="A universal image loader custom node for ComfyUI",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/your-username/comfyui-imgloader",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Multimedia :: Graphics",
        "Topic :: Scientific/Engineering :: Artificial Intelligence",
    ],
    python_requires=">=3.8",
    install_requires=requirements,
    include_package_data=True,
    package_data={
        "": ["js/*.js", "*.md", "*.txt"],
    },
    keywords="comfyui, image-processing, stable-diffusion, ai, machine-learning",
    project_urls={
        "Bug Reports": "https://github.com/your-username/comfyui-imgloader/issues",
        "Source": "https://github.com/your-username/comfyui-imgloader",
        "Documentation": "https://github.com/your-username/comfyui-imgloader#readme",
    },
)
