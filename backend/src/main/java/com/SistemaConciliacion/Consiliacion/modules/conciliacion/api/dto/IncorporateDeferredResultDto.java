package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.util.List;

public record IncorporateDeferredResultDto(int addedCount, List<String> warnings,
		List<DeferredMovementDto> incorporated) {
}
