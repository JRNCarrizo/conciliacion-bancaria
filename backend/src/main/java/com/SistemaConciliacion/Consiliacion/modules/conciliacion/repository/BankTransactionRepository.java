package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;

public interface BankTransactionRepository extends JpaRepository<BankTransaction, Long> {

	List<BankTransaction> findBySession_IdOrderByTxDateAscIdAsc(Long sessionId);

	long countBySession_Id(Long sessionId);

	Optional<BankTransaction> findByIdAndSession_Id(Long id, Long sessionId);
}

