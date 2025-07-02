namespace LithophaneStlGenerator.Settings;

// Height map processing settings
public class BilateralFilterSettings
{
    [Range(0.1, 5.0)]
    public double SigmaSpatial { get; set; } = 1.0;

    [Range(0.1, 5.0)]
    public double SigmaRange { get; set; } = 1.0;

    public void Validate()
    {
        var context = new ValidationContext(this);
        var results = new List<ValidationResult>();
        
        if (!Validator.TryValidateObject(this, context, results, true))
        {
            throw new ValidationException("BilateralFilter: " + string.Join("; ", results.Select(r => r.ErrorMessage)));
        }
    }
}
