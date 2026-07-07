package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "deferred_movement")
public class DeferredMovement {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Enumerated(EnumType.STRING)
	@Column(name = "movement_side", nullable = false, length = 16)
	private PendingMovementSide movementSide;

	@Column(name = "tx_date", nullable = false)
	private LocalDate txDate;

	@Column(nullable = false, precision = 19, scale = 4)
	private BigDecimal amount;

	@Column(name = "accounting_amount", precision = 19, scale = 4)
	private BigDecimal accountingAmount;

	@Column(length = 255)
	private String reference;

	@Column(length = 1024)
	private String description;

	@Column(name = "pending_classification", length = 128)
	private String pendingClassification;

	@Column(name = "content_fingerprint", length = 64)
	private String contentFingerprint;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "source_session_id", nullable = false)
	private ReconciliationSession sourceSession;

	@Column(name = "source_transaction_id")
	private Long sourceTransactionId;

	@Column(name = "excluded_at", nullable = false)
	private Instant excludedAt;

	@Column(name = "excluded_by", length = 128)
	private String excludedBy;

	@Column(length = 512)
	private String note;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false, length = 16)
	private DeferredMovementStatus status = DeferredMovementStatus.AVAILABLE;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "consumed_session_id")
	private ReconciliationSession consumedSession;

	@Column(name = "consumed_at")
	private Instant consumedAt;

	@Column(name = "created_transaction_id")
	private Long createdTransactionId;

	@PrePersist
	void prePersist() {
		if (excludedAt == null) {
			excludedAt = Instant.now();
		}
	}

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public PendingMovementSide getMovementSide() {
		return movementSide;
	}

	public void setMovementSide(PendingMovementSide movementSide) {
		this.movementSide = movementSide;
	}

	public LocalDate getTxDate() {
		return txDate;
	}

	public void setTxDate(LocalDate txDate) {
		this.txDate = txDate;
	}

	public BigDecimal getAmount() {
		return amount;
	}

	public void setAmount(BigDecimal amount) {
		this.amount = amount;
	}

	public BigDecimal getAccountingAmount() {
		return accountingAmount;
	}

	public void setAccountingAmount(BigDecimal accountingAmount) {
		this.accountingAmount = accountingAmount;
	}

	public String getReference() {
		return reference;
	}

	public void setReference(String reference) {
		this.reference = reference;
	}

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public String getPendingClassification() {
		return pendingClassification;
	}

	public void setPendingClassification(String pendingClassification) {
		this.pendingClassification = pendingClassification;
	}

	public String getContentFingerprint() {
		return contentFingerprint;
	}

	public void setContentFingerprint(String contentFingerprint) {
		this.contentFingerprint = contentFingerprint;
	}

	public ReconciliationSession getSourceSession() {
		return sourceSession;
	}

	public void setSourceSession(ReconciliationSession sourceSession) {
		this.sourceSession = sourceSession;
	}

	public Long getSourceTransactionId() {
		return sourceTransactionId;
	}

	public void setSourceTransactionId(Long sourceTransactionId) {
		this.sourceTransactionId = sourceTransactionId;
	}

	public Instant getExcludedAt() {
		return excludedAt;
	}

	public void setExcludedAt(Instant excludedAt) {
		this.excludedAt = excludedAt;
	}

	public String getExcludedBy() {
		return excludedBy;
	}

	public void setExcludedBy(String excludedBy) {
		this.excludedBy = excludedBy;
	}

	public String getNote() {
		return note;
	}

	public void setNote(String note) {
		this.note = note;
	}

	public DeferredMovementStatus getStatus() {
		return status;
	}

	public void setStatus(DeferredMovementStatus status) {
		this.status = status;
	}

	public ReconciliationSession getConsumedSession() {
		return consumedSession;
	}

	public void setConsumedSession(ReconciliationSession consumedSession) {
		this.consumedSession = consumedSession;
	}

	public Instant getConsumedAt() {
		return consumedAt;
	}

	public void setConsumedAt(Instant consumedAt) {
		this.consumedAt = consumedAt;
	}

	public Long getCreatedTransactionId() {
		return createdTransactionId;
	}

	public void setCreatedTransactionId(Long createdTransactionId) {
		this.createdTransactionId = createdTransactionId;
	}
}
