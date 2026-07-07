package com.SistemaConciliacion.Consiliacion.modules.auth.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;
import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppUser;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

	Optional<AppUser> findByUsernameIgnoreCase(String username);

	List<AppUser> findByEnabledTrueAndIdNotOrderByUsernameAsc(long excludeId);

	boolean existsByUsernameIgnoreCase(String username);

	long count();

	long countByRoleAndEnabled(AppRole role, boolean enabled);
}
