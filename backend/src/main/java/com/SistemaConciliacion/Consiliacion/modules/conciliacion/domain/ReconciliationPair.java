package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

import java.time.Instant;

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
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "reconciliation_pair", uniqueConstraints = {
		@UniqueConstraint(name = "uk_pair_bank", columnNames = "bank_transaction_id"),
		@UniqueConstraint(name = "uk_pair_company", columnNames = "company_transaction_id") })
public class ReconciliationPair {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	private ReconciliationSession session;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "bank_transaction_id", nullable = false, unique = true)
	private BankTransaction bankTransaction;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "company_transaction_id", nullable = false, unique = true)
	private CompanyTransaction companyTransaction;

	@Enumerated(EnumType.STRING)
	@Column(name = "match_source", nullable = false, length = 16)
	private MatchSource matchSource = MatchSource.AUTO;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

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

	public ReconciliationSession getSession() {
		return session;
	}

	public void setSession(ReconciliationSession session) {
		this.session = session;
	}

	public BankTransaction getBankTransaction() {
		return bankTransaction;
	}

	public void setBankTransaction(BankTransaction bankTransaction) {
		this.bankTransaction = bankTransaction;
	}

	public CompanyTransaction getCompanyTransaction() {
		return companyTransaction;
	}

	public void setCompanyTransaction(CompanyTransaction companyTransaction) {
		this.companyTransaction = companyTransaction;
	}

	public MatchSource getMatchSource() {
		return matchSource;
	}

	public void setMatchSource(MatchSource matchSource) {
		this.matchSource = matchSource;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public void setCreatedAt(Instant createdAt) {
		this.createdAt = createdAt;
	}
}
