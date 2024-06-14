using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;

namespace LitophanyStlGenerator
{
    public static class ImageProcessor
    {
        /// <summary>
        /// Načte a zpracuje obrázek: změní velikost a ořízne na cílovou velikost.
        /// Pokud je potřeba, otočí obrázek zrcadlově.
        /// </summary>
        /// <param name="imagePath">Cesta k obrázku.</param>
        /// <param name="targetSize">Cílová velikost obrázku.</param>
        /// <param name="mirror">Určuje, zda má být obrázek zrcadlově otočen.</param>
        /// <returns>Zpracovaný obrázek.</returns>
        public static Image<L8> LoadAndProcessImage(string imagePath, Size targetSize, bool mirror)
        {
            try
            {
                var image = Image.Load<L8>(imagePath);
                image.Mutate(x => x.Resize(new ResizeOptions
                {
                    Size = targetSize,
                    Mode = ResizeMode.Crop
                }));
                if (mirror)
                {
                    image.Mutate(x => x.Flip(FlipMode.Horizontal));
                }
                return image;
            }
            catch (Exception ex)
            {
                throw new Exception($"Chyba při načítání a zpracování obrázku: {ex.Message}");
            }
        }
    }
}