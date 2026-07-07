package com.SistemaConciliacion.Consiliacion.modules.chat.service;

import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.SistemaConciliacion.Consiliacion.modules.auth.repository.AppUserRepository;
import com.SistemaConciliacion.Consiliacion.modules.chat.repository.ChatConversationRepository;

/** Solo lectura JPA; usado por STOMP (sin depender de {@link ChatService} / broker). */
@Component
public class ChatParticipantVerifier {

	private final AppUserRepository appUserRepository;
	private final ChatConversationRepository conversationRepository;

	public ChatParticipantVerifier(AppUserRepository appUserRepository,
			ChatConversationRepository conversationRepository) {
		this.appUserRepository = appUserRepository;
		this.conversationRepository = conversationRepository;
	}

	@Transactional(readOnly = true)
	public boolean isParticipant(long conversationId, String username) {
		var me = appUserRepository.findByUsernameIgnoreCase(username).orElse(null);
		if (me == null) {
			return false;
		}
		var conv = conversationRepository.findById(conversationId).orElse(null);
		if (conv == null) {
			return false;
		}
		long uid = me.getId();
		return conv.getUserLow().getId().equals(uid) || conv.getUserHigh().getId().equals(uid);
	}
}
