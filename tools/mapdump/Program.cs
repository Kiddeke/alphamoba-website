using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Text;
using Wychwood.Data;
using Wychwood.Sim.Map;

// Usage: dotnet run -- <GameData/maps dir> <out dir> <map stem>...
// Writes <out dir>/<stem>.geometry.json for each map: every wall box
// WallBuilder lays, the thickets BrushProfile fits, and the river's centre
// line and width as RiverProfile has it. All in the sim frame (x east, y north).
static class Program
{
    static string F(float v) => Math.Round(v, 2).ToString(CultureInfo.InvariantCulture);

    static int Main(string[] args)
    {
        if (args.Length < 3)
        {
            Console.Error.WriteLine("usage: MapDump <maps dir> <out dir> <stem>...");
            return 1;
        }
        Directory.CreateDirectory(args[1]);
        foreach (var stem in args.Skip(2))
        {
            var map = MapLoader.FromJson(File.ReadAllText(Path.Combine(args[0], stem + ".json")));
            var walls = WallBuilder.Build(map);
            var brush = BrushProfile.FittedFor(map);
            RiverProfile.FitTo(map);
            var sb = new StringBuilder();
            sb.Append("{\"walls\":[");
            sb.Append(string.Join(",", walls.Select(w =>
                $"[{F(w.Center.X)},{F(w.Center.Y)},{F(w.Size.X)},{F(w.Size.Y)},{F(w.Yaw * 180f / MathF.PI)},\"{w.Tier.ToString().ToLowerInvariant()}\"]")));
            sb.Append("],\"brush\":[");
            sb.Append(string.Join(",", brush.Select(b => $"[{F(b.Center.X)},{F(b.Center.Y)},{F(b.Size.X)},{F(b.Size.Y)}]")));
            sb.Append("],\"river\":{\"width\":").Append(F(RiverProfile.RiverWidth)).Append(",\"spine\":[");
            var spine = new List<string>();
            if (RiverProfile.MidCourse)
            {
                float reach = RiverProfile.MidReach;
                for (float t = -reach; t <= reach + 0.01f; t += 1.5f)
                {
                    var p = RiverProfile.MidRiverPoint(t);
                    spine.Add($"[{F(p.X)},{F(p.Y)}]");
                }
            }
            sb.Append(string.Join(",", spine)).Append("]}}");
            File.WriteAllText(Path.Combine(args[1], stem + ".geometry.json"), sb.ToString());
            Console.WriteLine($"{stem}: {walls.Count} walls, {brush.Count} thickets, {spine.Count} river points");
        }
        return 0;
    }
}
