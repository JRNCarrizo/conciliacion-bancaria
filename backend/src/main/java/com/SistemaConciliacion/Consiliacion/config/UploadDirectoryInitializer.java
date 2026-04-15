package com.SistemaConciliacion.Consiliacion.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Garantiza que exista el directorio configurado para adjuntos antes de aceptar subidas.
 */
@Component
@Order(0)
public class UploadDirectoryInitializer implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(UploadDirectoryInitializer.class);

	private final UploadProperties uploadProperties;

	public UploadDirectoryInitializer(UploadProperties uploadProperties) {
		this.uploadProperties = uploadProperties;
	}

	@Override
	public void run(ApplicationArguments args) throws IOException {
		String raw = uploadProperties.baseDir();
		if (raw == null || raw.isBlank()) {
			throw new IllegalStateException(
					"app.upload.base-dir no está definido; revisá application.yml o APP_UPLOAD_BASE_DIR.");
		}
		Path base = Path.of(raw.trim()).toAbsolutePath().normalize();
		Files.createDirectories(base);
		if (!Files.isWritable(base)) {
			throw new IllegalStateException("Sin permiso de escritura en el directorio de adjuntos: " + base);
		}
		log.info("Adjuntos: carpeta base lista en {}", base);
	}
}
