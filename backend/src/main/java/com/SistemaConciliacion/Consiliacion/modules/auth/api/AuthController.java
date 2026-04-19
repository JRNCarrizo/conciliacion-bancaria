package com.SistemaConciliacion.Consiliacion.modules.auth.api;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.AuthResponseDto;
import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.BootstrapAvailableDto;
import com.SistemaConciliacion.Consiliacion.modules.auth.api.dto.LoginRequest;
import com.SistemaConciliacion.Consiliacion.modules.auth.repository.AppUserRepository;
import com.SistemaConciliacion.Consiliacion.modules.auth.service.AuthService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/auth")
@Validated
public class AuthController {

	private final AuthService authService;
	private final AppUserRepository appUserRepository;

	public AuthController(AuthService authService, AppUserRepository appUserRepository) {
		this.authService = authService;
		this.appUserRepository = appUserRepository;
	}

	@GetMapping("/bootstrap-available")
	public BootstrapAvailableDto bootstrapAvailable() {
		return new BootstrapAvailableDto(appUserRepository.count() == 0);
	}

	@PostMapping("/bootstrap")
	public AuthResponseDto bootstrap(@Valid @RequestBody LoginRequest body) {
		return authService.bootstrap(body);
	}

	@PostMapping("/login")
	public AuthResponseDto login(@Valid @RequestBody LoginRequest body) {
		return authService.login(body);
	}
}
