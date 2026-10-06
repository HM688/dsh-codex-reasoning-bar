# 一键把这个插件推到你的 Git 仓库（GitHub / Gitee 都适用）
#
# 用法（在【普通 PowerShell 窗口 / Windows Terminal】里执行，不要用 ISE）：
#   powershell -ExecutionPolicy Bypass -File ".\push-to-git.ps1"
#   或直接带远程地址：
#   powershell -ExecutionPolicy Bypass -File ".\push-to-git.ps1" -Remote https://gitee.com/你的用户名/dsh-codex-reasoning-bar.git
#
# 脚本会：找 git → 检查身份 → 检查网络 → 初始化仓库 → 提交 → 加 remote → 推送

param(
    [string]$Remote = ""
)

$ErrorActionPreference = 'Stop'

if ([Console]::IsOutputRedirected) {
    try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
}

if ($host.Name -like '*ISE*') {
    Write-Host ""
    Write-Host "请不要在 Windows PowerShell ISE 里运行本脚本（中文会乱码，且无法交互）。" -ForegroundColor Red
    Write-Host "请按 Win 键搜索 PowerShell 或 终端 (Windows Terminal) 打开后再跑。" -ForegroundColor Yellow
    Write-Host ""
    return
}

$repo = $PSScriptRoot

function Find-Git {
    $cmd = Get-Command git -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $cands = @(
        "C:\Program Files\Git\cmd\git.exe",
        "C:\Program Files (x86)\Git\cmd\git.exe",
        "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe",
        "$env:LOCALAPPDATA\Programs\PortableGit\cmd\git.exe"
    )
    foreach ($c in $cands) { if (Test-Path $c) { return $c } }
    return $null
}

function Test-Host443([string]$HostName) {
    try {
        $client = New-Object Net.Sockets.TcpClient
        $task = $client.ConnectAsync($HostName, 443)
        $ok = $task.Wait(6000) -and $client.Connected
        $client.Close()
        return $ok
    } catch { return $false }
}

Write-Host ""
Write-Host "[1/6] 查找 git ..." -ForegroundColor Cyan
$git = Find-Git
if (-not $git) {
    Write-Host ""
    Write-Host "本机没有安装 git，推不了仓库。" -ForegroundColor Red
    Write-Host "从国内镜像下载安装（比官网快得多）：" -ForegroundColor Yellow
    Write-Host "  https://registry.npmmirror.com/-/binary/git-for-windows/" -ForegroundColor White
    Write-Host "  选最新的 Git-<版本>-64-bit.exe；也可以用 PortableGit-<版本>-64-bit.7z.exe（免管理员）。" -ForegroundColor White
    Write-Host "装完**重开一个** PowerShell 窗口再跑本脚本（PATH 才会生效）。" -ForegroundColor White
    Write-Host ""
    return
}
Write-Host "  git: $git" -ForegroundColor Green
# 便携版 Git 不在系统 PATH 上：把它自己的 cmd 和 ucrt64\bin 加进本会话 PATH。
# 不加的话 Git Credential Manager 会因为找不到依赖 DLL 而起不来，push 时无法登录。
$gitRoot = Split-Path (Split-Path $git -Parent) -Parent
foreach ($sub in @("cmd", "ucrt64\bin", "mingw64\bin")) {
    $p = Join-Path $gitRoot $sub
    if (Test-Path $p) { $env:PATH = "$p;$env:PATH" }
}

Write-Host ""
Write-Host "[2/6] 检查提交身份 ..." -ForegroundColor Cyan
$name = & $git config --global user.name
$email = & $git config --global user.email
for ($try = 0; -not $name -and $try -lt 3; $try++) { $name = Read-Host "  你的 Git 用户名（会写进提交记录，不能为空）"; if ($name) { & $git config --global user.name $name } }
if (-not $name) { throw "没有填用户名，退出（可以先用 git config --global user.name 设好再重跑）" }
for ($try = 0; -not $email -and $try -lt 3; $try++) { $email = Read-Host "  你的邮箱（会写进提交记录，不能为空）"; if ($email) { & $git config --global user.email $email } }
if (-not $email) { throw "没有填邮箱，退出（可以先用 git config --global user.email 设好再重跑）" }
Write-Host "  $name <$email>" -ForegroundColor Green

if (-not $Remote) {
    Write-Host ""
    Write-Host "[3/6] 远程仓库地址" -ForegroundColor Cyan
    Write-Host "  先在网页上建一个空仓库（不要勾选 README/.gitignore/LICENSE），然后粘贴地址：" -ForegroundColor White
    Write-Host "    Gitee  : https://gitee.com/<用户名>/dsh-codex-reasoning-bar.git" -ForegroundColor DarkGray
    Write-Host "    GitHub : https://github.com/<用户名>/dsh-codex-reasoning-bar.git" -ForegroundColor DarkGray
    $Remote = Read-Host "  远程地址"
}
if (-not $Remote) { throw "没有远程地址，退出" }

Write-Host ""
Write-Host "[4/6] 检查网络（$Remote 的主机）..." -ForegroundColor Cyan
$hostName = ([Uri]$Remote).Host
if (-not (Test-Host443 $hostName)) {
    Write-Host ""
    Write-Host "连不上 $hostName:443 —— 推上去一定会失败，先解决网络。" -ForegroundColor Red
    Write-Host "  · Gitee 本机实测直连可用，换 Gitee 最省事；" -ForegroundColor Yellow
    Write-Host "  · GitHub 需要代理，可给 git 单独配：" -ForegroundColor Yellow
    Write-Host "      git config --global http.proxy  http://127.0.0.1:<端口>" -ForegroundColor White
    Write-Host "      git config --global https.proxy http://127.0.0.1:<端口>" -ForegroundColor White
    Write-Host "  · 注意 ghproxy 这类加速只支持下载，不支持 push。" -ForegroundColor Yellow
    Write-Host ""
    $go = Read-Host "仍然继续尝试推送吗？(y/N)"
    if ($go -notin @('y', 'Y')) { return }
} else {
    Write-Host "  $hostName:443 可达" -ForegroundColor Green
}

Push-Location $repo
try {
    Write-Host ""
    Write-Host "[5/6] 初始化并提交 ..." -ForegroundColor Cyan
    if (-not (Test-Path (Join-Path $repo ".git"))) { & $git init | Out-Null; Write-Host "  已 git init" }
    & $git branch -M main 2>$null
    & $git add -A
    Write-Host "  将要提交的文件：" -ForegroundColor White
    & $git status --short
    & $git commit -m "feat: CodeX 一样的推理等级调整条 (dsh-codex-reasoning-bar v1.0.0)" | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Host "  （没有新改动可提交，继续）" -ForegroundColor DarkGray }

    Write-Host ""
    Write-Host "[6/6] 推送 ..." -ForegroundColor Cyan
    $existing = & $git remote get-url origin 2>$null
    if ($existing) { & $git remote set-url origin $Remote } else { & $git remote add origin $Remote }
    & $git push -u origin main
    if ($LASTEXITCODE -ne 0) { throw "推送失败（看上面的 git 报错：认证、网络、或远程仓库非空）" }

    Write-Host ""
    Write-Host "推送成功！" -ForegroundColor Green
    Write-Host "  在 DSH 里安装（plugin_manager → install_bundle，target 填）：" -ForegroundColor Green
    Write-Host "    $Remote" -ForegroundColor White
    Write-Host "  提示：只有 GitHub 源会被 git ls-remote 预检，Gitee 等会跳过。" -ForegroundColor DarkGray
}
finally { Pop-Location }
