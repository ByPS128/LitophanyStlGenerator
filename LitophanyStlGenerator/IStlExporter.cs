namespace LitophanyStlGenerator
{
    public interface IStlExporter
    {
        void SaveAsSTL(double[,] heightMap, int finalWidthMM, int finalHeightMM, string filename, int resolution);
    }
}