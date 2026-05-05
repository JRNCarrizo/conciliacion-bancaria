package com.SistemaConciliacion.Consiliacion.modules.chat.domain;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "chat_read_state")
public class ChatReadState {

	@EmbeddedId
	private ChatReadStatePk id;

	@Column(name = "last_read_message_id")
	private Long lastReadMessageId;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt = Instant.now();

	public ChatReadState() {
	}

	public ChatReadStatePk getId() {
		return id;
	}

	public void setId(ChatReadStatePk id) {
		this.id = id;
	}

	public Long getLastReadMessageId() {
		return lastReadMessageId;
	}

	public void setLastReadMessageId(Long lastReadMessageId) {
		this.lastReadMessageId = lastReadMessageId;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public void setUpdatedAt(Instant updatedAt) {
		this.updatedAt = updatedAt;
	}
}
