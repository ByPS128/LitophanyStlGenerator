namespace LitophaneStlGenerator;

public class StlWriter
{
    private Dictionary<string, string> _headers = new();

    public void SaveToFile(Mesh mesh, string filename)
    {
        try
        {
            using (var writer = new BinaryWriter(File.Open(filename, FileMode.Create)))
            {
                WriteHeader(mesh, writer);
                writer.Write(mesh.Indices.Count / 3);

                for (var i = 0; i < mesh.Indices.Count; i += 3)
                {
                    Vector3 v0 = mesh.Vertices[mesh.Indices[i]];
                    Vector3 v1 = mesh.Vertices[mesh.Indices[i + 1]];
                    Vector3 v2 = mesh.Vertices[mesh.Indices[i + 2]];

                    WriteTriangle(writer, v0, v1, v2);
                }
            }
        }
        catch (Exception ex)
        {
            throw new Exception($"Chyba při ukládání STL souboru: {ex.Message}");
        }
    }

    public void AddOrReplaceHeader(string author, string value)
    {
        _headers[author.Trim()] = value.Trim();
    }

    private void WriteHeader(Mesh mesh, BinaryWriter writer)
    {
        var stringHeader = CreateHeader(mesh);
        var binaryHeader = GetStlHeaderBytes(stringHeader);
        writer.Write(binaryHeader);
    }

    /// <summary>
    ///  binární STL formát umožňuje prvních 80 bajtů jako ascii hlavičku nebo jiná data.
    ///  jde o fixní pole a nemusí být terminováno nulou.
    /// </summary>
    /// <param name="header"></param>
    /// <returns></returns>
    private byte[] GetStlHeaderBytes(string header)
    {
        var bytes = new byte[80];
        var headerBytes = Encoding.ASCII.GetBytes(header ?? "");

        int length = Math.Min(headerBytes.Length, 80);
        Array.Copy(headerBytes, bytes, length);

        // pokud je kratší než 80, zbytek zůstane nulový (default)

        return bytes;
    }

    private void WriteTriangle(BinaryWriter writer, Vector3 v0, Vector3 v1, Vector3 v2)
    {
        Vector3 normal = Vector3.Cross(v1 - v0, v2 - v0);
        normal = Vector3.Normalize(normal);

        writer.Write(normal.X);
        writer.Write(normal.Y);
        writer.Write(normal.Z);

        writer.Write(v0.X);
        writer.Write(v0.Y);
        writer.Write(v0.Z);
        writer.Write(v1.X);
        writer.Write(v1.Y);
        writer.Write(v1.Z);
        writer.Write(v2.X);
        writer.Write(v2.Y);
        writer.Write(v2.Z);

        writer.Write((ushort)0);
    }

    private string CreateHeader(Mesh mesh)
    {
        var sb = new StringBuilder();

        foreach (var metadataItem in _headers)
        {
            if (sb.Length > 0)
            {
                sb.Append(';');
            }

            sb
                .Append(metadataItem.Key)
                .Append(':')
                .Append(metadataItem.Value);
        }

        return sb.ToString();
    }
}
