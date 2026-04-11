package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ClassificationUpdateDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ConciliacionStatsDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.MovimientoDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ParDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionBalancesDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionDetailDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionHeaderDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionSummaryDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingClassification;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationPair;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.BankTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.CompanyTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;

@Service
public class ConciliacionSessionService {

	private static final BigDecimal EPS = new BigDecimal("0.02");

	private final ReconciliationSessionRepository sessionRepository;
	private final BankTransactionRepository bankTransactionRepository;
	private final CompanyTransactionRepository companyTransactionRepository;
	private final ReconciliationPairRepository reconciliationPairRepository;

	public ConciliacionSessionService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			ReconciliationPairRepository reconciliationPairRepository) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.reconciliationPairRepository = reconciliationPairRepository;
	}

	@Transactional(readOnly = true)
	public Page<SessionSummaryDto> listSessions(Pageable pageable) {
		return sessionRepository.findAllByOrderByCreatedAtDesc(pageable).map(this::toSummary);
	}

	private SessionSummaryDto toSummary(ReconciliationSession s) {
		long bid = s.getId();
		long bankCount = bankTransactionRepository.countBySession_Id(bid);
		long companyCount = companyTransactionRepository.countBySession_Id(bid);
		long matched = reconciliationPairRepository.countBySession_Id(bid);
		return new SessionSummaryDto(bid, s.getCreatedAt(), s.getSourceBankFileName(), s.getSourceCompanyFileName(),
				s.getStatus().name(), bankCount, companyCount, matched);
	}

	@Transactional(readOnly = true)
	public SessionDetailDto getSessionDetail(long sessionId) {
		ReconciliationSession s = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		List<BankTransaction> banks = bankTransactionRepository.findBySession_IdOrderByTxDateAscIdAsc(sessionId);
		List<CompanyTransaction> companies = companyTransactionRepository
				.findBySession_IdOrderByTxDateAscIdAsc(sessionId);
		List<ReconciliationPair> pairs = reconciliationPairRepository.findAllWithPartiesBySessionId(sessionId);

		Set<Long> matchedBankIds = new HashSet<>();
		Set<Long> matchedCompanyIds = new HashSet<>();
		for (ReconciliationPair p : pairs) {
			matchedBankIds.add(p.getBankTransaction().getId());
			matchedCompanyIds.add(p.getCompanyTransaction().getId());
		}

		List<MovimientoDto> bankDtos = banks.stream().map(this::toBankMov).toList();
		List<MovimientoDto> companyDtos = companies.stream().map(this::toCompanyMov).toList();
		List<MovimientoDto> unmatchedBank = banks.stream().filter(t -> !matchedBankIds.contains(t.getId()))
				.map(this::toBankMov).toList();
		List<MovimientoDto> unmatchedCompany = companies.stream().filter(t -> !matchedCompanyIds.contains(t.getId()))
				.map(this::toCompanyMov).toList();
		List<ParDto> parDtos = pairs.stream().map(this::toPar).toList();

		ConciliacionStatsDto stats = buildStats(s, banks, companies, pairs, matchedBankIds, matchedCompanyIds);

		return new SessionDetailDto(toHeader(s), bankDtos, companyDtos, unmatchedBank, unmatchedCompany, parDtos,
				stats);
	}

	@Transactional
	public SessionHeaderDto putBalances(long sessionId, SessionBalancesDto dto) {
		ReconciliationSession s = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		s.setOpeningBankBalance(dto.openingBankBalance());
		s.setClosingBankBalance(dto.closingBankBalance());
		s.setOpeningCompanyBalance(dto.openingCompanyBalance());
		s.setClosingCompanyBalance(dto.closingCompanyBalance());
		sessionRepository.save(s);
		return toHeader(s);
	}

	@Transactional
	public void putBankClassification(long sessionId, long bankTxId, ClassificationUpdateDto body) {
		if (reconciliationPairRepository.existsByBankTransaction_Id(bankTxId)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Solo se clasifican movimientos pendientes (sin par).");
		}
		BankTransaction t = bankTransactionRepository.findByIdAndSession_Id(bankTxId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimiento no encontrado"));
		t.setPendingClassification(parseClassification(body != null ? body.classification() : null));
		bankTransactionRepository.save(t);
	}

	@Transactional
	public void putCompanyClassification(long sessionId, long companyTxId, ClassificationUpdateDto body) {
		if (reconciliationPairRepository.existsByCompanyTransaction_Id(companyTxId)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Solo se clasifican movimientos pendientes (sin par).");
		}
		CompanyTransaction t = companyTransactionRepository.findByIdAndSession_Id(companyTxId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Movimiento no encontrado"));
		t.setPendingClassification(parseClassification(body != null ? body.classification() : null));
		companyTransactionRepository.save(t);
	}

	private static PendingClassification parseClassification(String raw) {
		if (raw == null || raw.isBlank()) {
			return null;
		}
		try {
			return PendingClassification.valueOf(raw.trim().toUpperCase());
		} catch (IllegalArgumentException e) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Clasificación inválida. Valores: COMISION, TRANSFERENCIA, DEPOSITO_TRANSITO, ERROR, OTRO o vacío.");
		}
	}

	private SessionHeaderDto toHeader(ReconciliationSession s) {
		return new SessionHeaderDto(s.getId(), s.getCreatedAt(), s.getSourceBankFileName(),
				s.getSourceCompanyFileName(), s.getStatus().name(), s.getOpeningBankBalance(), s.getClosingBankBalance(),
				s.getOpeningCompanyBalance(), s.getClosingCompanyBalance());
	}

	private ConciliacionStatsDto buildStats(ReconciliationSession session, List<BankTransaction> banks,
			List<CompanyTransaction> companies, List<ReconciliationPair> pairs, Set<Long> matchedBankIds,
			Set<Long> matchedCompanyIds) {
		long bankRowCount = banks.size();
		long companyRowCount = companies.size();
		long matchedPairs = pairs.size();
		long unmatchedBankCount = bankRowCount - matchedPairs;
		long unmatchedCompanyCount = companyRowCount - matchedPairs;

		BigDecimal sumBank = sumBankAmounts(banks);
		BigDecimal sumCompany = sumCompanyAmounts(companies);
		BigDecimal sumCompanyAccounting = sumCompanyAccountingAmounts(companies);
		BigDecimal differenceTotal = sumBank.subtract(sumCompany);

		BigDecimal sumReconciledBank = pairs.stream().map(p -> p.getBankTransaction().getAmount())
				.reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal sumReconciledCompany = pairs.stream().map(p -> p.getCompanyTransaction().getAmount())
				.reduce(BigDecimal.ZERO, BigDecimal::add);

		BigDecimal sumPendingBank = banks.stream().filter(t -> !matchedBankIds.contains(t.getId()))
				.map(BankTransaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal sumPendingCompany = companies.stream().filter(t -> !matchedCompanyIds.contains(t.getId()))
				.map(CompanyTransaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);

		BigDecimal pctRowsBank = rowReconciliationPct(bankRowCount, unmatchedBankCount);
		BigDecimal pctRowsCompany = rowReconciliationPct(companyRowCount, unmatchedCompanyCount);

		BigDecimal reconciledPairDelta = sumReconciledBank.subtract(sumReconciledCompany);
		BigDecimal pendingNetDifference = sumPendingBank.subtract(sumPendingCompany);
		long pairsExactAmountCount = 0;
		long pairsWithAmountGapCount = 0;
		long pairsOppositeSignCount = 0;
		for (ReconciliationPair p : pairs) {
			BigDecimal ba = p.getBankTransaction().getAmount();
			BigDecimal ca = p.getCompanyTransaction().getAmount();
			BigDecimal gap = ba.subtract(ca).abs();
			if (gap.compareTo(EPS) <= 0) {
				pairsExactAmountCount++;
			} else {
				pairsWithAmountGapCount++;
			}
			if (ba.signum() != 0 && ca.signum() != 0 && ba.signum() != ca.signum()) {
				pairsOppositeSignCount++;
			}
		}
		boolean pairAmountMismatch = reconciledPairDelta.abs().compareTo(EPS) >= 0;
		BigDecimal recomposed = reconciledPairDelta.add(pendingNetDifference);
		boolean differenceDecompositionOk = differenceTotal.subtract(recomposed).abs().compareTo(EPS) < 0;

		BigDecimal closingBank = session.getClosingBankBalance();
		BigDecimal closingCompany = session.getClosingCompanyBalance();
		BigDecimal adjustedBalanceFromBank = null;
		BigDecimal adjustedVsCompanyClosing = null;
		boolean closingBalancesForCrossCheck = false;
		if (closingBank != null) {
			adjustedBalanceFromBank = closingBank.add(sumPendingCompany).subtract(sumPendingBank);
		}
		if (adjustedBalanceFromBank != null && closingCompany != null) {
			adjustedVsCompanyClosing = adjustedBalanceFromBank.subtract(closingCompany);
			closingBalancesForCrossCheck = true;
		}
		boolean auditCierreCuadrado = closingBalancesForCrossCheck && adjustedVsCompanyClosing != null
				&& adjustedVsCompanyClosing.abs().compareTo(EPS) < 0;

		StatusPick st = resolveReportStatus(differenceDecompositionOk, pairsOppositeSignCount, pairAmountMismatch,
				unmatchedBankCount, unmatchedCompanyCount, differenceTotal, adjustedVsCompanyClosing, auditCierreCuadrado);

		List<String> explanation = buildDifferenceExplanation(differenceTotal, reconciledPairDelta, pendingNetDifference,
				unmatchedBankCount, unmatchedCompanyCount, pairAmountMismatch, differenceDecompositionOk,
				adjustedBalanceFromBank, adjustedVsCompanyClosing, closingBank, closingCompany, sumCompanyAccounting,
				pairsExactAmountCount, pairsWithAmountGapCount, pairsOppositeSignCount, auditCierreCuadrado);

		return new ConciliacionStatsDto(bankRowCount, companyRowCount, matchedPairs, unmatchedBankCount,
				unmatchedCompanyCount, sumBank, sumCompany, differenceTotal, sumReconciledBank, sumReconciledCompany,
				sumPendingBank, sumPendingCompany, pctRowsBank, pctRowsCompany, reconciledPairDelta, pendingNetDifference,
				pairAmountMismatch, differenceDecompositionOk, st.code(), st.detail(), explanation, adjustedBalanceFromBank,
				adjustedVsCompanyClosing, closingBalancesForCrossCheck, sumCompanyAccounting, pairsExactAmountCount,
				pairsWithAmountGapCount, pairsOppositeSignCount, auditCierreCuadrado);
	}

	private record StatusPick(String code, String detail) {
	}

	private static StatusPick resolveReportStatus(boolean decompositionOk, long pairsOppositeSignCount,
			boolean pairMismatch, long unBank, long unCompany, BigDecimal differenceTotal,
			BigDecimal adjustedVsCompanyClosing, boolean auditCierreCuadrado) {
		if (!decompositionOk) {
			return new StatusPick("STRUCTURAL_ERROR",
					"La diferencia total no cuadra con pares + pendientes (posible error interno o datos corruptos).");
		}
		if (pairsOppositeSignCount > 0) {
			return new StatusPick("PAIR_SIGN_MISMATCH",
					"Hay pares con importes de signo opuesto; no es un emparejamiento válido para conciliación.");
		}
		if (pairMismatch) {
			return new StatusPick("PAIR_AMOUNT_MISMATCH",
					"Hay pares donde el importe banco y el de empresa no coinciden.");
		}
		if (adjustedVsCompanyClosing != null && adjustedVsCompanyClosing.abs().compareTo(EPS) >= 0) {
			return new StatusPick("BALANCE_CROSS_CHECK_FAIL",
					"Saldo ajustado desde extracto (y pendientes) no coincide con el saldo final empresa declarado.");
		}
		if (unBank > 0 || unCompany > 0) {
			return new StatusPick("PENDING_DIFFERENCES", "Quedan movimientos sin emparejar.");
		}
		if (differenceTotal.abs().compareTo(EPS) >= 0) {
			return new StatusPick("PENDING_DIFFERENCES", "Las sumas de importes de los archivos no coinciden.");
		}
		if (auditCierreCuadrado) {
			return new StatusPick("OK",
					"Sin pendientes y sumas alineadas. Cierre auditado: saldos finales extracto y libro conformes.");
		}
		return new StatusPick("OK", "Sin pendientes y sumas de importes alineadas.");
	}

	/**
	 * Importes en textos de explicación / export: 2 decimales (alineado al resumen ejecutivo en pantalla).
	 */
	private static String fmtAmount(BigDecimal v) {
		return v.setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	private static List<String> buildDifferenceExplanation(BigDecimal differenceTotal, BigDecimal reconciledPairDelta,
			BigDecimal pendingNetDifference, long unmatchedBankCount, long unmatchedCompanyCount, boolean pairMismatch,
			boolean decompositionOk, BigDecimal adjustedBalanceFromBank, BigDecimal adjustedVsCompanyClosing,
			BigDecimal closingBank, BigDecimal closingCompany, BigDecimal sumCompanyAccounting,
			long pairsExact, long pairsGap, long pairsOppSign, boolean auditCierreCuadrado) {
		List<String> lines = new ArrayList<>();
		lines.add("Diferencia total (Σ banco − Σ empresa conciliación en el período importado): "
				+ fmtAmount(differenceTotal));
		lines.add("Σ neto contable plataforma (haber − debe por línea, solo libro): " + fmtAmount(sumCompanyAccounting));
		lines.add("Pares: importes idénticos (±tolerancia): " + pairsExact + " · con brecha de importe: " + pairsGap
				+ " · signo opuesto banco/empresa: " + pairsOppSign);
		lines.add("Δ en pares conciliados (Σ banco − Σ empresa en importes de conciliación): "
				+ fmtAmount(reconciledPairDelta));
		lines.add("Efecto neto pendientes (Σ pend. banco − Σ pend. empresa): " + fmtAmount(pendingNetDifference));
		lines.add("Cantidad de pendientes: " + unmatchedBankCount + " en extracto, " + unmatchedCompanyCount
				+ " en plataforma.");
		if (!decompositionOk) {
			lines.add("Validación: la suma Δ pares + efecto pendientes no reproduce la diferencia total (revisar).");
		} else {
			lines.add("Validación algebraica: diferencia total = Δ pares + efecto pendientes (tolerancia redondeo).");
		}
		if (pairsOppSign > 0) {
			lines.add("Crítico: hay pares con signo opuesto; la conciliación exige mismo signo e igual magnitud.");
		}
		if (pairMismatch) {
			lines.add("Atención: Δ neto en pares distinto de cero o brechas de importe entre banco y empresa.");
		}
		if (closingBank != null) {
			lines.add("Saldo final extracto declarado: " + fmtAmount(closingBank)
					+ " → saldo ajustado (extracto + Σ pend. empresa − Σ pend. banco): "
					+ (adjustedBalanceFromBank != null ? fmtAmount(adjustedBalanceFromBank) : "—"));
		} else {
			lines.add("Saldo final extracto no cargado: indicá saldos abajo para el ajuste contable.");
		}
		if (closingCompany != null && adjustedVsCompanyClosing != null) {
			lines.add("Saldo final empresa declarado: " + fmtAmount(closingCompany) + " → diferencia vs saldo ajustado: "
					+ fmtAmount(adjustedVsCompanyClosing));
		}
		if (auditCierreCuadrado) {
			lines.add(
					"Auditoría: cierre conforme — saldo final extracto + ajuste por pendientes = saldo final libro (±tolerancia).");
		} else if (closingBank != null && closingCompany != null && adjustedVsCompanyClosing != null) {
			lines.add("Auditoría: revisar el puente entre saldo final extracto y saldo final empresa declarado.");
		} else if (closingBank == null || closingCompany == null) {
			lines.add(
					"Auditoría: declará saldo final banco y saldo final empresa para cerrar el circuito extracto ↔ libro.");
		}
		return List.copyOf(lines);
	}

	private static BigDecimal sumBankAmounts(List<BankTransaction> banks) {
		return banks.stream().map(BankTransaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	private static BigDecimal sumCompanyAmounts(List<CompanyTransaction> companies) {
		return companies.stream().map(CompanyTransaction::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	private static BigDecimal sumCompanyAccountingAmounts(List<CompanyTransaction> companies) {
		return companies.stream().map(ConciliacionSessionService::accountingOrFallback).reduce(BigDecimal.ZERO,
				BigDecimal::add);
	}

	private static BigDecimal accountingOrFallback(CompanyTransaction t) {
		if (t.getAccountingAmount() != null) {
			return t.getAccountingAmount();
		}
		return t.getAmount().negate();
	}

	private static BigDecimal rowReconciliationPct(long totalRows, long unmatchedRows) {
		if (totalRows <= 0) {
			return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
		}
		long reconciled = totalRows - unmatchedRows;
		return BigDecimal.valueOf(reconciled).multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(totalRows),
				2, RoundingMode.HALF_UP);
	}

	private MovimientoDto toBankMov(BankTransaction t) {
		return new MovimientoDto(t.getId(), t.getTxDate(), t.getAmount(), t.getDescription(), t.getReference(),
				classificationLabel(t.getPendingClassification()), null);
	}

	private MovimientoDto toCompanyMov(CompanyTransaction t) {
		return new MovimientoDto(t.getId(), t.getTxDate(), t.getAmount(), t.getDescription(), t.getReference(),
				classificationLabel(t.getPendingClassification()), t.getAccountingAmount());
	}

	private static String classificationLabel(PendingClassification c) {
		return c == null ? null : c.name();
	}

	private ParDto toPar(ReconciliationPair p) {
		BankTransaction b = p.getBankTransaction();
		CompanyTransaction c = p.getCompanyTransaction();
		return new ParDto(p.getId(), p.getMatchSource().name(), b.getId(), c.getId(), b.getAmount(), c.getAmount(),
				b.getTxDate(), c.getTxDate());
	}
}
