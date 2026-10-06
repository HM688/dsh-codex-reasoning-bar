# 一键注册/登录并发布 dsh-codex-reasoning-bar 到 npm
#
# 为什么需要这个脚本：
#   1. 有些机器上 node / npm 不在 PATH 里，只有 DeepSeek Harness 自带的一套运行时；
#   2. www.npmjs.com 网站在国内常被拦截（实测返回 403），但注册和发布用的
#      registry.npmjs.org API 是通的（实测 /-/ping 返回 200）——所以全程走命令行即可，
#      不需要打开任何网页。
#
# 用法（在【普通 PowerShell 窗口 / Windows Terminal】里执行，不要用 ISE）：
#   powershell -ExecutionPolicy Bypass -File ".\publish-to-npm.ps1"

$ErrorActionPreference = 'Stop'

# 只有在输出被重定向（管道 / 文件）时才改编码。真实控制台里 PowerShell 用的是
# Unicode 控制台 API，此时改编码反而会让中文全变成乱码。
$redirected = $false
try { $redirected = [Console]::IsOutputRedirected } catch { $redirected = $false }
if ($redirected) {
    try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
}

# Windows PowerShell ISE 不是真正的控制台：它会把中文显示成乱码，而且无法承载
# pnpm adduser 这种需要键盘交互的子进程（会卡死）。直接劝退，省得白折腾。
if ($host.Name -like '*ISE*') {
    Write-Host ""
    Write-Host "请不要在 Windows PowerShell ISE 里运行本脚本。" -ForegroundColor Red
    Write-Host "  ISE garbles non-ASCII output and cannot host the interactive" -ForegroundColor Red
    Write-Host "  'pnpm adduser' prompt, so it would hang here." -ForegroundColor Red
    Write-Host ""
    Write-Host "请改用普通 PowerShell 窗口或 Windows Terminal：" -ForegroundColor Yellow
    Write-Host "  1) 按 Win 键，搜索 PowerShell 或 终端 (Windows Terminal)，打开；" -ForegroundColor Yellow
    Write-Host "  2) 切到本脚本所在目录，然后执行：" -ForegroundColor Yellow
    Write-Host ('     cd "' + $PSScriptRoot + '"') -ForegroundColor White
    Write-Host '     powershell -ExecutionPolicy Bypass -File ".\publish-to-npm.ps1"' -ForegroundColor White
    Write-Host ""
    return
}

# 定位 DSH 自带的运行时（不写死用户名：优先用 DSH_HOME，否则退回 ~/.dsh）
$dshHome = $env:DSH_HOME
if (-not $dshHome) { $dshHome = Join-Path $env:USERPROFILE ".dsh" }
$runtime = Join-Path $dshHome "dsh-runtimes\dsh-primary-runtime\dependencies"
$node = Join-Path $runtime "node\bin\node.exe"
$pnpm = Join-Path $runtime "pnpm\bin\pnpm.mjs"
$pkg = $PSScriptRoot   # 仓库根就是包根

if (-not (Test-Path $node)) { throw "找不到内置 node：$node（可用 -Node 参数或直接改这个脚本）" }
if (-not (Test-Path $pnpm)) { throw "找不到内置 pnpm：$pnpm" }
if (-not (Test-Path (Join-Path $pkg "package.json"))) { throw "找不到 package.json" }

Push-Location $pkg
try {
    Write-Host ""
    Write-Host "[1/4] 检查 npm 登录状态 ..." -ForegroundColor Cyan
    & $node $pnpm whoami
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "尚未登录 npm。" -ForegroundColor Yellow
        Write-Host "注意：www.npmjs.com 网页在国内常被拦截（实测 403），但你不需要打开它——" -ForegroundColor Yellow
        Write-Host "注册和发布走的都是 registry.npmjs.org 的 API（实测可达），命令行就能全部搞定。" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "接下来会依次要求输入：用户名 / 密码 / 邮箱，然后 npm 会往邮箱发一次性验证码。" -ForegroundColor White
        Write-Host "如果用户名已被占用，换一个即可；邮箱必须能收信。" -ForegroundColor White
        Write-Host ""
        $answer = Read-Host "现在开始注册 / 登录？(y/N)"
        if ($answer -notin @('y', 'Y')) { Write-Host "已取消，什么都没做。" -ForegroundColor Yellow; return }

        & $node $pnpm adduser
        if ($LASTEXITCODE -ne 0) { throw "注册 / 登录失败（用户名被占用、密码太弱、邮箱收不到验证码都可能）" }

        & $node $pnpm whoami
        if ($LASTEXITCODE -ne 0) { throw "看起来登录没有成功，请重跑一次本脚本" }
        Write-Host "登录成功。" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "[2/4] 试运行（不会真的上传）..." -ForegroundColor Cyan
    & $node $pnpm publish --dry-run --no-git-checks
    if ($LASTEXITCODE -ne 0) { throw "试运行失败，先修好再发布" }

    Write-Host ""
    Write-Host "[3/4] 正式发布" -ForegroundColor Cyan
    $answer = Read-Host "确认把 dsh-codex-reasoning-bar 发布到 registry.npmjs.org 吗？(y/N)"
    if ($answer -notin @('y', 'Y')) { Write-Host "已取消，什么都没上传。" -ForegroundColor Yellow; return }

    & $node $pnpm publish --no-git-checks
    if ($LASTEXITCODE -ne 0) { throw "发布失败（常见原因：包名已被占用、邮箱未验证、需要 2FA 一次性验证码）" }

    Write-Host ""
    Write-Host "[4/4] 发布成功！" -ForegroundColor Green
    Write-Host "  - 触发一次国内镜像同步（点一下，几秒后国内即可安装）：" -ForegroundColor Green
    Write-Host "    https://npmmirror.com/sync/dsh-codex-reasoning-bar" -ForegroundColor Green
    Write-Host "  - 之后在 DSH 插件页安装时，target 直接填包名 dsh-codex-reasoning-bar" -ForegroundColor Green
    Write-Host ""
    Write-Host "注：npm 允许在 72 小时内撤销发布（npm unpublish），之后版本号不能重用。" -ForegroundColor DarkGray
}
finally { Pop-Location }
