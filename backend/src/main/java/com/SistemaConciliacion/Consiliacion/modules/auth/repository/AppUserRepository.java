package com.SistemaConciliacion.Consiliacion.modules.auth.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;
import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppUser;

public interface AppUserRepository extends JpaRepository<AppUser, Long> {

	Optional<AppUser> findByUsernameIgnoreCase(String username);

	boolean existsByUsernameIgnoreCase(String username);

	long count();

	long countByRoleAndEnabled(AppRole role, boolean enabled);
}
