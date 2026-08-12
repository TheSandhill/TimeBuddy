# The half of an e2e test that WebDriver cannot see.
#
# WebDriver drives the webview. Every question this suite exists to ask is
# about the window *around* it — where it is on screen, whether it is still
# visible, whether the process is still alive — so those are asked of Windows
# itself, through the same API a user's mouse goes through.
#
# `drag` in particular is not a nicety: `data-tauri-drag-region` ends in
# `WM_NCLBUTTONDOWN`, and the modal move loop Windows enters there is fed by
# the OS input queue. Synthetic WebDriver clicks never reach it, which is
# exactly why a DOM assertion could pass while dragging was broken (#33).

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('find', 'drag')]
  [string]$Action,

  # `drag`: the window the press is meant for. Raised first, and checked to be
  # the one actually under the point — a real mouse presses whatever is on top
  # there, and dragging the developer's editor instead would fail the test
  # while saying nothing about the app.
  [int64]$Handle = 0,

  # `find`: which app to enumerate the windows of. By name, because there may
  # be more than one copy running and the caller is the side that knows which
  # process id is its own.
  [string]$ProcessName = 'TimeBuddy',

  # `drag`: physical screen pixels, start and finish.
  [int]$FromX = 0,
  [int]$FromY = 0,
  [int]$ToX = 0,
  [int]$ToY = 0
)

$ErrorActionPreference = 'Stop'

Add-Type -Namespace TimeBuddyE2E -Name Win32 -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int Left, Top, Right, Bottom; }

[StructLayout(LayoutKind.Sequential)]
public struct POINT { public int X, Y; }

public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

[DllImport("user32.dll")]
public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);

[DllImport("user32.dll")]
public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

[DllImport("user32.dll")]
public static extern IntPtr GetParent(IntPtr hWnd);

[DllImport("user32.dll")]
public static extern bool IsWindowVisible(IntPtr hWnd);

[DllImport("user32.dll")]
public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

[DllImport("user32.dll")]
public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);

[DllImport("user32.dll")]
public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);

[DllImport("user32.dll", CharSet = CharSet.Unicode)]
public static extern int GetWindowTextW(IntPtr hWnd, System.Text.StringBuilder text, int count);

[DllImport("user32.dll")]
public static extern bool SetCursorPos(int x, int y);

[DllImport("user32.dll")]
public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

[DllImport("user32.dll")]
public static extern IntPtr WindowFromPoint(POINT point);

[DllImport("user32.dll")]
public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

[DllImport("user32.dll")]
public static extern bool SetForegroundWindow(IntPtr hWnd);

[DllImport("user32.dll")]
public static extern bool BringWindowToTop(IntPtr hWnd);

/// GA_ROOT — a point lands on the webview's child window, and what is wanted
/// is the top-level one it belongs to.
public const uint GA_ROOT = 2;

public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
public const uint MOUSEEVENTF_LEFTUP = 0x0004;
'@

function Get-TopLevelWindows {
  param([int[]]$ProcessIds)

  $found = New-Object System.Collections.ArrayList
  $callback = [TimeBuddyE2E.Win32+EnumWindowsProc] {
    param($hWnd, $lParam)

    $owner = 0
    [void][TimeBuddyE2E.Win32]::GetWindowThreadProcessId($hWnd, [ref]$owner)
    if ($ProcessIds -notcontains [int]$owner) { return $true }
    # Tao leaves message-only and helper windows behind; only the real one is
    # both top-level and titled.
    if ([TimeBuddyE2E.Win32]::GetParent($hWnd) -ne [IntPtr]::Zero) { return $true }

    $text = New-Object System.Text.StringBuilder 512
    [void][TimeBuddyE2E.Win32]::GetWindowTextW($hWnd, $text, $text.Capacity)
    if ($text.Length -eq 0) { return $true }

    $rect = New-Object TimeBuddyE2E.Win32+RECT
    [void][TimeBuddyE2E.Win32]::GetWindowRect($hWnd, [ref]$rect)

    # The client origin, not the window origin: an undecorated window still
    # carries an invisible resize frame, so the two differ by a pixel or two —
    # enough to aim a drag at the wrong row.
    $origin = New-Object TimeBuddyE2E.Win32+POINT
    [void][TimeBuddyE2E.Win32]::ClientToScreen($hWnd, [ref]$origin)

    [void]$found.Add([pscustomobject]@{
      handle    = [int64]$hWnd
      processId = [int]$owner
      visible   = [bool][TimeBuddyE2E.Win32]::IsWindowVisible($hWnd)
      x         = $rect.Left
      y         = $rect.Top
      width     = $rect.Right - $rect.Left
      height    = $rect.Bottom - $rect.Top
      clientX   = $origin.X
      clientY   = $origin.Y
    })

    return $true
  }

  [void][TimeBuddyE2E.Win32]::EnumWindows($callback, [IntPtr]::Zero)
  return $found
}

switch ($Action) {
  'find' {
    # Every window of every copy, and the caller decides which is its own.
    # Picking one here would sooner or later pick the developer's real
    # TimeBuddy, which is running in their tray while they work on this.
    $ids = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    if ($ids.Count -eq 0) {
      '{"windows":[],"processIds":[]}'
      break
    }

    $windows = @(Get-TopLevelWindows -ProcessIds $ids)
    [pscustomobject]@{ windows = $windows; processIds = $ids } |
      ConvertTo-Json -Compress -Depth 4
  }

  'drag' {
    if ($Handle -ne 0) {
      $hWnd = [IntPtr]$Handle
      [void][TimeBuddyE2E.Win32]::BringWindowToTop($hWnd)
      [void][TimeBuddyE2E.Win32]::SetForegroundWindow($hWnd)
      Start-Sleep -Milliseconds 400

      $point = New-Object TimeBuddyE2E.Win32+POINT
      $point.X = $FromX
      $point.Y = $FromY
      $under = [TimeBuddyE2E.Win32]::GetAncestor(
        [TimeBuddyE2E.Win32]::WindowFromPoint($point),
        [TimeBuddyE2E.Win32]::GA_ROOT)

      if ($under -ne $hWnd) {
        # Said rather than pressed. Dragging whatever is on top instead would
        # fail the test for a reason that has nothing to do with the app.
        Write-Error "another window is covering the titlebar at $FromX,$FromY"
        exit 1
      }
    }

    # Real input, in the OS queue, because that is the only kind the move loop
    # behind WM_NCLBUTTONDOWN reads. Moved in steps rather than one jump: a
    # single teleport can be swallowed as a click.
    [void][TimeBuddyE2E.Win32]::SetCursorPos($FromX, $FromY)
    Start-Sleep -Milliseconds 120
    [TimeBuddyE2E.Win32]::mouse_event([TimeBuddyE2E.Win32]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 120

    $steps = 12
    for ($step = 1; $step -le $steps; $step++) {
      $x = [int]($FromX + ($ToX - $FromX) * $step / $steps)
      $y = [int]($FromY + ($ToY - $FromY) * $step / $steps)
      [void][TimeBuddyE2E.Win32]::SetCursorPos($x, $y)
      Start-Sleep -Milliseconds 40
    }

    Start-Sleep -Milliseconds 120
    [TimeBuddyE2E.Win32]::mouse_event([TimeBuddyE2E.Win32]::MOUSEEVENTF_LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 200
    'ok'
  }
}
