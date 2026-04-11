package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * KPIs de sesión: sumas de control, desglose de la diferencia total y estado del reporte.
 * <p>
 * Identidad algebraica: {@code differenceTotal = reconciledPairDelta + pendingNetDifference} (salvo
 * redondeo). {@code adjustedBalanceFromBank} = saldo final extracto + Σ pendientes empresa − Σ
 * pendientes banco (control contable cuando hay saldo final de extracto).
 */
public record ConciliacionStatsDto(long bankRowCount, long companyRowCount, long matchedPairs,
		long unmatchedBankCount, long unmatchedCompanyCount, BigDecimal sumBank, BigDecimal sumCompany,
		BigDecimal differenceTotal, BigDecimal sumReconciledBank, BigDecimal sumReconciledCompany,
		BigDecimal sumPendingBank, BigDecimal sumPendingCompany, BigDecimal pctRowsReconciledBank,
		BigDecimal pctRowsReconciledCompany,
		BigDecimal reconciledPairDelta, BigDecimal pendingNetDifference, boolean pairAmountMismatch,
		boolean differenceDecompositionOk, String reconciliationStatus, String reconciliationStatusDetail,
		List<String> differenceExplanation, BigDecimal adjustedBalanceFromBank,
		BigDecimal adjustedVsCompanyClosing, boolean closingBalancesForCrossCheck,
		BigDecimal sumCompanyAccounting, long pairsExactAmountCount, long pairsWithAmountGapCount,
		long pairsOppositeSignCount,
		/** Ambos saldos finales cargados y saldo ajustado extracto = saldo libro (±tolerancia). */
		boolean auditCierreCuadrado) {
}
