package com.SistemaConciliacion.Consiliacion.modules.auth.service;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.AuthResponseDto;
import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.LoginRequest;
import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;
import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppUser;
import com.SistemaConciliacion.Consiliacion.modules.auth.repository.AppUserRepository;
import com.SistemaConciliacion.Consiliacion.modules.auth.security.JwtService;

@Service
public class AuthService {

	private final AuthenticationManager authenticationManager;
	private final AppUserRepository appUserRepository;
	private final JwtService jwtService;
	private final UserPasswordService userPasswordService;

	public AuthService(AuthenticationManager authenticationManager, AppUserRepository appUserRepository,
			JwtService jwtService, UserPasswordService userPasswordService) {
		this.authenticationManager = authenticationManager;
		this.appUserRepository = appUserRepository;
		this.jwtService = jwtService;
		this.userPasswordService = userPasswordService;
	}

	public AuthResponseDto login(LoginRequest request) {
		authenticationManager.authenticate(
				new UsernamePasswordAuthenticationToken(request.username().trim(), request.password()));
		AppUser u = appUserRepository.findByUsernameIgnoreCase(request.username().trim())
				.orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado."));
		return AuthResponseDto.of(jwtService.generateToken(u.getUsername(), u.getRole()), u.getUsername(), u.getRole());
	}

	@Transactional
	public AuthResponseDto bootstrap(LoginRequest request) {
		if (appUserRepository.count() > 0) {
			throw new IllegalStateException("Ya existe al menos un usuario. No se puede repetir el alta inicial.");
		}
		String u = request.username().trim();
		if (appUserRepository.existsByUsernameIgnoreCase(u)) {
			throw new IllegalArgumentException("Ese nombre de usuario ya existe.");
		}
		AppUser admin = new AppUser();
		admin.setUsername(u);
		admin.setPasswordHash(userPasswordService.encode(request.password()));
		admin.setRole(AppRole.ADMIN);
		admin.setEnabled(true);
		appUserRepository.save(admin);
		return AuthResponseDto.of(jwtService.generateToken(admin.getUsername(), admin.getRole()), admin.getUsername(),
				admin.getRole());
	}
}
