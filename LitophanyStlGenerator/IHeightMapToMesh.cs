namespace LitophanyStlGenerator;

public interface IHeightMapToMesh
{
    Mesh Convert(double[,] heightMap, int finalWidthMM, int finalHeightMM, int resolution);
}
