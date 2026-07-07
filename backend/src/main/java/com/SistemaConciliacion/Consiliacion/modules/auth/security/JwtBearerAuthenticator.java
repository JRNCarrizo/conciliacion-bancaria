package com.SistemaConciliacion.Consiliacion.modules.auth.security;

import java.util.List;
import java.util.Optional;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;

import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;
import com.SistemaConciliacion.Consiliacion.modules.auth.repository.AppUserRepository;

import io.jsonwebtoken.Claims;

@Component
public class JwtBearerAuthenticator {

	private final JwtService jwtService;
	private final AppUserRepository appUserRepository;

	public JwtBearerAuthenticator(JwtService jwtService, AppUserRepository appUserRepository) {
		this.jwtService = jwtService;
		this.appUserRepository = appUserRepository;
	}

	/** Valida JWT (firma, sid, usuario habilitado) y devuelve autenticación de Spring. */
	public Optional<Authentication> authenticate(String jwtToken) {
		if (jwtToken == null || jwtToken.isBlank()) {
			return Optional.empty();
		}
		try {
			Claims claims = jwtService.parseClaims(jwtToken.trim());
			String username = claims.getSubject();
			Long sidClaim = claims.get("sid", Long.class);
			if (sidClaim == null) {
				return Optional.empty();
			}
			var userOpt = appUserRepository.findByUsernameIgnoreCase(username);
			if (userOpt.isEmpty() || !userOpt.get().isEnabled()) {
				return Optional.empty();
			}
			var user = userOpt.get();
			if (user.getSessionVersion() != sidClaim.longValue()) {
				return Optional.empty();
			}
			AppRole role = user.getRole();
			return Optional.of(new UsernamePasswordAuthenticationToken(username, null,
					List.of(new SimpleGrantedAuthority("ROLE_" + role.name()))));
		} catch (Exception e) {
			return Optional.empty();
		}
	}
}
