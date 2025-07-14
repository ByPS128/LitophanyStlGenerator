using System.Reflection;
using LithophaneStlGenerator.Attributes;
using LithophaneStlGenerator.Settings;

namespace LithophaneStlGenerator;

public class SettingsOverrider
{
    /// <summary>
    /// Aplikuju overrides na settings.
    /// </summary>
    public void ApplyOverrides(LithophaneSettings settings, Dictionary<string, string> overrides)
    {
        foreach (var kvp in overrides)
        {
            SetPropertyValue(settings, kvp.Key, kvp.Value);
        }
    }

    /// <summary>
    /// Nastavím hodnotu pro danou cestu v objektu.
    /// </summary>
    private void SetPropertyValue(object target, string path, string valueStr)
    {
        var parts = path.Split('.');
        object current = target;

        for (int i = 0; i < parts.Length; i++)
        {
            var propName = parts[i];
            var prop = current.GetType().GetProperty(propName) ?? throw new ArgumentException($"Path '{path}' does not exist: '{propName}' not found.");

            var editableAttr = prop.GetCustomAttribute<AppEditableAttribute>();
            if (editableAttr == null)
                throw new ArgumentException($"Path '{path}' is not editable: '{propName}' lacks [Editable].");

            if (i < parts.Length - 1)
            {
                current = prop.GetValue(current) ?? throw new InvalidOperationException($"Path '{path}': '{propName}' is null.");
            }
            else
            {
                // Konverze hodnoty
                try
                {
                    var convertedValue = Convert.ChangeType(valueStr, prop.PropertyType);
                    prop.SetValue(current, convertedValue);
                }
                catch (Exception ex)
                {
                    throw new ArgumentException($"Invalid value '{valueStr}' for path '{path}': {ex.Message}");
                }
            }
        }
    }

    /// <summary>
    /// Získám seznam editovatelných opcí rekurzivně.
    /// </summary>
    public List<string> GetEditableOptions(Type type, string prefix = "")
    {
        var options = new List<string>();

        foreach (var prop in type.GetProperties())
        {
            var editableAttr = prop.GetCustomAttribute<AppEditableAttribute>();
            if (editableAttr != null)
            {
                var fullPath = string.IsNullOrEmpty(prefix) ? prop.Name : $"{prefix}.{prop.Name}";
                options.Add($"{fullPath} - {editableAttr.Description}");
            }

            // Rekurze do subobjektů, ale jen pokud není primitive (pro omezení hloubky)
            if (!prop.PropertyType.IsPrimitive && !prop.PropertyType.IsValueType && prop.PropertyType != typeof(string))
            {
                options.AddRange(GetEditableOptions(prop.PropertyType, prop.Name));
            }
        }

        return options;
    }
}
