namespace LitophanyStlGenerator.Helpers;

public static class FileHelper
{
    /// <summary>
    /// Generuje očíslovaný název souboru na základě existujících souborů.
    /// </summary>
    /// <param name="directory">Adresář, kde budou soubory uloženy.</param>
    /// <param name="mask">Maska názvu souboru (např. "output").</param>
    /// <returns>Nový název souboru s číslováním.</returns>
    public static string GetNextFileName(string directory, string mask)
    {
        int count = 1;
        string fileName;
        string extension = ".stl";

        do
        {
            fileName = $"{mask}-{count:0000}{extension}";
            count++;
        } while (File.Exists(Path.Combine(directory, fileName)));

        return Path.Combine(directory, fileName);
    }
}
