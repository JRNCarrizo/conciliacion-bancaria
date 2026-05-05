package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationPairComment;

public interface ReconciliationPairCommentRepository extends JpaRepository<ReconciliationPairComment, Long> {

	List<ReconciliationPairComment> findBySession_IdAndPair_IdOrderByCreatedAtAsc(long sessionId, long pairId);

	@Query("SELECT c.pair.id, COUNT(c) FROM ReconciliationPairComment c WHERE c.session.id = :sid GROUP BY c.pair.id")
	List<Object[]> countByPairGrouped(@Param("sid") long sessionId);

	void deleteByPair_Id(Long pairId);

	@Modifying
	@Query("DELETE FROM ReconciliationPairComment c WHERE c.pair.id IN :pairIds")
	int deleteAllByPair_IdIn(@Param("pairIds") Collection<Long> pairIds);
}

