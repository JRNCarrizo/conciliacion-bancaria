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
@Table(name = "reconciliation_group_company_member", uniqueConstraints = {
		@UniqueConstraint(name = "uk_rgcm_company", columnNames = "company_transaction_id") })
public class ReconciliationGroupCompanyMember {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "group_id", nullable = false)
	private ReconciliationGroup group;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "company_transaction_id", nullable = false, unique = true)
	private CompanyTransaction companyTransaction;

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

	public CompanyTransaction getCompanyTransaction() {
		return companyTransaction;
	}

	public void setCompanyTransaction(CompanyTransaction companyTransaction) {
		this.companyTransaction = companyTransaction;
	}
}
