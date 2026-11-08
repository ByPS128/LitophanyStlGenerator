using System.Numerics;
using System.Text.Json;
using LithophaneStlGenerator;
using LithophaneStlGenerator.HeightMapToMeshConverters;
using LithophaneStlGenerator.Models.Enums;
using SixLabors.ImageSharp;

// File-based adapter: the original executable and its algorithms remain unchanged.
try
{
    if (args.Length != 2) throw new ArgumentException("Usage: FlatLithophaneBridge input.json output-directory");
    var request = JsonSerializer.Deserialize<FlatRequest>(File.ReadAllText(args[0]), new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true
    }) ?? throw new ArgumentException("Missing request.");
    Directory.CreateDirectory(args[1]);
    FlatGenerator.Generate(request, args[1]);
}
catch (Exception error)
{
    Console.Error.WriteLine(error.Message);
    Environment.ExitCode = 1;
}

public sealed class FlatRequest
{
    public string Image { get; set; } = "";
    public int Width { get; set; }
    public int Height { get; set; }
    public double Minimum { get; set; }
    public double Maximum { get; set; }
    public double Border { get; set; }
    public double[] X { get; set; } = [];
    public double[] Y { get; set; } = [];
    public string Smoothing { get; set; } = "BilateralFilter";
    public string Resample { get; set; } = "Bicubic";
    public double Sigma { get; set; } = 2;
    public double Threshold { get; set; } = .5;
    public int Window { get; set; } = 3;
    public double Spatial { get; set; } = 1;
    public double Range { get; set; } = 1;
}

public static class FlatGenerator
{
    public static void Generate(FlatRequest r, string directory)
    {
        if (r.Width < 10 || r.Height < 10 || r.Width > 1000 || r.Height > 1000 ||
            !double.IsFinite(r.Minimum) || !double.IsFinite(r.Maximum) || r.Minimum < .1 ||
            r.Maximum > 20 || r.Minimum >= r.Maximum || !double.IsFinite(r.Border) ||
            r.Border < 0 || 2*r.Border >= Math.Min(r.Width, r.Height))
            throw new ArgumentException("Invalid plate dimensions or thickness.");
        ValidateGrid(r.X, r.Width); ValidateGrid(r.Y, r.Height);
        if ((long)r.X.Length*r.Y.Length > 600_000) throw new ArgumentException("Too many samples (maximum 600000).");
        if (r.Resample is not ("Bicubic" or "Bilinear")) throw new ArgumentException("Unsupported resampling.");
        if (!double.IsFinite(r.Sigma) || r.Sigma < .1 || r.Sigma > 10 ||
            !double.IsFinite(r.Threshold) || r.Threshold < .1 || r.Threshold > 2 ||
            r.Window < 3 || r.Window > 15 || r.Window % 2 == 0 ||
            !double.IsFinite(r.Spatial) || r.Spatial < .1 || r.Spatial > 5 ||
            !double.IsFinite(r.Range) || r.Range < .1 || r.Range > 5)
            throw new ArgumentException("Invalid smoothing parameters.");
        using var image = ImageProcessor.LoadAndProcessImage(r.Image, new Size(r.X.Length, r.Y.Length), Enum.Parse<ResampleMethod>(r.Resample));
        var heights = HeightMapGenerator.GenerateHeightMap(image, r.Minimum, r.Maximum, 1);
        heights = r.Smoothing switch
        {
            "None" => heights,
            "GaussianBlur" => HeightMapProcessors.GaussianBlurSmooth(heights, r.Sigma, r.Threshold),
            "MedianFilter" => HeightMapProcessors.MedianFilterSmooth(heights, r.Window),
            "BilateralFilter" => HeightMapProcessors.BilateralFilterSmooth(heights, r.Spatial, r.Range),
            _ => throw new ArgumentException("Unsupported smoothing.")
        };
        for (int y=0; y<r.Y.Length; y++)
        for (int x=0; x<r.X.Length; x++)
        {
            // The exact border nodes are part of the grid. Smoothing cannot invade the frame.
            bool border = r.Border > 0 && (r.X[x] <= r.Border || r.X[x] >= r.Width-r.Border ||
                                           r.Y[y] <= r.Border || r.Y[y] >= r.Height-r.Border);
            heights[y,x] = border ? r.Maximum : Math.Clamp(heights[y,x], r.Minimum, r.Maximum);
            if (!double.IsFinite(heights[y,x])) throw new ArgumentException("Non-finite height.");
        }
        var mesh = ClosedSurface(heights, r);
        var writer = new StlWriter();
        writer.AddOrReplaceHeader("author", "ByPS128");
        writer.AddOrReplaceHeader("generator", "Luna-flat-original-dotnet");
        writer.SaveToFile(mesh, Path.Combine(directory, "result.stl"));
        using var output = new BinaryWriter(File.Create(Path.Combine(directory,"heights.bin")));
        output.Write(r.X.Length); output.Write(r.Y.Length);
        foreach (double coordinate in r.X) output.Write((float)coordinate);
        foreach (double coordinate in r.Y) output.Write((float)coordinate);
        for (int y=0; y<r.Y.Length; y++)
        for (int x=0; x<r.X.Length; x++) output.Write((float)heights[y,x]);
    }

    private static void ValidateGrid(double[] grid, double extent)
    {
        if (grid.Length < 2 || grid[0] != 0 || grid[^1] != extent ||
            grid.Any(v => !double.IsFinite(v)) || grid.Zip(grid.Skip(1)).Any(pair => pair.First >= pair.Second))
            throw new ArgumentException("Invalid sampling grid.");
    }

    private static Mesh ClosedSurface(double[,] heights, FlatRequest r)
    {
        int width=r.X.Length, height=r.Y.Length;
        // Retain the original triangulated relief. Adapt its swapped axes and one-sample-short extent.
        var original = new ContinuousSurfaceHeightMapToMeshConverter().Convert(heights, r.Width, r.Height, 1);
        var mesh = new Mesh();
        Vector3 Convert(Vector3 v)
        {
            int x=(int)Math.Round(v.Y*width/r.Width), y=(int)Math.Round(v.X*height/r.Height);
            return new Vector3((float)r.X[x], (float)(r.Height-r.Y[y]), v.Z);
        }
        int topIndices=(width-1)*(height-1)*6;
        for (int i=0; i<topIndices; i+=3)
            mesh.AddTriangle(Convert(original.Vertices[original.Indices[i]]),
                Convert(original.Vertices[original.Indices[i+2]]), Convert(original.Vertices[original.Indices[i+1]]));
        // A segmented perimeter and bottom fan avoid T-junctions in the original two-triangle base.
        var perimeter = new List<Vector3>();
        Vector3 At(int x,int y) => new((float)r.X[x],(float)(r.Height-r.Y[y]),(float)heights[y,x]);
        for(int x=0;x<width;x++) perimeter.Add(At(x,0));
        for(int y=1;y<height;y++) perimeter.Add(At(width-1,y));
        for(int x=width-2;x>=0;x--) perimeter.Add(At(x,height-1));
        for(int y=height-2;y>0;y--) perimeter.Add(At(0,y));
        var center=new Vector3(r.Width/2f,r.Height/2f,0);
        for(int i=0;i<perimeter.Count;i++)
        {
            var a=perimeter[i]; var b=perimeter[(i+1)%perimeter.Count];
            var lowA=new Vector3(a.X,a.Y,0); var lowB=new Vector3(b.X,b.Y,0);
            mesh.AddTriangle(a,b,lowB); mesh.AddTriangle(a,lowB,lowA);
            mesh.AddTriangle(center,lowA,lowB);
        }
        return mesh;
    }
}
