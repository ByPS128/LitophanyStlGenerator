namespace LithophaneStlGenerator.Settings;

// Resin specifické nastavení
public class ResinSettings
{
    [Required]
    [Range(1, 100)]
    public int Resolution { get; set; } = 10;

    public void Validate()
    {
        var context = new ValidationContext(this);
        var results = new List<ValidationResult>();
        
        if (!Validator.TryValidateObject(this, context, results, true))
        {
            throw new ValidationException(string.Join("; ", results.Select(r => r.ErrorMessage)));
        }

        if (Resolution <= 0)
            throw new ValidationException("Resolution must be >= 1");
    }
}
