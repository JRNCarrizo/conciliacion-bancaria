package com.SistemaConciliacion.Consiliacion.modules.auth.api.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
		@NotBlank String username,
		@NotBlank String password) {
}
