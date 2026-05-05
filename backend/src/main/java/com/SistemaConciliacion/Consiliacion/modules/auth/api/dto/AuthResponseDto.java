package com.SistemaConciliacion.Consiliacion.modules.auth.api.dto;

import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;

public record AuthResponseDto(String token, String tokenType, String username, AppRole role, long userId) {
	public static AuthResponseDto of(String token, String username, AppRole role, long userId) {
		return new AuthResponseDto(token, "Bearer", username, role, userId);
	}
}
