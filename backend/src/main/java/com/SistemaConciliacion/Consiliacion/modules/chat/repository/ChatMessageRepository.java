package com.SistemaConciliacion.Consiliacion.modules.chat.repository;

import java.util.List;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.chat.domain.ChatMessage;

public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

	@EntityGraph(attributePaths = { "sender", "conversation" })
	Page<ChatMessage> findByConversation_IdOrderByCreatedAtAsc(long conversationId, Pageable pageable);

	@Query("SELECT MAX(m.id) FROM ChatMessage m WHERE m.conversation.id = :cid")
	Long maxIdForConversation(@Param("cid") long conversationId);

	@Query(value = """
			SELECT COUNT(*) FROM chat_message m
			INNER JOIN chat_conversation c ON m.conversation_id = c.id
			LEFT JOIN chat_read_state r ON r.conversation_id = c.id AND r.user_id = :uid
			WHERE (c.user_low_id = :uid OR c.user_high_id = :uid)
			AND m.sender_id <> :uid
			AND m.id > COALESCE(r.last_read_message_id, 0)
			""", nativeQuery = true)
	Long countTotalUnreadMessages(@Param("uid") long userId);

	@Query(value = """
			SELECT m.conversation_id, COUNT(*) FROM chat_message m
			INNER JOIN chat_conversation c ON m.conversation_id = c.id
			LEFT JOIN chat_read_state r ON r.conversation_id = c.id AND r.user_id = :uid
			WHERE (c.user_low_id = :uid OR c.user_high_id = :uid)
			AND m.sender_id <> :uid
			AND m.id > COALESCE(r.last_read_message_id, 0)
			GROUP BY m.conversation_id
			""", nativeQuery = true)
	List<Object[]> countUnreadGroupedByConversation(@Param("uid") long userId);
}
