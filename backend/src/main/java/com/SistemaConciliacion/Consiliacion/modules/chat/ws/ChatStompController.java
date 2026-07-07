package com.SistemaConciliacion.Consiliacion.modules.chat.ws;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

import com.SistemaConciliacion.Consiliacion.modules.chat.service.ChatService;

@Controller
public class ChatStompController {

	private final ChatService chatService;

	public ChatStompController(ChatService chatService) {
		this.chatService = chatService;
	}

	@MessageMapping("/chat.send")
	public void send(ChatSendPayload payload, Principal principal) {
		if (principal == null) {
			return;
		}
		chatService.sendFromSocket(principal.getName(), payload);
	}
}
