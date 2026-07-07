package com.SistemaConciliacion.Consiliacion.modules.conciliacion.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain.ReconciliationSession;

public interface ReconciliationSessionRepository extends JpaRepository<ReconciliationSession, Long> {

	Page<ReconciliationSession> findAllByOrderByCreatedAtDesc(Pageable pageable);
}

