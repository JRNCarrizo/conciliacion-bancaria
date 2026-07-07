package com.SistemaConciliacion.Consiliacion.modules.auth.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.CreateUserRequest;
import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.UpdateUserRequest;
import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.UserResponseDto;
import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;
import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppUser;
import com.SistemaConciliacion.Consiliacion.modules.auth.repository.AppUserRepository;

@Service
public class UserManagementService {

	private final AppUserRepository appUserRepository;
	private final UserPasswordService userPasswordService;

	public UserManagementService(AppUserRepository appUserRepository, UserPasswordService userPasswordService) {
		this.appUserRepository = appUserRepository;
		this.userPasswordService = userPasswordService;
	}

	public List<UserResponseDto> listAll() {
		return appUserRepository.findAll().stream().map(this::toDto).toList();
	}

	@Transactional
	public UserResponseDto create(CreateUserRequest request) {
		String u = request.username().trim();
		if (appUserRepository.existsByUsernameIgnoreCase(u)) {
			throw new IllegalArgumentException("Ya existe un usuario con ese nombre.");
		}
		AppUser entity = new AppUser();
		entity.setUsername(u);
		entity.setPasswordHash(userPasswordService.encode(request.password()));
		entity.setRole(request.role());
		entity.setEnabled(true);
		return toDto(appUserRepository.save(entity));
	}

	@Transactional
	public UserResponseDto update(long id, UpdateUserRequest request) {
		if (request.role() == null && request.enabled() == null) {
			throw new IllegalArgumentException("Indicá al menos rol o estado habilitado.");
		}
		AppUser entity = appUserRepository.findById(id)
				.orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado."));

		AppRole newRole = request.role() != null ? request.role() : entity.getRole();
		boolean newEnabled = request.enabled() != null ? request.enabled() : entity.isEnabled();
		boolean wasEnabledAdmin = entity.getRole() == AppRole.ADMIN && entity.isEnabled();
		boolean willBeEnabledAdmin = newRole == AppRole.ADMIN && newEnabled;
		if (wasEnabledAdmin && !willBeEnabledAdmin) {
			long enabledAdmins = appUserRepository.countByRoleAndEnabled(AppRole.ADMIN, true);
			if (enabledAdmins <= 1) {
				throw new IllegalStateException(
						"Debe existir al menos un administrador habilitado. Creá otro administrador o habilitá uno antes de deshabilitar o cambiar el rol de este usuario.");
			}
		}

		if (request.role() != null) {
			entity.setRole(request.role());
		}
		if (request.enabled() != null) {
			entity.setEnabled(request.enabled());
		}
		return toDto(appUserRepository.save(entity));
	}

	private UserResponseDto toDto(AppUser u) {
		return new UserResponseDto(u.getId(), u.getUsername(), u.getRole(), u.isEnabled(), u.getCreatedAt());
	}
}
