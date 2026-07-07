package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "reconciliation_group_bank_member", uniqueConstraints = {
		@UniqueConstraint(name = "uk_rgbm_bank", columnNames = "bank_transaction_id") })
public class ReconciliationGroupBankMember {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "group_id", nullable = false)
	private ReconciliationGroup group;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "bank_transaction_id", nullable = false, unique = true)
	private BankTransaction bankTransaction;

	public Long getId() {
		return id;
	}

	public void setId(Long id) {
		this.id = id;
	}

	public ReconciliationGroup getGroup() {
		return group;
	}

	public void setGroup(ReconciliationGroup group) {
		this.group = group;
	}

	public BankTransaction getBankTransaction() {
		return bankTransaction;
	}

	public void setBankTransaction(BankTransaction bankTransaction) {
		this.bankTransaction = bankTransaction;
	}
}
