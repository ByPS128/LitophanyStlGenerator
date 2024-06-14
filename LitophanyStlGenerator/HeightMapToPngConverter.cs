namespace LitophanyStlGenerator;

public class HeightMapToPngConverter
{
    public void SaveToPng(double[,] heightMap, string filename)
    {
        int width = heightMap.GetLength(1);
        int height = heightMap.GetLength(0);
        using (var image = new Image<L8>(width, height))
        {
            for (var y = 0; y < height; y++)
            {
                for (var x = 0; x < width; x++)
                {
                    var pixelValue = (byte) (255 - heightMap[y, x] * 255);
                    image[x, y] = new L8(pixelValue);
                }
            }

            image.Mutate(x => x.RotateFlip(RotateMode.Rotate180, FlipMode.Horizontal));
            image.Save(filename);
        }
    }
}