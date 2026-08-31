Option Explicit

Dim shell, fileSystem, installDir, command, argument
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
installDir = fileSystem.GetParentFolderName(WScript.ScriptFullName)
command = Quote(installDir & "\runtime\node.exe") & " " & Quote(installDir & "\app\dist\index.js")

For Each argument In WScript.Arguments
    command = command & " " & Quote(CStr(argument))
Next

shell.Run command, 0, False

Function Quote(value)
    Quote = Chr(34) & Replace(value, Chr(34), Chr(34) & Chr(34)) & Chr(34)
End Function
