package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementComment;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementSide;

public interface PendingMovementCommentRepository extends JpaRepository<PendingMovementComment, Long> {

	List<PendingMovementComment> findBySession_IdAndMovementSideAndMovementIdOrderByCreatedAtAsc(long sessionId,
			PendingMovementSide side, long movementId);

	List<PendingMovementComment> findBySession_IdOrderByCreatedAtAsc(long sessionId);

	@Query("SELECT c.movementSide, c.movementId, COUNT(c) FROM PendingMovementComment c WHERE c.session.id = :sid GROUP BY c.movementSide, c.movementId")
	List<Object[]> countByMovementGrouped(@Param("sid") long sessionId);
}
