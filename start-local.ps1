$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Run-Step {
    param([string]$Label, [string]$Program, [string[]]$Arguments)
    Write-Host "`n$Label" -ForegroundColor Cyan
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label (код $LASTEXITCODE)" }
}

try {
    $node = Get-Command node.exe -ErrorAction Stop
    $versionText = (& $node.Source --version).TrimStart('v')
    if ([version]$versionText -lt [version]'22.13.0') {
        throw 'Нужен Node.js версии 22.13.0 или новее.'
    }

    $corepack = Get-Command corepack.cmd -ErrorAction SilentlyContinue
    $pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
    if ($corepack) {
        $packageProgram = $corepack.Source
        $packagePrefix = @('pnpm')
    } elseif ($pnpm) {
        $packageProgram = $pnpm.Source
        $packagePrefix = @()
    } else {
        throw 'Не найден pnpm или corepack. Установите Node.js 22.13+ вместе с Corepack.'
    }

    $installMarker = '.sites-runtime/local-install-complete'
    $lockHash = (Get-FileHash -LiteralPath 'pnpm-lock.yaml' -Algorithm SHA256).Hash
    $installedHash = if (Test-Path -LiteralPath $installMarker) { (Get-Content -LiteralPath $installMarker -Raw).Trim() } else { '' }
    if ($installedHash -ne $lockHash -or -not (Test-Path -LiteralPath 'node_modules/vinext/dist/cli.js')) {
        Run-Step 'Устанавливаю зависимости (при первом запуске нужен интернет)...' $packageProgram ($packagePrefix + @('install', '--frozen-lockfile'))
        New-Item -ItemType Directory -Force -Path '.sites-runtime' | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $PSScriptRoot $installMarker), $lockHash)
    }

    if (-not (Test-Path -LiteralPath 'dist/server/wrangler.json')) {
        Run-Step 'Готовлю локальную базу...' $packageProgram ($packagePrefix + @('build'))
    }

    # IF NOT EXISTS сохраняет ранее созданные таблицы и записи при повторном запуске.
    New-Item -ItemType Directory -Force -Path '.wrangler' | Out-Null
    $migrationFiles = @('drizzle/0000_thankful_spitfire.sql', 'drizzle/0001_next_storm.sql', 'drizzle/0002_rapid_ben_grimm.sql')
    for ($i = 0; $i -lt $migrationFiles.Count; $i++) {
        $migration = Get-Content -LiteralPath $migrationFiles[$i] -Raw
        $migration = $migration.Replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ').Replace('CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS ')
        $migrationFile = Join-Path $PSScriptRoot ".wrangler/local-schema-$i.sql"
        [System.IO.File]::WriteAllText($migrationFile, $migration, [System.Text.UTF8Encoding]::new($false))
        Run-Step 'Проверяю таблицы...' $node.Source @('--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', '.wrangler/state', '--file', $migrationFile)
    }

    # Use the computer's date: the SQLite worker may use UTC even on Windows.
    $todayKey = Get-Date -Format 'yyyy-MM-dd'
    $todoBackfillFile = Join-Path $PSScriptRoot '.wrangler/local-todo-backfill.sql'
    $todoBackfill = "INSERT OR IGNORE INTO todo_dates (todo_id, date) SELECT id, '$todayKey' FROM todos;"
    [System.IO.File]::WriteAllText($todoBackfillFile, $todoBackfill, [System.Text.UTF8Encoding]::new($false))
    Run-Step 'Привязываю прежние дела к дате...' $node.Source @('--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--config', 'dist/server/wrangler.json', '--persist-to', '.wrangler/state', '--file', $todoBackfillFile)

    $url = 'http://localhost:5173/'
    Start-Job -ArgumentList $url -ScriptBlock {
        param($targetUrl)
        for ($i = 0; $i -lt 180; $i++) {
            $socket = New-Object System.Net.Sockets.TcpClient
            try {
                $socket.Connect('localhost', 5173)
                Start-Process $targetUrl
                return
            } catch {
                Start-Sleep -Seconds 1
            } finally {
                $socket.Dispose()
            }
        }
    } | Out-Null

    Write-Host "`nДневник откроется в браузере. Для остановки нажмите Ctrl+C." -ForegroundColor Green
    Run-Step 'Запускаю сервер...' $packageProgram ($packagePrefix + @('dev'))
} catch {
    Write-Host "`nОшибка: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
