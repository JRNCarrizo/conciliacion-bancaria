package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api;

import java.io.IOException;
import java.math.BigDecimal;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ClassificationUpdateDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ConciliacionRunResultDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ManualPairRequestDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ManualPairResponseDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionBalancesDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionDetailDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionHeaderDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.SessionSummaryDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionExportService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionExportService.ExportKind;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionImportService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionManualPairService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionMatchingService;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.PlataformaImportTemplateBuilder;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.service.ConciliacionSessionService;

@RestController
@RequestMapping("/api/v1/conciliacion")
public class ConciliacionController {

	private final ConciliacionImportService conciliacionImportService;
	private final ConciliacionSessionService conciliacionSessionService;
	private final ConciliacionMatchingService conciliacionMatchingService;
	private final ConciliacionManualPairService conciliacionManualPairService;
	private final ConciliacionExportService conciliacionExportService;

	public ConciliacionController(ConciliacionImportService conciliacionImportService,
			ConciliacionSessionService conciliacionSessionService,
			ConciliacionMatchingService conciliacionMatchingService,
			ConciliacionManualPairService conciliacionManualPairService,
			ConciliacionExportService conciliacionExportService) {
		this.conciliacionImportService = conciliacionImportService;
		this.conciliacionSessionService = conciliacionSessionService;
		this.conciliacionMatchingService = conciliacionMatchingService;
		this.conciliacionManualPairService = conciliacionManualPairService;
		this.conciliacionExportService = conciliacionExportService;
	}

	@GetMapping("/status")
	public Map<String, Object> status() {
		return Map.of(
				"module", "conciliacion",
				"ready", true,
				"note", "GET export.csv | export.xlsx (Resumen+Pares+Pendientes), POST /sessions/{id}/pares manual; AUTO no borra MANUAL al conciliar");
	}

	@PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ConciliacionImportService.ImportResult importFiles(@RequestParam("bank") MultipartFile bank,
			@RequestParam("company") MultipartFile company) throws IOException {
		return conciliacionImportService.importFiles(bank, company);
	}

	@GetMapping("/sessions")
	public Page<SessionSummaryDto> listSessions(@PageableDefault(size = 20) Pageable pageable) {
		return conciliacionSessionService.listSessions(pageable);
	}

	@GetMapping("/sessions/{id}")
	public SessionDetailDto getSession(@PathVariable long id) {
		return conciliacionSessionService.getSessionDetail(id);
	}

	@PutMapping(value = "/sessions/{id}/balances", consumes = MediaType.APPLICATION_JSON_VALUE)
	public SessionHeaderDto putBalances(@PathVariable long id, @RequestBody SessionBalancesDto body) {
		return conciliacionSessionService.putBalances(id, body);
	}

	@PutMapping(value = "/sessions/{id}/pending/banco/{txId}/clasificacion", consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void putBankClassification(@PathVariable long id, @PathVariable long txId,
			@RequestBody(required = false) ClassificationUpdateDto body) {
		conciliacionSessionService.putBankClassification(id, txId,
				body != null ? body : new ClassificationUpdateDto(null));
	}

	@PutMapping(value = "/sessions/{id}/pending/empresa/{txId}/clasificacion", consumes = MediaType.APPLICATION_JSON_VALUE)
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void putCompanyClassification(@PathVariable long id, @PathVariable long txId,
			@RequestBody(required = false) ClassificationUpdateDto body) {
		conciliacionSessionService.putCompanyClassification(id, txId,
				body != null ? body : new ClassificationUpdateDto(null));
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
