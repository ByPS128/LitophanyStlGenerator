namespace LitophanyStlGenerator;

public static class HeightMapGenerator
{
    /// <summary>
    ///     Generuje height mapu z obrázku na základě hodnot pixelů.
    /// </summary>
    /// <param name="image">Zpracovaný obrázek.</param>
    /// <param name="minHeightMM">Minimální výška v mm.</param>
    /// <param name="maxHeightMM">Maximální výška v mm.</param>
    /// <param name="resolution">Počet bodů na centimetr.</param>
    /// <returns>Generovaná height mapa.</returns>
    public static double[,] GenerateHeightMap(Image<L8> image, double minHeightMM, double maxHeightMM, int resolution)
    {
        int originalWidth = image.Width;
        int originalHeight = image.Height;
        int newWidth = Math.Max(1, originalWidth * resolution / 10);
        int newHeight = Math.Max(1, originalHeight * resolution / 10);
        var heightMap = new double[newHeight, newWidth];

        Console.WriteLine($"Original size: {originalWidth}x{originalHeight}, New size: {newWidth}x{newHeight}");

        for (var y = 0; y < newHeight; y++)
        {
            for (var x = 0; x < newWidth; x++)
            {
                int originalX = Math.Min(originalWidth - 1, x * originalWidth / newWidth);
                int originalY = Math.Min(originalHeight - 1, y * originalHeight / newHeight);

                // Kontrolní výpisy pro diagnostiku problému
                if (originalY < 0 || originalY >= originalHeight || originalX < 0 || originalX >= originalWidth)
                {
                    Console.WriteLine($"Index out of range: originalY = {originalY}, originalX = {originalX}");
                    continue;
                }

                byte pixelValue = image[originalX, originalY].PackedValue; // Změněno pořadí parametrů na [x, y]
                double normalizedValue = 1 - (pixelValue / 255.0);
                heightMap[y, x] = minHeightMM + normalizedValue * (maxHeightMM - minHeightMM);
            }
        }

        return heightMap;
    }
}