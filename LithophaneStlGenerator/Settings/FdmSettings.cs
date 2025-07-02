namespace LithophaneStlGenerator.Settings;

// FDM specifické nastavení
public class FdmSettings
{
    [Required]
    [Range(0.1, 2.0)]
    public double NozzleDiameterMM { get; set; } = 0.4;

    [Range(0.5, 1.0)]
    public double NozzleToPixelRatio { get; set; } = 0.8; // 80% trysky = pixel

    public int GetCalculatedResolution()
    {
        double targetPixelSizeMM = NozzleDiameterMM * NozzleToPixelRatio;
        int resolution = (int)Math.Round(1.0 / targetPixelSizeMM);
        return Math.Clamp(resolution, 1, 50);
    }

    public double GetPixelSizeMM()
    {
        return NozzleDiameterMM * NozzleToPixelRatio;
    }

    public void Validate()
    {
        var context = new ValidationContext(this);
        var results = new List<ValidationResult>();
        
        if (!Validator.TryValidateObject(this, context, results, true))
        {
            throw new ValidationException(string.Join("; ", results.Select(r => r.ErrorMessage)));
        }

        if (NozzleDiameterMM <= 0)
            throw new ValidationException("Nozzle diameter must be > 0");
    }
}
