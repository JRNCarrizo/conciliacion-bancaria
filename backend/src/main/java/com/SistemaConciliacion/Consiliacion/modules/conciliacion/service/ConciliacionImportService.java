package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ImportFileSummaryDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ImportLayoutDto;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionAuditEventType;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.BancoWorkbookParser;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.BankGridLayout;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.CompanyGridLayout;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.PlataformaWorkbookParser;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.BankTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.CompanyTransactionRepository;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository.ReconciliationSessionRepository;

@Service
public class ConciliacionImportService {

	private static final int MAX_SOURCE_NAME_LEN = 255;
	private static final ZoneId APP_ZONE = ZoneId.of("America/Argentina/Buenos_Aires");

	private final ReconciliationSessionRepository sessionRepository;
	private final BankTransactionRepository bankTransactionRepository;
	private final CompanyTransactionRepository companyTransactionRepository;
	private final BancoWorkbookParser bancoWorkbookParser;
	private final PlataformaWorkbookParser plataformaWorkbookParser;
	private final SessionAuditService sessionAuditService;

	public ConciliacionImportService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			BancoWorkbookParser bancoWorkbookParser,
			PlataformaWorkbookParser plataformaWorkbookParser,
			SessionAuditService sessionAuditService) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.bancoWorkbookParser = bancoWorkbookParser;
		this.plataformaWorkbookParser = plataformaWorkbookParser;
		this.sessionAuditService = sessionAuditService;
	}

	/**
	 * Carga uno o más libros por lado en una sola sesión (mismo layout en todos).
	 * Acepta .xls y .xlsx vía {@link WorkbookFactory}.
	 */
	@Transactional
	public ImportResult importFiles(List<MultipartFile> bankFiles, List<MultipartFile> companyFiles,
			ImportLayoutDto layout) throws IOException {
		List<MultipartFile> banks = nonEmptyParts(bankFiles, "banco");
		List<MultipartFile> companies = nonEmptyParts(companyFiles, "plataforma");

		BankGridLayout bankLayout = ImportLayoutResolver.resolveBank(layout);
		CompanyGridLayout companyLayout = ImportLayoutResolver.resolveCompany(layout);
		bankLayout.validate();
		companyLayout.validate();

		ReconciliationSession session = new ReconciliationSession();
		session.setSourceBankFileName(joinFileNames(banks));
		session.setSourceCompanyFileName(joinFileNames(companies));
		session.setStatus(SessionStatus.IMPORTED);
		session = sessionRepository.save(session);
		session.setDisplayName(defaultDisplayName(session.getCreatedAt()));

		List<BankTransaction> allBankRows = new ArrayList<>();
		List<ImportFileSummaryDto> bankSummaries = new ArrayList<>();
		for (MultipartFile bankFile : banks) {
			List<BankTransaction> rows = parseBankWorkbook(bankFile, session, bankLayout);
			allBankRows.addAll(rows);
			bankSummaries.add(new ImportFileSummaryDto(displayFileName(bankFile), rows.size()));
		}
		List<CompanyTransaction> allCompanyRows = new ArrayList<>();
		List<ImportFileSummaryDto> companySummaries = new ArrayList<>();
		for (MultipartFile companyFile : companies) {
			List<CompanyTransaction> rows = parseCompanyWorkbook(companyFile, session, companyLayout);
			allCompanyRows.addAll(rows);
			companySummaries.add(new ImportFileSummaryDto(displayFileName(companyFile), rows.size()));
		}

		session.setBankImportFileSummaries(bankSummaries);
		session.setCompanyImportFileSummaries(companySummaries);
		session = sessionRepository.save(session);

		if (allBankRows.isEmpty()) {
			throw new IllegalArgumentException("No se encontraron movimientos de banco en los archivos enviados.");
		}
		if (allCompanyRows.isEmpty()) {
			throw new IllegalArgumentException("No se encontraron movimientos de plataforma en los archivos enviados.");
		}

		bankTransactionRepository.saveAll(allBankRows);
		companyTransactionRepository.saveAll(allCompanyRows);

		String auditDetail = importDetail(session.getSourceBankFileName(), session.getSourceCompanyFileName(),
				banks.size(), companies.size());
		sessionAuditService.append(session.getId(), SessionAuditEventType.IMPORT, auditDetail);

		return new ImportResult(session.getId(), allBankRows.size(), allCompanyRows.size(),
				session.getSourceBankFileName(), session.getSourceCompanyFileName(), banks.size(),
				companies.size(), bankSummaries, companySummaries);
	}

	private List<BankTransaction> parseBankWorkbook(MultipartFile bankFile, ReconciliationSession session,
			BankGridLayout bankLayout) throws IOException {
		try (InputStream bankIs = bankFile.getInputStream(); Workbook bankWb = WorkbookFactory.create(bankIs)) {
			Sheet bankSheet = sheetAt(bankWb, bankLayout.sheetIndex());
			return bancoWorkbookParser.parse(bankSheet, session, bankLayout);
		}
	}

	private List<CompanyTransaction> parseCompanyWorkbook(MultipartFile companyFile, ReconciliationSession session,
			CompanyGridLayout companyLayout) throws IOException {
		try (InputStream companyIs = companyFile.getInputStream();
				Workbook companyWb = WorkbookFactory.create(companyIs)) {
			Sheet companySheet = sheetAt(companyWb, companyLayout.sheetIndex());
			return plataformaWorkbookParser.parse(companySheet, session, companyLayout);
		}
	}

	private static String displayFileName(MultipartFile file) {
		String name = file.getOriginalFilename();
		if (name == null || name.isBlank()) {
			return "archivo";
		}
		return name;
	}

	private static List<MultipartFile> nonEmptyParts(List<MultipartFile> files, String role) {
		if (files == null || files.isEmpty()) {
			throw new IllegalArgumentException("Falta al menos un archivo de " + role + ".");
		}
		List<MultipartFile> out = files.stream().filter(f -> f != null && !f.isEmpty()).collect(Collectors.toList());
		if (out.isEmpty()) {
			throw new IllegalArgumentException("Falta al menos un archivo de " + role + ".");
		}
		return out;
	}

	private static String joinFileNames(List<MultipartFile> files) {
		List<String> names = files.stream().map(MultipartFile::getOriginalFilename).filter(n -> n != null && !n.isBlank())
				.toList();
		if (names.isEmpty()) {
			return "—";
		}
		if (names.size() == 1) {
			return truncate(names.get(0), MAX_SOURCE_NAME_LEN);
		}
		String joined = String.join("; ", names);
		String withCount = names.size() + " archivos: " + joined;
		return truncate(withCount, MAX_SOURCE_NAME_LEN);
	}

	private static String truncate(String s, int max) {
		if (s.length() <= max) {
			return s;
		}
		return s.substring(0, max - 1) + "…";
	}

	private static String defaultDisplayName(Instant createdAt) {
		Instant when = createdAt != null ? createdAt : Instant.now();
		String monthYear = DateTimeFormatter.ofPattern("MMM yyyy", Locale.forLanguageTag("es-AR"))
				.format(when.atZone(APP_ZONE));
		return "Conciliación · " + monthYear;
	}

	private static String importDetail(String bankName, String companyName, int bankFiles, int companyFiles) {
		String b = bankName != null && !bankName.isBlank() ? bankName : "—";
		String c = companyName != null && !companyName.isBlank() ? companyName : "—";
		return "Banco (" + bankFiles + "): " + b + " · Empresa (" + companyFiles + "): " + c;
	}

	private static Sheet sheetAt(Workbook wb, int index) {
		if (wb.getNumberOfSheets() < 1) {
			throw new IllegalArgumentException("El libro no tiene hojas.");
		}
		if (index < 0 || index >= wb.getNumberOfSheets()) {
			throw new IllegalArgumentException(
					"Índice de hoja inválido: " + index + " (el libro tiene " + wb.getNumberOfSheets() + " hoja(s)).");
		}
		return wb.getSheetAt(index);
	}

	public record ImportResult(long sessionId, int bankRows, int companyRows, String sourceBankFileName,
			String sourceCompanyFileName, int bankFileCount, int companyFileCount,
			List<ImportFileSummaryDto> bankFileSummaries, List<ImportFileSummaryDto> companyFileSummaries) {
	}
}
