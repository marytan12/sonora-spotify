// Sonora para Windows: abre Sonora como una aplicación de escritorio (ventana propia, sin barra
// del navegador) usando Chrome o Edge en modo aplicación. Se usan estos navegadores porque traen
// Widevine, el sistema de protección de contenido que Spotify exige para reproducir música.
//
// Compilar (Windows, .NET Framework 4 incluido en Windows 10/11):
//   desktop\build.cmd
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("Sonora")]
[assembly: AssemblyDescription("Sonora: tu música de Spotify como aplicación de escritorio")]
[assembly: AssemblyProduct("Sonora")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

static class Program
{
    const string Url = "https://sonora-spotify-lac.vercel.app/";

    static string Env(string name)
    {
        return Environment.GetEnvironmentVariable(name) ?? "";
    }

    [STAThread]
    static void Main()
    {
        // Chrome primero (aprovecha la sesión que ya tengas iniciada en Sonora) y después Edge,
        // que viene instalado en Windows 11
        string[] browsers =
        {
            Path.Combine(Env("ProgramFiles"), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Env("ProgramFiles(x86)"), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Env("LocalAppData"), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Env("ProgramFiles(x86)"), @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(Env("ProgramFiles"), @"Microsoft\Edge\Application\msedge.exe"),
        };

        foreach (string exe in browsers)
        {
            if (!File.Exists(exe)) continue;
            try
            {
                ProcessStartInfo info = new ProcessStartInfo(exe, "--app=\"" + Url + "\" --window-size=1360,880");
                info.UseShellExecute = false;
                Process.Start(info);
                return;
            }
            catch (Exception)
            {
                // Se prueba con el siguiente navegador
            }
        }

        // Sin Chrome ni Edge: se abre en el navegador predeterminado
        try
        {
            Process.Start(Url);
        }
        catch (Exception e)
        {
            MessageBox.Show(
                "No se ha podido abrir Sonora.\n\nAbre " + Url + " en tu navegador.\n\n(" + e.Message + ")",
                "Sonora",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }
}
