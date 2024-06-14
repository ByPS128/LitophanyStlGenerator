using System;
using System.Numerics;

namespace LitophanyStlGenerator
{
    public class CubicHeightMapToMeshConverter : IHeightMapToMesh
    {
        /// <summary>
        /// Převádí height mapu na mesh s kvádry.
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

            Mesh mesh = new Mesh();

            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    double zHeight = heightMap[y, x];
                    Vector3 v0 = new Vector3((float)(y * scaleY), (float)(x * scaleX), 0f);
                    Vector3 v1 = new Vector3((float)(y * scaleY), (float)((x + 1) * scaleX), 0f);
                    Vector3 v2 = new Vector3((float)((y + 1) * scaleY), (float)((x + 1) * scaleX), 0f);
                    Vector3 v3 = new Vector3((float)((y + 1) * scaleY), (float)(x * scaleX), 0f);

                    Vector3 v4 = v0 + new Vector3(0, 0, (float)zHeight);
                    Vector3 v5 = v1 + new Vector3(0, 0, (float)zHeight);
                    Vector3 v6 = v2 + new Vector3(0, 0, (float)zHeight);
                    Vector3 v7 = v3 + new Vector3(0, 0, (float)zHeight);

                    AddCube(mesh, v0, v1, v2, v3, v4, v5, v6, v7);
                }
            }

            return mesh;
        }

        /// <summary>
        /// Přidá kvádr do meshe.
        /// </summary>
        private void AddCube(Mesh mesh, Vector3 v0, Vector3 v1, Vector3 v2, Vector3 v3, Vector3 v4, Vector3 v5, Vector3 v6, Vector3 v7)
        {
            // Bottom face
            AddFace(mesh, v0, v1, v2, v3);

            // Top face
            AddFace(mesh, v4, v5, v6, v7);

            // Front face
            AddFace(mesh, v0, v1, v5, v4);

            // Back face
            AddFace(mesh, v3, v2, v6, v7);

            // Left face
            AddFace(mesh, v0, v3, v7, v4);

            // Right face
            AddFace(mesh, v1, v2, v6, v5);
        }

        /// <summary>
        /// Přidá čtyři vrcholy jako dvě trojúhelníkové plochy do meshe.
        /// </summary>
        private void AddFace(Mesh mesh, Vector3 v0, Vector3 v1, Vector3 v2, Vector3 v3)
        {
            mesh.AddTriangle(v0, v1, v2);
            mesh.AddTriangle(v0, v2, v3);
        }
    }
}
