package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ImportFileSummaryDto;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "reconciliation_session")
public class ReconciliationSession {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "source_bank_file_name")
	private String sourceBankFileName;

	@Column(name = "source_company_file_name")
	private String sourceCompanyFileName;

	@Convert(converter = ImportFileSummaryListConverter.class)
	@Column(name = "bank_import_file_summaries", columnDefinition = "TEXT")
	private List<ImportFileSummaryDto> bankImportFileSummaries = new ArrayList<>();

	@Convert(converter = ImportFileSummaryListConverter.class)
	@Column(name = "company_import_file_summaries", columnDefinition = "TEXT")
	private List<ImportFileSummaryDto> companyImportFileSummaries = new ArrayList<>();

	/** Nombre legible opcional (ej. «Octubre 2025»). */
	@Column(name = "display_name", length = 120)
	private String displayName;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 32)
	private SessionStatus status = SessionStatus.IMPORTED;

	@Column(name = "opening_bank_balance", precision = 19, scale = 4)
	private BigDecimal openingBankBalance;

	@Column(name = "closing_bank_balance", precision = 19, scale = 4)
	private BigDecimal closingBankBalance;

	@Column(name = "opening_company_balance", precision = 19, scale = 4)
	private BigDecimal openingCompanyBalance;

	@Column(name = "closing_company_balance", precision = 19, scale = 4)
	private BigDecimal closingCompanyBalance;

	/** Última tolerancia de importe usada en conciliar automático (clasificación de brechas en UI). */
	@Column(name = "amount_tolerance", precision = 19, scale = 4)
	private BigDecimal amountTolerance;

	@Column(name = "date_tolerance_days")
	private Integer dateToleranceDays;

	@PrePersist
	void prePersist() {
		if (createdAt == null) {
			createdAt = Instant.now();
		}
	}

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public void setCreatedAt(Instant createdAt) {
		this.createdAt = createdAt;
	}

	public String getSourceBankFileName() {
		return sourceBankFileName;
	}

	public void setSourceBankFileName(String sourceBankFileName) {
		this.sourceBankFileName = sourceBankFileName;
	}

	public String getSourceCompanyFileName() {
		return sourceCompanyFileName;
	}

	public void setSourceCompanyFileName(String sourceCompanyFileName) {
		this.sourceCompanyFileName = sourceCompanyFileName;
	}

	public List<ImportFileSummaryDto> getBankImportFileSummaries() {
		return bankImportFileSummaries;
	}

	public void setBankImportFileSummaries(List<ImportFileSummaryDto> bankImportFileSummaries) {
		this.bankImportFileSummaries = bankImportFileSummaries != null ? bankImportFileSummaries : new ArrayList<>();
	}

	public List<ImportFileSummaryDto> getCompanyImportFileSummaries() {
		return companyImportFileSummaries;
	}

	public void setCompanyImportFileSummaries(List<ImportFileSummaryDto> companyImportFileSummaries) {
		this.companyImportFileSummaries = companyImportFileSummaries != null ? companyImportFileSummaries
				: new ArrayList<>();
	}

	public String getDisplayName() {
		return displayName;
	}

	public void setDisplayName(String displayName) {
		this.displayName = displayName;
	}

	public SessionStatus getStatus() {
		return status;
	}

	public void setStatus(SessionStatus status) {
		this.status = status;
	}

	public BigDecimal getOpeningBankBalance() {
		return openingBankBalance;
	}

	public void setOpeningBankBalance(BigDecimal openingBankBalance) {
		this.openingBankBalance = openingBankBalance;
	}

	public BigDecimal getClosingBankBalance() {
		return closingBankBalance;
	}

	public void setClosingBankBalance(BigDecimal closingBankBalance) {
		this.closingBankBalance = closingBankBalance;
	}

	public BigDecimal getOpeningCompanyBalance() {
		return openingCompanyBalance;
	}

	public void setOpeningCompanyBalance(BigDecimal openingCompanyBalance) {
		this.openingCompanyBalance = openingCompanyBalance;
	}

	public BigDecimal getClosingCompanyBalance() {
		return closingCompanyBalance;
	}

	public void setClosingCompanyBalance(BigDecimal closingCompanyBalance) {
		this.closingCompanyBalance = closingCompanyBalance;
	}

	public BigDecimal getAmountTolerance() {
		return amountTolerance;
	}

	public void setAmountTolerance(BigDecimal amountTolerance) {
		this.amountTolerance = amountTolerance;
	}

	public Integer getDateToleranceDays() {
		return dateToleranceDays;
	}

	public void setDateToleranceDays(Integer dateToleranceDays) {
		this.dateToleranceDays = dateToleranceDays;
	}
}
