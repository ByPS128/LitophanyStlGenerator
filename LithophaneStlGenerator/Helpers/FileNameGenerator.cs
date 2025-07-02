namespace LithophaneStlGenerator.Helpers;

public static class FileNameGenerator
{
    public static string GetNextFileName(string directory, string mask, string extension)
    {
        var index = 1;
        string fileName;

        do
        {
            fileName = Path.Combine(directory, $"{mask}-{index:D4}.{extension}");
            index++;
        } while (File.Exists(fileName));

        return fileName;
    }
}
