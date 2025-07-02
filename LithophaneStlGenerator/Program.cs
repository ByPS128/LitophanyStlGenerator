using LithophaneStlGenerator.Models;
using LithophaneStlGenerator.Models.Enums;
using LithophaneStlGenerator.Settings;

namespace LithophaneStlGenerator;

internal class Program
{
    private static void Main(string[] args)
    {
        try
        {
            var config = ParseCommandLineArguments(args);
            ProcessImage(config.InputImagePath, config.TemplatePath, config.OutputDirectory);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            ShowUsage();
        }
    }

    private static CommandLineConfig ParseCommandLineArguments(string[] args)
    {
        if (args.Length < 2)
        {
            throw new ArgumentException("Insufficient arguments");
        }

        string inputImagePath = args[0];
        string templatePath = args[1];
        string outputDirectory = args.Length > 2 ? args[2] : @"c:\temp\";

        // Validace vstupního souboru
        if (!File.Exists(inputImagePath))
        {
            throw new FileNotFoundException($"Input image not found: {inputImagePath}");
        }

        // Validace template
        if (!File.Exists(templatePath))
        {
            throw new FileNotFoundException($"Template not found: {templatePath}");
        }

        // Vytvoř output adresář pokud neexistuje
        Directory.CreateDirectory(outputDirectory);

        return new CommandLineConfig
        {
            InputImagePath = Path.GetFullPath(inputImagePath),
            TemplatePath = Path.GetFullPath(templatePath),
            OutputDirectory = Path.GetFullPath(outputDirectory)
        };
    }

    private static void ProcessImage(string inputImagePath, string templatePath, string outputDirectory)
    {
        // Načti template
        var settings = TemplateManager.LoadTemplate(templatePath);
        
        // Vypiš shrnutí konfigurace
        PrintConfigurationSummary(settings, inputImagePath, outputDirectory);

        // Generuj názvy výstupních souborů
        var outputFiles = GenerateOutputFilenames(inputImagePath, outputDirectory);

        // Zpracování obrázku podle settings
        var resolution = settings.GetCalculatedResolution();
        int newWidth = settings.FinalWidthMM * resolution;
        int newHeight = settings.FinalHeightMM * resolution;

        Console.WriteLine($"Processing image with resolution: {resolution} points/cm");
        Console.WriteLine($"Target image size: {newWidth} x {newHeight} pixels");

        // Načtení a zpracování obrázku
        Image<L8> processedImage = ImageProcessor.LoadAndProcessImage(
            inputImagePath, 
            new Size(newWidth, newHeight), 
            settings.ResampleMethod);

        Console.WriteLine($"Processed image size: {processedImage.Width} x {processedImage.Height}");

        // Uložení resamplovaného obrázku
        processedImage.Save(outputFiles.ResampledPngFileName);

        // Generování height mapy
        double[,] heightMap = HeightMapGenerator.GenerateHeightMap(
            processedImage, 
            settings.MinHeightMM, 
            settings.MaxHeightMM, 
            resolution);

        // Aplikace vybraného smoothing algoritmu
        double[,] smoothedHeightMap = ApplySmoothingAlgorithm(heightMap, settings);

        // Uložení smoothed height mapy
        var pngConverter = new HeightMapToPngConverter();
        pngConverter.SaveToPng(smoothedHeightMap, outputFiles.SmoothedPngFileName);

        // Výběr a aplikace mesh converteru
        IHeightMapToMesh meshConverter = CreateMeshConverter(settings.MeshConverterType);

        // Konverze height mapy na mesh
        Mesh mesh = meshConverter.Convert(
            smoothedHeightMap, 
            settings.FinalWidthMM, 
            settings.FinalHeightMM, 
            resolution);

        // Export do STL
        var stlWriter = new StlWriter();
        stlWriter.AddOrReplaceHeader("author", "ByPS128");
        stlWriter.AddOrReplaceHeader("github", "https://github.com/ByPS128/LitophanyStlGenerator");
        stlWriter.SaveToFile(mesh, outputFiles.StlFileName);

        // Uložení finální height mapy
        pngConverter.SaveToPng(smoothedHeightMap, outputFiles.FinalPngFileName);

        // Výpis výsledků
        PrintResults(outputFiles);
    }

    private static OutputFilenames GenerateOutputFilenames(string inputImagePath, string outputDirectory)
    {
        string inputFileName = Path.GetFileNameWithoutExtension(inputImagePath);
        
        // Použij FileNameGenerator pro číslování
        string baseFileName = FileNameGenerator.GetNextFileName(outputDirectory, inputFileName, "stl");
        string baseName = Path.GetFileNameWithoutExtension(baseFileName);

        return new OutputFilenames
        {
            StlFileName = baseFileName,
            ResampledPngFileName = Path.Combine(outputDirectory, $"{baseName}-resampled.png"),
            SmoothedPngFileName = Path.Combine(outputDirectory, $"{baseName}-smoothed.png"),
            FinalPngFileName = Path.Combine(outputDirectory, $"{baseName}.png")
        };
    }

    private static double[,] ApplySmoothingAlgorithm(double[,] heightMap, LithophaneSettings settings)
    {
        return settings.SmoothingAlgorithm switch
        {
            SmoothingAlgorithm.GaussianBlur => HeightMapProcessors.GaussianBlurSmooth(
                heightMap, 
                settings.GaussianBlur.Sigma, 
                settings.GaussianBlur.Threshold),
            
            SmoothingAlgorithm.MedianFilter => HeightMapProcessors.MedianFilterSmooth(
                heightMap, 
                settings.MedianFilter.WindowSize),
            
            SmoothingAlgorithm.BilateralFilter => HeightMapProcessors.BilateralFilterSmooth(
                heightMap, 
                settings.BilateralFilter.SigmaSpatial, 
                settings.BilateralFilter.SigmaRange),
            
            SmoothingAlgorithm.None => heightMap,
            
            _ => throw new ArgumentOutOfRangeException($"Unknown smoothing algorithm: {settings.SmoothingAlgorithm}")
        };
    }

    private static IHeightMapToMesh CreateMeshConverter(MeshConverterType converterType)
    {
        return converterType switch
        {
            MeshConverterType.ContinuousSurface => new ContinuousSurfaceHeightMapToMeshConverter(),
            MeshConverterType.Cubic => new CubicHeightMapToMeshConverter(),
            MeshConverterType.Simple => new HeightMapToMeshConverter(),
            _ => throw new ArgumentOutOfRangeException($"Unknown mesh converter type: {converterType}")
        };
    }

    private static void PrintConfigurationSummary(LithophaneSettings settings, string inputPath, string outputDir)
    {
        Console.WriteLine("=== LITHOPHANE GENERATION ===");
        Console.WriteLine($"Input image: {Path.GetFileName(inputPath)}");
        Console.WriteLine($"Output directory: {outputDir}");
        Console.WriteLine();
        
        Console.WriteLine($"=== {settings.PrintMode.ToString().ToUpper()} PRINT CONFIGURATION ===");
        Console.WriteLine($"Model dimensions: {settings.FinalWidthMM} × {settings.FinalHeightMM} mm");
        Console.WriteLine($"Height range: {settings.MinHeightMM} - {settings.MaxHeightMM} mm");
        Console.WriteLine($"Resolution: {settings.GetCalculatedResolution()} points/cm");
        Console.WriteLine($"Pixel size: {settings.GetPixelSizeMM():F3} mm");
        
        if (settings.PrintMode == PrintMode.FDM)
        {
            Console.WriteLine($"Nozzle diameter: {settings.FdmSettings!.NozzleDiameterMM} mm");
            Console.WriteLine($"Nozzle-to-pixel ratio: {settings.FdmSettings.NozzleToPixelRatio:F1}");
        }
        
        Console.WriteLine($"Resampling: {settings.ResampleMethod}");
        Console.WriteLine($"Smoothing: {settings.SmoothingAlgorithm}");
        Console.WriteLine($"Mesh type: {settings.MeshConverterType}");
        Console.WriteLine();
    }

    private static void PrintResults(OutputFilenames files)
    {
        Console.WriteLine("=== GENERATION COMPLETED ===");
        Console.WriteLine("Generated files:");
        Console.WriteLine($"  STL: {Path.GetFileName(files.StlFileName)}");
        Console.WriteLine($"  PNG (final): {Path.GetFileName(files.FinalPngFileName)}");
        Console.WriteLine($"  PNG (resampled): {Path.GetFileName(files.ResampledPngFileName)}");
        Console.WriteLine($"  PNG (smoothed): {Path.GetFileName(files.SmoothedPngFileName)}");
        Console.WriteLine();
        Console.WriteLine($"Output directory: {Path.GetDirectoryName(files.StlFileName)}");
    }

    private static void ShowUsage()
    {
        Console.WriteLine();
        Console.WriteLine("=== LITHOPHANE GENERATOR USAGE ===");
        Console.WriteLine("LitophanyStlGenerator.exe <input-image> <template.json> [output-directory]");
        Console.WriteLine();
        Console.WriteLine("Arguments:");
        Console.WriteLine("  input-image      Path to input image (jpg, png, etc.)");
        Console.WriteLine("  template.json    Configuration template file");
        Console.WriteLine("  output-directory Optional output directory (default: c:\\temp\\)");
        Console.WriteLine();
        Console.WriteLine("Examples:");
        Console.WriteLine("  LitophanyStlGenerator.exe photo.jpg fdm-0.4mm.json");
        Console.WriteLine("  LitophanyStlGenerator.exe ..\\photos\\portrait.png resin-hd.json c:\\output\\");
        Console.WriteLine("  LitophanyStlGenerator.exe c:\\images\\landscape.jpg fdm-0.2mm.json");
        Console.WriteLine();
        Console.WriteLine("Available templates will be created on first run in ./templates/ directory");
    }
}
