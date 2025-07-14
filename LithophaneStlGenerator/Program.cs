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
            var parser = new CommandLineParser(args);
            var (config, overrides) = parser.Parse();
        
            ProcessImage(config.InputImagePath, config.TemplatePath, config.OutputDirectory, overrides);
        }
        catch (Exception ex) when (ex.Message == "HELP_REQUESTED")
        {
            Console.WriteLine(CommandLineParser.GetHelpText());
            ShowEditableOptions();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            Console.WriteLine();
            Console.WriteLine("Use --help for usage information.");
            Environment.Exit(1);
        }
    }

    private static void ShowEditableOptions()
    {
        Console.WriteLine();
        Console.WriteLine("Editable options for --override:");
        var overrider = new SettingsOverrider();
        var options = overrider.GetEditableOptions(typeof(LithophaneSettings));
        foreach (var opt in options.OrderBy(o => o))
        {
            Console.WriteLine($"  {opt}");
        }
    }

    private static void ProcessImage(string inputImagePath, string templatePath, string outputDirectory, Dictionary<string, string> overrides)
    {
        // Načti template
        var settings = TemplateManager.LoadTemplate(templatePath);
        
        // Aplikuj overrides
        var overrider = new SettingsOverrider();
        overrider.ApplyOverrides(settings, overrides);
        
        // Validace po overrides
        settings.Validate();
        
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
}
