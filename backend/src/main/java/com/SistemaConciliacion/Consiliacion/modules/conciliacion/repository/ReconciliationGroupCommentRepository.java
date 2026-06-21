package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationGroupComment;

public interface ReconciliationGroupCommentRepository extends JpaRepository<ReconciliationGroupComment, Long> {

	List<ReconciliationGroupComment> findBySession_IdAndGroup_IdOrderByCreatedAtAsc(long sessionId, long groupId);

	void deleteByGroup_Id(long groupId);

	@Query("SELECT c.group.id, COUNT(c) FROM ReconciliationGroupComment c WHERE c.session.id = :sid GROUP BY c.group.id")
	List<Object[]> countByGroupGrouped(@Param("sid") long sessionId);
}
