@echo off
rem Compila Sonora.exe con el compilador de C# de .NET Framework 4 (incluido en Windows 10/11)
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
"%CSC%" /nologo /target:winexe /optimize+ /win32icon:sonora.ico /r:System.Windows.Forms.dll /out:..\public\descargas\Sonora.exe Sonora.cs
if errorlevel 1 exit /b 1
echo Creado public\descargas\Sonora.exe
