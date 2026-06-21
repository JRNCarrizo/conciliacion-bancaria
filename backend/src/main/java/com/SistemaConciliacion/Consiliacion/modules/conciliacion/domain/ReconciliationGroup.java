package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CascadeType;
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
import jakarta.persistence.OneToMany;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "reconciliation_group")
public class ReconciliationGroup {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	private ReconciliationSession session;

	@Enumerated(EnumType.STRING)
	@Column(name = "match_source", nullable = false, length = 16)
	private MatchSource matchSource = MatchSource.MANUAL;

	@Column(name = "classification", length = 128)
	private String classification;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<ReconciliationGroupBankMember> bankMembers = new ArrayList<>();

	@OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
	private List<ReconciliationGroupCompanyMember> companyMembers = new ArrayList<>();

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

	public MatchSource getMatchSource() {
		return matchSource;
	}

	public void setMatchSource(MatchSource matchSource) {
		this.matchSource = matchSource;
	}

	public String getClassification() {
		return classification;
	}

	public void setClassification(String classification) {
		this.classification = classification;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public void setCreatedAt(Instant createdAt) {
		this.createdAt = createdAt;
	}

	public List<ReconciliationGroupBankMember> getBankMembers() {
		return bankMembers;
	}

	public void setBankMembers(List<ReconciliationGroupBankMember> bankMembers) {
		this.bankMembers = bankMembers;
	}

	public List<ReconciliationGroupCompanyMember> getCompanyMembers() {
		return companyMembers;
	}

	public void setCompanyMembers(List<ReconciliationGroupCompanyMember> companyMembers) {
		this.companyMembers = companyMembers;
	}
}
