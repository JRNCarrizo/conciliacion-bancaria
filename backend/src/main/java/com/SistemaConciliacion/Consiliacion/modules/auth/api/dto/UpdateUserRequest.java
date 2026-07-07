package com.SistemaConciliacion.Consiliacion.modules.auth.api.dto;

import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;

public record UpdateUserRequest(AppRole role, Boolean enabled) {
}
