package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

/**
 * Clasificación de un pendiente; {@code null} o vacío borra la clasificación.
 */
public record ClassificationUpdateDto(String classification) {
}
