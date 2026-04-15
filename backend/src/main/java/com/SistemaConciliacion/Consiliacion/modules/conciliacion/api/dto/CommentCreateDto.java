package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

/**
 * Cuerpo del comentario; texto obligatorio no vacío tras trim (validación en servicio).
 */
public record CommentCreateDto(String text) {
}
