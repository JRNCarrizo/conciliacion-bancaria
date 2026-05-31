package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.config.SecurityUtils;
import com.SistemaConciliacion.Consiliacion.config.UploadProperties;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ConciliacionStatsDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionCheckpointDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionDetailDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEventType;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionCheckpoint;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.pdf.ConciliacionPdfReportWriter;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.SessionCheckpointRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class SessionCheckpointService {

	private static final ObjectMapper JSON = new ObjectMapper();

	private final UploadProperties uploadProperties;
	private final ReconciliationSessionRepository sessionRepository;
	private final SessionCheckpointRepository checkpointRepository;
	private final ConciliacionSessionService conciliacionSessionService;
	private final SessionAuditService sessionAuditService;

	public SessionCheckpointService(UploadProperties uploadProperties,
			ReconciliationSessionRepository sessionRepository,
			SessionCheckpointRepository checkpointRepository,
			ConciliacionSessionService conciliacionSessionService,
			SessionAuditService sessionAuditService) {
		this.uploadProperties = uploadProperties;
		this.sessionRepository = sessionRepository;
		this.checkpointRepository = checkpointRepository;
		this.conciliacionSessionService = conciliacionSessionService;
		this.sessionAuditService = sessionAuditService;
	}

	@Transactional(readOnly = true)
	public List<SessionCheckpointDto> listForSession(long sessionId) {
		assertSessionExists(sessionId);
		return checkpointRepository.findBySession_IdOrderByCreatedAtDesc(sessionId).stream().map(this::toDto).toList();
	}

	@Transactional(readOnly = true)
	public SessionCheckpointDto get(long sessionId, long checkpointId) {
		return toDto(findCheckpoint(sessionId, checkpointId));
	}

	@Transactional(readOnly = true)
	public Resource loadPdf(long sessionId, long checkpointId) {
		SessionCheckpoint cp = findCheckpoint(sessionId, checkpointId);
		Path file = basePath().resolve(cp.getPdfStoredPath()).normalize();
		if (!file.startsWith(basePath()) || !Files.isRegularFile(file)) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "PDF del corte no encontrado.");
		}
		return new FileSystemResource(file);
	}

	@Transactional
	public SessionCheckpointDto create(long sessionId, String note) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesión está cerrada; no se pueden guardar cortes.");
		}

		String trimmedNote = note == null ? null : note.trim();
		if (trimmedNote != null && trimmedNote.isEmpty()) {
			trimmedNote = null;
		}
		if (trimmedNote != null && trimmedNote.length() > 512) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La nota no puede superar 512 caracteres.");
		}

		SessionDetailDto detail = conciliacionSessionService.getSessionDetail(sessionId);
		ConciliacionStatsDto stats = detail.stats();
		byte[] pdfBytes;
		try {
			pdfBytes = ConciliacionPdfReportWriter.build(detail);
		} catch (IOException e) {
			throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo generar el PDF del corte.");
		}

		SessionCheckpoint cp = new SessionCheckpoint();
		cp.setSession(session);
		cp.setCreatedByUsername(Optional.ofNullable(SecurityUtils.currentUsername()).orElse("sistema"));
		cp.setNote(trimmedNote);
		cp.setSessionStatus(session.getStatus().name());
		cp.setMatchedPairs(stats.matchedPairs());
		cp.setUnmatchedBankCount(stats.unmatchedBankCount());
		cp.setUnmatchedCompanyCount(stats.unmatchedCompanyCount());
		cp.setReconciliationStatus(stats.reconciliationStatus());
		cp.setStatsJson(writeStatsJson(stats));
		cp.setPdfStoredPath("pending");
		cp.setPdfSizeBytes(pdfBytes.length);
		cp = checkpointRepository.save(cp);

		String relative = sessionId + "/checkpoints/" + cp.getId() + ".pdf";
		Path target = basePath().resolve(relative).normalize();
		if (!target.startsWith(basePath())) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ruta de almacenamiento inválida.");
		}
		try {
			Files.createDirectories(target.getParent());
			Files.write(target, pdfBytes);
		} catch (IOException e) {
			checkpointRepository.delete(cp);
			throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo guardar el PDF del corte.");
		}
		cp.setPdfStoredPath(relative.replace('\\', '/'));
		cp = checkpointRepository.save(cp);

		sessionAuditService.append(sessionId, SessionAuditEventType.SAVE_CHECKPOINT,
				"Corte #" + cp.getId() + (trimmedNote != null ? " · " + trimmedNote : ""));

		return toDto(cp);
	}

	private SessionCheckpoint findCheckpoint(long sessionId, long checkpointId) {
		return checkpointRepository.findByIdAndSession_Id(checkpointId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Corte no encontrado."));
	}

	private void assertSessionExists(long sessionId) {
		if (!sessionRepository.existsById(sessionId)) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesión no encontrada");
		}
	}

	private Path basePath() {
		return Path.of(uploadProperties.baseDir()).toAbsolutePath().normalize();
	}

	private String writeStatsJson(ConciliacionStatsDto stats) {
		try {
			return JSON.writeValueAsString(stats);
		} catch (JsonProcessingException e) {
			throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo serializar el resumen.");
		}
	}

	private ConciliacionStatsDto readStatsJson(String json) {
		try {
			return JSON.readValue(json, ConciliacionStatsDto.class);
		} catch (JsonProcessingException e) {
			throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Resumen del corte corrupto.");
		}
	}

	private SessionCheckpointDto toDto(SessionCheckpoint cp) {
		return new SessionCheckpointDto(cp.getId(), cp.getSession().getId(), cp.getCreatedAt(),
				cp.getCreatedByUsername(), cp.getNote(), cp.getSessionStatus(), cp.getMatchedPairs(),
				cp.getUnmatchedBankCount(), cp.getUnmatchedCompanyCount(), cp.getReconciliationStatus(),
				readStatsJson(cp.getStatsJson()));
	}
}
