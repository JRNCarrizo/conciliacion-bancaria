package com.SistemaConciliacion.Consiliacion.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Directorio base para adjuntos (comprobantes). Se crea al arrancar si no existe.
 * <p>
 * Por defecto: {@code ${user.home}/.conciliacion-bancaria/uploads} — siempre escribible al ejecutar el
 * JAR. Sobrescribir con {@code APP_UPLOAD_BASE_DIR} o {@code app.upload.base-dir}.
 */
@ConfigurationProperties(prefix = "app.upload")
public record UploadProperties(String baseDir) {
}
