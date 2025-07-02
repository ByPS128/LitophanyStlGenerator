namespace LithophaneStlGenerator;

public static class HeightMapProcessors
{
    /// <summary>
    ///     Inverze hodnot height mapy (negativ).
    /// </summary>
    /// <param name="heightMap">Výška mapa.</param>
    /// <param name="minHeight">Minimální výška.</param>
    /// <param name="maxHeight">Maximální výška.</param>
    /// <returns>Inverzní výška mapa.</returns>
    public static double[,] Invert(double[,] heightMap, double minHeight, double maxHeight)
    {
        int width = heightMap.GetLength(1);
        int height = heightMap.GetLength(0);
        var invertedHeightMap = new double[height, width];

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                invertedHeightMap[y, x] = maxHeight - (heightMap[y, x] - minHeight);
            }
        }

        return invertedHeightMap;
    }

    /// <summary>
    ///     Vyhlazení height mapy pomocí Gaussian blur.
    /// </summary>
    /// <param name="heightMap">Výška mapa.</param>
    /// <param name="sigma">Sigma pro Gaussian blur.</param>
    /// <param name="threshold">Prahová hodnota pro vyhlazení kontrastu.</param>
    /// <returns>Vyhlazená výška mapa.</returns>
    public static double[,] GaussianBlurSmooth(double[,] heightMap, double sigma, double threshold)
    {
        int width = heightMap.GetLength(1);
        int height = heightMap.GetLength(0);
        var smoothedHeightMap = (double[,])heightMap.Clone();

        var kernelRadius = (int)Math.Ceiling(2 * sigma);
        double[,] kernel = CreateGaussianKernel(sigma, kernelRadius);

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                double newValue = ApplyKernel(heightMap, kernel, x, y, kernelRadius, width, height);

                if (Math.Abs(newValue - heightMap[y, x]) > threshold)
                {
                    smoothedHeightMap[y, x] = newValue;
                }
            }
        }

        return smoothedHeightMap;
    }

    private static double[,] CreateGaussianKernel(double sigma, int radius)
    {
        int size = 2 * radius + 1;
        var kernel = new double[size, size];
        var sum = 0.0;
        double twoSigmaSquare = 2 * sigma * sigma;

        for (int y = -radius; y <= radius; y++)
        {
            for (int x = -radius; x <= radius; x++)
            {
                double distance = x * x + y * y;
                kernel[y + radius, x + radius] = Math.Exp(-distance / twoSigmaSquare);
                sum += kernel[y + radius, x + radius];
            }
        }

        for (var y = 0; y < size; y++)
        {
            for (var x = 0; x < size; x++)
            {
                kernel[y, x] /= sum;
            }
        }

        return kernel;
    }

    private static double ApplyKernel(double[,] heightMap, double[,] kernel, int x, int y, int radius, int width, int height)
    {
        var sum = 0.0;

        for (int ky = -radius; ky <= radius; ky++)
        {
            for (int kx = -radius; kx <= radius; kx++)
            {
                int px = Math.Clamp(x + kx, 0, width - 1);
                int py = Math.Clamp(y + ky, 0, height - 1);
                sum += heightMap[py, px] * kernel[ky + radius, kx + radius];
            }
        }

        return sum;
    }

    /// <summary>
    ///     Vyhlazení height mapy pomocí Median filter.
    /// </summary>
    /// <param name="heightMap">Výška mapa.</param>
    /// <param name="windowSize">Velikost okna pro median filter.</param>
    /// <returns>Vyhlazená výška mapa.</returns>
    public static double[,] MedianFilterSmooth(double[,] heightMap, int windowSize)
    {
        int width = heightMap.GetLength(1);
        int height = heightMap.GetLength(0);
        var smoothedHeightMap = (double[,])heightMap.Clone();
        int radius = windowSize / 2;

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var window = new double[windowSize * windowSize];
                var index = 0;

                for (int ky = -radius; ky <= radius; ky++)
                {
                    for (int kx = -radius; kx <= radius; kx++)
                    {
                        int px = Math.Clamp(x + kx, 0, width - 1);
                        int py = Math.Clamp(y + ky, 0, height - 1);
                        window[index++] = heightMap[py, px];
                    }
                }

                Array.Sort(window);
                smoothedHeightMap[y, x] = window[window.Length / 2];
            }
        }

        return smoothedHeightMap;
    }

    /// <summary>
    ///     Vyhlazení height mapy pomocí Bilateral filter.
    /// </summary>
    /// <param name="heightMap">Výška mapa.</param>
    /// <param name="sigmaSpatial">Sigma pro prostorovou část Bilateral filter.</param>
    /// <param name="sigmaRange">Sigma pro rozsahovou část Bilateral filter.</param>
    /// <returns>Vyhlazená výška mapa.</returns>
    public static double[,] BilateralFilterSmooth(double[,] heightMap, double sigmaSpatial, double sigmaRange)
    {
        int width = heightMap.GetLength(1);
        int height = heightMap.GetLength(0);
        var smoothedHeightMap = (double[,])heightMap.Clone();
        var radius = (int)Math.Ceiling(2 * sigmaSpatial);
        double twoSigmaSpatialSquare = 2 * sigmaSpatial * sigmaSpatial;
        double twoSigmaRangeSquare = 2 * sigmaRange * sigmaRange;

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                var sum = 0.0;
                var normalization = 0.0;
                double centerValue = heightMap[y, x];

                for (int ky = -radius; ky <= radius; ky++)
                {
                    for (int kx = -radius; kx <= radius; kx++)
                    {
                        int px = Math.Clamp(x + kx, 0, width - 1);
                        int py = Math.Clamp(y + ky, 0, height - 1);
                        double neighborValue = heightMap[py, px];

                        double spatialDistance = kx * kx + ky * ky;
                        double rangeDistance = (centerValue - neighborValue) * (centerValue - neighborValue);

                        double spatialWeight = Math.Exp(-spatialDistance / twoSigmaSpatialSquare);
                        double rangeWeight = Math.Exp(-rangeDistance / twoSigmaRangeSquare);
                        double weight = spatialWeight * rangeWeight;

                        sum += neighborValue * weight;
                        normalization += weight;
                    }
                }

                smoothedHeightMap[y, x] = sum / normalization;
            }
        }

        return smoothedHeightMap;
    }
}
