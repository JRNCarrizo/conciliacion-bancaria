package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.MatchSource;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationPair;

public interface ReconciliationPairRepository extends JpaRepository<ReconciliationPair, Long> {

	@Modifying
	@Transactional
	@Query("DELETE FROM ReconciliationPair p WHERE p.session.id = :sessionId AND p.matchSource = :source")
	void deleteBySession_IdAndMatchSource(@Param("sessionId") Long sessionId, @Param("source") MatchSource source);

	long countBySession_Id(Long sessionId);

	boolean existsByBankTransaction_Id(Long bankTransactionId);

	boolean existsByCompanyTransaction_Id(Long companyTransactionId);

	List<ReconciliationPair> findBySession_IdAndMatchSource(Long sessionId, MatchSource matchSource);

	@Query("SELECT p FROM ReconciliationPair p JOIN FETCH p.bankTransaction JOIN FETCH p.companyTransaction WHERE p.session.id = :sessionId ORDER BY p.id ASC")
	List<ReconciliationPair> findAllWithPartiesBySessionId(@Param("sessionId") Long sessionId);

	Optional<ReconciliationPair> findByIdAndSession_Id(Long id, Long sessionId);

	@Query("SELECT p.id FROM ReconciliationPair p WHERE p.session.id = :sessionId AND p.matchSource = :source")
	List<Long> findIdsBySessionIdAndMatchSource(@Param("sessionId") long sessionId, @Param("source") MatchSource source);
}
