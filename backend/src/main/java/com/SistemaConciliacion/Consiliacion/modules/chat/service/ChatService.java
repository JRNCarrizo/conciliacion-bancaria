package com.SistemaConciliacion.Consiliacion.modules.chat.service;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppUser;
import com.SistemaConciliacion.Consiliacion.modules.auth.repository.AppUserRepository;
import com.SistemaConciliacion.Consiliacion.modules.chat.api.dto.ChatContactDto;
import com.SistemaConciliacion.Consiliacion.modules.chat.api.dto.ChatConversationDto;
import com.SistemaConciliacion.Consiliacion.modules.chat.api.dto.ChatMessageDto;
import com.SistemaConciliacion.Consiliacion.modules.chat.domain.ChatConversation;
import com.SistemaConciliacion.Consiliacion.modules.chat.domain.ChatMessage;
import com.SistemaConciliacion.Consiliacion.modules.chat.domain.ChatReadState;
import com.SistemaConciliacion.Consiliacion.modules.chat.domain.ChatReadStatePk;
import com.SistemaConciliacion.Consiliacion.modules.chat.repository.ChatConversationRepository;
import com.SistemaConciliacion.Consiliacion.modules.chat.repository.ChatMessageRepository;
import com.SistemaConciliacion.Consiliacion.modules.chat.repository.ChatReadStateRepository;
import com.SistemaConciliacion.Consiliacion.modules.chat.ws.ChatSendPayload;

@Service
public class ChatService {

	private static final int MAX_BODY = 4000;

	private final AppUserRepository appUserRepository;
	private final ChatConversationRepository conversationRepository;
	private final ChatMessageRepository messageRepository;
	private final ChatReadStateRepository readStateRepository;
	private final ChatParticipantVerifier participantVerifier;
	private final SimpMessagingTemplate messagingTemplate;

	public ChatService(AppUserRepository appUserRepository, ChatConversationRepository conversationRepository,
			ChatMessageRepository messageRepository, ChatReadStateRepository readStateRepository,
			ChatParticipantVerifier participantVerifier, SimpMessagingTemplate messagingTemplate) {
		this.appUserRepository = appUserRepository;
		this.conversationRepository = conversationRepository;
		this.messageRepository = messageRepository;
		this.readStateRepository = readStateRepository;
		this.participantVerifier = participantVerifier;
		this.messagingTemplate = messagingTemplate;
	}

	@Transactional(readOnly = true)
	public boolean isParticipant(long conversationId, String username) {
		return participantVerifier.isParticipant(conversationId, username);
	}

	@Transactional(readOnly = true)
	public List<ChatContactDto> listContacts(String username) {
		AppUser me = appUserRepository.findByUsernameIgnoreCase(username)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		Long myId = me.getId();
		Map<Long, Long> unreadByPeer = unreadCountByPeerUser(me);
		Map<Long, ChatConversation> convByPeer = new HashMap<>();
		for (ChatConversation c : conversationRepository.findAllForParticipant(myId.longValue())) {
			convByPeer.put(peerUserId(c, myId), c);
		}
		return appUserRepository.findByEnabledTrueAndIdNotOrderByUsernameAsc(myId.longValue()).stream().map(peer -> {
			ChatConversation conv = convByPeer.get(peer.getId());
			Long convId = conv != null ? conv.getId() : null;
			Instant lastAt = conv != null ? conv.getUpdatedAt() : null;
			long unread = unreadByPeer.getOrDefault(peer.getId(), 0L);
			return new ChatContactDto(peer.getId(), peer.getUsername(), convId, lastAt, unread);
		}).sorted((a, b) -> {
			Instant ta = a.lastActivityAt() != null ? a.lastActivityAt() : Instant.MIN;
			Instant tb = b.lastActivityAt() != null ? b.lastActivityAt() : Instant.MIN;
			int cmp = tb.compareTo(ta);
			if (cmp != 0) {
				return cmp;
			}
			return a.username().compareToIgnoreCase(b.username());
		}).toList();
	}

	@Transactional(readOnly = true)
	public List<ChatConversationDto> listConversations(String username) {
		AppUser me = appUserRepository.findByUsernameIgnoreCase(username)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		Map<Long, Long> unreadByConv = unreadCountsGrouped(me.getId());
		return conversationRepository.findAllForParticipant(me.getId()).stream()
				.map(c -> toConversationDto(c, me, unreadByConv.getOrDefault(c.getId(), 0L))).toList();
	}

	@Transactional(readOnly = true)
	public long totalUnreadMessages(String username) {
		AppUser me = appUserRepository.findByUsernameIgnoreCase(username)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		Long n = messageRepository.countTotalUnreadMessages(me.getId());
		return n != null ? n.longValue() : 0L;
	}

	@Transactional
	public void markConversationRead(String username, long conversationId) {
		if (!participantVerifier.isParticipant(conversationId, username)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN);
		}
		AppUser me = appUserRepository.findByUsernameIgnoreCase(username)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		Long maxId = messageRepository.maxIdForConversation(conversationId);
		if (maxId == null) {
			return;
		}
		ChatReadStatePk pk = new ChatReadStatePk(conversationId, me.getId());
		ChatReadState row = readStateRepository.findById(pk).orElseGet(() -> {
			ChatReadState n = new ChatReadState();
			n.setId(pk);
			return n;
		});
		row.setLastReadMessageId(maxId);
		row.setUpdatedAt(Instant.now());
		readStateRepository.save(row);
		ChatConversation conv = conversationRepository.findById(conversationId).orElse(null);
		if (conv != null) {
			long peerNotifyId = peerUserId(conv, me.getId());
			messagingTemplate.convertAndSend("/topic/chat.notify." + peerNotifyId,
					String.format(Locale.US,
							"{\"type\":\"readReceipt\",\"conversationId\":%d,\"lastReadMessageId\":%d}",
							conversationId, maxId.longValue()));
		}
	}

	private Map<Long, Long> unreadCountsGrouped(long userId) {
		Map<Long, Long> map = new HashMap<>();
		for (Object[] row : messageRepository.countUnreadGroupedByConversation(userId)) {
			map.put(((Number) row[0]).longValue(), ((Number) row[1]).longValue());
		}
		return map;
	}

	/** userId del otro participante → mensajes sin leer que te envió en ese DM. */
	private Map<Long, Long> unreadCountByPeerUser(AppUser me) {
		Long myId = me.getId();
		Map<Long, Long> unreadByConv = unreadCountsGrouped(myId.longValue());
		Map<Long, Long> byPeer = new HashMap<>();
		for (ChatConversation c : conversationRepository.findAllForParticipant(myId.longValue())) {
			Long peerId = peerUserId(c, myId);
			byPeer.put(peerId, unreadByConv.getOrDefault(c.getId(), 0L));
		}
		return byPeer;
	}

	private static Long peerUserId(ChatConversation c, Long meId) {
		return c.getUserLow().getId().equals(meId) ? c.getUserHigh().getId() : c.getUserLow().getId();
	}

	@Transactional
	public ChatConversationDto openConversation(String username, long peerUserId) {
		AppUser me = appUserRepository.findByUsernameIgnoreCase(username)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		if (peerUserId == me.getId()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No podés chatear con vos mismo.");
		}
		AppUser peer = appUserRepository.findById(peerUserId).filter(AppUser::isEnabled).orElseThrow(
				() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado o inhabilitado."));
		long low = Math.min(me.getId(), peer.getId());
		long high = Math.max(me.getId(), peer.getId());
		ChatConversation conv = conversationRepository.findByUserLow_IdAndUserHigh_Id(low, high).orElseGet(() -> {
			ChatConversation c = new ChatConversation();
			c.setUserLow(appUserRepository.getReferenceById(low));
			c.setUserHigh(appUserRepository.getReferenceById(high));
			return conversationRepository.save(c);
		});
		Map<Long, Long> unread = unreadCountsGrouped(me.getId());
		return toConversationDto(conv, me, unread.getOrDefault(conv.getId(), 0L));
	}

	@Transactional(readOnly = true)
	public Page<ChatMessageDto> pageMessages(String username, long conversationId, Pageable pageable) {
		if (!isParticipant(conversationId, username)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN);
		}
		AppUser me = appUserRepository.findByUsernameIgnoreCase(username)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		ChatConversation conv = conversationRepository.findById(conversationId)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		Long peerLastRead = peerLastReadMessageId(conversationId, peerUserId(conv, me.getId()));
		final Long peerCursor = peerLastRead;
		return messageRepository.findByConversation_IdOrderByCreatedAtAsc(conversationId, pageable)
				.map(m -> toMessageDto(m, peerCursor));
	}

	@Transactional
	public void sendFromSocket(String username, ChatSendPayload payload) {
		if (payload == null || payload.conversationId() == null) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Datos incompletos.");
		}
		String body = payload.body() == null ? "" : payload.body().trim();
		if (body.isEmpty()) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El mensaje está vacío.");
		}
		if (body.length() > MAX_BODY) {
			throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El mensaje es demasiado largo.");
		}
		long convId = payload.conversationId();
		if (!isParticipant(convId, username)) {
			throw new ResponseStatusException(HttpStatus.FORBIDDEN);
		}
		AppUser sender = appUserRepository.findByUsernameIgnoreCase(username)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
		ChatMessage msg = new ChatMessage();
		msg.setConversation(conversationRepository.getReferenceById(convId));
		msg.setSender(sender);
		msg.setBody(body);
		messageRepository.save(msg);
		ChatConversation conv = conversationRepository.findById(convId).orElseThrow();
		conv.setUpdatedAt(Instant.now());
		conversationRepository.save(conv);
		long senderId = sender.getId();
		Long peerLastRead = peerLastReadMessageId(convId, peerUserId(conv, senderId));
		messagingTemplate.convertAndSend("/topic/chat." + convId, toMessageDto(msg, peerLastRead));
		long lowId = conv.getUserLow().getId();
		long highId = conv.getUserHigh().getId();
		if (lowId != senderId) {
			messagingTemplate.convertAndSend("/topic/chat.notify." + lowId, "{\"type\":\"unread\"}");
		}
		if (highId != senderId) {
			messagingTemplate.convertAndSend("/topic/chat.notify." + highId, "{\"type\":\"unread\"}");
		}
	}

	private ChatConversationDto toConversationDto(ChatConversation c, AppUser me, long unreadCount) {
		AppUser peer = c.getUserLow().getId().equals(me.getId()) ? c.getUserHigh() : c.getUserLow();
		return new ChatConversationDto(c.getId(), peer.getId(), peer.getUsername(), c.getUpdatedAt(), unreadCount);
	}

	private Long peerLastReadMessageId(long conversationId, long peerUserId) {
		ChatReadStatePk pk = new ChatReadStatePk(conversationId, peerUserId);
		return readStateRepository.findById(pk).map(ChatReadState::getLastReadMessageId).orElse(null);
	}

	private ChatMessageDto toMessageDto(ChatMessage m, Long peerLastReadMessageId) {
		boolean readByPeer = peerLastReadMessageId != null && peerLastReadMessageId.longValue() >= m.getId();
		return new ChatMessageDto(m.getId(), m.getConversation().getId(), m.getSender().getId(),
				m.getSender().getUsername(), m.getBody(), m.getCreatedAt(), readByPeer);
	}
}
