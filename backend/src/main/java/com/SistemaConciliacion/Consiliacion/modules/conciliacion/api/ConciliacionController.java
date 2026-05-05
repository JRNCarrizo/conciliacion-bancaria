package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api;

import java.io.IOException;
import java.math.BigDecimal;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.ContentDisposition;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ClassificationUpdateDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ImportLayoutDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.CommentCreateDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.PendingCommentDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ConciliacionRunResultDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ManualPairRequestDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ManualPairResponseDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.MovementAttachmentDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ReopenSessionRequestDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionBalancesDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionDetailDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionHeaderDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionAuditEntryDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionSummaryDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionExportService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionExportService.ExportKind;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionImportService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionManualPairService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionMatchingService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.MovementAttachmentService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.MovementAttachmentService.ResourceWithMeta;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.PairAttachmentService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.PlataformaImportTemplateBuilder;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PendingMovementSide;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionSessionService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.SessionAuditService;

@RestController
@RequestMapping("/api/v1/conciliacion")
public class ConciliacionController {

	private static final ObjectMapper IMPORT_LAYOUT_JSON = new ObjectMapper();

	private final ConciliacionImportService conciliacionImportService;
	private final ConciliacionSessionService conciliacionSessionService;
	private final ConciliacionMatchingService conciliacionMatchingService;
	private final ConciliacionManualPairService conciliacionManualPairService;
	private final ConciliacionExportService conciliacionExportService;
	private final MovementAttachmentService movementAttachmentService;
	private final PairAttachmentService pairAttachmentService;
	private final SessionAuditService sessionAuditService;

	public ConciliacionController(ConciliacionImportService conciliacionImportService,
			ConciliacionSessionService conciliacionSessionService,
			ConciliacionMatchingService conciliacionMatchingService,
			ConciliacionManualPairService conciliacionManualPairService,
			ConciliacionExportService conciliacionExportService,
			MovementAttachmentService movementAttachmentService,
			PairAttachmentService pairAttachmentService,
			SessionAuditService sessionAuditService) {
		this.conciliacionImportService = conciliacionImportService;
		this.conciliacionSessionService = conciliacionSessionService;
		this.conciliacionMatchingService = conciliacionMatchingService;
		this.conciliacionManualPairService = conciliacionManualPairService;
		this.conciliacionExportService = conciliacionExportService;
		this.movementAttachmentService = movementAttachmentService;
		this.pairAttachmentService = pairAttachmentService;
		this.sessionAuditService = sessionAuditService;
	}

	@GetMapping("/status")
	public Map<String, Object> status() {
		return Map.of(
				"module", "conciliacion",
				"ready", true,
				"note", "POST /import opcional ?layout= JSON (mapeo filas/columnas banco y empresa); GET export.csv | export.xlsx | export/pdf; POST /sessions/{id}/pares manual; AUTO no borra MANUAL al conciliar");
	}

	@PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ConciliacionImportService.ImportResult importFiles(@RequestParam("bank") MultipartFile bank,
			@RequestParam("company") MultipartFile company,
			@RequestParam(value = "layout", required = false) String layoutJson) throws IOException {
		ImportLayoutDto layout = null;
		if (layoutJson != null && !layoutJson.isBlank()) {
			try {
				layout = IMPORT_LAYOUT_JSON.readValue(layoutJson, ImportLayoutDto.class);
			} catch (JsonProcessingException e) {
				throw new IllegalArgumentException("Parámetro layout: JSON inválido.");
			}
		}
		return conciliacionImportService.importFiles(bank, company, layout);
	}

	@GetMapping("/sessions")
	public Page<SessionSummaryDto> listSessions(@PageableDefault(size = 20) Pageable pageable) {
		return conciliacionSessionService.listSessions(pageable);
	}

	@GetMapping("/sessions/{id}")
	public SessionDetailDto getSession(@PathVariable long id,
			@RequestParam(value = "recordAccess", defaultValue = "false") boolean recordAccess) {
		return conciliacionSessionService.getSessionDetail(id, recordAccess);
	}

	@GetMapping("/sessions/{id}/activity")
	public List<SessionAuditEntryDto> listSessionActivity(@PathVariable long id) {
		return sessionAuditService.listForSession(id);
	}

	@PutMapping(value = "/sessions/{id}/balances", consumes = MediaType.APPLICATION_JSON_VALUE)
	public SessionHeaderDto putBalances(@PathVariable long id, @RequestBody SessionBalancesDto body) {
		return conciliacionSessionService.putBalances(id, body);
	}

	/** Cierra la sesión: bloquea saldos, clasificación de pendientes y cambios de conciliación estructural. */
	@PostMapping("/sessions/{id}/cierre")
	public SessionHeaderDto cerrarSesion(@PathVariable long id) {
		return conciliacionSessionService.closeSession(id);
	}

	/** Solo administrador: revierte el cierre y deja la sesión editable de nuevo (registrado en auditoría). */
	@PreAuthorize("hasRole('ADMIN')")
	@PostMapping(value = "/sessions/{id}/reapertura", consumes = MediaType.APPLICATION_JSON_VALUE)
	public SessionHeaderDto reopenSession(@PathVariable long id,
			@RequestBody(required = false) ReopenSessionRequestDto body) {
		String reason = body != null ? body.reason() : null;
		return conciliacionSessionService.reopenSession(id, reason);
	}

	@PreAuthorize("hasAnyRole('ADMIN', 'OPERADOR')")
	@PutMapping(value = "/sessions/{id}/pending/banco/{txId}/clasificacion", consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void putBankClassification(@PathVariable long id, @PathVariable long txId,
			@RequestBody(required = false) ClassificationUpdateDto body) {
		conciliacionSessionService.putBankClassification(id, txId,
				body != null ? body : new ClassificationUpdateDto(null));
	}

	@PreAuthorize("hasAnyRole('ADMIN', 'OPERADOR')")
	@PutMapping(value = "/sessions/{id}/pending/empresa/{txId}/clasificacion", consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void putCompanyClassification(@PathVariable long id, @PathVariable long txId,
			@RequestBody(required = false) ClassificationUpdateDto body) {
		conciliacionSessionService.putCompanyClassification(id, txId,
				body != null ? body : new ClassificationUpdateDto(null));
	}

	/** Clasificación única del par conciliado (una por fila, no duplicada en cada movimiento). */
	@PreAuthorize("hasAnyRole('ADMIN', 'OPERADOR')")
	@PutMapping(value = "/sessions/{id}/pairs/{pairId}/clasificacion", consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void putPairClassification(@PathVariable long id, @PathVariable long pairId,
			@RequestBody(required = false) ClassificationUpdateDto body) {
		conciliacionSessionService.putPairClassification(id, pairId,
				body != null ? body : new ClassificationUpdateDto(null));
	}

	@GetMapping("/sessions/{id}/pending/banco/{txId}/comentarios")
	public List<PendingCommentDto> listBankPendingComments(@PathVariable long id, @PathVariable long txId) {
		return conciliacionSessionService.listPendingComments(id, PendingMovementSide.BANK, txId);
	}

	@PostMapping(value = "/sessions/{id}/pending/banco/{txId}/comentarios", consumes = MediaType.APPLICATION_JSON_VALUE)
	public PendingCommentDto addBankPendingComment(@PathVariable long id, @PathVariable long txId,
			@RequestBody(required = false) CommentCreateDto body) {
		return conciliacionSessionService.addPendingComment(id, PendingMovementSide.BANK, txId,
				body != null ? body : new CommentCreateDto(""));
	}

	@GetMapping("/sessions/{id}/pending/empresa/{txId}/comentarios")
	public List<PendingCommentDto> listCompanyPendingComments(@PathVariable long id, @PathVariable long txId) {
		return conciliacionSessionService.listPendingComments(id, PendingMovementSide.COMPANY, txId);
	}

	@PostMapping(value = "/sessions/{id}/pending/empresa/{txId}/comentarios", consumes = MediaType.APPLICATION_JSON_VALUE)
	public PendingCommentDto addCompanyPendingComment(@PathVariable long id, @PathVariable long txId,
			@RequestBody(required = false) CommentCreateDto body) {
		return conciliacionSessionService.addPendingComment(id, PendingMovementSide.COMPANY, txId,
				body != null ? body : new CommentCreateDto(""));
	}

	@GetMapping("/sessions/{id}/pairs/{pairId}/comentarios")
	public List<PendingCommentDto> listPairComments(@PathVariable long id, @PathVariable long pairId) {
		return conciliacionSessionService.listPairComments(id, pairId);
	}

	@PostMapping(value = "/sessions/{id}/pairs/{pairId}/comentarios", consumes = MediaType.APPLICATION_JSON_VALUE)
	public PendingCommentDto addPairComment(@PathVariable long id, @PathVariable long pairId,
			@RequestBody(required = false) CommentCreateDto body) {
		return conciliacionSessionService.addPairComment(id, pairId, body != null ? body : new CommentCreateDto(""));
	}

	@GetMapping("/sessions/{id}/pending/banco/{txId}/adjuntos")
	public List<MovementAttachmentDto> listBankAttachments(@PathVariable long id, @PathVariable long txId) {
		return movementAttachmentService.list(id, PendingMovementSide.BANK, txId);
	}

	@PostMapping(value = "/sessions/{id}/pending/banco/{txId}/adjuntos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public MovementAttachmentDto uploadBankAttachment(@PathVariable long id, @PathVariable long txId,
			@RequestPart("file") MultipartFile file) throws IOException {
		return movementAttachmentService.upload(id, PendingMovementSide.BANK, txId, file);
	}

	@GetMapping("/sessions/{id}/pending/banco/{txId}/adjuntos/{attachmentId}/archivo")
	public ResponseEntity<Resource> downloadBankAttachment(@PathVariable long id,
			@PathVariable long txId, @PathVariable long attachmentId) {
		ResourceWithMeta meta = movementAttachmentService.loadForDownload(id, PendingMovementSide.BANK, txId,
				attachmentId);
		ContentDisposition disposition = ContentDisposition.attachment()
				.filename(meta.downloadFilename(), StandardCharsets.UTF_8)
				.build();
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
				.contentType(MediaType.parseMediaType(meta.contentType()))
				.body(meta.resource());
	}

	@DeleteMapping("/sessions/{id}/pending/banco/{txId}/adjuntos/{attachmentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteBankAttachment(@PathVariable long id, @PathVariable long txId, @PathVariable long attachmentId) {
		movementAttachmentService.delete(id, PendingMovementSide.BANK, txId, attachmentId);
	}

	@GetMapping("/sessions/{id}/pending/empresa/{txId}/adjuntos")
	public List<MovementAttachmentDto> listCompanyAttachments(@PathVariable long id, @PathVariable long txId) {
		return movementAttachmentService.list(id, PendingMovementSide.COMPANY, txId);
	}

	@PostMapping(value = "/sessions/{id}/pending/empresa/{txId}/adjuntos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public MovementAttachmentDto uploadCompanyAttachment(@PathVariable long id, @PathVariable long txId,
			@RequestPart("file") MultipartFile file) throws IOException {
		return movementAttachmentService.upload(id, PendingMovementSide.COMPANY, txId, file);
	}

	@GetMapping("/sessions/{id}/pending/empresa/{txId}/adjuntos/{attachmentId}/archivo")
	public ResponseEntity<Resource> downloadCompanyAttachment(@PathVariable long id,
			@PathVariable long txId, @PathVariable long attachmentId) {
		ResourceWithMeta meta = movementAttachmentService.loadForDownload(id, PendingMovementSide.COMPANY, txId,
				attachmentId);
		ContentDisposition disposition = ContentDisposition.attachment()
				.filename(meta.downloadFilename(), StandardCharsets.UTF_8)
				.build();
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
				.contentType(MediaType.parseMediaType(meta.contentType()))
				.body(meta.resource());
	}

	@DeleteMapping("/sessions/{id}/pending/empresa/{txId}/adjuntos/{attachmentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteCompanyAttachment(@PathVariable long id, @PathVariable long txId, @PathVariable long attachmentId) {
		movementAttachmentService.delete(id, PendingMovementSide.COMPANY, txId, attachmentId);
	}

	@PostMapping("/sessions/{id}/conciliar")
	public ConciliacionRunResultDto conciliar(@PathVariable long id,
			@RequestParam(defaultValue = "3") int dateToleranceDays,
			@RequestParam(defaultValue = "0.01") BigDecimal amountTolerance) {
		return conciliacionMatchingService.reconcile(id, dateToleranceDays, amountTolerance);
	}

	@PostMapping(value = "/sessions/{id}/pares", consumes = MediaType.APPLICATION_JSON_VALUE)
	public ManualPairResponseDto createManualPair(@PathVariable long id, @RequestBody ManualPairRequestDto body) {
		return conciliacionManualPairService.createManualPair(id, body.bankTransactionId(), body.companyTransactionId());
	}

	@DeleteMapping("/sessions/{id}/pares/{pairId}")
	public ResponseEntity<Void> deleteManualPair(@PathVariable long id, @PathVariable long pairId) {
		conciliacionManualPairService.deleteManualPair(id, pairId);
		return ResponseEntity.noContent().build();
	}

	@GetMapping("/sessions/{id}/pares/{pairId}/adjuntos")
	public List<MovementAttachmentDto> listPairAttachments(@PathVariable long id, @PathVariable long pairId) {
		return pairAttachmentService.list(id, pairId);
	}

	@PostMapping(value = "/sessions/{id}/pares/{pairId}/adjuntos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public MovementAttachmentDto uploadPairAttachment(@PathVariable long id, @PathVariable long pairId,
			@RequestPart("file") MultipartFile file) throws IOException {
		return pairAttachmentService.upload(id, pairId, file);
	}

	@GetMapping("/sessions/{id}/pares/{pairId}/adjuntos/{attachmentId}/archivo")
	public ResponseEntity<Resource> downloadPairAttachment(@PathVariable long id, @PathVariable long pairId,
			@PathVariable long attachmentId) {
		ResourceWithMeta meta = pairAttachmentService.loadForDownload(id, pairId, attachmentId);
		ContentDisposition disposition = ContentDisposition.attachment()
				.filename(meta.downloadFilename(), StandardCharsets.UTF_8)
				.build();
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
				.contentType(MediaType.parseMediaType(meta.contentType()))
				.body(meta.resource());
	}

	@DeleteMapping("/sessions/{id}/pares/{pairId}/adjuntos/{attachmentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deletePairAttachment(@PathVariable long id, @PathVariable long pairId,
			@PathVariable long attachmentId) {
		pairAttachmentService.delete(id, pairId, attachmentId);
	}

	@GetMapping("/sessions/{id}/export.csv")
	public ResponseEntity<byte[]> exportCsv(@PathVariable long id, @RequestParam(defaultValue = "PAIRS") String kind) {
		ExportKind k;
		try {
			k = ExportKind.valueOf(kind.toUpperCase());
		} catch (IllegalArgumentException e) {
			throw new IllegalArgumentException("kind debe ser PAIRS o PENDING.");
		}
		byte[] data = conciliacionExportService.exportCsv(id, k);
		String filename = k == ExportKind.PAIRS ? "conciliacion-pares-" + id + ".csv" : "conciliacion-pendientes-" + id + ".csv";
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
				.contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
				.body(data);
	}

	@GetMapping("/sessions/{id}/export.xlsx")
	public ResponseEntity<byte[]> exportExcel(@PathVariable long id) {
		byte[] data = conciliacionExportService.exportExcel(id);
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"conciliacion-sesion-" + id + ".xlsx\"")
				.contentType(MediaType.parseMediaType(
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
				.body(data);
	}

	@GetMapping("/sessions/{id}/export/pdf")
	public ResponseEntity<byte[]> exportPdf(@PathVariable long id) {
		byte[] data = conciliacionExportService.exportPdf(id);
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"conciliacion-sesion-" + id + ".pdf\"")
				.contentType(MediaType.APPLICATION_PDF)
				.body(data);
	}

	/**
	 * Plantilla vacía con el mismo layout que el export TES / resumen bancario (compatible con
	 * {@link com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.PlataformaWorkbookParser}).
	 */
	@GetMapping("/template/plataforma.xlsx")
	public ResponseEntity<byte[]> plataformaImportTemplate() {
		byte[] data = PlataformaImportTemplateBuilder.buildXlsx();
		return ResponseEntity.ok()
				.header(HttpHeaders.CONTENT_DISPOSITION,
						"attachment; filename=\"plantilla-plataforma-resumen-bancario.xlsx\"")
				.contentType(MediaType.parseMediaType(
						"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
				.body(data);
	}
}
