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

@Entity
@Table(name = "pending_movement_comment")
public class PendingMovementComment {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@ManyToOne(optional = false, fetch = FetchType.LAZY)
	@JoinColumn(name = "session_id", nullable = false)
	private ReconciliationSession session;

	@Enumerated(EnumType.STRING)
	@Column(name = "movement_side", nullable = false, length = 16)
	private PendingMovementSide movementSide;

	@Column(name = "movement_id", nullable = false)
	private Long movementId;

	@Column(nullable = false, length = 4000)
	private String body;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "created_by_username", length = 128)
	private String createdByUsername;

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

	public PendingMovementSide getMovementSide() {
		return movementSide;
	}

	public void setMovementSide(PendingMovementSide movementSide) {
		this.movementSide = movementSide;
	}

	public Long getMovementId() {
		return movementId;
	}

	public void setMovementId(Long movementId) {
		this.movementId = movementId;
	}

	public String getBody() {
		return body;
	}

	public void setBody(String body) {
		this.body = body;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public void setCreatedAt(Instant createdAt) {
		this.createdAt = createdAt;
	}

	public String getCreatedByUsername() {
		return createdByUsername;
	}

	public void setCreatedByUsername(String createdByUsername) {
		this.createdByUsername = createdByUsername;
	}
}
