using LithophaneStlGenerator.Models.Enums;
using LithophaneStlGenerator.Settings;

namespace LithophaneStlGenerator;

public static class TemplateManager
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter() }
    };

    public static void SaveTemplate(LithophaneSettings settings, string templatePath)
    {
        settings.Validate();
        
        string json = JsonSerializer.Serialize(settings, JsonOptions);
        File.WriteAllText(templatePath, json);
    }

    public static LithophaneSettings LoadTemplate(string templatePath)
    {
        if (!File.Exists(templatePath))
            throw new FileNotFoundException($"Template not found: {templatePath}");

        string json = File.ReadAllText(templatePath);
        var settings = JsonSerializer.Deserialize<LithophaneSettings>(json, JsonOptions);
        
        if (settings == null)
            throw new InvalidOperationException("Invalid template format");

        settings.Validate();
        return settings;
    }

    public static void CreateDefaultTemplates(string templatesDir)
    {
        Directory.CreateDirectory(templatesDir);

        // FDM 0.4mm template
        var fdm04 = new LithophaneSettings
        {
            PrintMode = PrintMode.FDM,
            FdmSettings = new FdmSettings { NozzleDiameterMM = 0.4 },
            MeshConverterType = MeshConverterType.ContinuousSurface,
            SmoothingAlgorithm = SmoothingAlgorithm.BilateralFilter
        };
        SaveTemplate(fdm04, Path.Combine(templatesDir, "fdm-0.4mm.json"));

        // FDM 0.2mm high detail template
        var fdm02 = new LithophaneSettings
        {
            PrintMode = PrintMode.FDM,
            FinalWidthMM = 100,
            FinalHeightMM = 75,
            FdmSettings = new FdmSettings { NozzleDiameterMM = 0.2 },
            MeshConverterType = MeshConverterType.ContinuousSurface,
            SmoothingAlgorithm = SmoothingAlgorithm.GaussianBlur,
            GaussianBlur = new GaussianBlurSettings { Sigma = 1.5, Threshold = 0.3 }
        };
        SaveTemplate(fdm02, Path.Combine(templatesDir, "fdm-0.2mm-high-detail.json"));

        // FDM 0.6mm fast template
        var fdm06 = new LithophaneSettings
        {
            PrintMode = PrintMode.FDM,
            FinalWidthMM = 200,
            FinalHeightMM = 150,
            FdmSettings = new FdmSettings { NozzleDiameterMM = 0.6 },
            MeshConverterType = MeshConverterType.Cubic,
            SmoothingAlgorithm = SmoothingAlgorithm.MedianFilter,
            MedianFilter = new MedianFilterSettings { WindowSize = 5 }
        };
        SaveTemplate(fdm06, Path.Combine(templatesDir, "fdm-0.6mm-fast.json"));

        // Resin standard template
        var resinStd = new LithophaneSettings
        {
            PrintMode = PrintMode.Resin,
            ResinSettings = new ResinSettings { Resolution = 10 },
            MeshConverterType = MeshConverterType.ContinuousSurface,
            SmoothingAlgorithm = SmoothingAlgorithm.BilateralFilter
        };
        SaveTemplate(resinStd, Path.Combine(templatesDir, "resin-standard.json"));

        // Resin high detail template
        var resinHD = new LithophaneSettings
        {
            PrintMode = PrintMode.Resin,
            FinalWidthMM = 120,
            FinalHeightMM = 90,
            MinHeightMM = 0.3,
            MaxHeightMM = 2.5,
            ResinSettings = new ResinSettings { Resolution = 20 },
            MeshConverterType = MeshConverterType.ContinuousSurface,
            SmoothingAlgorithm = SmoothingAlgorithm.GaussianBlur,
            GaussianBlur = new GaussianBlurSettings { Sigma = 1.0, Threshold = 0.2 }
        };
        SaveTemplate(resinHD, Path.Combine(templatesDir, "resin-high-detail.json"));

        Console.WriteLine($"Created default templates in: {templatesDir}");
    }
}
