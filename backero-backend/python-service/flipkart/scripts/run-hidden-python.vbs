' Runs a Python script of this project (using its own venv) with NO console window, appending output to a log,
' and waits for it — so Task Scheduler restarts it if it crashes (non-zero exit).
' Usage:  wscript.exe //B //Nologo run-hidden-python.vbs "<project dir>" "<script and arguments>" "<log file>"
Option Explicit
Dim sh, q, py, code
Set sh = CreateObject("WScript.Shell")
q = Chr(34)
sh.CurrentDirectory = WScript.Arguments(0)
py = WScript.Arguments(0) & "\venv\Scripts\python.exe"
code = sh.Run("cmd.exe /c " & q & q & py & q & " " & WScript.Arguments(1) & " >> " & q & WScript.Arguments(2) & q & " 2>&1" & q, 0, True)
WScript.Quit code
