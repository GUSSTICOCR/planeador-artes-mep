@echo off
TITLE Art Lesson Planner IA - MEP 2026
echo ======================================================
echo           ART LESSON PLANNER - GEMINI IA
echo ======================================================
echo.
echo [1/2] Abriendo el navegador...
start http://127.0.0.1:3000/galeria.html
echo.
echo [2/2] Iniciando el servidor Node.js...
echo       (No cierres esta ventana mientras uses la app)
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo ERROR: El servidor se detuvo o Node.js no esta instalado.
    pause
)
