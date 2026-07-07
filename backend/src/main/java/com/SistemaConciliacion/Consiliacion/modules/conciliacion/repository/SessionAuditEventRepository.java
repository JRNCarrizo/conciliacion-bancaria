package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEvent;

public interface SessionAuditEventRepository extends JpaRepository<SessionAuditEvent, Long> {

	List<SessionAuditEvent> findBySession_IdOrderByCreatedAtAsc(Long sessionId);
}
