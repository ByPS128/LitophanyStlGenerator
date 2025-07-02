namespace LithophaneStlGenerator.Settings;

// Height map processing settings
public class GaussianBlurSettings
{
    [Range(0.1, 10.0)]
    public double Sigma { get; set; } = 2.0;

    [Range(0.1, 2.0)]
    public double Threshold { get; set; } = 0.5;

    public void Validate()
    {
        var context = new ValidationContext(this);
        var results = new List<ValidationResult>();
        
        if (!Validator.TryValidateObject(this, context, results, true))
        {
            throw new ValidationException("GaussianBlur: " + string.Join("; ", results.Select(r => r.ErrorMessage)));
        }
    }
}
