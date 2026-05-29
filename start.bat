@echo off
REM quick launcher: starts the backend on :8000 and the frontend on :5173

echo Starting ReelRAG...

REM --- backend ---
cd backend
if not exist venv (
    echo Setting up Python venv...
    python -m venv venv
    call venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
)
start "ReelRAG Backend" cmd /k "venv\Scripts\activate && uvicorn main:app --reload --port 8000"
cd ..

REM --- frontend ---
cd frontend
if not exist node_modules (
    echo Installing npm packages...
    call npm install
)
start "ReelRAG Frontend" cmd /k "npm run dev"
cd ..

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo Docs:     http://localhost:8000/docs
echo.
pause
