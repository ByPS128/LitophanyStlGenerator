using SixLabors.ImageSharp.PixelFormats;

namespace LitophanyStlGenerator;

internal class Program
{
    private static void Main(string[] args)
    {
        try
        {
            // Definování cesty k obrázkům
            var backImagePath = "./demo-photos/back2_image.png";
            var outputDirectory = @"c:\temp\";
            var outputMask = "output";

            // Generování očíslovaného názvu souboru
            string outputPath = FileHelper.GetNextFileName(outputDirectory, outputMask);

            // Definování rozměrů a tlouštěk
            var finalWidthMM = 100; // 10 cm
            var finalHeightMM = 150; // 15 cm
            var minHeightMM = 1.0; // Tloušťka pro nejsvětlejší barvu (např. 1 mm)
            var maxHeightMM = 5.0; // Tloušťka pro nejtmavší barvu (např. 5 mm)
            var resolution = 3; // Hustota bodů na centimetr
            var sigma = 1.0; // Sigma pro Gaussian blur
            var threshold = 0.5; // Prahová hodnota pro vyhlazení kontrastu
            var windowSize = 3; // Velikost okna pro Median filter
            var sigmaSpatial = 1.0; // Sigma pro prostorovou část Bilateral filter
            var sigmaRange = 1.0; // Sigma pro rozsahovou část Bilateral filter

            // Načtení a zpracování obrázků
            Image<L8> backImage = ImageProcessor.LoadAndProcessImage(backImagePath, new Size(1500, 1000), true);

            // Kontrola rozměrů obrázku
            Console.WriteLine($"Back Image Size: {backImage.Width} x {backImage.Height}");

            // Generování height mapy
            double[,] backHeightMap = HeightMapGenerator.GenerateHeightMap(backImage, minHeightMM, maxHeightMM, resolution);

            // Předzpracování height mapy
            double[,] resultHeightMap;

            // Výběr algoritmu pro vyhlazení
            string smoothingAlgorithm = "BilateralFilter";

            switch (smoothingAlgorithm)
            {
                case "GaussianBlur":
                    resultHeightMap = HeightMapProcessor.GaussianBlurSmooth(backHeightMap, sigma, threshold);
                    break;
                case "MedianFilter":
                    resultHeightMap = HeightMapProcessor.MedianFilterSmooth(backHeightMap, windowSize);
                    break;
                case "BilateralFilter":
                    resultHeightMap = HeightMapProcessor.BilateralFilterSmooth(backHeightMap, sigmaSpatial, sigmaRange);
                    break;
                default:
                    resultHeightMap = backHeightMap;
                    break;
            }

            // Výběr implementace exportéru
            IStlExporter stlExporter = new StlExporter6();

            // Export do STL souboru
            stlExporter.SaveAsSTL(resultHeightMap, finalWidthMM, finalHeightMM, outputPath, resolution);

            Console.WriteLine("STL soubor byl úspěšně vytvořen: " + outputPath);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Chyba: {ex.Message}");
        }
    }
}