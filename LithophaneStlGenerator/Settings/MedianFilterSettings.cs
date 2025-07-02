namespace LithophaneStlGenerator.Settings;

// Height map processing settings
public class MedianFilterSettings
{
    [Range(3, 15)]
    public int WindowSize { get; set; } = 3;

    public void Validate()
    {
        var context = new ValidationContext(this);
        var results = new List<ValidationResult>();
        
        if (!Validator.TryValidateObject(this, context, results, true))
        {
            throw new ValidationException("MedianFilter: " + string.Join("; ", results.Select(r => r.ErrorMessage)));
        }
    }
}
