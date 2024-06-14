using System;

namespace LithophaneGenerator
{
    class Program
    {
        static void Main(string[] args)
        {
            try
            {
                // Definování cesty k obrázkům
                var frontImagePath = "./demo-photos/front_image.png";
                var backImagePath = "./demo-photos/back_image.png";
                var outputDirectory = @"c:\temp\";
                var outputMask = "output";

                // Generování očíslovaného názvu souboru
                var outputPath = FileHelper.GetNextFileName(outputDirectory, outputMask);

                // Definování rozměrů a tlouštěk
                int finalWidthMM = 100; // 10 cm
                int finalHeightMM = 150; // 15 cm
                double minHeightMM = 1.0; // Tloušťka pro nejsvětlejší barvu (např. 1 mm)
                double maxHeightMM = 5.0; // Tloušťka pro nejtmavší barvu (např. 5 mm)
                int resolution = 5; // Hustota bodů na centimetr

                // Načtení a zpracování obrázků
                var frontImage = ImageProcessor.LoadAndProcessImage(frontImagePath, new Size(1000, 1500), false);
                var backImage = ImageProcessor.LoadAndProcessImage(backImagePath, new Size(1000, 1500), false);

                // Kontrola rozměrů obrázků
                Console.WriteLine($"Front Image Size: {frontImage.Width} x {frontImage.Height}");
                Console.WriteLine($"Back Image Size: {backImage.Width} x {backImage.Height}");

                // Generování height mapy
                double[,] frontHeightMap = HeightMapGenerator.GenerateHeightMap(frontImage, minHeightMM, maxHeightMM, resolution);
                double[,] backHeightMap = HeightMapGenerator.GenerateHeightMap(backImage, minHeightMM, maxHeightMM, resolution);
                double[,] resultHeightMap = backHeightMap;

                // Výběr implementace exportéru
                IStlExporter stlExporter;

                if (false && args.Length > 0 && args[0] == "useNuget")
                {
                    //stlExporter = new StlExporter2(); // Použití STLWriter
                }
                else
                {
                   stlExporter = new StlExporter(); // Použití vlastního exportéru
                }

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
}
