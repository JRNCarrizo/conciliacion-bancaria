package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.config.SecurityUtils;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionAuditEntryDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEvent;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEventType;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.SessionAuditEventRepository;

@Service
public class SessionAuditService {

	private final ReconciliationSessionRepository sessionRepository;
	private final SessionAuditEventRepository eventRepository;

	public SessionAuditService(ReconciliationSessionRepository sessionRepository,
			SessionAuditEventRepository eventRepository) {
		this.sessionRepository = sessionRepository;
		this.eventRepository = eventRepository;
	}

	@Transactional
	public void append(long sessionId, SessionAuditEventType type, String detail) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		saveEvent(session, type, detail);
	}

	/**
	 * Registro de acceso al detalle desde una transacción de solo lectura: commit independiente.
	 */
	@Transactional(propagation = Propagation.REQUIRES_NEW)
	public void recordDetailAccess(long sessionId) {
		ReconciliationSession session = sessionRepository.findById(sessionId).orElse(null);
		if (session == null) {
			return;
		}
		saveEvent(session, SessionAuditEventType.VIEW_DETAIL, null);
	}

	private void saveEvent(ReconciliationSession session, SessionAuditEventType type, String detail) {
		SessionAuditEvent e = new SessionAuditEvent();
		e.setSession(session);
		e.setEventType(type);
		e.setUsername(Optional.ofNullable(SecurityUtils.currentUsername()).orElse("sistema"));
		e.setDetail(detail);
		eventRepository.save(e);
	}

	@Transactional(readOnly = true)
	public List<SessionAuditEntryDto> listForSession(long sessionId) {
		if (!sessionRepository.existsById(sessionId)) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada");
		}
		return eventRepository.findBySession_IdOrderByCreatedAtAsc(sessionId).stream().map(this::toDto).toList();
	}

	private SessionAuditEntryDto toDto(SessionAuditEvent e) {
		SessionAuditEventType t = e.getEventType();
		return new SessionAuditEntryDto(e.getId(), t.name(), label(t), e.getUsername(), e.getCreatedAt(),
				e.getDetail());
	}

	private static String label(SessionAuditEventType t) {
		return switch (t) {
			case IMPORT -> "Importó archivos";
			case RECONCILE -> "Conciliar (automático)";
			case SAVE_BALANCES -> "Guardó saldos";
			case CLOSE_SESSION -> "Cerró la sesión";
			case VIEW_DETAIL -> "Abrió el detalle de la sesión";
		};
	}
}
