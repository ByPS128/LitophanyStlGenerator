namespace LithophaneStlGenerator.Attributes;

[AttributeUsage(AttributeTargets.Property, AllowMultiple = false)]
public class AppEditableAttribute : Attribute
{
    public string Description { get; }

    public AppEditableAttribute(string description)
    {
        Description = description ?? throw new ArgumentNullException(nameof(description));
    }
}
