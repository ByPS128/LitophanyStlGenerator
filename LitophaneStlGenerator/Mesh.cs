namespace LitophaneStlGenerator;

public class Mesh
{
    public List<Vector3> Vertices { get; private set; }
    public List<int> Indices { get; private set; }

    public Mesh()
    {
        Vertices = new List<Vector3>();
        Indices = new List<int>();
    }

    /// <summary>
    /// Přidá trojúhelník do meshe.
    /// </summary>
    public void AddTriangle(Vector3 v0, Vector3 v1, Vector3 v2)
    {
        int index0 = AddVertex(v0);
        int index1 = AddVertex(v1);
        int index2 = AddVertex(v2);

        Indices.Add(index0);
        Indices.Add(index1);
        Indices.Add(index2);
    }

    /// <summary>
    /// Přidá vrchol do meshe a vrátí jeho index.
    /// </summary>
    private int AddVertex(Vector3 vertex)
    {
        Vertices.Add(vertex);
        return Vertices.Count - 1;
    }
}
