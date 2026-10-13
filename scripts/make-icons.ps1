# Convertit les PNG de assets/ en grilles de cases pour le composant Raster du terminal.
# Chaque case = un caractère demi-bloc ▀ : couleur haute = premier pixel, couleur basse = second.
# Sortie : hooks/icons.ts (généré, ne pas éditer à la main).
#
# Usage : pwsh -NoProfile -File scripts/make-icons.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'assets/kenney-input-prompts/xbox'
$target = Join-Path $root 'hooks/icons.ts'

$columns = 8   # largeur en pixels = colonnes
$rows = 4      # hauteur en cases = 8 pixels

$halfBlock = 0x2580      # ▀
$defaultColor = 0x01000000   # couleur par défaut du terminal

function Get-Color([System.Drawing.Color]$pixel) {
  if ($pixel.A -lt 128) { return $defaultColor }
  return ([uint32]$pixel.R -shl 16) -bor ([uint32]$pixel.G -shl 8) -bor [uint32]$pixel.B
}

function Get-Cells([string]$path) {
  $image = [System.Drawing.Image]::FromFile($path)
  $bitmap = New-Object System.Drawing.Bitmap($columns, $columns)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($image, 0, 0, $columns, $columns)
  $graphics.Dispose()
  $image.Dispose()

  $bytes = New-Object System.Collections.Generic.List[byte]
  for ($row = 0; $row -lt $rows; $row++) {
    for ($column = 0; $column -lt $columns; $column++) {
      $top = Get-Color $bitmap.GetPixel($column, 2 * $row)
      $bottom = Get-Color $bitmap.GetPixel($column, 2 * $row + 1)
      foreach ($value in @([uint32]$halfBlock, [uint32]$top, [uint32]$bottom)) {
        $bytes.AddRange([BitConverter]::GetBytes([uint32]$value))
      }
    }
  }
  $bitmap.Dispose()
  return [Convert]::ToBase64String($bytes.ToArray())
}

$names = [ordered]@{
  a = 'xbox_button_color_a'
  b = 'xbox_button_color_b'
  x = 'xbox_button_color_x'
  y = 'xbox_button_color_y'
  start = 'xbox_button_start'
  back = 'xbox_button_back'
  lb = 'xbox_lb'
  rb = 'xbox_rb'
}

$lines = @(
  '// Généré par scripts/make-icons.ps1 à partir des PNG Kenney (CC0) : ne pas éditer à la main.',
  '// Chaque icône : cases du composant Raster (caractère ▀, couleurs RGB), codées en base64.',
  '',
  'export const ICONS = {'
)
foreach ($key in $names.Keys) {
  $cells = Get-Cells (Join-Path $source ($names[$key] + '.png'))
  $lines += "  $key`: { columns: $columns, rows: $rows, cells: '$cells' },"
}
$lines += '} as const'

Set-Content -Path $target -Value $lines -Encoding UTF8
Write-Output "Écrit : $target"
