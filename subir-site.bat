@echo off
echo ============================================== > "C:\Users\joaob\.gemini\antigravity\scratch\MedStudy\push.log"
echo   Iniciando push >> "C:\Users\joaob\.gemini\antigravity\scratch\MedStudy\push.log"
echo ============================================== >> "C:\Users\joaob\.gemini\antigravity\scratch\MedStudy\push.log"
set "PATH=C:\Users\joaob\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd;C:\Users\joaob\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\mingw64\bin;%PATH%"
cd /d "C:\Users\joaob\.gemini\antigravity\scratch\MedStudy"

git push origin main >> "C:\Users\joaob\.gemini\antigravity\scratch\MedStudy\push.log" 2>&1
echo Codigo de saida: %ERRORLEVEL% >> "C:\Users\joaob\.gemini\antigravity\scratch\MedStudy\push.log"
