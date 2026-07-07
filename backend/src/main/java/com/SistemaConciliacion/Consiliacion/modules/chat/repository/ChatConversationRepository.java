package com.SistemaConciliacion.Consiliacion.modules.chat.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.chat.domain.ChatConversation;

public interface ChatConversationRepository extends JpaRepository<ChatConversation, Long> {

	Optional<ChatConversation> findByUserLow_IdAndUserHigh_Id(long userLowId, long userHighId);

	@Query("""
			SELECT DISTINCT c FROM ChatConversation c
			JOIN FETCH c.userLow JOIN FETCH c.userHigh
			WHERE c.userLow.id = :uid OR c.userHigh.id = :uid
			ORDER BY c.updatedAt DESC
			""")
	List<ChatConversation> findAllForParticipant(@Param("uid") long userId);
}
