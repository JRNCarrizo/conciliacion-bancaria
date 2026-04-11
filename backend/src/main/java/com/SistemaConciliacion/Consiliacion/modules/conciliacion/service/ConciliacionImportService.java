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

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.BankTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.CompanyTransaction;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.SessionStatus;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.excel.BancoWorkbookParser;
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

	public ConciliacionImportService(ReconciliationSessionRepository sessionRepository,
			BankTransactionRepository bankTransactionRepository,
			CompanyTransactionRepository companyTransactionRepository,
			BancoWorkbookParser bancoWorkbookParser,
			PlataformaWorkbookParser plataformaWorkbookParser) {
		this.sessionRepository = sessionRepository;
		this.bankTransactionRepository = bankTransactionRepository;
		this.companyTransactionRepository = companyTransactionRepository;
		this.bancoWorkbookParser = bancoWorkbookParser;
		this.plataformaWorkbookParser = plataformaWorkbookParser;
	}

	/**
	 * Carga ambos libros con {@link WorkbookFactory}: acepta .xls (BIFF) y .xlsx (OOXML) en cada
	 * archivo. El layout sigue siendo el de {@link BancoWorkbookParser} para bank y
	 * {@link PlataformaWorkbookParser} para company (primera hoja de cada libro).
	 */
	@Transactional
	public ImportResult importFiles(MultipartFile bankFile, MultipartFile companyFile) throws IOException {
		validateMultipart(bankFile, "banco");
		validateMultipart(companyFile, "plataforma");

		ReconciliationSession session = new ReconciliationSession();
		session.setSourceBankFileName(bankFile.getOriginalFilename());
		session.setSourceCompanyFileName(companyFile.getOriginalFilename());
		session.setStatus(SessionStatus.IMPORTED);
		session = sessionRepository.save(session);

		try (InputStream bankIs = bankFile.getInputStream();
				InputStream companyIs = companyFile.getInputStream();
				Workbook bankWb = WorkbookFactory.create(bankIs);
				Workbook companyWb = WorkbookFactory.create(companyIs)) {
			Sheet bankSheet = firstSheet(bankWb);
			Sheet companySheet = firstSheet(companyWb);

			List<BankTransaction> bankRows = bancoWorkbookParser.parse(bankSheet, session);
			List<CompanyTransaction> companyRows = plataformaWorkbookParser.parse(companySheet, session);

			bankTransactionRepository.saveAll(bankRows);
			companyTransactionRepository.saveAll(companyRows);

			return new ImportResult(session.getId(), bankRows.size(), companyRows.size(),
					session.getSourceBankFileName(), session.getSourceCompanyFileName());
		}
	}

	private static void validateMultipart(MultipartFile file, String role) {
		if (file == null || file.isEmpty()) {
			throw new IllegalArgumentException("Falta el archivo de " + role + ".");
		}
	}

	private static Sheet firstSheet(Workbook wb) {
		if (wb.getNumberOfSheets() < 1) {
			throw new IllegalArgumentException("El libro no tiene hojas.");
		}
		return wb.getSheetAt(0);
	}

	public record ImportResult(long sessionId, int bankRows, int companyRows, String sourceBankFileName,
			String sourceCompanyFileName) {
	}
}
