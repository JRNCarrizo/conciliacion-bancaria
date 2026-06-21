package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationGroup;

public interface ReconciliationGroupRepository extends JpaRepository<ReconciliationGroup, Long> {

	@Query("""
			SELECT DISTINCT g FROM ReconciliationGroup g
			LEFT JOIN FETCH g.bankMembers bm
			LEFT JOIN FETCH bm.bankTransaction
			WHERE g.session.id = :sessionId
			ORDER BY g.createdAt ASC, g.id ASC
			""")
	List<ReconciliationGroup> findAllWithBankMembersBySessionId(@Param("sessionId") long sessionId);

	/** Segunda pasada: inicializa companyMembers en los grupos ya cargados (evita MultipleBagFetchException). */
	@Query("""
			SELECT DISTINCT g FROM ReconciliationGroup g
			LEFT JOIN FETCH g.companyMembers cm
			LEFT JOIN FETCH cm.companyTransaction
			WHERE g.session.id = :sessionId
			ORDER BY g.createdAt ASC, g.id ASC
			""")
	List<ReconciliationGroup> findAllWithCompanyMembersBySessionId(@Param("sessionId") long sessionId);

	Optional<ReconciliationGroup> findByIdAndSession_Id(Long id, Long sessionId);

	long countBySession_Id(Long sessionId);
}
