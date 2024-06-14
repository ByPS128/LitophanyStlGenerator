using SixLabors.ImageSharp.PixelFormats;

namespace LitophanyStlGenerator
{
    public static class HeightMapGenerator
    {
        /// <summary>
        /// Generuje height mapu z obrázku na základě hodnot pixelů.
        /// Přidán parametr resolution pro definici hustoty bodů na centimetr.
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
            int newWidth = originalWidth * resolution / 10; // Převod rozlišení na počet bodů na cm
            int newHeight = originalHeight * resolution / 10;
            double[,] heightMap = new double[newWidth, newHeight];

            for (int y = 0; y < newHeight; y++)
            {
                for (int x = 0; x < newWidth; x++)
                {
                    int originalX = x * originalWidth / newWidth;
                    int originalY = y * originalHeight / newHeight;
                    byte pixelValue = image[originalX, originalY].PackedValue;
                    double normalizedValue = pixelValue / 255.0;
                    //heightMap[x, y] = minHeightMM + normalizedValue * (maxHeightMM - minHeightMM);
                    heightMap[x, y] = minHeightMM + (1 - normalizedValue) * (maxHeightMM - minHeightMM);
                }
            }

            return heightMap;
        }

        /// <summary>
        /// Kombinuje dvě height mapy do jedné.
        /// </summary>
        /// <param name="frontHeightMap">Height mapa přední strany.</param>
        /// <param name="backHeightMap">Height mapa zadní strany.</param>
        /// <returns>Kombinovaná height mapa.</returns>
        public static double[,] CombineHeightMaps(double[,] frontHeightMap, double[,] backHeightMap)
        {
            int width = frontHeightMap.GetLength(1);
            int height = frontHeightMap.GetLength(0);
            double[,] combinedHeightMap = new double[height, width];

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    combinedHeightMap[y, x] = (frontHeightMap[y, x] + backHeightMap[y, x]) / 2.0;
                }
            }

            return combinedHeightMap;
        }
    }
}
