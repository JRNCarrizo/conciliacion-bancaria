package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationGroupBankMember;

public interface ReconciliationGroupBankMemberRepository extends JpaRepository<ReconciliationGroupBankMember, Long> {

	boolean existsByBankTransaction_Id(Long bankTransactionId);

	Optional<ReconciliationGroupBankMember> findByBankTransaction_Id(Long bankTransactionId);

	@Query("""
			SELECT m.group.id FROM ReconciliationGroupBankMember m
			WHERE m.bankTransaction.id = :txId AND m.group.session.id = :sessionId
			""")
	Optional<Long> findGroupIdByBankTransactionAndSession(@Param("txId") long txId,
			@Param("sessionId") long sessionId);

	long countByGroup_Id(Long groupId);
}
