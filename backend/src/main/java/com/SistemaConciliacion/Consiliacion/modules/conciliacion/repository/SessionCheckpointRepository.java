package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionCheckpoint;

public interface SessionCheckpointRepository extends JpaRepository<SessionCheckpoint, Long> {

	List<SessionCheckpoint> findBySession_IdOrderByCreatedAtDesc(long sessionId);

	Optional<SessionCheckpoint> findByIdAndSession_Id(long id, long sessionId);
}
