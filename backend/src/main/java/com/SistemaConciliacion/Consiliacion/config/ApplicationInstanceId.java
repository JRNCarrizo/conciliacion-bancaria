package com.SistemaConciliacion.Consiliacion.config;

import java.util.UUID;

import org.springframework.stereotype.Component;

/**
 * Identificador único por proceso JVM. Sirve para que el front invalide sesiones guardadas
 * cuando se reinicia el servidor (nuevo UUID).
 */
@Component
public class ApplicationInstanceId {

	private final String id = UUID.randomUUID().toString();

	public String getId() {
		return id;
	}
}
