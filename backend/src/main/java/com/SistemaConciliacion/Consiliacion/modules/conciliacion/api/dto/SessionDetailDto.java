package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.util.List;

public record SessionDetailDto(SessionHeaderDto session, List<MovimientoDto> bankTransactions,
		List<MovimientoDto> companyTransactions, List<MovimientoDto> unmatchedBankTransactions,
		List<MovimientoDto> unmatchedCompanyTransactions, List<ParDto> pairs, ConciliacionStatsDto stats) {
}
