package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import org.springframework.stereotype.Service;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementSide;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationGroupBankMemberRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationGroupCompanyMemberRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairRepository;

@Service
public class MovementMatchService {

	private final ReconciliationPairRepository reconciliationPairRepository;
	private final ReconciliationGroupBankMemberRepository groupBankMemberRepository;
	private final ReconciliationGroupCompanyMemberRepository groupCompanyMemberRepository;

	public MovementMatchService(ReconciliationPairRepository reconciliationPairRepository,
			ReconciliationGroupBankMemberRepository groupBankMemberRepository,
			ReconciliationGroupCompanyMemberRepository groupCompanyMemberRepository) {
		this.reconciliationPairRepository = reconciliationPairRepository;
		this.groupBankMemberRepository = groupBankMemberRepository;
		this.groupCompanyMemberRepository = groupCompanyMemberRepository;
	}

	public boolean isBankTransactionMatched(long bankTransactionId) {
		return reconciliationPairRepository.existsByBankTransaction_Id(bankTransactionId)
				|| groupBankMemberRepository.existsByBankTransaction_Id(bankTransactionId);
	}

	public boolean isCompanyTransactionMatched(long companyTransactionId) {
		return reconciliationPairRepository.existsByCompanyTransaction_Id(companyTransactionId)
				|| groupCompanyMemberRepository.existsByCompanyTransaction_Id(companyTransactionId);
	}

	public boolean isTransactionMatched(PendingMovementSide side, long transactionId) {
		return side == PendingMovementSide.BANK
				? isBankTransactionMatched(transactionId)
				: isCompanyTransactionMatched(transactionId);
	}

	public void assertBankUnmatched(long bankTransactionId) {
		if (isBankTransactionMatched(bankTransactionId)) {
			throw new IllegalArgumentException("Ese movimiento de banco ya está vinculado.");
		}
	}

	public void assertCompanyUnmatched(long companyTransactionId) {
		if (isCompanyTransactionMatched(companyTransactionId)) {
			throw new IllegalArgumentException("Ese movimiento de empresa ya está vinculado.");
		}
	}
}
