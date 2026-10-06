' run-hidden.vbs -- run a PowerShell script with NO window, NO focus theft, and a
' REAL exit code.
'
' Usage:  wscript.exe //B //Nologo run-hidden.vbs <script.ps1> [args...]
'
' WHY THIS EXISTS
' ---------------
' A scheduled task registered with an interactive logon type -- which is what you
' use when you refuse to store a password -- gets a console window, and a new
' console window TAKES KEYBOARD AND MOUSE FOCUS. Lupo lived with that every hour
' for six days and mentioned it as a footnote.
'
' The usual fixes, measured on this box 2026-09-25, not assumed:
'   -WindowStyle Hidden      still creates the console, then hides it. Flashes.
'   conhost.exe --headless   DOES NOT WORK as a wrapper here. It emitted terminal
'                            escape sequences and the inner process never ran.
'                            TODO-after-independence.md S1 recommends this. It is
'                            wrong on this machine.
'   stored task password     REJECTED by Lupo, deliberately. That stands.
'
' wscript.exe is a GUI-subsystem host: it creates no console at all.
'
' WHY IT TAKES A PATH AND NOT A COMMAND LINE
' ------------------------------------------
' The first version took a whole command line as one argument. Getting a quoted
' PowerShell invocation through Task Scheduler -> wscript -> WScript.Arguments
' intact requires three layers of nested quoting, and the first test of it produced
' a FALSE FAILURE: the shim looked broken when the quoting was broken. Building the
' command line HERE, from a path, removes the nesting entirely. Any argument that
' has to survive three parsers will eventually not.
'
' EXIT CODES ARE THE POINT
' ------------------------
' bWaitOnReturn is True and the code is passed through with WScript.Quit. A launcher
' that returns 0 regardless would silently defeat the graded exit codes the
' credential sentinel exists to produce -- the masking-pipe bug in a new hat, and
' that one has already manufactured both a false pass and a false failure here.
'
' Author: Lodestone <lodestone@smoothcurves.nexus>
' Collaborator: Lupo

Option Explicit

Dim shell, fso, script, cmd, rc, i

If WScript.Arguments.Count < 1 Then
    ' No script is a caller error, not a success. 64 = EX_USAGE.
    WScript.Quit 64
End If

script = WScript.Arguments(0)

Set fso = CreateObject("Scripting.FileSystemObject")
If Not fso.FileExists(script) Then
    ' "I could not look" must never be reported as "it ran and was fine".
    ' 66 = EX_NOINPUT.
    WScript.Quit 66
End If

cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File " & Chr(34) & script & Chr(34)

' Pass remaining arguments through, quoting each so spaces survive.
For i = 1 To WScript.Arguments.Count - 1
    cmd = cmd & " " & Chr(34) & WScript.Arguments(i) & Chr(34)
Next

Set shell = CreateObject("WScript.Shell")
' 0 = hidden.  True = wait, so the exit code is measured rather than invented.
rc = shell.Run(cmd, 0, True)

WScript.Quit rc
