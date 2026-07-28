param(
    [ValidateSet('local-check', 'preflight', 'migrate', 'postflight')]
    [string]$Mode = 'local-check',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$RunnerArguments
)

$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'tidb_production_migration.py'
$arguments = @($runner, '--mode', $Mode)
if ($RunnerArguments) {
    $arguments += $RunnerArguments
}

& python -I @arguments
exit $LASTEXITCODE
