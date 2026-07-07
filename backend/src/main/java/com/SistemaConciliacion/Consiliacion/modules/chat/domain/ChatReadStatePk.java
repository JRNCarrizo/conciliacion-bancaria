package com.SistemaConciliacion.Consiliacion.modules.chat.domain;

import java.io.Serializable;
import java.util.Objects;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

@Embeddable
public class ChatReadStatePk implements Serializable {

	@Column(name = "conversation_id", nullable = false)
	private long conversationId;

	@Column(name = "user_id", nullable = false)
	private long userId;

	protected ChatReadStatePk() {
	}

	public ChatReadStatePk(long conversationId, long userId) {
		this.conversationId = conversationId;
		this.userId = userId;
	}

	public long getConversationId() {
		return conversationId;
	}

	public long getUserId() {
		return userId;
	}

	@Override
	public boolean equals(Object o) {
		if (this == o) {
			return true;
		}
		if (o == null || getClass() != o.getClass()) {
			return false;
		}
		ChatReadStatePk that = (ChatReadStatePk) o;
		return conversationId == that.conversationId && userId == that.userId;
	}

	@Override
	public int hashCode() {
		return Objects.hash(conversationId, userId);
	}
}
