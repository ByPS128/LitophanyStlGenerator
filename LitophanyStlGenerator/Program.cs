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
            string baseFileName = FileNameGenerator.GetNextFileName(outputDirectory, outputMask, "stl");
            string stlFileName = baseFileName.Replace(".stl", ".stl");
            string resampledPngFileName = baseFileName.Replace(".stl", "-resampled.png");
            string smoothedPngFileName = baseFileName.Replace(".stl", "-smoothed.png");
            string finalPngFileName = baseFileName.Replace(".stl", ".png");

            // Definování rozměrů a tlouštěk
            var finalWidthMM = 150; // 10 cm
            var finalHeightMM = 100; // 15 cm

            var minHeightMM = 0.6; // Zvětšení minimální výšky (např. 2 mm)
            var maxHeightMM = 3.6; // Snížení maximální výšky (např. 3 mm)

            var resolution = 3; // Hustota bodů na centimetr
            var sigma = 2.0; // Zvýšení sigmy pro Gaussian blur
            var threshold = 0.5; // Prahová hodnota pro vyhlazení kontrastu
            var windowSize = 3; // Velikost okna pro Median filter
            var sigmaSpatial = 1.0; // Sigma pro prostorovou část Bilateral filter
            var sigmaRange = 1.0; // Sigma pro rozsahovou část Bilateral filter

            // Načtení a zpracování obrázků
            int newWidth = finalWidthMM * resolution;
            int newHeight = finalHeightMM * resolution;
            Image<L8> backImage = ImageProcessor.LoadAndProcessImage(backImagePath, new Size(newWidth, newHeight), ResampleMethod.Bicubic);

            // Kontrola rozměrů obrázku
            Console.WriteLine($"Back Image Size: {backImage.Width} x {backImage.Height}");

            // Uložení resamplovaného obrázku
            backImage.Save(resampledPngFileName);

            // Generování height mapy
            double[,] backHeightMap = HeightMapGenerator.GenerateHeightMap(backImage, minHeightMM, maxHeightMM, resolution);

            // Předzpracování height mapy
            double[,] resultHeightMap;

            // Výběr algoritmu pro vyhlazení
            string smoothingAlgorithm = args.Length > 0 ? args[0] : "GaussianBlur";
            smoothingAlgorithm = "BilateralFilter";

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

            // Uložení smoothed height mapy
            var pngConverter = new HeightMapToPngConverter();
            pngConverter.SaveToPng(resultHeightMap, smoothedPngFileName);

            // Výběr typu konverze height mapy na mesh
            string meshConverterType = args.Length > 1 ? args[1] : "ContinuousSurface";

            IHeightMapToMesh heightMapToMeshConverter;
            if (meshConverterType == "ContinuousSurface")
            {
                heightMapToMeshConverter = new ContinuousSurfaceHeightMapToMeshConverter();
            }
            else
            {
                heightMapToMeshConverter = new CubicHeightMapToMeshConverter();
            }

            // Konverze height mapy na mesh
            Mesh mesh = heightMapToMeshConverter.Convert(resultHeightMap, finalWidthMM, finalHeightMM, resolution);

            // Export meše do STL souboru
            var stlWriter = new StlWriter();
            stlWriter.SaveToFile(mesh, stlFileName);

            // Uložení height mapy do PNG souboru
            pngConverter.SaveToPng(resultHeightMap, finalPngFileName);

            Console.WriteLine("STL a PNG soubory byly úspěšně vytvořeny:");
            Console.WriteLine("STL: " + stlFileName);
            Console.WriteLine("PNG (resampled): " + resampledPngFileName);
            Console.WriteLine("PNG (smoothed): " + smoothedPngFileName);
            Console.WriteLine("PNG (final): " + finalPngFileName);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Chyba: {ex.Message}");
        }
    }
}
