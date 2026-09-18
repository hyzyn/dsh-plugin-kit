#Requires -Version 5.1
<#
.SYNOPSIS
    在 Windows 11 上准备 DSH 插件「真机兼容性测试」环境：Node + npm + npx + pnpm（可选 git / dsh CLI / 仓库 / compat profile）。

.DESCRIPTION
    dsh-plugin-kit 各包的硬性要求（见 packages/*/package.json）：
        engines.node      >= 22.19.0
        packageManager    pnpm@10.30.3
        dsh.engines.dsh   >= 0.1.2-rc.1

    npm 与 npx 随 Node 一起分发，所以「装 Node」就等于装齐 node + npm + npx。
    本脚本只做安装与**只读验证**；除非显式传 -WithRepo，它不会碰你的 DSH profile。

    预检阶段会顺手修 ExecutionPolicy：Win11 客户端默认 Restricted，而 Node/corepack 装出来的
    npm / npx / pnpm 都带一个 .ps1 shim，PowerShell 会优先命中它并报「禁止运行脚本」
    （FullyQualifiedErrorId : UnauthorizedAccess）——Git Bash 走 .cmd/shell 脚本所以看着是好的。
    修复方式是把 CurrentUser 作用域设为 RemoteSigned（不需要管理员，可用
    `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Undefined` 还原）。

    Node 安装方式（-Method）：
        Auto    默认。有 winget → Winget；否则有管理员 → Msi；否则 Zip。
        Winget  winget install OpenJS.NodeJS.<major>，失败回退 OpenJS.NodeJS.LTS。
        Msi     从 nodejs.org/dist 解析最新 v<major>.x，下载 node-vX.Y.Z-x64.msi，msiexec 静默安装（需管理员）。
        Zip     同版本取 node-vX.Y.Z-win-x64.zip，解压到 %LOCALAPPDATA%\dsh-nodes\vX.Y.Z，写用户 PATH（免管理员）。
                —— 想在真机上并排测多个 Node 版本时用这个。

.PARAMETER Method
    Auto / Winget / Msi / Zip，默认 Auto。

.PARAMETER NodeMajor
    主版本号，默认 22（仓库声明的下限线 22.19.0 所在线）。

.PARAMETER WorkDir
    报告与（-WithRepo 时的）仓库落地目录，默认 %USERPROFILE%\dsh-compat。

.PARAMETER ProfileName
    -WithRepo 时挂载用的 DSH profile 名，默认 compat（刻意不污染 web）。

.PARAMETER SkipExecutionPolicy
    不改 ExecutionPolicy（默认会把它修成 CurrentUser=RemoteSigned）。

.PARAMETER Reinstall
    即使现有 node 已满足 >= 22.19.0 也重装一次。

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-dsh-testenv.ps1

.EXAMPLE
    # 免管理员、装到用户目录、不改 PATH
    powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-dsh-testenv.ps1 -Method Zip -NoPathChange

.EXAMPLE
    # 装完工具链后直接拉仓库、构建，并挂进 compat profile
    powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-dsh-testenv.ps1 -WithRepo

.EXAMPLE
    # 先看会做什么，不落盘
    powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-dsh-testenv.ps1 -WhatIf
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateSet('Auto', 'Winget', 'Msi', 'Zip')]
    [string]$Method = 'Auto',

    [ValidateRange(18, 30)]
    [int]$NodeMajor = 22,

    [string]$WorkDir = (Join-Path $env:USERPROFILE 'dsh-compat'),

    [string]$ProfileName = 'compat',

    [string]$RepoUrl = 'https://github.com/hyzyn/dsh-plugin-kit.git',

    [switch]$WithRepo,
    [switch]$SkipGit,
    [switch]$SkipPnpm,
    [switch]$SkipDsh,
    [switch]$NoPathChange,
    [switch]$SkipExecutionPolicy,
    [switch]$Reinstall
)

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$NodeFloor = [version]'22.19.0'
$PnpmWanted = '10.30.3'

$script:Report = @()
$script:FailCount = 0
$script:WarnCount = 0
$script:ZipNodeDir = $null

# ---------------------------------------------------------------- 输出helpers
function Write-Head { param([string]$Text) Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Ok { param([string]$Text) Write-Host "  [ OK ] $Text" -ForegroundColor Green }
function Write-Warn { param([string]$Text) Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Bad { param([string]$Text) Write-Host "  [FAIL] $Text" -ForegroundColor Red }
function Write-Info { param([string]$Text) Write-Host "        $Text" -ForegroundColor DarkGray }

function Add-Result {
    param(
        [string]$Area,
        [string]$Item,
        [string]$Value,
        [ValidateSet('OK', 'WARN', 'FAIL')]
        [string]$Status = 'OK'
    )
    $script:Report += [pscustomobject]@{ Status = $Status; Area = $Area; Item = $Item; Value = $Value }
    if ($Status -eq 'FAIL') { $script:FailCount++ }
    if ($Status -eq 'WARN') { $script:WarnCount++ }
    switch ($Status) {
        'OK' { Write-Ok "$Item : $Value" }
        'WARN' { Write-Warn "$Item : $Value" }
        'FAIL' { Write-Bad "$Item : $Value" }
    }
}

function Get-CmdPath {
    param([string]$Name)
    $c = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $c) { return $null }
    if ($c.Path) { return $c.Path }
    if ($c.Source) { return $c.Source }
    return $null
}

function Get-ToolVersion {
    param([string]$Exe, [string[]]$Arguments = @('--version'))
    if (-not (Get-CmdPath $Exe)) { return $null }
    # 局部放开 EAP：PS 5.1 下 native 命令往 stderr 写一行（有些 CLI 会）会被当成终止错误，
    # 那样会把「装好了」误判成「没装」。版本号我们只要 stdout 首行。
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $Exe @Arguments 2>$null | Select-Object -First 1
    } catch {
        $out = $null
    } finally {
        $ErrorActionPreference = $eap
    }
    if ($null -eq $out) { return $null }
    return ("$out").Trim()
}

function Get-ShimDiagnosis {
    # 版本号取不到时，区分「确实没装」和「装了但被执行策略拦住」——
    # 后者是本仓库 Windows 上最容易被误判成安装失败的形态。
    param([string]$Name, [string]$Version)
    if ($Version) { return $null }
    $p = Get-CmdPath $Name
    if (-not $p) { return '未找到该命令（没装或不在 PATH）' }

    $text = ''
    $eap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $text = (& $Name '--version' 2>&1 | Out-String) } catch { $text = "$_" } finally { $ErrorActionPreference = $eap }

    if ($text -match 'UnauthorizedAccess|PSSecurityException|Execution_Policies|禁止运行脚本') {
        return "被 ExecutionPolicy 拦住（$p）→ Set-ExecutionPolicy -Scope CurrentUser RemoteSigned"
    }
    return "调用失败（$p）"
}

function Sync-SessionPath {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @()
    foreach ($chunk in @($machine, $user)) {
        if ($chunk) { $entries += ($chunk -split ';') }
    }
    $extra = @($script:ZipNodeDir, (Join-Path $env:APPDATA 'npm'))
    $all = @($entries | Where-Object { $_ -and $_.Trim() }) + @($extra | Where-Object { $_ })
    $env:Path = (($all | ForEach-Object { $_.Trim() }) | Select-Object -Unique) -join ';'
}

function Add-UserPathEntry {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param([string]$Entry)

    if ($NoPathChange) {
        Write-Warn "按 -NoPathChange 跳过用户 PATH 写入：$Entry"
        return $false
    }
    $raw = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $raw) { $raw = '' }
    $parts = @($raw -split ';' | Where-Object { $_ -and $_.Trim() })
    foreach ($p in $parts) {
        if ($p.Trim().TrimEnd('\') -ieq $Entry.TrimEnd('\')) {
            Write-Info "用户 PATH 已包含：$Entry"
            return $true
        }
    }
    $new = (@($parts) + $Entry) -join ';'
    if ($PSCmdlet.ShouldProcess('用户 PATH', "追加 $Entry")) {
        [Environment]::SetEnvironmentVariable('Path', $new, 'User')
        Write-Ok "已写入用户 PATH：$Entry（新开终端生效）"
    }
    return $true
}

# ---------------------------------------------------------------- 执行策略
function Repair-ExecutionPolicy {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param()

    # 为什么必须管这个：Node/corepack 安装出来的是三件套 shim ——
    #   pnpm.cmd / pnpm.ps1、npm.cmd / npm.ps1、npx.cmd / npx.ps1
    # Git Bash 调的是 shell 脚本 / .cmd，不受影响；PowerShell 会优先命中 .ps1，
    # 而 Win11 客户端默认策略是 Restricted，于是报：
    #   “无法加载文件 ...\pnpm.ps1，因为在此系统上禁止运行脚本”
    #   FullyQualifiedErrorId : UnauthorizedAccess
    # 症状看起来像「pnpm 没装好」，其实装得好好的。
    $effective = 'Unknown'
    try { $effective = (Get-ExecutionPolicy).ToString() } catch { }
    Add-Result 'Policy' '当前 ExecutionPolicy' $effective 'OK'

    if ($SkipExecutionPolicy) {
        Add-Result 'Policy' '修复' '按 -SkipExecutionPolicy 跳过（npm/npx/pnpm 的 .ps1 shim 可能仍被拦）' 'WARN'
        return
    }

    if ($effective -in @('Restricted', 'AllSigned', 'Undefined')) {
        Write-Info "把 CurrentUser 作用域设为 RemoteSigned（不需要管理员；优先级高于 LocalMachine 的 Restricted）"
        if ($PSCmdlet.ShouldProcess('ExecutionPolicy (CurrentUser)', '设为 RemoteSigned')) {
            try {
                Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
                $effective = (Get-ExecutionPolicy).ToString()
                Add-Result 'Policy' '修复结果' $effective 'OK'
                Write-Info '想还原：Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy Undefined'
            } catch {
                Add-Result 'Policy' '修复失败' "$($_.Exception.Message) —— 手工执行 Set-ExecutionPolicy -Scope CurrentUser RemoteSigned" 'FAIL'
            }
        }
    } else {
        Add-Result 'Policy' '修复' "已经是 $effective，无需改动" 'OK'
    }
}

function Unblock-NodeShims {
    # winget 装出来的 Node 落在 WinGet Packages 目录，解压/下载的文件可能带
    # Zone.Identifier（mark-of-the-web）；那样连 RemoteSigned 也会拦。统一解锁。
    $nodePath = Get-CmdPath 'node'
    if (-not $nodePath) { return }
    $dir = Split-Path -Parent $nodePath
    $shims = @(Get-ChildItem -Path $dir -Filter '*.ps1' -ErrorAction SilentlyContinue)
    if ($shims.Count -eq 0) { return }
    $blocked = 0
    foreach ($s in $shims) {
        try {
            if (Get-Item -Path $s.FullName -Stream Zone.Identifier -ErrorAction SilentlyContinue) {
                Unblock-File -Path $s.FullName -ErrorAction SilentlyContinue
                $blocked++
            }
        } catch { }
    }
    if ($blocked -gt 0) { Write-Info "已解锁 $blocked 个带 mark-of-the-web 的 .ps1 shim（$dir）" }
    else { Write-Info "shim 无需解锁（$dir）" }
}

# ---------------------------------------------------------------- 安装helpers
function Resolve-NodeDistVersion {
    param([int]$Major, [string]$Arch, [string]$Kind)
    $fileKey = "win-$Arch-$Kind"
    Write-Info "查询 nodejs.org/dist/index.json：最新 v$Major.x（$fileKey）..."
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing -TimeoutSec 90
    $hit = @($index | Where-Object { $_.version -match "^v$Major\." -and (@($_.files) -contains $fileKey) })
    if ($hit.Count -eq 0) { throw "nodejs.org 上没有 v$Major.* 的 $fileKey 发行版" }
    return $hit[0].version   # index.json 由新到旧排列，首条即最新
}

function Install-NodeFromWinget {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param([int]$Major)
    $ids = @("OpenJS.NodeJS.$Major", 'OpenJS.NodeJS.LTS')
    foreach ($id in $ids) {
        Write-Info "winget install --id $id --exact --silent"
        if ($PSCmdlet.ShouldProcess("Node.js ($id)", 'winget install')) {
            & winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements
            Sync-SessionPath
        }
        if (Get-CmdPath 'node') { return $true }
        Write-Warn "winget 装 $id 后仍未发现 node，尝试下一个候选"
    }
    return $false
}

function Install-NodeFromMsi {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param([string]$Version, [string]$Arch, [bool]$IsAdmin)
    if (-not $IsAdmin) { throw 'MSI 安装需要管理员权限：请用管理员 PowerShell 重跑，或改用 -Method Zip。' }
    $name = "node-$Version-$Arch"
    $url = "https://nodejs.org/dist/$Version/$name.msi"
    $msi = Join-Path $env:TEMP "$name.msi"
    Write-Info "下载 $url"
    if ($PSCmdlet.ShouldProcess($url, '下载')) {
        Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing -TimeoutSec 600
    }
    if ($PSCmdlet.ShouldProcess($name, 'msiexec 静默安装')) {
        $p = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -PassThru
        if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw "msiexec 退出码 $($p.ExitCode)" }
        Remove-Item $msi -Force -ErrorAction SilentlyContinue
    }
    Sync-SessionPath
    return $true
}

function Install-NodeFromZip {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param([string]$Version, [string]$Arch)
    $name = "node-$Version-win-$Arch"
    $parent = Join-Path $env:LOCALAPPDATA 'dsh-nodes'
    $target = Join-Path $parent $Version

    if (Test-Path (Join-Path $target 'node.exe')) {
        Write-Ok "复用已解压的 $target"
        $script:ZipNodeDir = $target
        Sync-SessionPath
        Add-UserPathEntry -Entry $target | Out-Null
        Add-UserPathEntry -Entry (Join-Path $env:APPDATA 'npm') | Out-Null
        return $true
    }

    $url = "https://nodejs.org/dist/$Version/$name.zip"
    $zip = Join-Path $env:TEMP "$name.zip"
    if ($PSCmdlet.ShouldProcess($url, '下载')) {
        Write-Info "下载 $url"
        Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 600
    }
    if ($PSCmdlet.ShouldProcess($target, '解压并落到用户目录')) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
        Expand-Archive -Path $zip -DestinationPath $parent -Force
        $extracted = Join-Path $parent $name
        if (Test-Path $target) { Remove-Item $target -Recurse -Force }
        Move-Item -Path $extracted -Destination $target
        Remove-Item $zip -Force -ErrorAction SilentlyContinue
    }
    $script:ZipNodeDir = $target
    Sync-SessionPath
    Add-UserPathEntry -Entry $target | Out-Null
    Add-UserPathEntry -Entry (Join-Path $env:APPDATA 'npm') | Out-Null
    Add-Result 'Node' '安装目录（免管理员）' $target 'OK'
    return $true
}

# ================================================================ 主流程
Write-Host '============================================================'
Write-Host ' DSH 插件兼容性测试环境 · Windows 11 bootstrap'
Write-Host '============================================================'
Write-Host (" 主机       : {0}" -f $env:COMPUTERNAME)
Write-Host (" PowerShell : {0}" -f $PSVersionTable.PSVersion)
Write-Host (" 要求       : node >= {0} / pnpm {1} / dsh >= 0.1.2-rc.1" -f $NodeFloor, $PnpmWanted)

# ---------------------------------------------------------------- 0 预检
Write-Head '0/7 环境预检'
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
# PROCESSOR_ARCHITEW6432 是「32 位进程跑在 64 位系统上」时的原生架构，
# 优先取它，免得在 ARM64 机器上误判成 x64。
$archRaw = $env:PROCESSOR_ARCHITEW6432
if (-not $archRaw) { $archRaw = $env:PROCESSOR_ARCHITECTURE }
$arch = if ($archRaw -eq 'ARM64') { 'arm64' } else { 'x64' }
Add-Result 'Preflight' '管理员权限' "$isAdmin" 'OK'
Add-Result 'Preflight' 'CPU 架构' "$arch（$archRaw）" 'OK'

$os = $null
try { $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue } catch { }
if ($os) {
    Add-Result 'Preflight' '操作系统' ("{0} (build {1})" -f $os.Caption, $os.BuildNumber) 'OK'
} else {
    Add-Result 'Preflight' '操作系统' '无法读取（Get-CimInstance 不可用）' 'WARN'
}
if (-not (Get-CmdPath 'winget')) {
    Add-Result 'Preflight' 'winget' '不可用（App Installer 缺失或过旧）' 'WARN'
}
# 先修执行策略：否则后面所有 npm/npx/pnpm 的 .ps1 shim 全被拦（Git Bash 里却是好的）
Repair-ExecutionPolicy
Unblock-NodeShims
Write-Info "报告与工作目录：$WorkDir"

# ---------------------------------------------------------------- 1 现状
Write-Head '1/7 现有工具链现状（只读）'
foreach ($tool in @('node', 'npm', 'npx', 'pnpm', 'git', 'dsh')) {
    $path = Get-CmdPath $tool
    if ($path) {
        Write-Info ("{0,-5} -> {1}" -f $tool, $path)
    } else {
        Write-Info ("{0,-5} -> (未安装)" -f $tool)
    }
}

$nodeNow = Get-ToolVersion 'node' @('-v')
$nodeOk = $false
if ($nodeNow) {
    $clean = $nodeNow -replace '^v', ''
    try { $nodeOk = ([version]$clean -ge $NodeFloor) } catch { $nodeOk = $false }
    Add-Result 'Node' '当前版本' $nodeNow $(if ($nodeOk) { 'OK' } else { 'WARN' })
    if (-not $nodeOk) { Write-Info "现有 node $nodeNow 低于下限 $NodeFloor，将安装 v$NodeMajor.x" }
} else {
    Add-Result 'Node' '当前版本' '未安装' 'WARN'
}

$needNodeInstall = $Reinstall -or (-not $nodeOk)

# ---------------------------------------------------------------- 2 Git
Write-Head '2/7 Git（仅 -WithRepo 需要）'
$gitPath = Get-CmdPath 'git'
$gitVer = Get-ToolVersion 'git' @('--version')
if ($gitPath) {
    Add-Result 'Git' '已安装' ("{0} @ {1}" -f $gitVer, $gitPath) 'OK'
} elseif ($SkipGit) {
    Add-Result 'Git' '跳过' '按 -SkipGit' 'WARN'
} elseif (Get-CmdPath 'winget') {
    if ($PSCmdlet.ShouldProcess('Git.Git', 'winget install')) {
        & winget install --id Git.Git --exact --silent --accept-package-agreements --accept-source-agreements
        Sync-SessionPath
    }
    $gitPath = Get-CmdPath 'git'
    $gitVer = Get-ToolVersion 'git' @('--version')
    if ($gitPath) { Add-Result 'Git' '已安装' ("{0} @ {1}" -f $gitVer, $gitPath) 'OK' }
    else { Add-Result 'Git' '安装失败' '手工装 Git for Windows，或 -WithRepo 前先准备好 git' 'WARN' }
} else {
    Add-Result 'Git' '未安装' '没有 winget，手工装 Git for Windows' 'WARN'
}

# ---------------------------------------------------------------- 3 Node
Write-Head '3/7 Node.js（含 npm / npx）'
if (-not $needNodeInstall) {
    Write-Ok "已有 node $nodeNow 满足 >= $NodeFloor，跳过安装（要强制重装加 -Reinstall）"
    Add-Result 'Node' '安装动作' '跳过（已满足下限）' 'OK'
} else {
    $useMethod = $Method
    if ($useMethod -eq 'Auto') {
        if (Get-CmdPath 'winget') { $useMethod = 'Winget' }
        elseif ($isAdmin) { $useMethod = 'Msi' }
        else { $useMethod = 'Zip' }
    }
    Add-Result 'Node' '安装方式' $useMethod 'OK'

    $installed = $false
    if ($useMethod -eq 'Winget') {
        $installed = Install-NodeFromWinget -Major $NodeMajor
        if (-not $installed) {
            Write-Warn 'winget 路径失败，回退'
            if ($isAdmin) { $useMethod = 'Msi' } else { $useMethod = 'Zip' }
        }
    }

    if (-not $installed -and ($useMethod -eq 'Msi' -or $useMethod -eq 'Zip')) {
        $kind = if ($useMethod -eq 'Msi') { 'msi' } else { 'zip' }
        try {
            $ver = Resolve-NodeDistVersion -Major $NodeMajor -Arch $arch -Kind $kind
            Write-Info "选中版本：$ver"
            if ($useMethod -eq 'Msi') {
                $installed = Install-NodeFromMsi -Version $ver -Arch $arch -IsAdmin $isAdmin
            } else {
                $installed = Install-NodeFromZip -Version $ver -Arch $arch
            }
        } catch {
            Add-Result 'Node' '安装失败' "$($_.Exception.Message)" 'FAIL'
        }
    }

    if ($installed) {
        $nodeNow = Get-ToolVersion 'node' @('-v')
        if ($nodeNow) { Add-Result 'Node' '安装结果' "node $nodeNow" 'OK' }
    }
}

Sync-SessionPath

# ---------------------------------------------------------------- 4 npm/npx
Write-Head '4/7 npm / npx 校验'
Unblock-NodeShims
$npmVer = Get-ToolVersion 'npm' @('-v')
$npxVer = Get-ToolVersion 'npx' @('-v')
if ($npmVer) { Add-Result 'npm' '版本' "$npmVer（$(Get-CmdPath 'npm')）" 'OK' }
else { Add-Result 'npm' '版本' (Get-ShimDiagnosis 'npm' $npmVer) 'FAIL' }
if ($npxVer) { Add-Result 'npx' '版本' "$npxVer（$(Get-CmdPath 'npx')）" 'OK' }
else { Add-Result 'npx' '版本' (Get-ShimDiagnosis 'npx' $npxVer) 'FAIL' }

if ($nodeNow) {
    $clean = $nodeNow -replace '^v', ''
    $ok = $false
    try { $ok = ([version]$clean -ge $NodeFloor) } catch { $ok = $false }
    if ($ok) { Add-Result 'Node' '满足 engines.node >= 22.19.0' $nodeNow 'OK' }
    else { Add-Result 'Node' '满足 engines.node >= 22.19.0' "$nodeNow 低于下限" 'FAIL' }
} else {
    Add-Result 'Node' '满足 engines.node >= 22.19.0' '无 node' 'FAIL'
}

# ---------------------------------------------------------------- 5 pnpm
Write-Head '5/7 pnpm'
if ($SkipPnpm) {
    Add-Result 'pnpm' '跳过' '按 -SkipPnpm' 'WARN'
} else {
    $pnpmVer = Get-ToolVersion 'pnpm' @('-v')
    if ($pnpmVer -and ($pnpmVer -match '^10\.')) {
        Add-Result 'pnpm' '版本' "$pnpmVer（已满足 pnpm 10 线）" 'OK'
    } else {
        # pnpm 其实装好了、只是 .ps1 shim 被执行策略拦住时，别再去 corepack/npm 白折腾一遍
        $pnpmDiag = Get-ShimDiagnosis 'pnpm' $pnpmVer
        if ($pnpmDiag -and ($pnpmDiag -match 'ExecutionPolicy')) {
            Add-Result 'pnpm' '版本' $pnpmDiag 'FAIL'
        } else {
        $done = $false
        if (Get-CmdPath 'corepack') {
            Write-Info "corepack enable + corepack prepare pnpm@$PnpmWanted --activate"
            if ($PSCmdlet.ShouldProcess("pnpm@$PnpmWanted", 'corepack 激活')) {
                try {
                    & corepack enable
                    & corepack prepare "pnpm@$PnpmWanted" --activate
                } catch {
                    Write-Warn "corepack 失败：$($_.Exception.Message)"
                }
                Sync-SessionPath
            }
            $pnpmVer = Get-ToolVersion 'pnpm' @('-v')
            if ($pnpmVer) { $done = $true }
        }
        if (-not $done -and (Get-CmdPath 'npm')) {
            Write-Info 'corepack 不可用，回退 npm install -g pnpm@10'
            if ($PSCmdlet.ShouldProcess('pnpm@10', 'npm 全局安装')) {
                & npm install -g pnpm@10
                Sync-SessionPath
            }
            $pnpmVer = Get-ToolVersion 'pnpm' @('-v')
            if ($pnpmVer) { $done = $true }
        }
        if ($pnpmVer) { Add-Result 'pnpm' '版本' "$pnpmVer（$(Get-CmdPath 'pnpm')）" 'OK' }
        else { Add-Result 'pnpm' '版本' (Get-ShimDiagnosis 'pnpm' $pnpmVer) 'FAIL' }
        }
    }
}

# ---------------------------------------------------------------- 6 dsh CLI
Write-Head '6/7 dsh CLI（@deepseek-ai/dsh）'
if ($SkipDsh) {
    Add-Result 'dsh' '跳过' '按 -SkipDsh' 'WARN'
} else {
    $dshVer = Get-ToolVersion 'dsh' @('--version')
    $dshDiag = Get-ShimDiagnosis 'dsh' $dshVer
    if ($dshVer) {
        Add-Result 'dsh' '版本' "$dshVer（$(Get-CmdPath 'dsh')）" 'OK'
    } elseif ($dshDiag -and ($dshDiag -match 'ExecutionPolicy')) {
        Add-Result 'dsh' '版本' $dshDiag 'FAIL'
    } elseif (Get-CmdPath 'npm') {
        Write-Info 'npm install -g @deepseek-ai/dsh'
        if ($PSCmdlet.ShouldProcess('@deepseek-ai/dsh', 'npm 全局安装')) {
            & npm install -g '@deepseek-ai/dsh'
            Sync-SessionPath
        }
        $dshVer = Get-ToolVersion 'dsh' @('--version')
        if ($dshVer) { Add-Result 'dsh' '版本' "$dshVer（$(Get-CmdPath 'dsh')）" 'OK' }
        else {
            $why = Get-ShimDiagnosis 'dsh' $dshVer
            Add-Result 'dsh' '安装失败' "$why；若包未公开，需配 registry/凭据：npm config set @deepseek-ai:registry <url>" 'WARN'
        }
    } else {
        Add-Result 'dsh' '未安装' '没有 npm，无法安装 dsh CLI' 'WARN'
    }
}

# ---------------------------------------------------------------- 7 仓库
if ($WithRepo) {
    Write-Head '7/7 仓库 + compat profile'
    New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
    $repoDir = Join-Path $WorkDir 'dsh-plugin-kit'
    $gitPath = Get-CmdPath 'git'

    if (-not $gitPath) {
        Add-Result 'Repo' '克隆' '没有 git，跳过（先装 Git for Windows 再重跑 -WithRepo）' 'FAIL'
    } else {
        if (Test-Path (Join-Path $repoDir '.git')) {
            if ($PSCmdlet.ShouldProcess($repoDir, 'git pull --ff-only')) { & git -C $repoDir pull --ff-only }
        } elseif ($PSCmdlet.ShouldProcess($repoDir, 'git clone')) {
            & git clone --depth 1 $RepoUrl $repoDir
        }

        if (Test-Path (Join-Path $repoDir 'package.json')) {
            & git -C $repoDir config core.longpaths true
            Add-Result 'Repo' '仓库目录' $repoDir 'OK'

            if (Get-CmdPath 'pnpm') {
                Push-Location $repoDir
                try {
                    if ($PSCmdlet.ShouldProcess($repoDir, 'pnpm install')) { & pnpm install }
                    if ($PSCmdlet.ShouldProcess($repoDir, 'pnpm -r build')) { & pnpm -r build }
                    if ($PSCmdlet.ShouldProcess($repoDir, 'pnpm -r typecheck')) { & pnpm -r typecheck }
                    # link-dsh-runtime 让插件与宿主共用同一份 @deepseek-ai/*（否则仓库 .pnpm 里那套会造假象）
                    if ($PSCmdlet.ShouldProcess($repoDir, 'link-dsh-runtime --dry-run')) {
                        & node scripts/link-dsh-runtime.mjs --dry-run
                    }
                } finally {
                    Pop-Location
                }
                Add-Result 'Repo' '构建' 'pnpm install + build + typecheck 已执行' 'OK'
            } else {
                Add-Result 'Repo' '依赖' '没有 pnpm，跳过 install/build' 'FAIL'
            }

            if (Get-CmdPath 'dsh') {
                if ($PSCmdlet.ShouldProcess("profile $ProfileName", "dsh plugin add link:$repoDir")) {
                    & dsh plugin --profile $ProfileName add "link:$repoDir"
                    Write-Info '--- dsh --dump-config 校验 ---'
                    & dsh --profile $ProfileName --dump-config
                }
                Add-Result 'Repo' 'profile' "已挂载到 $ProfileName（注意：不要再同时装 @hyzyn/dsh-all 或任一子包，会 duplicate loader entry id）" 'OK'
            } else {
                Add-Result 'Repo' 'profile' '没有 dsh CLI，手工执行：dsh plugin --profile <name> add link:<repoDir>' 'WARN'
            }
        } else {
            Add-Result 'Repo' '克隆' "克隆后未找到 package.json：$repoDir" 'FAIL'
        }
    }
}

# ---------------------------------------------------------------- 报告
Write-Head '验证报告'
$script:Report | Format-Table -Property Status, Area, Item, Value -AutoSize | Out-String -Width 200 | Write-Host

$reportPath = Join-Path $WorkDir 'dsh-compat-report.txt'
try {
    New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
    $lines = @()
    $lines += 'DSH 插件兼容性测试环境报告'
    $lines += "生成时间   : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')"
    $lines += "主机       : $env:COMPUTERNAME ($arch, admin=$isAdmin)"
    $lines += "PowerShell : $($PSVersionTable.PSVersion)"
    $lines += "Node 方法  : $Method"
    $lines += ''
    foreach ($r in $script:Report) {
        $lines += ('[{0,-4}] {1,-10} {2,-26} {3}' -f $r.Status, $r.Area, $r.Item, $r.Value)
    }
    $lines += ''
    $lines += ("OK={0}  WARN={1}  FAIL={2}" -f ($script:Report.Count - $script:FailCount - $script:WarnCount), $script:WarnCount, $script:FailCount)
    [IO.File]::WriteAllLines($reportPath, $lines, (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "报告已写入：$reportPath"
} catch {
    Write-Warn "报告写入失败：$($_.Exception.Message)"
}

# ---------------------------------------------------------------- 下一步
Write-Head '下一步：真机兼容性测试'
$repoGuess = Join-Path $WorkDir 'dsh-plugin-kit'
Write-Host @"
  # 1) 开一个新终端（让 PATH 生效），确认工具链
  node -v ; npm -v ; npx -v ; pnpm -v ; dsh --version
  #    若报「无法加载文件 ...\pnpm.ps1，因为在此系统上禁止运行脚本」：
  #    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

  # 2) 拉仓库并构建（若刚才没加 -WithRepo）
  git clone https://github.com/hyzyn/dsh-plugin-kit.git "$repoGuess"
  cd "$repoGuess"
  pnpm install
  pnpm -r build

  # 3) 关键：让插件与宿主的 @deepseek-ai/* 同源，否则测出的是假象
  node scripts/link-dsh-runtime.mjs --dry-run
  node scripts/link-dsh-runtime.mjs

  # 4) 挂进干净 profile（不要用 web，避免污染）
  dsh plugin --profile $ProfileName add link:$repoGuess
  dsh --profile $ProfileName --dump-config
  dsh --profile $ProfileName web
  #    路径分隔符若不被接受，把 link:C:\... 换成 link:C:/... （正斜杠）再试

  # 5) 打开 设置 → 插件，逐张卡片点一遍；再跑三平台 CI：
  #    .github/workflows/ci.yml 的 workflow_dispatch 可只复跑某个用例
"@
Write-Host ''
Write-Host ('  汇总：OK={0}  WARN={1}  FAIL={2}' -f ($script:Report.Count - $script:FailCount - $script:WarnCount), $script:WarnCount, $script:FailCount) -ForegroundColor Cyan
if ($script:FailCount -gt 0) {
    Write-Bad '存在硬性失败项，环境还不足以跑兼容性测试。'
    exit 1
}
Write-Ok '环境就绪。'
exit 0
