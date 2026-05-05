package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.PairAttachment;

public interface PairAttachmentRepository extends JpaRepository<PairAttachment, Long> {

	List<PairAttachment> findBySession_IdAndPair_IdOrderByCreatedAtAsc(long sessionId, long pairId);

	List<PairAttachment> findBySession_IdAndPair_IdIn(long sessionId, Collection<Long> pairIds);

	Optional<PairAttachment> findByIdAndSession_IdAndPair_Id(long id, long sessionId, long pairId);

	@Query("SELECT p.id, COUNT(a) FROM PairAttachment a JOIN a.pair p WHERE a.session.id = :sid GROUP BY p.id")
	List<Object[]> countByPairGrouped(@Param("sid") long sessionId);
}
