# Conciliación bancaria — cómo ejecutar el sistema en tu computadora

Guía para quien recibe el **JAR** y quiere dejar la aplicación funcionando en Windows (ajustá los comandos si usás Linux o macOS).

---

## 1. Requisitos

| Componente | Versión / notas |
|------------|------------------|
| **Java** | **21** (JDK o JRE). La aplicación no arranca con versiones anteriores. |
| **MySQL** | **8.x** recomendado. El servicio debe estar **en ejecución** antes de levantar el JAR. |
| **Puerto** | Por defecto **8080** (navegador: `http://localhost:8080`). Si está ocupado, ver [Puerto 8080 en uso](#7-puerto-8080-en-uso). |

---

## 2. Instalar y comprobar Java 21

1. Descargá e instalá **Java 21** desde el sitio de **Eclipse Temurin**, **Oracle JDK** u otra distribución compatible.
2. Abrí **Símbolo del sistema** o **PowerShell** y ejecutá:

```bat
java -version
```

Deberías ver algo como `openjdk version "21.x.x"` o `java version "21.x.x"`. Si dice otra versión mayor (por ejemplo 17), instalá el 21 y revisá el **PATH** del sistema.

Para ver si el ejecutable está en el PATH:

```bat
where java
```

---

## 3. Instalar MySQL y el servicio

1. Instalá **MySQL Server** (el instalador oficial o MySQL Installer para Windows).
2. Durante la instalación definí la contraseña del usuario **`root`** (en esta guía usamos **`123456`** como ejemplo; en producción usá una contraseña fuerte).
3. Asegurate de que el servicio **MySQL** esté **Iniciado** (Administrador de tareas → Servicios, o `services.msc`).

Comprobar que el cliente responde (pedirá la contraseña de root):

```bat
mysql --version
mysql -u root -p -e "SELECT VERSION();"
```

---

## 4. Crear la base de datos

La aplicación espera por defecto una base llamada **`conciliacion`** (vacía). Las tablas las crea **Flyway** al primer arranque.

Entrá a MySQL como root:

```bat
mysql -u root -p
```

Ejecutá:

```sql
CREATE DATABASE IF NOT EXISTS conciliacion
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
EXIT;
```

El usuario **`root`** debe poder conectarse desde `localhost` con la contraseña que configuraste (ej. `123456`).

---

## 5. Variables de entorno que usa el JAR

Con el perfil por defecto (**`mysql`**), la conexión se arma con variables de entorno. Si no las definís, valen los **defaults** del proyecto (coinciden con el ejemplo):

| Variable | Ejemplo | Descripción |
|----------|---------|-------------|
| `MYSQL_HOST` | `localhost` | Donde corre MySQL |
| `MYSQL_PORT` | `3306` | Puerto del servidor MySQL |
| `MYSQL_DATABASE` | `conciliacion` | Nombre de la base |
| `MYSQL_USER` | `root` | Usuario |
| `MYSQL_PASSWORD` | `123456` | Contraseña |
| `JWT_SECRET` | cadena **≥ 32 caracteres** | Secreto para firmar tokens; **cambiá el valor de ejemplo en entornos reales** |

Opcional:

| Variable | Descripción |
|----------|-------------|
| `APP_UPLOAD_BASE_DIR` | Carpeta donde guardar adjuntos (si no, usa una carpeta bajo el usuario). |

---

## 6. Cómo ejecutar el sistema

### Opción A — Script `distribucion\iniciar.bat`

1. Copiá el archivo **`Consiliacion-Bancaria-0.0.1-SNAPSHOT.jar`** en la misma carpeta que **`iniciar.bat`** (por ejemplo la carpeta `distribucion` del proyecto, o una carpeta que armes para la empresa).
2. Editá **`iniciar.bat`** si tu contraseña de MySQL, nombre del JAR o variables no coinciden con los valores por defecto.
3. Hacé doble clic en **`iniciar.bat`** o ejecutalo desde la consola.

El script define `MYSQL_*`, `JWT_SECRET` y ejecuta:

```bat
java -jar "Consiliacion-Bancaria-0.0.1-SNAPSHOT.jar"
```

### Opción B — Línea de comandos

En la carpeta donde está el JAR:

```bat
set MYSQL_PASSWORD=123456
set JWT_SECRET=tu-frase-secreta-de-al-menos-treinta-y-dos-caracteres
java -jar Consiliacion-Bancaria-0.0.1-SNAPSHOT.jar
```

### Abrir la aplicación

En el navegador: **http://localhost:8080**

La primera vez puede hacer falta el flujo de **usuario inicial** / login según cómo esté cargada la base.

### Otras PCs en la red local

- Permití **TCP entrante** en el **firewall de Windows** para el puerto **8080** (o el que uses).
- Desde otra máquina: **http://IP_DE_ESTA_PC:8080**

---

## 7. Puerto 8080 en uso

Si el log dice que **el puerto 8080 ya está en uso**, cerrá la otra aplicación que lo usa o arrancá en otro puerto:

```bat
java -jar Consiliacion-Bancaria-0.0.1-SNAPSHOT.jar --server.port=9080
```

Y entrá a **http://localhost:9080**.

---

## 8. Generar el JAR desde el código (desarrolladores)

En la máquina de desarrollo, con **Maven** y (para incluir la web en el JAR) **Node** para el build del frontend:

```bat
cd frontend
npm install
npm run build

cd ..\backend
mvnw.cmd clean package -DskipTests
```

El artefacto queda en:

`backend\target\Consiliacion-Bancaria-0.0.1-SNAPSHOT.jar`

Para empaquetar sin reconstruir el frontend:

```bat
mvnw.cmd clean package -DskipTests -Dskip.frontend.build=true
```

---

## 9. Seguridad (importante)

- No subas a repositorios públicos archivos con **contraseñas reales** (`iniciar.bat` con credenciales, etc.).
- Cambiá **`JWT_SECRET`** por un valor largo y aleatorio en cualquier entorno que no sea prueba local.
- La contraseña **`123456`** es solo ejemplo de documentación; en producción usá credenciales fuertes y usuarios dedicados en MySQL si corresponde.
