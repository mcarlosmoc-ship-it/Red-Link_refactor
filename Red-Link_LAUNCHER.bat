@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem =============================================================
rem   Red-Link - Full launcher (frontend + backend)
rem   Run this file with a double click to prepare dependencies,
rem   run quick checks and start both services in their own windows.
rem =============================================================

title Red-Link - Full launcher
cd /d "%~dp0"
set "PROJECT_DIR=%cd%"
set "BACKEND_DIR=%PROJECT_DIR%\backend"
set "VENV_DIR=%BACKEND_DIR%\.venv"
set "VENV_PYTHON=%VENV_DIR%\Scripts\python.exe"
set "VENV_PIP=%VENV_DIR%\Scripts\pip.exe"
set "VENV_ACTIVATE=%VENV_DIR%\Scripts\activate.bat"
set "WARNINGS="

call :banner
call :log_info "Project directory: %PROJECT_DIR%"

call :require_command npm "npm was not found. Install Node.js from https://nodejs.org/ before continuing."
if errorlevel 1 goto :fail

call :require_command python "Python was not found in PATH. Install Python 3.10+ from https://www.python.org/downloads/ and run this script again."
if errorlevel 1 goto :fail

call :require_file "%PROJECT_DIR%\package.json" "package.json is missing. Make sure you run this script inside the cloned repository."
if errorlevel 1 goto :fail

call :require_file "%BACKEND_DIR%\requirements.txt" "backend\\requirements.txt is missing. Verify that the repository was fully downloaded."
if errorlevel 1 goto :fail

if not exist "%PROJECT_DIR%\.env.local" (
    if exist "%PROJECT_DIR%\.env.example" (
        call :log_info ".env.local is missing. Creating an initial copy from .env.example ..."
        copy /Y "%PROJECT_DIR%\.env.example" "%PROJECT_DIR%\.env.local" >nul
        if errorlevel 1 (
            call :log_error "Could not copy .env.example to .env.local. Please copy it manually."
        ) else (
            call :log_warn ".env.local was created automatically. Edit VITE_API_BASE_URL so it points to your backend."
        )
    ) else (
        call :log_warn ".env.local is missing. Copy .env.example to .env.local and adjust VITE_API_BASE_URL for your backend."
    )
)

call :setup_backend
if errorlevel 1 goto :fail

call :setup_frontend
if errorlevel 1 goto :fail

call :run_checks

call :launch_services
if errorlevel 1 goto :fail

call :summary

goto :end

:fail
echo.
call :log_error "Errors prevented the automatic setup from finishing. Review the messages above for more details."
echo.
pause
exit /b 1

:end
echo.
call :log_info "Process completed. You may close this window after reviewing the messages."
echo.
pause
exit /b 0

:banner
echo =============================================================
echo   Red-Link - Setup and launch assistant
echo =============================================================
exit /b 0

:log_info
call :_log "INFO" %*
exit /b 0

:log_warn
call :_log "WARN" %*
exit /b 0

:log_error
call :_log "ERROR" %*
exit /b 0

:log_success
call :_log "SUCCESS" %*
exit /b 0

:_log
setlocal EnableExtensions EnableDelayedExpansion
set "LEVEL=%~1"
shift
set "MESSAGE="
:_log_collect
if "%~1"=="" goto :_log_print
if defined MESSAGE (
    set "MESSAGE=!MESSAGE! %~1"
) else (
    set "MESSAGE=%~1"
)
shift
goto :_log_collect

:_log_print
if /I "%LEVEL%"=="ERROR" (
    echo [ERROR] !MESSAGE!
) else if /I "%LEVEL%"=="WARN" (
    echo [WARNING] !MESSAGE!
) else if /I "%LEVEL%"=="SUCCESS" (
    echo [OK] !MESSAGE!
) else (
    echo [%LEVEL%] !MESSAGE!
)
endlocal
exit /b 0

:require_command
where %~1 >nul 2>nul
if errorlevel 1 (
    call :log_error "%~2"
    exit /b 1
)
exit /b 0

:require_file
if not exist "%~1" (
    call :log_error "%~2"
    exit /b 1
)
exit /b 0

:setup_backend
call :log_info "Preparing backend (FastAPI)..."
pushd "%BACKEND_DIR%" >nul

if not exist "%VENV_PYTHON%" (
    call :log_info "Creating virtual environment in backend\.venv ..."
    python -m venv .venv
    if errorlevel 1 (
        popd >nul
        call :log_error "The virtual environment could not be created. Check your Python installation."
        exit /b 1
    )
    call :log_success "Virtual environment created successfully."
) else (
    call :log_info "Existing virtual environment detected."
)

if not exist "%VENV_PIP%" (
    popd >nul
    call :log_error "pip was not found inside the virtual environment. Try deleting backend\.venv and run the script again."
    exit /b 1
)

call :log_info "Upgrading pip..."
call "%VENV_PYTHON%" -m pip install --upgrade pip
if errorlevel 1 (
    popd >nul
    call :log_error "pip upgrade failed in the virtual environment."
    exit /b 1
)

call :log_info "Installing backend dependencies..."
call "%VENV_PIP%" install -r requirements.txt
if errorlevel 1 (
    popd >nul
    call :log_error "Backend dependency installation failed."
    exit /b 1
)

call :log_info "Applying database migrations with Alembic..."
call "%VENV_PYTHON%" -m alembic -c alembic.ini upgrade head
if errorlevel 1 (
    popd >nul
    call :log_error "Alembic migrations failed. Check DATABASE_URL or database permissions."
    exit /b 1
)

popd >nul
call :log_success "Backend ready."
exit /b 0

:setup_frontend
call :log_info "Preparing frontend (Vite + React)..."
pushd "%PROJECT_DIR%" >nul
if not exist "node_modules" (
    call :log_info "Installing Node dependencies (npm install)..."
    call npm install
    if errorlevel 1 (
        popd >nul
        call :log_error "npm install failed. Check your internet connection or permissions."
        exit /b 1
    )
) else (
    call :log_info "Node dependencies detected (node_modules)."
)
popd >nul
call :log_success "Frontend ready."
exit /b 0

:run_checks
call :log_info "Running quick checks (lint and tests)..."
pushd "%PROJECT_DIR%" >nul
call npm run lint
if errorlevel 1 (
    set "WARNINGS=1"
    call :log_warn "npm run lint reported problems. Fix ESLint errors before committing changes."
) else (
    call :log_success "Frontend lint completed without errors."
)

call npm run test -- --run
if errorlevel 1 (
    set "WARNINGS=1"
    call :log_warn "Frontend tests (Vitest) failed. Review the previous messages."
) else (
    call :log_success "Frontend tests completed successfully."
)
popd >nul

pushd "%BACKEND_DIR%" >nul
call "%VENV_PYTHON%" -m pytest
if errorlevel 1 (
    set "WARNINGS=1"
    call :log_warn "Backend tests (pytest) reported errors."
) else (
    call :log_success "Backend tests completed successfully."
)
popd >nul
exit /b 0

:launch_services
call :log_info "Starting services in separate windows..."
if exist "%VENV_ACTIVATE%" (
    start "Red-Link Backend" cmd /k "cd /d \"%BACKEND_DIR%\" && call \"%VENV_ACTIVATE%\" && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
) else (
    start "Red-Link Backend" cmd /k "cd /d \"%BACKEND_DIR%\" && python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
)
if errorlevel 1 (
    call :log_error "Backend window could not be started."
    exit /b 1
)

start "Red-Link Frontend" cmd /k "cd /d \"%PROJECT_DIR%\" && npm run dev"
if errorlevel 1 (
    call :log_error "Frontend window could not be started."
    exit /b 1
)

start "" "http://localhost:5173/"
call :log_success "Services started. Attempted to open http://localhost:5173/ in your default browser."
exit /b 0

:summary
echo.
call :log_info "Launcher summary:"
if defined WARNINGS (
    call :log_warn "Warnings were detected during the checks. Review the windows for more details."
) else (
    call :log_success "No issues were detected by the automatic checks."
)

echo    - Backend: http://localhost:8000
call :log_info "    - Frontend: http://localhost:5173"
call :log_info "To stop the services, close the opened windows or press CTRL+C inside each one."
exit /b 0
