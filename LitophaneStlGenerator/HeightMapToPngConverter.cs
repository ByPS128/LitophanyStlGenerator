namespace LitophaneStlGenerator;

public class HeightMapToPngConverter
{
    /// <summary>
    ///     Uloží height mapu jako PNG obrázek.
    /// </summary>
    /// <param name="heightMap">Height mapa.</param>
    /// <param name="filename">Výstupní soubor PNG.</param>
    public void SaveToPng(double[,] heightMap, string filename)
    {
        int width = heightMap.GetLength(1);
        int height = heightMap.GetLength(0);

        var minHeight = GetMinHeight(heightMap);
        var maxHeight = GetMaxHeight(heightMap);

        using (var image = new Image<L8>(width, height))
        {
            for (var y = 0; y < height; y++)
            {
                for (var x = 0; x < width; x++)
                {
                    double heightValue = heightMap[y, x];
                    var pixelValue = (byte)(255 * (heightValue - minHeight) / (maxHeight - minHeight));
                    pixelValue = (byte)(255 - pixelValue); // Invertování barev
                    image[ /*width - 1 -*/ x, y] = new L8(pixelValue); // flip
                }
            }

            image.Save(filename);
        }
    }

    private double GetMinHeight(double[,] heightMap)
    {
        var min = double.MaxValue;
        foreach (double value in heightMap)
        {
            if (value < min)
            {
                min = value;
            }
        }

        return min;
    }

    private double GetMaxHeight(double[,] heightMap)
    {
        var max = double.MinValue;
        foreach (double value in heightMap)
        {
            if (value > max)
            {
                max = value;
            }
        }

        return max;
    }
}
