package com.SistemaConciliacion.Consiliacion.modules.chat.api;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.SistemaConciliacion.Consiliacion.modules.chat.api.dto.ChatContactDto;
import com.SistemaConciliacion.Consiliacion.modules.chat.api.dto.ChatConversationDto;
import com.SistemaConciliacion.Consiliacion.modules.chat.api.dto.ChatMessageDto;
import com.SistemaConciliacion.Consiliacion.modules.chat.api.dto.ChatUnreadCountDto;
import com.SistemaConciliacion.Consiliacion.modules.chat.api.dto.OpenConversationRequest;
import com.SistemaConciliacion.Consiliacion.modules.chat.service.ChatService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/chat")
@Validated
public class ChatController {

	private final ChatService chatService;

	public ChatController(ChatService chatService) {
		this.chatService = chatService;
	}

	@GetMapping("/contacts")
	public List<ChatContactDto> contacts(@AuthenticationPrincipal String username) {
		return chatService.listContacts(username);
	}

	@GetMapping("/unread-count")
	public ChatUnreadCountDto unreadCount(@AuthenticationPrincipal String username) {
		return new ChatUnreadCountDto(chatService.totalUnreadMessages(username));
	}

	@GetMapping("/conversations")
	public List<ChatConversationDto> conversations(@AuthenticationPrincipal String username) {
		return chatService.listConversations(username);
	}

	@PostMapping("/conversations/open")
	public ChatConversationDto openConversation(@AuthenticationPrincipal String username,
			@Valid @RequestBody OpenConversationRequest body) {
		return chatService.openConversation(username, body.peerUserId());
	}

	@PostMapping("/conversations/{id}/read")
	public void markRead(@AuthenticationPrincipal String username, @PathVariable("id") long id) {
		chatService.markConversationRead(username, id);
	}

	@GetMapping("/conversations/{id}/messages")
	public Page<ChatMessageDto> messages(@AuthenticationPrincipal String username, @PathVariable("id") long id,
			@RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "100") int size) {
		int safeSize = Math.min(Math.max(size, 1), 500);
		return chatService.pageMessages(username, id, PageRequest.of(page, safeSize));
	}
}
