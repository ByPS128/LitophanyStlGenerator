using LitophanyStlGenerator.Enums;

namespace LitophanyStlGenerator;

public static class ImageProcessor
{
    public static Image<L8> LoadAndProcessImage(string filePath, Size targetSize, ResampleMethod resampleMethod)
    {
        using (var image = Image.Load<L8>(filePath))
        {
            double targetAspectRatio = (double)targetSize.Width / targetSize.Height;
            double originalAspectRatio = (double)image.Width / image.Height;

            if (Math.Abs(targetAspectRatio - originalAspectRatio) > 0.01)
            {
                Console.WriteLine("Poměry stran nejsou stejné, dochází k ořezu.");

                if (originalAspectRatio > targetAspectRatio)
                {
                    int newWidth = (int)(image.Height * targetAspectRatio);
                    int xOffset = (image.Width - newWidth) / 2;
                    image.Mutate(x => x.Crop(new Rectangle(xOffset, 0, newWidth, image.Height)));
                }
                else
                {
                    int newHeight = (int)(image.Width / targetAspectRatio);
                    int yOffset = (image.Height - newHeight) / 2;
                    image.Mutate(x => x.Crop(new Rectangle(0, yOffset, image.Width, newHeight)));
                }
            }

            var resizedImage = new Image<L8>(targetSize.Width, targetSize.Height);
            for (int y = 0; y < targetSize.Height; y++)
            {
                for (int x = 0; x < targetSize.Width; x++)
                {
                    double srcX = x * (double)image.Width / targetSize.Width;
                    double srcY = y * (double)image.Height / targetSize.Height;
                    resizedImage[x, y] = resampleMethod switch
                    {
                        ResampleMethod.Bicubic => BicubicResample(image, srcX, srcY),
                        ResampleMethod.Bilinear => BilinearResample(image, srcX, srcY),
                        ResampleMethod.Lanczos3 => Lanczos3Resample(image, srcX, srcY),
                        _ => throw new ArgumentOutOfRangeException(nameof(resampleMethod), resampleMethod, null)
                    };
                }
            }

            return resizedImage.Clone();
        }
    }

    private static L8 BicubicResample(Image<L8> image, double x, double y)
    {
        // Bicubic resampling implementation
        int x1 = (int)Math.Floor(x);
        int y1 = (int)Math.Floor(y);

        double dx = x - x1;
        double dy = y - y1;

        double[] weightsX = new double[4];
        double[] weightsY = new double[4];

        for (int i = -1; i <= 2; i++)
        {
            weightsX[i + 1] = CubicWeight(i - dx);
            weightsY[i + 1] = CubicWeight(i - dy);
        }

        double pixelValue = 0;
        for (int j = -1; j <= 2; j++)
        {
            for (int i = -1; i <= 2; i++)
            {
                int srcX = Math.Clamp(x1 + i, 0, image.Width - 1);
                int srcY = Math.Clamp(y1 + j, 0, image.Height - 1);
                pixelValue += weightsX[i + 1] * weightsY[j + 1] * image[srcX, srcY].PackedValue;
            }
        }

        return new L8((byte)Math.Clamp(pixelValue, 0, 255));
    }

    private static L8 BilinearResample(Image<L8> image, double x, double y)
    {
        int x1 = (int)Math.Floor(x);
        int y1 = (int)Math.Floor(y);
        int x2 = Math.Min(x1 + 1, image.Width - 1);
        int y2 = Math.Min(y1 + 1, image.Height - 1);

        double dx = x - x1;
        double dy = y - y1;

        double topLeft = image[x1, y1].PackedValue * (1 - dx) * (1 - dy);
        double topRight = image[x2, y1].PackedValue * dx * (1 - dy);
        double bottomLeft = image[x1, y2].PackedValue * (1 - dx) * dy;
        double bottomRight = image[x2, y2].PackedValue * dx * dy;

        double pixelValue = topLeft + topRight + bottomLeft + bottomRight;
        return new L8((byte)Math.Clamp(pixelValue, 0, 255));
    }

    private static L8 Lanczos3Resample(Image<L8> image, double x, double y)
    {
        // Lanczos3 resampling implementation
        throw new NotImplementedException("Lanczos3 resampling not yet implemented");
    }

    private static double CubicWeight(double x)
    {
        const double a = -0.5;
        if (x < 0) x = -x;
        if (x <= 1) return (a + 2) * Math.Pow(x, 3) - (a + 3) * Math.Pow(x, 2) + 1;
        if (x < 2) return a * Math.Pow(x, 3) - 5 * a * Math.Pow(x, 2) + 8 * a * x - 4 * a;
        return 0;
    }
}
