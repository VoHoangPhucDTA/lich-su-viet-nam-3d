param(
    [int]$Repeat = 1,
    [switch]$Keep
)
$ErrorActionPreference = 'Stop'
$arguments = @("$PSScriptRoot/run_ai_e2e.py", '--repeat', $Repeat)
if ($Keep) { $arguments += '--keep' }
python @arguments
exit $LASTEXITCODE
