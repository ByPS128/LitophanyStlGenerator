using SixLabors.ImageSharp.PixelFormats;

namespace LitophanyStlGenerator;

internal class Program
{
    private static void Main(string[] args)
    {
        try
        {
            // Definování cesty k obrázkům
            var frontImagePath = "./demo-photos/back_image.png";
            var backImagePath = "./demo-photos/back_image.png";
            var outputDirectory = @"c:\temp\";
            var outputMask = "output";

            // Generování očíslovaného názvu souboru
            string outputPath = FileHelper.GetNextFileName(outputDirectory, outputMask);

            // Definování rozměrů a tlouštěk
            var finalWidthMM = 100; // 10 cm
            var finalHeightMM = 150; // 15 cm
            var minHeightMM = 1.0; // Tloušťka pro nejsvětlejší barvu (např. 1 mm)
            var maxHeightMM = 5.0; // Tloušťka pro nejtmavší barvu (např. 5 mm)

            // Načtení a zpracování obrázků
            Image<L8> frontImage = ImageProcessor.LoadAndProcessImage(frontImagePath, new Size(1000, 1500), false);
            Image<L8> backImage = ImageProcessor.LoadAndProcessImage(backImagePath, new Size(1000, 1500), false);

            // Kontrola rozměrů obrázků
            Console.WriteLine($"Front Image Size: {frontImage.Width} x {frontImage.Height}");
            Console.WriteLine($"Back Image Size: {backImage.Width} x {backImage.Height}");

            // Generování height mapy
            double[,] frontHeightMap = HeightMapGenerator.GenerateHeightMap(frontImage, minHeightMM, maxHeightMM);
            double[,] backHeightMap = HeightMapGenerator.GenerateHeightMap(backImage, minHeightMM, maxHeightMM);
            double[,] resultHeightMap = backHeightMap;

            // Export do STL souboru
            STLExporter.SaveAsSTL(resultHeightMap, finalWidthMM, finalHeightMM, outputPath);

            Console.WriteLine("STL soubor byl úspěšně vytvořen: " + outputPath);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Chyba: {ex.Message}");
        }
    }
}