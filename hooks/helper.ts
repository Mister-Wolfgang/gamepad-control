// Helper lancé par $.process.spawn : lit les manettes XInput (0 à 3) et énumère
// les manettes HID pour en deviner la marque d'après leur identifiant USB (VID).
// Le script reste en ASCII : il est passé en -EncodedCommand (UTF-16LE, base64).
export const HELPER_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$out = [Console]::Out

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class XInputNative {
  [StructLayout(LayoutKind.Sequential)]
  public struct Pad { public ushort Buttons; public byte LeftTrigger; public byte RightTrigger; public short LX; public short LY; public short RX; public short RY; }
  [StructLayout(LayoutKind.Sequential)]
  public struct State { public uint Packet; public Pad Gamepad; }
  [DllImport("xinput1_4.dll")]
  public static extern int XInputGetState(uint index, out State state);
}
'@

$brands = @{ '054C' = 'sony'; '057E' = 'nintendo'; '045E' = 'xbox' }
Get-PnpDevice -Class HIDClass -Status OK -ErrorAction SilentlyContinue |
  Where-Object { $_.InstanceId -match 'VID_(054C|057E|045E)' -and ($_.InstanceId -match '&IG_' -or $_.FriendlyName -match 'controller|gamepad|joy-con|dualsense|dualshock') } |
  ForEach-Object {
    $vid = [regex]::Match($_.InstanceId, 'VID_([0-9A-F]{4})').Groups[1].Value
    $out.WriteLine('DEVICE ' + $brands[$vid] + ' ' + $_.FriendlyName)
  }

$out.WriteLine('READY')

$buttons = [ordered]@{
  'A' = 0x1000; 'B' = 0x2000; 'X' = 0x4000; 'Y' = 0x8000
  'LB' = 0x0100; 'RB' = 0x0200; 'Back' = 0x0020; 'Start' = 0x0010
  'Up' = 0x0001; 'Down' = 0x0002; 'Left' = 0x0004; 'Right' = 0x0008
  'LThumb' = 0x0040; 'RThumb' = 0x0080
}
$wasUp = @{}
$wasButtons = @{}

while ($true) {
  for ($i = 0; $i -lt 4; $i++) {
    $state = New-Object XInputNative+State
    $isUp = ([XInputNative]::XInputGetState([uint32]$i, [ref]$state) -eq 0)
    if ($isUp -ne [bool]$wasUp[$i]) {
      $wasUp[$i] = $isUp
      $out.WriteLine('PAD ' + $i + ' ' + $(if ($isUp) { 'up' } else { 'down' }))
    }
    if ($isUp) {
      $now = [int]$state.Gamepad.Buttons
      $before = [int]$wasButtons[$i]
      foreach ($name in $buttons.Keys) {
        $mask = [int]$buttons[$name]
        if ((($now -band $mask) -ne 0) -and (($before -band $mask) -eq 0)) {
          $out.WriteLine('BTN ' + $name)
        }
      }
      $wasButtons[$i] = $now
    } else {
      $wasButtons[$i] = 0
    }
  }
  Start-Sleep -Milliseconds 30
}
`

// Arguments de powershell.exe pour lancer HELPER_SCRIPT sans souci de guillemets
export function encodedCommand(script: string): string {
  let binary = ''
  for (let i = 0; i < script.length; i++) {
    const code = script.charCodeAt(i)
    binary += String.fromCharCode(code & 0xff, code >> 8)
  }
  return btoa(binary)
}
