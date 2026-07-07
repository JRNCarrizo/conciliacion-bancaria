package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.util.List;

public record CreateReconciliationGroupRequestDto(List<Long> bankTransactionIds, List<Long> companyTransactionIds) {
}
