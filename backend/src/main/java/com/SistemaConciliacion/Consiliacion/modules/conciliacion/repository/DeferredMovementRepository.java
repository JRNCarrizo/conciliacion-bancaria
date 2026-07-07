package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.DeferredMovement;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.DeferredMovementStatus;

public interface DeferredMovementRepository extends JpaRepository<DeferredMovement, Long> {

	List<DeferredMovement> findBySourceSession_IdOrderByExcludedAtDesc(Long sourceSessionId);

	List<DeferredMovement> findByStatusOrderByExcludedAtAsc(DeferredMovementStatus status);

	List<DeferredMovement> findByStatusAndSourceSession_IdNotOrderByExcludedAtAsc(
			DeferredMovementStatus status, Long sourceSessionId);

	List<DeferredMovement> findByConsumedSession_IdOrderByConsumedAtDesc(Long consumedSessionId);

	long countByStatus(DeferredMovementStatus status);

	long countByStatusAndSourceSession_IdNot(DeferredMovementStatus status, Long sourceSessionId);

	Optional<DeferredMovement> findByIdAndStatus(Long id, DeferredMovementStatus status);
}
