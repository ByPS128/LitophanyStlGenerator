namespace LitophanyStlGenerator.HeightMapToMeshConverters;

public class ContinuousSurfaceHeightMapToMeshConverter : IHeightMapToMesh
{
    /// <summary>
    ///     Převádí height mapu na mesh s kontinuální plochou.
    /// </summary>
    /// <param name="heightMap">Height mapa.</param>
    /// <param name="finalWidthMM">Šířka výsledného modelu v mm.</param>
    /// <param name="finalHeightMM">Výška výsledného modelu v mm.</param>
    /// <param name="resolution">Počet bodů na centimetr.</param>
    /// <returns>Generovaný mesh.</returns>
    public Mesh Convert(double[,] heightMap, int finalWidthMM, int finalHeightMM, int resolution)
    {
        int width = heightMap.GetLength(1);
        int height = heightMap.GetLength(0);
        double scaleX = (double)finalWidthMM / width;
        double scaleY = (double)finalHeightMM / height;

        var mesh = new Mesh();

        for (var y = 0; y < height - 1; y++)
        {
            for (var x = 0; x < width - 1; x++)
            {
                // Otočení bodů při vytváření meshe
                var v0 = new Vector3((float)(y * scaleY), (float)(x * scaleX), (float)heightMap[y, x]);
                var v1 = new Vector3((float)(y * scaleY), (float)((x + 1) * scaleX), (float)heightMap[y, x + 1]);
                var v2 = new Vector3((float)((y + 1) * scaleY), (float)((x + 1) * scaleX), (float)heightMap[y + 1, x + 1]);
                var v3 = new Vector3((float)((y + 1) * scaleY), (float)(x * scaleX), (float)heightMap[y + 1, x]);

                AddFace(mesh, v0, v1, v2, v3);
            }
        }

        // Přidání základny a stran modelu
        WriteBase(mesh, width, height, scaleX, scaleY);
        WriteSides(mesh, heightMap, scaleX, scaleY);

        return mesh;
    }

    /// <summary>
    ///     Přidá strany modelu do meshe.
    /// </summary>
    /// <param name="mesh">Mesh.</param>
    /// <param name="heightMap">Height mapa.</param>
    /// <param name="scaleX">Škálování osy X.</param>
    /// <param name="scaleY">Škálování osy Y.</param>
    private void WriteSides(Mesh mesh, double[,] heightMap, double scaleX, double scaleY)
    {
        int width = heightMap.GetLength(1);
        int height = heightMap.GetLength(0);

        // Levá strana
        for (var y = 0; y < height - 1; y++)
        {
            AddSide(mesh,
                y * scaleY, 0, heightMap[y, 0],
                (y + 1) * scaleY, 0, heightMap[y + 1, 0],
                (y + 1) * scaleY, 0, 0,
                y * scaleY, 0, 0);
        }

        // Pravá strana
        for (var y = 0; y < height - 1; y++)
        {
            AddSide(mesh,
                y * scaleY, (width - 1) * scaleX, heightMap[y, width - 1],
                (y + 1) * scaleY, (width - 1) * scaleX, heightMap[y + 1, width - 1],
                (y + 1) * scaleY, (width - 1) * scaleX, 0,
                y * scaleY, (width - 1) * scaleX, 0);
        }

        // Spodní strana
        for (var x = 0; x < width - 1; x++)
        {
            AddSide(mesh,
                0, x * scaleX, heightMap[0, x],
                0, (x + 1) * scaleX, heightMap[0, x + 1],
                0, (x + 1) * scaleX, 0,
                0, x * scaleX, 0);
        }

        // Horní strana
        for (var x = 0; x < width - 1; x++)
        {
            AddSide(mesh,
                (height - 1) * scaleY, x * scaleX, heightMap[height - 1, x],
                (height - 1) * scaleY, (x + 1) * scaleX, heightMap[height - 1, x + 1],
                (height - 1) * scaleY, (x + 1) * scaleX, 0,
                (height - 1) * scaleY, x * scaleX, 0);
        }
    }

    /// <summary>
    ///     Přidá základnu modelu do meshe.
    /// </summary>
    /// <param name="mesh">Mesh.</param>
    /// <param name="width">Šířka height mapy.</param>
    /// <param="height">Výška height mapy.</param>
    /// <param name="scaleX">Škálování osy X.</param>
    /// <param name="scaleY">Škálování osy Y.</param>
    private void WriteBase(Mesh mesh, int width, int height, double scaleX, double scaleY)
    {
        var v0 = new Vector3(0f, 0f, 0f);
        var v1 = new Vector3(0f, (float)((width - 1) * scaleX), 0f);
        var v2 = new Vector3((float)((height - 1) * scaleY), (float)((width - 1) * scaleX), 0f);
        var v3 = new Vector3((float)((height - 1) * scaleY), 0f, 0f);

        AddFace(mesh, v0, v1, v2, v3);
    }

    /// <summary>
    ///     Přidá jednu stranu modelu do meshe.
    /// </summary>
    private void AddSide(Mesh mesh, double x0, double y0, double z0, double x1, double y1, double z1, double x2, double y2, double z2, double x3, double y3, double z3)
    {
        var v0 = new Vector3((float)x0, (float)y0, (float)z0);
        var v1 = new Vector3((float)x1, (float)y1, (float)z1);
        var v2 = new Vector3((float)x2, (float)y2, (float)z2);
        var v3 = new Vector3((float)x3, (float)y3, (float)z3);

        AddFace(mesh, v0, v1, v2, v3);
    }

    /// <summary>
    ///     Přidá čtyři vrcholy jako dvě trojúhelníkové plochy do meshe.
    /// </summary>
    private void AddFace(Mesh mesh, Vector3 v0, Vector3 v1, Vector3 v2, Vector3 v3)
    {
        mesh.AddTriangle(v0, v1, v2);
        mesh.AddTriangle(v0, v2, v3);
    }
}
