package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.GroupAttachment;

public interface GroupAttachmentRepository extends JpaRepository<GroupAttachment, Long> {

	List<GroupAttachment> findBySession_IdAndGroup_IdOrderByCreatedAtAsc(long sessionId, long groupId);

	List<GroupAttachment> findBySession_IdAndGroup_IdIn(long sessionId, Collection<Long> groupIds);

	Optional<GroupAttachment> findByIdAndSession_IdAndGroup_Id(long id, long sessionId, long groupId);

	@Query("SELECT g.id, COUNT(a) FROM GroupAttachment a JOIN a.group g WHERE a.session.id = :sid GROUP BY g.id")
	List<Object[]> countByGroupGrouped(@Param("sid") long sessionId);
}
