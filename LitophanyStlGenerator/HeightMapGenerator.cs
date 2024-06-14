using SixLabors.ImageSharp.PixelFormats;

namespace LitophanyStlGenerator
{
    public static class HeightMapGenerator
    {
        /// <summary>
        /// Generuje height mapu z obrázku na základě hodnot pixelů.
        /// </summary>
        /// <param name="image">Zpracovaný obrázek.</param>
        /// <param name="minHeightMM">Minimální výška v mm.</param>
        /// <param name="maxHeightMM">Maximální výška v mm.</param>
        /// <returns>Generovaná height mapa.</returns>
        public static double[,] GenerateHeightMap(Image<L8> image, double minHeightMM, double maxHeightMM)
        {
            int width = image.Width;
            int height = image.Height;
            double[,] heightMap = new double[height, width];

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    byte pixelValue = image[x, y].PackedValue;
                    double normalizedValue = pixelValue / 255.0;
                    heightMap[y, x] = minHeightMM + normalizedValue * (maxHeightMM - minHeightMM);
                }
            }

            Console.WriteLine($"HeightMap Generated: Width = {width}, Height = {height}");
            Console.WriteLine($"Sample Value (0,0): {heightMap[0, 0]}");

            return heightMap;
        }
    }
}