# Lithophane STL Generator

Transform your photos into stunning 3D-printable lithophanes with precision and ease.

---

## Overview

Lithophane STL Generator is a professional-grade .NET console application that converts color or grayscale images into high-quality lithophanes optimized for 3D printing. Whether you're using FDM or resin printers, this tool provides the precision and flexibility needed to create beautiful illuminated art pieces.

### Key Features

- Universal Image Support: JPG, PNG, BMP and other common formats
- Advanced Processing Pipeline: Multi-stage image optimization with selectable algorithms
- 3D Printer Optimization: Dedicated profiles for FDM (nozzle-aware) and resin printing
- Template-Based Configuration: Reusable JSON templates for consistent results
- Professional Output: STL files with embedded metadata + intermediate processing images
- Intelligent Scaling: Automatic resolution calculation based on printer specifications

---

## Quick Start

Basic usage:
LithophaneStlGenerator.exe photo.jpg fdm-0.4mm.json

With custom output directory:
LithophaneStlGenerator.exe portrait.png resin-hd.json c:\output\

Using relative paths:
LithophaneStlGenerator.exe ..\images\landscape.jpg templates\fdm-0.2mm.json

Output files generated:
- photo-0001.stl - 3D model ready for printing
- photo-0001.png - Final height map visualization
- photo-0001-resampled.png - Processed input image
- photo-0001-smoothed.png - Post-processing result

---

## Technical Architecture

### Processing Pipeline

1. Image Loading & Preprocessing
    - Automatic format detection and color space conversion
    - Aspect ratio preservation with intelligent cropping
    - Configurable resampling algorithms (Bicubic, Bilinear, Lanczos3)

2. Height Map Generation
    - Grayscale conversion (0-255 range mapping)
    - Configurable height range mapping (min/max thickness)
    - Precision floating-point calculations

3. Advanced Smoothing (Optional)
    - Gaussian Blur: Sigma-controlled smoothing with threshold
    - Median Filter: Noise reduction with configurable window
    - Bilateral Filter: Edge-preserving smoothing

4. Mesh Generation
    - Continuous Surface: Smooth lithophane surfaces
    - Cubic: Voxel-based approach for artistic effects
    - Simple: Lightweight mesh for prototyping

5. STL Export
    - Binary STL format with embedded metadata
    - Custom 80-byte ASCII headers (author, settings, nozzle info)
    - Optimized triangle generation

### Smart Resolution Calculation

The application automatically calculates optimal image resolution based on your 3D printer:

- FDM Mode: pixel_size = nozzle_diameter × 0.8
- Resin Mode: User-defined resolution in pixels per mm
- Validation: Automatic warnings for suboptimal settings

---

## Template System

Templates are JSON configuration files that define all processing parameters.

FDM Template Example:
```json
{
   "finalWidthMM": 150,
   "finalHeightMM": 100,
   "printMode": "FDM",
   "fdmSettings": {
      "nozzleDiameterMM": 0.4,
      "nozzleToPixelRatio": 0.8
   },
   "smoothingAlgorithm": "BilateralFilter",
   "meshConverterType": "ContinuousSurface"
}
```

Available Templates:
- fdm-0.4mm.json - Standard FDM printing (0.4mm nozzle)
- fdm-0.2mm-high-detail.json - High-detail FDM (0.2mm nozzle)
- fdm-0.6mm-fast.json - Fast printing (0.6mm nozzle, Cubic mesh)
- resin-standard.json - Standard resin printing
- resin-high-detail.json - High-resolution resin printing

---

## Configuration Parameters

### Model Dimensions
- finalWidthMM/finalHeightMM: Physical size of printed model
- minHeightMM: Thickness for white pixels (255) - minimum printable thickness
- maxHeightMM: Thickness for black pixels (0) - opacity for your LED setup

### Critical Settings Explanation

Min Height: Represents the thickness for white areas (pixel value 255). This ensures the model can be removed from the print bed and allows light to pass through effectively.

Max Height: Represents the thickness for black areas (pixel value 0). This should be calibrated based on your LED power and filament opacity to achieve true black appearance.

### Print Mode Optimization

FDM Settings:
- nozzleDiameterMM: Your printer's nozzle diameter
- nozzleToPixelRatio: Pixel-to-nozzle ratio (default 0.8 for optimal quality)

Resin Settings:
- resolution: Pixels per millimeter for high-detail printing

---

## Creating Perfect Lithophanes

### Testing Your Setup

We recommend creating a test print with gradual thickness transitions to calibrate your LED setup:

[DEMO_IMAGE_PLACEHOLDER: demo-grayscale-gradient.png]

This gradient test helps you adjust min/max height values to achieve proper white-to-black transition with your specific:
- LED strip power and color temperature
- Filament material and transparency
- Display box setup

### Display Setup

1. Print Orientation: Thick side towards viewer, thin side towards LEDs
2. LED Placement: Position LED strips behind the thin side
3. Dust Protection: Place thin transparent acrylic sheet in front to prevent dust accumulation on uneven surfaces
4. Housing: Mount in a light box with controlled ambient lighting

### Template Customization

Create custom templates for your specific setup:
```json
{
   "finalWidthMM": 200,
   "finalHeightMM": 150,
   "minHeightMM": 0.8,  // Adjust based on your test prints
   "maxHeightMM": 4.2,  // Calibrate with your LED setup
   "printMode": "FDM",
   "fdmSettings": {
     "nozzleDiameterMM": 0.4
   }
}
```

---

## Advanced Features

### Embedded STL Metadata

The generator embeds processing information in STL headers:
author:ByPS128;github:https://github.com/ByPS128/LitophaneStlGenerator;printMode:FDM;nozzle:0.4

### Automatic File Naming

Sequential numbering prevents overwrites:
- photo-0001.stl, photo-0002.stl, etc.
- Preserves original filename with incremental suffix

### Processing Visualization

Each run generates intermediate images for quality control:
- Resampled: Shows input after scaling and cropping
- Smoothed: Displays result of selected smoothing algorithm
- Final: Height map visualization for verification

---

## Requirements

- .NET 8.0 Runtime
- Windows, macOS, or Linux
- Supported image formats: JPG, PNG, BMP, and others via ImageSharp

---

## Installation & Usage

1. Download the latest release
2. Extract to desired location
3. Add to system PATH for global access
4. Run from any directory:

LithophaneStlGenerator.exe your-photo.jpg template.json [output-directory]

Default templates are created automatically on first run in ./templates/ directory.

---

## Technical Specifications

- Image Processing: SixLabors.ImageSharp library
- Mesh Generation: Custom optimized algorithms
- STL Format: Binary with custom metadata headers
- Precision: Double-precision floating-point calculations
- Memory Efficient: Streaming processing for large images
- Cross-Platform: .NET 8.0 compatible