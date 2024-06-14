using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace LitophanyStlGenerator;

public static class HeightMapGenerator
{
    /// <summary>
    ///     Generuje height mapu z obrázku na základě hodnot pixelů.
    /// </summary>
    /// <param name="image">Zpracovaný obrázek.</param>
    /// <param name="minHeightMM">Minimální výška v mm.</param>
    /// <param name="maxHeightMM">Maximální výška v mm.</param>
    /// <returns>Generovaná height mapa.</returns>
    public static double[,] GenerateHeightMap(Image<L8> image, double minHeightMM, double maxHeightMM)
    {
        int width = image.Width;
        int height = image.Height;
        var heightMap = new double[height, width];

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                byte pixelValue = image[x, y].PackedValue;
                double normalizedValue = pixelValue / 255.0;
                heightMap[y, x] = minHeightMM + normalizedValue * (maxHeightMM - minHeightMM);
            }
        }

        return heightMap;
    }

    /// <summary>
    ///     Vypočítá výslednou height mapu odečtením přední height mapy od zadní.
    /// </summary>
    /// <param name="frontHeightMap">Height mapa přední strany.</param>
    /// <param name="backHeightMap">Height mapa zadní strany.</param>
    /// <returns>Výsledná height mapa.</returns>
    public static double[,] CalculateResultHeightMap(double[,] frontHeightMap, double[,] backHeightMap)
    {
        int width = frontHeightMap.GetLength(1);
        int height = frontHeightMap.GetLength(0);
        var resultHeightMap = new double[height, width];

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                double heightValue = backHeightMap[y, x] - frontHeightMap[y, x];
                resultHeightMap[y, x] = Math.Max(heightValue, 0);
            }
        }

        return resultHeightMap;
    }
}