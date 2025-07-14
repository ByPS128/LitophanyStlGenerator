using LithophaneStlGenerator.Models;

namespace LithophaneStlGenerator;

public class CommandLineParser
{
    private readonly string[] _args;

    /// <summary>
    /// Inicializuju parser s argumenty.
    /// </summary>
    public CommandLineParser(string[] args)
    {
        _args = args ?? throw new ArgumentNullException(nameof(args));
    }

    /// <summary>
    /// Parsuju command line argumenty - podporuje jak pozičí argumenty tak named options.
    /// </summary>
    public (CommandLineConfig Config, Dictionary<string, string> Overrides) Parse()
    {
        if (_args.Length == 0)
        {
            throw new ArgumentException("No arguments provided. Use --help for usage information.");
        }

        // Pokud první argument začíná '--', používáme named options
        if (_args[0].StartsWith("--"))
        {
            return ParseNamedOptions();
        }
        else
        {
            return ParsePositionalArguments();
        }
    }

    /// <summary>
    /// Parsuje pozičí argumenty (původní styl).
    /// Format: [inputImage] [template] [outputDir] [overrides...]
    /// </summary>
    private (CommandLineConfig Config, Dictionary<string, string> Overrides) ParsePositionalArguments()
    {
        if (_args.Length < 2)
        {
            throw new ArgumentException("At least 2 arguments required: <inputImage> <template> [outputDir] [overrides...]");
        }

        string inputImagePath = _args[0];
        string templatePath = _args[1];
        string outputDirectory = _args.Length > 2 ? _args[2] : @"c:\temp\";

        // Zpracování overrides ze zbývajících argumentů
        var overrides = new Dictionary<string, string>();
        for (int i = 3; i < _args.Length; i++)
        {
            string arg = _args[i];
            var parts = arg.Split('=', 2);
            if (parts.Length == 2)
            {
                overrides[parts[0].Trim()] = parts[1].Trim();
            }
            else
            {
                Console.WriteLine($"Warning: Ignoring invalid override format: {arg}. Use Key=Value");
            }
        }

        var config = CreateAndValidateConfig(inputImagePath, templatePath, outputDirectory);
        return (config, overrides);
    }

    /// <summary>
    /// Parsuje named options (nový styl s --argumenty).
    /// </summary>
    private (CommandLineConfig Config, Dictionary<string, string> Overrides) ParseNamedOptions()
    {
        string? inputImagePath = null;
        string? templatePath = null;
        string outputDirectory = @"c:\temp\";
        var overrides = new Dictionary<string, string>();
        bool showHelp = false;

        for (int i = 0; i < _args.Length; i++)
        {
            string arg = _args[i];

            switch (arg.ToLowerInvariant())
            {
                case "--input":
                case "-i":
                    if (i + 1 >= _args.Length)
                        throw new ArgumentException("--input requires a value");
                    inputImagePath = _args[++i];
                    break;

                case "--template":
                case "-t":
                    if (i + 1 >= _args.Length)
                        throw new ArgumentException("--template requires a value");
                    templatePath = _args[++i];
                    break;

                case "--output":
                case "-o":
                    if (i + 1 >= _args.Length)
                        throw new ArgumentException("--output requires a value");
                    outputDirectory = _args[++i];
                    break;

                case "--override":
                    if (i + 1 >= _args.Length)
                        throw new ArgumentException("--override requires a value");
                    string overrideValue = _args[++i];
                    var parts = overrideValue.Split('=', 2);
                    if (parts.Length != 2)
                        throw new ArgumentException($"Invalid override format: {overrideValue}. Use Key=Value");
                    overrides[parts[0].Trim()] = parts[1].Trim();
                    break;

                case "--help":
                case "-h":
                case "/?":
                    showHelp = true;
                    break;

                default:
                    throw new ArgumentException($"Unknown argument: {arg}");
            }
        }

        if (showHelp)
        {
            throw new ArgumentException("HELP_REQUESTED"); // Speciální exception pro help
        }

        if (string.IsNullOrEmpty(inputImagePath))
            throw new ArgumentException("Input image is required. Use --input <path> or provide as first positional argument");

        if (string.IsNullOrEmpty(templatePath))
            throw new ArgumentException("Template is required. Use --template <path> or provide as second positional argument");

        var config = CreateAndValidateConfig(inputImagePath, templatePath, outputDirectory);
        return (config, overrides);
    }

    /// <summary>
    /// Vytvoří a validuje konfiguraci.
    /// </summary>
    private CommandLineConfig CreateAndValidateConfig(string inputImagePath, string templatePath, string outputDirectory)
    {
        var config = new CommandLineConfig
        {
            InputImagePath = Path.GetFullPath(inputImagePath),
            TemplatePath = Path.GetFullPath(templatePath),
            OutputDirectory = Path.GetFullPath(outputDirectory)
        };

        // Validace souborů
        if (!File.Exists(config.InputImagePath))
            throw new FileNotFoundException($"Input image not found: {config.InputImagePath}");
        if (!File.Exists(config.TemplatePath))
            throw new FileNotFoundException($"Template not found: {config.TemplatePath}");
        
        Directory.CreateDirectory(config.OutputDirectory);

        return config;
    }

    /// <summary>
    /// Vrátí help text.
    /// </summary>
    public static string GetHelpText()
    {
        return @"
=== LITHOPHANE GENERATOR USAGE ===

Positional Arguments (Simple):
  LithophaneStlGenerator.exe <image> <template> [output-directory] [overrides...]
  
Named Arguments (Advanced):
  LithophaneStlGenerator.exe --input <image> --template <template> [options]

Positional Examples:
  LithophaneStlGenerator.exe photo.jpg fdm-0.4mm.json
  LithophaneStlGenerator.exe portrait.png resin-hd.json c:\output\
  LithophaneStlGenerator.exe ..\photos\landscape.jpg templates\fdm-0.2mm.json c:\temp\ MinHeightMM=0.8

Named Options:
  --input, -i <PATH>     Path to input image (jpg, png, etc.) - required
  --template, -t <PATH>  Path to template JSON - required  
  --output, -o <DIR>     Output directory (default: c:\temp\)
  --override <KEY=VALUE> Override template setting (can be used multiple times)
  --help, -h             Show this help

Named Examples:
  LithophaneStlGenerator.exe --input photo.jpg --template fdm-0.4mm.json
  LithophaneStlGenerator.exe -i portrait.png -t resin-hd.json -o c:\output\
  LithophaneStlGenerator.exe --input landscape.jpg --template fdm-0.2mm.json --override MinHeightMM=0.8 --override FinalWidthMM=200

Override Examples:
  MinHeightMM=0.8
  FinalWidthMM=200  
  FdmSettings.NozzleDiameterMM=0.6
  BilateralFilter.SigmaSpatial=1.5
";
    }
}
