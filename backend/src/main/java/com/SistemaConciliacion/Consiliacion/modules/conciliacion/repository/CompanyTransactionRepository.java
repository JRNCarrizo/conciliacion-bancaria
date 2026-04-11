package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;

public interface CompanyTransactionRepository extends JpaRepository<CompanyTransaction, Long> {

	List<CompanyTransaction> findBySession_IdOrderByTxDateAscIdAsc(Long sessionId);

	long countBySession_Id(Long sessionId);

	Optional<CompanyTransaction> findByIdAndSession_Id(Long id, Long sessionId);
}

