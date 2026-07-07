package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.MovementAttachment;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementSide;

public interface MovementAttachmentRepository extends JpaRepository<MovementAttachment, Long> {

	List<MovementAttachment> findBySession_IdAndMovementSideAndMovementIdOrderByCreatedAtAsc(long sessionId,
			PendingMovementSide side, long movementId);

	Optional<MovementAttachment> findByIdAndSession_Id(long id, long sessionId);

	Optional<MovementAttachment> findByIdAndSession_IdAndMovementSideAndMovementId(long id, long sessionId,
			PendingMovementSide side, long movementId);

	@Query("SELECT a.movementSide, a.movementId, COUNT(a) FROM MovementAttachment a WHERE a.session.id = :sid GROUP BY a.movementSide, a.movementId")
	List<Object[]> countByMovementGrouped(@Param("sid") long sessionId);
}
