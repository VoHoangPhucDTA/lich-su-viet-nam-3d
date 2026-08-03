@echo off
setlocal
python -I "%~dp0tidb_production_migration.py" %*
exit /b %ERRORLEVEL%
