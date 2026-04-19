package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.config.SecurityUtils;
import com.SistemaConciliacion.Consiliacion.config.UploadProperties;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.MovementAttachmentDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PairAttachment;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationPair;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.PairAttachmentRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationPairRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;

@Service
public class PairAttachmentService {

	private static final long MAX_BYTES = 20L * 1024 * 1024;
	private static final Set<String> ALLOWED_EXT = Set.of("pdf", "png", "jpg", "jpeg", "webp", "gif");

	private final UploadProperties uploadProperties;
	private final ReconciliationSessionRepository sessionRepository;
	private final ReconciliationPairRepository reconciliationPairRepository;
	private final PairAttachmentRepository pairAttachmentRepository;

	public PairAttachmentService(UploadProperties uploadProperties,
			ReconciliationSessionRepository sessionRepository,
			ReconciliationPairRepository reconciliationPairRepository,
			PairAttachmentRepository pairAttachmentRepository) {
		this.uploadProperties = uploadProperties;
		this.sessionRepository = sessionRepository;
		this.reconciliationPairRepository = reconciliationPairRepository;
		this.pairAttachmentRepository = pairAttachmentRepository;
	}

	@Transactional(readOnly = true)
	public List<MovementAttachmentDto> list(long sessionId, long pairId) {
		sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesi?n no encontrada"));
		assertPairInSession(sessionId, pairId);
		return pairAttachmentRepository.findBySession_IdAndPair_IdOrderByCreatedAtAsc(sessionId, pairId).stream()
				.map(PairAttachmentService::toDto)
				.toList();
	}

	@Transactional
	public MovementAttachmentDto upload(long sessionId, long pairId, MultipartFile file) throws IOException {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesi?n no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesi?n est? cerrada; no se pueden subir archivos.");
		}
		ReconciliationPair pair = reconciliationPairRepository.findByIdAndSession_Id(pairId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Par no encontrado."));
		if (file == null || file.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Archivo vac?o.");
		}
		long size = file.getSize();
		if (size <= 0 || size > MAX_BYTES) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"El archivo debe tener entre 1 y " + (MAX_BYTES / (1024 * 1024)) + " MB.");
		}
		String original = file.getOriginalFilename();
		if (original == null || original.isBlank()) {
			original = "adjunto";
		}
		String ext = extensionOf(original);
		ext = ext == null ? null : ext.toLowerCase(Locale.ROOT);
		if (ext == null || !ALLOWED_EXT.contains(ext)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"Tipo no permitido. Us? PDF o imagen (PNG, JPG, WEBP, GIF).");
		}

		Path base = basePath();
		String relative = sessionId + "/pair/" + pairId + "/" + UUID.randomUUID() + "." + ext;
		Path target = base.resolve(relative).normalize();
		if (!target.startsWith(base)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ruta inv?lida.");
		}
		Files.createDirectories(target.getParent());
		try (InputStream in = file.getInputStream()) {
			Files.copy(in, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
		}

		PairAttachment row = new PairAttachment();
		row.setSession(session);
		row.setPair(pair);
		row.setStoredPath(relative.replace('\\', '/'));
		row.setOriginalFilename(original.length() > 255 ? original.substring(0, 255) : original);
		String ct = file.getContentType();
		row.setContentType(ct != null && ct.length() <= 128 ? ct : guessContentType(ext));
		row.setSizeBytes(size);
		row.setCreatedByUsername(SecurityUtils.currentUsername());
		pairAttachmentRepository.save(row);

		return toDto(row);
	}

	@Transactional
	public void delete(long sessionId, long pairId, long attachmentId) {
		ReconciliationSession session = sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesi?n no encontrada"));
		if (session.getStatus() == SessionStatus.CLOSED) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
					"La sesi?n est? cerrada; no se pueden eliminar archivos.");
		}
		PairAttachment a = pairAttachmentRepository
				.findByIdAndSession_IdAndPair_Id(attachmentId, sessionId, pairId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Adjunto no encontrado."));
		assertPairInSession(sessionId, pairId);
		Path base = basePath();
		Path filePath = base.resolve(a.getStoredPath()).normalize();
		if (!filePath.startsWith(base)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ruta inv?lida.");
		}
		pairAttachmentRepository.delete(a);
		try {
			Files.deleteIfExists(filePath);
		} catch (IOException e) {
			throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
					"No se pudo eliminar el archivo del disco.");
		}
	}

	@Transactional(readOnly = true)
	public MovementAttachmentService.ResourceWithMeta loadForDownload(long sessionId, long pairId, long attachmentId) {
		sessionRepository.findById(sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sesi?n no encontrada"));
		PairAttachment a = pairAttachmentRepository
				.findByIdAndSession_IdAndPair_Id(attachmentId, sessionId, pairId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Adjunto no encontrado."));
		Path base = basePath();
		Path filePath = base.resolve(a.getStoredPath()).normalize();
		if (!filePath.startsWith(base)) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ruta inv?lida.");
		}
		if (!Files.isRegularFile(filePath)) {
			throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Archivo no encontrado en disco.");
		}
		String ct = a.getContentType() != null ? a.getContentType() : "application/octet-stream";
		return new MovementAttachmentService.ResourceWithMeta(new FileSystemResource(filePath), a.getOriginalFilename(),
				ct);
	}

	private void assertPairInSession(long sessionId, long pairId) {
		reconciliationPairRepository.findByIdAndSession_Id(pairId, sessionId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Par no encontrado."));
	}

	private Path basePath() {
		String raw = uploadProperties.baseDir();
		if (raw == null || raw.isBlank()) {
			throw new IllegalStateException("app.upload.base-dir no configurado.");
		}
		return Path.of(raw.trim()).toAbsolutePath().normalize();
	}

	private static String extensionOf(String filename) {
		int dot = filename.lastIndexOf('.');
		if (dot < 0 || dot == filename.length() - 1) {
			return null;
		}
		return filename.substring(dot + 1);
	}

	private static String guessContentType(String ext) {
		return switch (ext) {
			case "pdf" -> "application/pdf";
			case "png" -> "image/png";
			case "jpg", "jpeg" -> "image/jpeg";
			case "webp" -> "image/webp";
			case "gif" -> "image/gif";
			default -> "application/octet-stream";
		};
	}

	private static MovementAttachmentDto toDto(PairAttachment a) {
		return new MovementAttachmentDto(a.getId(), a.getOriginalFilename(), a.getContentType(), a.getSizeBytes(),
				a.getCreatedAt(), a.getCreatedByUsername());
	}
}
