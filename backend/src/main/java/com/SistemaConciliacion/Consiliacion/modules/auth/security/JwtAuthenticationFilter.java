package com.SistemaConciliacion.Consiliacion.modules.auth.security;

import java.io.IOException;
import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.SistemaConciliacion.Consiliacion.modules.auth.domain.AppRole;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;

	public JwtAuthenticationFilter(JwtService jwtService) {
		this.jwtService = jwtService;
	}

	@Override
	protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
			@NonNull FilterChain filterChain) throws ServletException, IOException {
		String path = request.getRequestURI();
		if (path.startsWith("/api/v1/auth/")) {
			filterChain.doFilter(request, response);
			return;
		}

		String header = request.getHeader(HttpHeaders.AUTHORIZATION);
		if (header != null && header.startsWith("Bearer ")) {
			String token = header.substring(7).trim();
			if (!token.isEmpty()) {
				try {
					String username = jwtService.extractUsername(token);
					AppRole role = jwtService.extractRole(token);
					var auth = new UsernamePasswordAuthenticationToken(username, null,
							List.of(new SimpleGrantedAuthority("ROLE_" + role.name())));
					SecurityContextHolder.getContext().setAuthentication(auth);
				} catch (Exception ignored) {
					// Token inválido o expirado: sin autenticación; el acceso protegido devolverá 401
				}
			}
		}
		try {
			filterChain.doFilter(request, response);
		} finally {
			SecurityContextHolder.clearContext();
		}
	}
}
