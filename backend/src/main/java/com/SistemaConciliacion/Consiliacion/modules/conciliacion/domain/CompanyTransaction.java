package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

import java.math.BigDecimal;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

@Entity
@Table(name = "company_transaction")
public class CompanyTransaction {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	private ReconciliationSession session;

	@Column(name = "tx_date", nullable = false)
	private LocalDate txDate;

	/**
	 * Importe para conciliación con el extracto (mismo criterio de signo que el banco): debe − haber.
	 */
	@Column(nullable = false, precision = 19, scale = 4)
	private BigDecimal amount;

	/**
	 * Neto contable de la línea (libro mayor / TES): haber − debe. Informativo; no se usa en matching.
	 */
	@Column(name = "accounting_amount", precision = 19, scale = 4)
	private BigDecimal accountingAmount;

	@Column(length = 1024)
	private String description;

	@Column(length = 255)
	private String reference;

	@Enumerated(EnumType.STRING)
	@Column(name = "pending_classification", length = 32)
	private PendingClassification pendingClassification;

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public ReconciliationSession getSession() {
		return session;
	}

	public void setSession(ReconciliationSession session) {
		this.session = session;
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

	public String getDescription() {
		return description;
	}

	public void setDescription(String description) {
		this.description = description;
	}

	public String getReference() {
		return reference;
	}

	public void setReference(String reference) {
		this.reference = reference;
	}

	public PendingClassification getPendingClassification() {
		return pendingClassification;
	}

	public void setPendingClassification(PendingClassification pendingClassification) {
		this.pendingClassification = pendingClassification;
	}
}
