package com.SistemaConciliacion.Consiliacion.modules.chat.ws;

import java.security.Principal;
import java.util.List;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import com.SistemaConciliacion.Consiliacion.modules.auth.repository.AppUserRepository;
import com.SistemaConciliacion.Consiliacion.modules.auth.security.JwtBearerAuthenticator;
import com.SistemaConciliacion.Consiliacion.modules.chat.service.ChatParticipantVerifier;

@Component
public class ChatStompJwtChannelInterceptor implements ChannelInterceptor {

	private final JwtBearerAuthenticator jwtBearerAuthenticator;
	private final ChatParticipantVerifier participantVerifier;
	private final AppUserRepository appUserRepository;

	public ChatStompJwtChannelInterceptor(JwtBearerAuthenticator jwtBearerAuthenticator,
			ChatParticipantVerifier participantVerifier, AppUserRepository appUserRepository) {
		this.jwtBearerAuthenticator = jwtBearerAuthenticator;
		this.participantVerifier = participantVerifier;
		this.appUserRepository = appUserRepository;
	}

	@Override
	public Message<?> preSend(Message<?> message, MessageChannel channel) {
		StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
		if (accessor == null) {
			return message;
		}
		StompCommand cmd = accessor.getCommand();
		if (StompCommand.CONNECT.equals(cmd)) {
			List<String> headers = accessor.getNativeHeader("Authorization");
			String bearer = headers != null && !headers.isEmpty() ? headers.getFirst() : null;
			if (bearer == null || !bearer.startsWith("Bearer ")) {
				throw new MessagingException("Se requiere Authorization Bearer en CONNECT.");
			}
			String token = bearer.substring(7).trim();
			Authentication auth = jwtBearerAuthenticator.authenticate(token)
					.orElseThrow(() -> new MessagingException("Token inválido."));
			accessor.setUser(auth);
			return message;
		}
		if (StompCommand.SUBSCRIBE.equals(cmd)) {
			String dest = accessor.getDestination();
			Principal user = accessor.getUser();
			if (dest != null && user instanceof Authentication auth) {
				if (dest.startsWith("/topic/chat.notify.")) {
					long uid = Long.parseLong(dest.substring("/topic/chat.notify.".length()));
					var me = appUserRepository.findByUsernameIgnoreCase(auth.getName()).orElseThrow();
					if (me.getId().longValue() != uid) {
						throw new MessagingException("No autorizado a notificaciones de otro usuario.");
					}
					return message;
				}
				if (dest.startsWith("/topic/chat.")) {
					long convId = Long.parseLong(dest.substring("/topic/chat.".length()));
					if (!participantVerifier.isParticipant(convId, auth.getName())) {
						throw new MessagingException("No autorizado a esta conversación.");
					}
				}
			}
			return message;
		}
		return message;
	}
}
