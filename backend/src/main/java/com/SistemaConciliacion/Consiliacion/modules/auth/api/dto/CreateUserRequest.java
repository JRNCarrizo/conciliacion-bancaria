package com.SistemaConciliacion.Consiliacion.modules.auth.api.dto;

import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
		@NotBlank @Size(min = 2, max = 128) String username,
		@NotBlank @Size(min = 8, max = 128) String password,
		@NotNull AppRole role) {
}
