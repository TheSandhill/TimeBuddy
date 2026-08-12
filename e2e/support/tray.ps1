# The notification area, which neither WebDriver nor `win32.ps1` can reach.
#
# `win32.ps1` asks user32 about a window. A tray icon is not a window: it is a
# `Shell_NotifyIcon` registration owned by explorer, drawn by explorer, and
# addressable only through the `hWnd`/`uID` pair it was registered under —
# which is `tray-icon`'s private business and not ours. Windows 11 then put
# the icons behind an overflow flyout, so even the old trick of reading
# `TBBUTTON` structures out of explorer with `ReadProcessMemory` finds an empty
# toolbar.
#
# What does reach both the flyout and the icons in it is UI Automation, which
# is why this is a second harness rather than four more lines in `win32.ps1`
# (ADR-0013). UIA answers two questions and nothing else here:
#
# 1. **Where the icon is**, so the real mouse can be pressed on it. The press
#    itself is `mouse_event`, exactly as the drag is — a tray menu is opened by
#    `WM_CONTEXTMENU` and shown with `TrackPopupMenu`, and neither is reachable
#    from inside a webview.
# 2. **What the icon and its menu say**, which is the assertion: the tooltip is
#    the icon's UIA name, and the menu items are `MenuItem` elements under the
#    `#32768` popup the app just opened.
#
# Nothing here consults TimeBuddy. The tooltip read back is the one Windows is
# showing, not the one the app believes it set.

[CmdletBinding()]
param(
  # probe    — whether this session has a notification area at all.
  # find     — locate an icon by the tooltip it is currently showing.
  # read     — what a known icon's tooltip says now.
  # menu     — right-click a known icon and report what the menu offers.
  # activate — the same, and then press one of those items.
  # dismiss  — close whatever this script left open.
  [Parameter(Mandatory = $true)]
  [ValidateSet('probe', 'find', 'read', 'menu', 'activate', 'dismiss')]
  [string]$Action,

  # `find`: a regex against the icon's tooltip. Every match is returned and the
  # caller decides — a developer running this suite has their own TimeBuddy in
  # the tray, and picking one of two would pick theirs half the time.
  [string]$Match = '',

  # `read`/`menu`/`activate`: the icon `find` returned, by UIA runtime id.
  #
  # Not by tooltip, because the tooltip is the thing under test: a running
  # block's icon says "Nog 24 min" and no longer says TimeBuddy at all, so an
  # icon looked up by name would go missing at exactly the moment it mattered.
  [string]$RuntimeId = '',

  # `activate`: which menu item to press, top to bottom from zero. By position
  # rather than by label, like the titlebar buttons in `close-hides-to-tray`:
  # the labels come from the catalogues and a reworded Dutch string is not a
  # regression.
  [int]$Item = -1
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes

Add-Type -Namespace TimeBuddyTray -Name Win32 -MemberDefinition @'
[StructLayout(LayoutKind.Sequential)]
public struct POINT { public int X, Y; }

[StructLayout(LayoutKind.Sequential)]
public struct RECT { public int Left, Top, Right, Bottom; }

[DllImport("user32.dll")]
public static extern bool SetCursorPos(int x, int y);

[DllImport("user32.dll")]
public static extern bool GetCursorPos(out POINT point);

[DllImport("user32.dll")]
public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);

[DllImport("user32.dll")]
public static extern IntPtr WindowFromPoint(POINT point);

[DllImport("user32.dll")]
public static extern IntPtr GetAncestor(IntPtr hWnd, uint flags);

[DllImport("user32.dll")]
public static extern bool IsWindowVisible(IntPtr hWnd);

[DllImport("user32.dll")]
public static extern IntPtr SendMessageW(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);

[DllImport("user32.dll")]
public static extern int GetMenuItemCount(IntPtr menu);

[DllImport("user32.dll", CharSet = CharSet.Unicode)]
public static extern int GetMenuStringW(IntPtr menu, uint item, System.Text.StringBuilder text, int max, uint flags);

[DllImport("user32.dll")]
public static extern bool GetMenuItemRect(IntPtr hWnd, IntPtr menu, uint item, out RECT rect);

/// GA_ROOT — the point lands on an inner host window, and what is wanted is
/// the top-level one it belongs to.
public const uint GA_ROOT = 2;

/// MN_GETHMENU — asks a popup menu window for the menu it is showing. The
/// undocumented-but-forever message, and the only way in: `GetMenu` answers
/// for a window's menu bar, and a tray menu has no window and no bar.
public const uint MN_GETHMENU = 0x01E1;

/// MF_BYPOSITION — items are addressed top to bottom rather than by the
/// command ids `muda` assigns, which are its own business.
public const uint MF_BYPOSITION = 0x0400;

public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
public const uint MOUSEEVENTF_LEFTUP = 0x0004;
public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
'@

$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$CT = [System.Windows.Automation.ControlType]
$ANY = [System.Windows.Automation.Condition]::TrueCondition

function ByProperty($property, $value) {
  New-Object System.Windows.Automation.PropertyCondition($property, $value)
}

function Get-Root {
  return $AE::RootElement
}

function Get-TopLevel([string]$className) {
  return (Get-Root).FindFirst($TS::Children, (ByProperty $AE::ClassNameProperty $className))
}

# Windows 11 hosts the flyout in a XAML island; every earlier shell, and the
# Server images CI runs on, use the old one. Whichever is there is the one that
# answers.
$OVERFLOW_CLASSES = @('TopLevelWindowForOverflowXamlIsland', 'NotifyIconOverflowWindow')

function Get-Overflow {
  foreach ($className in $OVERFLOW_CLASSES) {
    $window = Get-TopLevel $className
    if ($null -ne $window) { return $window }
  }
  return $null
}

<#
  Every notify icon under an element, in the order the shell lays them out.

  Two shells, two shapes. Windows 11 gives each icon an `AutomationId` of
  `NotifyItemIcon`; the classic tray gives them none at all and hangs them off
  a `ToolbarWindow32` inside `TrayNotifyWnd`. Both are collected, because the
  overflow flyout and the promoted row are searched by the same code.
#>
function Get-NotifyIcons($scope) {
  $icons = New-Object System.Collections.ArrayList

  foreach ($icon in $scope.FindAll($TS::Descendants, (ByProperty $AE::AutomationIdProperty 'NotifyItemIcon'))) {
    [void]$icons.Add($icon)
  }

  # The classic tray, whose buttons are only distinguishable by where they
  # hang: `Shell_TrayWnd` has a second `ToolbarWindow32` for the task band, and
  # the running-applications buttons in it are not tray icons.
  $notifyArea = $scope.FindFirst($TS::Descendants, (ByProperty $AE::ClassNameProperty 'TrayNotifyWnd'))
  $within = if ($null -ne $notifyArea) { $notifyArea } else { $scope }
  foreach ($bar in $within.FindAll($TS::Descendants, (ByProperty $AE::ClassNameProperty 'ToolbarWindow32'))) {
    foreach ($icon in $bar.FindAll($TS::Children, (ByProperty $AE::ControlTypeProperty $CT::Button))) {
      [void]$icons.Add($icon)
    }
  }

  return $icons
}

function As-Icon($element) {
  $rect = $element.Current.BoundingRectangle
  return [pscustomobject]@{
    runtimeId = ($element.GetRuntimeId() -join '.')
    # The tooltip, which is what a `Shell_NotifyIcon` registration puts in the
    # element's name. Multi-line for some apps, so it is handed back whole and
    # the caller matches against it.
    name      = $element.Current.Name
    x         = [int]$rect.X
    y         = [int]$rect.Y
    width     = [int]$rect.Width
    height    = [int]$rect.Height
  }
}

<#
  Presses whatever hides the icons, and answers with the flyout it opened.

  The chevron is identified by where it sits rather than by what it is called —
  "Show Hidden Icons" is a localised string, and this suite must not need the
  desktop to be in English. On Windows 11 it is the first system tray button
  before the promoted icons begin; on the classic tray it is the lone plain
  `Button` in the notification area.

  Each candidate is pressed and then judged by whether a flyout appeared, so
  guessing wrong costs a flyout that is not there and one more try, rather than
  a language switcher opened in silence.
#>
function Open-Overflow {
  $already = Get-Overflow
  if ($null -ne $already) { return $already }

  $tray = Get-TopLevel 'Shell_TrayWnd'
  if ($null -eq $tray) { return $null }

  $everything = @($tray.FindAll($TS::Descendants, $ANY))
  $firstIcon = [int]::MaxValue
  for ($i = 0; $i -lt $everything.Count; $i++) {
    if ($everything[$i].Current.AutomationId -eq 'NotifyItemIcon') { $firstIcon = $i; break }
  }

  $candidates = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $everything.Count; $i++) {
    if ($i -ge $firstIcon) { break }
    $current = $everything[$i].Current
    $isModern = $current.AutomationId -eq 'SystemTrayIcon' -and $current.ClassName -eq 'SystemTray.NormalButton'
    $isClassic = $current.ClassName -eq 'Button' -and $current.ControlType -eq $CT::Button
    if ($isModern -or $isClassic) { [void]$candidates.Add($everything[$i]) }
  }

  foreach ($candidate in $candidates) {
    try {
      $candidate.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    } catch {
      continue
    }
    $script:opened += 1

    $deadline = (Get-Date).AddSeconds(3)
    while ((Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 150
      $overflow = Get-Overflow
      if ($null -ne $overflow) { return $overflow }
    }

    # Something opened that was not the flyout. Put it away before trying the
    # next one, or the desktop collects stray popups for the rest of the run.
    Close-Popups
  }

  return $null
}

<#
  The icon with this runtime id, opening the overflow flyout if that is where
  it is.

  Promoted icons are looked for first and without opening anything: an icon
  Windows is already showing needs no flyout, and a flyout opened for nothing
  is a second window over the part of the screen about to be clicked.
#>
function Resolve-Icon([string]$runtimeId) {
  $tray = Get-TopLevel 'Shell_TrayWnd'
  if ($null -ne $tray) {
    foreach ($icon in Get-NotifyIcons $tray) {
      if (($icon.GetRuntimeId() -join '.') -eq $runtimeId) {
        return @{ icon = $icon; container = $tray }
      }
    }
  }

  $overflow = Open-Overflow
  if ($null -ne $overflow) {
    foreach ($icon in Get-NotifyIcons $overflow) {
      if (($icon.GetRuntimeId() -join '.') -eq $runtimeId) {
        return @{ icon = $icon; container = $overflow }
      }
    }
  }

  return $null
}

<#
  Closes what this script opened, and only that.

  Escape rather than a click somewhere empty: there is no somewhere empty that
  is not also somebody's window. Counted rather than sent twice for luck — a
  stray Escape with nothing open goes to whatever is in front, which during
  these tests is the app under test.
#>
$script:opened = 0

function Close-Popups {
  if ($script:opened -le 0) { return }

  Add-Type -AssemblyName System.Windows.Forms
  while ($script:opened -gt 0) {
    [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
    Start-Sleep -Milliseconds 250
    $script:opened -= 1
  }
}

function Invoke-Click($x, $y, [switch]$Right) {
  $was = New-Object TimeBuddyTray.Win32+POINT
  [void][TimeBuddyTray.Win32]::GetCursorPos([ref]$was)

  [void][TimeBuddyTray.Win32]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 150

  $down = if ($Right) { [TimeBuddyTray.Win32]::MOUSEEVENTF_RIGHTDOWN } else { [TimeBuddyTray.Win32]::MOUSEEVENTF_LEFTDOWN }
  $up = if ($Right) { [TimeBuddyTray.Win32]::MOUSEEVENTF_RIGHTUP } else { [TimeBuddyTray.Win32]::MOUSEEVENTF_LEFTUP }

  [TimeBuddyTray.Win32]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [TimeBuddyTray.Win32]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 250

  # Back where it was, so the pointer is not left hovering the taskbar — a
  # thumbnail preview would then cover the very icons the next step clicks.
  [void][TimeBuddyTray.Win32]::SetCursorPos($was.X, $was.Y)
}

<#
  Right-clicks the icon and answers with the menu items that appeared.

  The popup is an ordinary Win32 menu (`#32768`) — `tray-icon` shows it with
  `TrackPopupMenu`, which is why no amount of WebDriver reaches it and why the
  click has to be a real one.
#>
function Open-Menu([string]$runtimeId) {
  # A real mouse presses whatever is on top, so what is on top is checked
  # first — the same refusal `win32.ps1` makes before dragging a titlebar.
  # Waited out rather than refused outright, though, because the thing most
  # likely to be over these icons is TimeBuddy's own doing: the first hide
  # raises a Windows notification in this exact corner, and it goes away by
  # itself in a few seconds.
  #
  # Asked of user32 rather than of UIA. `AutomationElement.FromPoint` stops at
  # the flyout's own window and never descends into the XAML island inside it,
  # so it can say which window is on top and nothing finer — which is exactly
  # the question, so the window is what is compared.
  $deadline = (Get-Date).AddSeconds(20)
  $x = 0
  $y = 0
  $why = "no tray icon with runtime id $runtimeId"

  for (;;) {
    $found = Resolve-Icon $runtimeId
    if ($null -ne $found) {
      $rect = $found.icon.Current.BoundingRectangle
      $x = [int]($rect.X + $rect.Width / 2)
      $y = [int]($rect.Y + $rect.Height / 2)

      $point = New-Object TimeBuddyTray.Win32+POINT
      $point.X = $x
      $point.Y = $y
      $onTop = [TimeBuddyTray.Win32]::GetAncestor(
        [TimeBuddyTray.Win32]::WindowFromPoint($point),
        [TimeBuddyTray.Win32]::GA_ROOT)

      if ($onTop -eq [IntPtr]$found.container.Current.NativeWindowHandle) { break }
      $why = "something is covering the tray icon at $x,$y"
    }

    if ((Get-Date) -gt $deadline) { throw $why }

    # Let go of the flyout between attempts: whatever came up in front of it
    # may well have closed it, and the next attempt opens it again.
    Close-Popups
    Start-Sleep -Milliseconds 800
  }

  Invoke-Click $x $y -Right

  # The popup, and then the menu inside it.
  #
  # UIA finds the window and stops there: a `TrackPopupMenu` menu exposes no
  # items to it at all — `FindAll` over the `#32768` element comes back empty
  # while the menu is plainly on screen. So the window is all UIA is asked for,
  # and the items are read the way the shell reads them, out of the `HMENU`.
  #
  # Which is the better half of the bargain anyway. `GetMenuString` is the
  # exact text `set_text` put there, and `GetMenuItemRect` is where Windows
  # will accept a click on it.
  $deadline = (Get-Date).AddSeconds(5)
  $window = [IntPtr]::Zero
  $menu = [IntPtr]::Zero

  while ((Get-Date) -lt $deadline) {
    $popup = Get-TopLevel '#32768'
    if ($null -ne $popup) {
      $window = [IntPtr]$popup.Current.NativeWindowHandle
      # A closed menu leaves its window behind, hidden and holding nothing.
      if ([TimeBuddyTray.Win32]::IsWindowVisible($window)) {
        $menu = [TimeBuddyTray.Win32]::SendMessageW($window, [TimeBuddyTray.Win32]::MN_GETHMENU, [IntPtr]::Zero, [IntPtr]::Zero)
        if ($menu -ne [IntPtr]::Zero -and [TimeBuddyTray.Win32]::GetMenuItemCount($menu) -gt 0) { break }
      }
    }
    Start-Sleep -Milliseconds 150
    $menu = [IntPtr]::Zero
  }

  if ($menu -eq [IntPtr]::Zero) { throw 'the tray icon opened no menu' }
  $script:opened += 1

  $items = New-Object System.Collections.ArrayList
  $count = [TimeBuddyTray.Win32]::GetMenuItemCount($menu)
  for ($position = 0; $position -lt $count; $position++) {
    $text = New-Object System.Text.StringBuilder 512
    [void][TimeBuddyTray.Win32]::GetMenuStringW($menu, [uint32]$position, $text, $text.Capacity, [TimeBuddyTray.Win32]::MF_BYPOSITION)

    $bounds = New-Object TimeBuddyTray.Win32+RECT
    [void][TimeBuddyTray.Win32]::GetMenuItemRect($window, $menu, [uint32]$position, [ref]$bounds)

    [void]$items.Add([pscustomobject]@{
      name = $text.ToString()
      x    = [int](($bounds.Left + $bounds.Right) / 2)
      y    = [int](($bounds.Top + $bounds.Bottom) / 2)
    })
  }

  return $items
}

# Whatever happens, the flyout and the menu are put away. A run that fell over
# mid-menu used to leave a popup sitting over the notification area, and every
# step after it failed for that reason instead of its own.
try {

switch ($Action) {
  'probe' {
    # Asked before anything is launched, and answered without touching the
    # shell. A session with no notification area — a runner with no desktop, a
    # machine sitting at the lock screen — cannot be asked whether the tray
    # menu works, which is a different answer from the menu being broken.
    $tray = Get-TopLevel 'Shell_TrayWnd'
    [pscustomobject]@{ notificationArea = ($null -ne $tray) } | ConvertTo-Json -Compress
  }

  'find' {
    $found = New-Object System.Collections.ArrayList

    $tray = Get-TopLevel 'Shell_TrayWnd'
    if ($null -eq $tray) {
      # Said rather than guessed at. A desktop with no notification area is not
      # a failing tray menu, it is a session that cannot be asked — and the
      # test says so instead of reporting the app broken.
      '{"notificationArea":false,"icons":[]}'
      break
    }

    foreach ($icon in Get-NotifyIcons $tray) {
      if ($icon.Current.Name -match $Match) { [void]$found.Add((As-Icon $icon)) }
    }

    if ($found.Count -eq 0) {
      $overflow = Open-Overflow
      if ($null -ne $overflow) {
        foreach ($icon in Get-NotifyIcons $overflow) {
          if ($icon.Current.Name -match $Match) { [void]$found.Add((As-Icon $icon)) }
        }
      }
      Close-Popups
    }

    [pscustomobject]@{ notificationArea = $true; icons = @($found) } |
      ConvertTo-Json -Compress -Depth 4
  }

  'read' {
    $found = Resolve-Icon $RuntimeId
    if ($null -eq $found) { throw "no tray icon with runtime id $RuntimeId" }
    $answer = As-Icon $found.icon
    Close-Popups
    $answer | ConvertTo-Json -Compress -Depth 4
  }

  'menu' {
    $items = Open-Menu $RuntimeId
    # Read and then put away: an assertion about what the menu offers must not
    # leave it open over the desktop the next step works on.
    Close-Popups
    [pscustomobject]@{ items = @($items) } | ConvertTo-Json -Compress -Depth 4
  }

  'activate' {
    $items = Open-Menu $RuntimeId
    if ($Item -lt 0 -or $Item -ge $items.Count) {
      Close-Popups
      throw "the tray menu has $($items.Count) items; asked for number $Item"
    }

    $chosen = $items[$Item]
    Invoke-Click $chosen.x $chosen.y
    # The click closed the menu itself; the flyout behind it, if there was one,
    # is still open.
    $script:opened -= 1
    Close-Popups
    [pscustomobject]@{ pressed = $chosen.name } | ConvertTo-Json -Compress -Depth 4
  }

  'dismiss' {
    # The one action that presses Escape without having opened anything: it
    # exists for a run that fell over mid-menu and left the desktop with a
    # popup on it.
    $script:opened = 2
    Close-Popups
    'ok'
  }
}

} finally {
  Close-Popups
}
