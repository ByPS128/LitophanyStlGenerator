using LithophaneStlGenerator.Models.Enums;

namespace LithophaneStlGenerator.Settings;

// Hlavní settings třída - root level vlastnosti
public class LithophaneSettings
{
    // Model dimensions
    [Required]
    [Range(10, 1000)]
    public int FinalWidthMM { get; set; } = 150;

    [Required] 
    [Range(10, 1000)]
    public int FinalHeightMM { get; set; } = 100;

    [Required]
    [Range(0.1, 10.0)]
    public double MinHeightMM { get; set; } = 0.6;

    [Required]
    [Range(0.2, 20.0)]
    public double MaxHeightMM { get; set; } = 3.6;

    // Processing settings
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public PrintMode PrintMode { get; set; } = PrintMode.FDM;

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public ResampleMethod ResampleMethod { get; set; } = ResampleMethod.Bicubic;

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public SmoothingAlgorithm SmoothingAlgorithm { get; set; } = SmoothingAlgorithm.BilateralFilter;

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public MeshConverterType MeshConverterType { get; set; } = MeshConverterType.ContinuousSurface;

    // Print-specific settings
    public FdmSettings? FdmSettings { get; set; }
    public ResinSettings? ResinSettings { get; set; }

    // Height map processing settings
    public GaussianBlurSettings GaussianBlur { get; set; } = new();
    public MedianFilterSettings MedianFilter { get; set; } = new();
    public BilateralFilterSettings BilateralFilter { get; set; } = new();

    // Computed properties
    public int GetCalculatedResolution()
    {
        return PrintMode switch
        {
            PrintMode.FDM => FdmSettings?.GetCalculatedResolution() ?? throw new InvalidOperationException("FDM settings required"),
            PrintMode.Resin => ResinSettings?.Resolution ?? throw new InvalidOperationException("Resin settings required"),
            _ => throw new ArgumentOutOfRangeException()
        };
    }

    public double GetPixelSizeMM()
    {
        return PrintMode switch
        {
            PrintMode.FDM => FdmSettings?.GetPixelSizeMM() ?? throw new InvalidOperationException("FDM settings required"),
            PrintMode.Resin => (double)FinalWidthMM / (FinalWidthMM * ResinSettings!.Resolution),
            _ => throw new ArgumentOutOfRangeException()
        };
    }

    public void Validate()
    {
        // Základní validace
        var context = new ValidationContext(this);
        var results = new List<ValidationResult>();
        
        if (!Validator.TryValidateObject(this, context, results, true))
        {
            throw new ValidationException(string.Join("; ", results.Select(r => r.ErrorMessage)));
        }

        // Validace podle print mode
        switch (PrintMode)
        {
            case PrintMode.FDM:
                if (FdmSettings == null)
                    throw new ValidationException("FDM mode requires FdmSettings section");
                FdmSettings.Validate();
                break;

            case PrintMode.Resin:
                if (ResinSettings == null)
                    throw new ValidationException("Resin mode requires ResinSettings section");
                ResinSettings.Validate();
                break;
        }

        // Validace processing settings
        GaussianBlur.Validate();
        MedianFilter.Validate();
        BilateralFilter.Validate();
    }
}
