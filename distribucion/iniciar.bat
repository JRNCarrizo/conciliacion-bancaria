@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

REM Colocá en esta misma carpeta el JAR generado:
REM   backend\target\Consiliacion-Bancaria-0.0.1-SNAPSHOT.jar
REM y renombralo si querés; ajustá el nombre en la línea "set JAR=..." abajo.

set "JAR=Consiliacion-Bancaria-0.0.1-SNAPSHOT.jar"
if not exist "%JAR%" (
  echo No se encuentra %JAR% en esta carpeta.
  pause
  exit /b 1
)

REM --- MySQL (misma PC que el JAR o host/puerto que corresponda) ---
set "MYSQL_HOST=localhost"
set "MYSQL_PORT=3306"
set "MYSQL_DATABASE=conciliacion"
set "MYSQL_USER=root"
set "MYSQL_PASSWORD=123456"

REM --- Obligatorio en red real: secreto largo ^(minimo 32 caracteres^) ---
set "JWT_SECRET=cambiar-por-un-secreto-largo-de-al-menos-treinta-y-dos-caracteres"

REM Opcional: carpeta de adjuntos ^(si no, usa el directorio por defecto del usuario^)
REM set "APP_UPLOAD_BASE_DIR=C:\Conciliacion\uploads"

echo Iniciando conciliacion...
java -jar "%JAR%" %*
set "EXIT=!ERRORLEVEL!"
if not "!EXIT!"=="0" echo Salida con codigo !EXIT!
pause
exit /b !EXIT!
