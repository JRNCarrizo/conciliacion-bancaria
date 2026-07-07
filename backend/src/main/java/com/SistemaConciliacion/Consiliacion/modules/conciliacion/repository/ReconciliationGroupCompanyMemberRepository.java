package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationGroupCompanyMember;

public interface ReconciliationGroupCompanyMemberRepository
		extends JpaRepository<ReconciliationGroupCompanyMember, Long> {

	boolean existsByCompanyTransaction_Id(Long companyTransactionId);

	Optional<ReconciliationGroupCompanyMember> findByCompanyTransaction_Id(Long companyTransactionId);

	@Query("""
			SELECT m.group.id FROM ReconciliationGroupCompanyMember m
			WHERE m.companyTransaction.id = :txId AND m.group.session.id = :sessionId
			""")
	Optional<Long> findGroupIdByCompanyTransactionAndSession(@Param("txId") long txId,
			@Param("sessionId") long sessionId);

	long countByGroup_Id(Long groupId);
}
