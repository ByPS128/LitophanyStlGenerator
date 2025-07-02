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
        int width = image.Width;
        int height = image.Height;
        var heightMap = new double[height, width];

        Console.WriteLine($"Image size: {width}x{height}");

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                byte pixelValue = image[x, y].PackedValue;
                double normalizedValue = 1 - pixelValue / 255.0;
                heightMap[y, x] = minHeightMM + normalizedValue * (maxHeightMM - minHeightMM);
            }
        }

        return heightMap;
    }
}
