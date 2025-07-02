namespace LitophanyStlGenerator;

public interface IStlExporter
{
    void SaveToFile(double[,] heightMap, int finalWidthMM, int finalHeightMM, string filename, int resolution);
}
