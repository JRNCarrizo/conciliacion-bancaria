package com.SistemaConciliacion.Consiliacion.modules.auth.api.dto;

import java.time.Instant;

import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;

public record UserResponseDto(long id, String username, AppRole role, boolean enabled, Instant createdAt) {
}
