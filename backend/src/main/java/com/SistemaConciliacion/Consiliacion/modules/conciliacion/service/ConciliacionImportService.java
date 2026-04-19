package com.SistemaConciliacion.Consiliacion.modules.conciliacion.service;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

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
	 * Carga ambos libros con {@link WorkbookFactory}: acepta .xls (BIFF) y .xlsx (OOXML) en cada
	 * archivo. Por defecto el layout es el de {@link BancoWorkbookParser} / {@link PlataformaWorkbookParser}
	 * (primera hoja). Opcionalmente {@code layout} permite filas/columnas distintas.
	 */
	@Transactional
	public ImportResult importFiles(MultipartFile bankFile, MultipartFile companyFile) throws IOException {
		return importFiles(bankFile, companyFile, null);
	}

	@Transactional
	public ImportResult importFiles(MultipartFile bankFile, MultipartFile companyFile, ImportLayoutDto layout)
			throws IOException {
		validateMultipart(bankFile, "banco");
		validateMultipart(companyFile, "plataforma");

		BankGridLayout bankLayout = ImportLayoutResolver.resolveBank(layout);
		CompanyGridLayout companyLayout = ImportLayoutResolver.resolveCompany(layout);
		bankLayout.validate();
		companyLayout.validate();

		ReconciliationSession session = new ReconciliationSession();
		session.setSourceBankFileName(bankFile.getOriginalFilename());
		session.setSourceCompanyFileName(companyFile.getOriginalFilename());
		session.setStatus(SessionStatus.IMPORTED);
		session = sessionRepository.save(session);

		try (InputStream bankIs = bankFile.getInputStream();
				InputStream companyIs = companyFile.getInputStream();
				Workbook bankWb = WorkbookFactory.create(bankIs);
				Workbook companyWb = WorkbookFactory.create(companyIs)) {
			Sheet bankSheet = sheetAt(bankWb, bankLayout.sheetIndex());
			Sheet companySheet = sheetAt(companyWb, companyLayout.sheetIndex());

			List<BankTransaction> bankRows = bancoWorkbookParser.parse(bankSheet, session, bankLayout);
			List<CompanyTransaction> companyRows = plataformaWorkbookParser.parse(companySheet, session, companyLayout);

			bankTransactionRepository.saveAll(bankRows);
			companyTransactionRepository.saveAll(companyRows);

			String auditDetail = importDetail(session.getSourceBankFileName(), session.getSourceCompanyFileName());
			sessionAuditService.append(session.getId(), SessionAuditEventType.IMPORT, auditDetail);

			return new ImportResult(session.getId(), bankRows.size(), companyRows.size(),
					session.getSourceBankFileName(), session.getSourceCompanyFileName());
		}
	}

	private static String importDetail(String bankName, String companyName) {
		String b = bankName != null && !bankName.isBlank() ? bankName : "—";
		String c = companyName != null && !companyName.isBlank() ? companyName : "—";
		return "Banco: " + b + " · Empresa: " + c;
	}

	private static void validateMultipart(MultipartFile file, String role) {
		if (file == null || file.isEmpty()) {
			throw new IllegalArgumentException("Falta el archivo de " + role + ".");
		}
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
			String sourceCompanyFileName) {
	}
}
