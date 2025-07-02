namespace LithophaneStlGenerator.HeightMapToMeshConverters;

public class HeightMapToMeshConverter : IHeightMapToMesh
{
    public Mesh Convert(double[,] heightMap, int finalWidthMM, int finalHeightMM, int resolution)
    {
        int width = heightMap.GetLength(1);
        int height = heightMap.GetLength(0);
        double scaleX = (double)finalWidthMM / width;
        double scaleY = (double)finalHeightMM / height;

        Mesh mesh = new Mesh();

        for (var y = 0; y < height; y++)
        {
            for (var x = 0; x < width; x++)
            {
                mesh.Vertices.Add(new Vector3((float)(x * scaleX), (float)(y * scaleY), (float)heightMap[y, x]));
            }
        }

        for (var y = 0; y < height - 1; y++)
        {
            for (var x = 0; x < width - 1; x++)
            {
                int v0 = y * width + x;
                int v1 = v0 + 1;
                int v2 = v0 + width;
                int v3 = v2 + 1;

                mesh.Indices.Add(v0);
                mesh.Indices.Add(v1);
                mesh.Indices.Add(v3);

                mesh.Indices.Add(v0);
                mesh.Indices.Add(v3);
                mesh.Indices.Add(v2);
            }
        }

        return mesh;
    }
}
