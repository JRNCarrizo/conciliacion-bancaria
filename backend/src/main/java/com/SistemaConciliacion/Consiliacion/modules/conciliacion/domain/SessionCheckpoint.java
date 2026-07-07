package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Lob;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "session_checkpoint")
public class SessionCheckpoint {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "session_id", nullable = false)
	private ReconciliationSession session;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt = Instant.now();

	@Column(name = "created_by_username", nullable = false, length = 128)
	private String createdByUsername;

	@Column(length = 512)
	private String note;

	@Column(name = "session_status", nullable = false, length = 32)
	private String sessionStatus;

	@Column(name = "matched_pairs", nullable = false)
	private long matchedPairs;

	@Column(name = "unmatched_bank_count", nullable = false)
	private long unmatchedBankCount;

	@Column(name = "unmatched_company_count", nullable = false)
	private long unmatchedCompanyCount;

	@Column(name = "reconciliation_status", nullable = false, length = 64)
	private String reconciliationStatus;

	@Lob
	@Column(name = "stats_json", nullable = false, columnDefinition = "MEDIUMTEXT")
	private String statsJson;

	@Column(name = "pdf_stored_path", nullable = false, length = 512)
	private String pdfStoredPath;

	@Column(name = "pdf_size_bytes", nullable = false)
	private long pdfSizeBytes;

	public Long getId() {
		return id;
	}

	public ReconciliationSession getSession() {
		return session;
	}

	public void setSession(ReconciliationSession session) {
		this.session = session;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public String getCreatedByUsername() {
		return createdByUsername;
	}

	public void setCreatedByUsername(String createdByUsername) {
		this.createdByUsername = createdByUsername;
	}

	public String getNote() {
		return note;
	}

	public void setNote(String note) {
		this.note = note;
	}

	public String getSessionStatus() {
		return sessionStatus;
	}

	public void setSessionStatus(String sessionStatus) {
		this.sessionStatus = sessionStatus;
	}

	public long getMatchedPairs() {
		return matchedPairs;
	}

	public void setMatchedPairs(long matchedPairs) {
		this.matchedPairs = matchedPairs;
	}

	public long getUnmatchedBankCount() {
		return unmatchedBankCount;
	}

	public void setUnmatchedBankCount(long unmatchedBankCount) {
		this.unmatchedBankCount = unmatchedBankCount;
	}

	public long getUnmatchedCompanyCount() {
		return unmatchedCompanyCount;
	}

	public void setUnmatchedCompanyCount(long unmatchedCompanyCount) {
		this.unmatchedCompanyCount = unmatchedCompanyCount;
	}

	public String getReconciliationStatus() {
		return reconciliationStatus;
	}

	public void setReconciliationStatus(String reconciliationStatus) {
		this.reconciliationStatus = reconciliationStatus;
	}

	public String getStatsJson() {
		return statsJson;
	}

	public void setStatsJson(String statsJson) {
		this.statsJson = statsJson;
	}

	public String getPdfStoredPath() {
		return pdfStoredPath;
	}

	public void setPdfStoredPath(String pdfStoredPath) {
		this.pdfStoredPath = pdfStoredPath;
	}

	public long getPdfSizeBytes() {
		return pdfSizeBytes;
	}

	public void setPdfSizeBytes(long pdfSizeBytes) {
		this.pdfSizeBytes = pdfSizeBytes;
	}
}
