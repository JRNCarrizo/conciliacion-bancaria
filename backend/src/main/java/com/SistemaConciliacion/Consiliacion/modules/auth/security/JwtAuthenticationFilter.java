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
import com.SistemaConciliacion.Consiliacion.modules.auth.repository.AppUserRepository;

import io.jsonwebtoken.Claims;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtService jwtService;
	private final AppUserRepository appUserRepository;

	public JwtAuthenticationFilter(JwtService jwtService, AppUserRepository appUserRepository) {
		this.jwtService = jwtService;
		this.appUserRepository = appUserRepository;
	}

	@Override
	protected void doFilterInternal(@NonNull HttpServletRequest request, @NonNull HttpServletResponse response,
			@NonNull FilterChain filterChain) throws ServletException, IOException {
		try {
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
						Claims claims = jwtService.parseClaims(token);
						String username = claims.getSubject();
						Long sidClaim = claims.get("sid", Long.class);
						if (sidClaim == null) {
							sendUnauthorized(response);
							return;
						}
						var userOpt = appUserRepository.findByUsernameIgnoreCase(username);
						if (userOpt.isEmpty() || !userOpt.get().isEnabled()) {
							sendUnauthorized(response);
							return;
						}
						var user = userOpt.get();
						if (user.getSessionVersion() != sidClaim.longValue()) {
							sendUnauthorized(response);
							return;
						}
						AppRole role = user.getRole();
						var auth = new UsernamePasswordAuthenticationToken(username, null,
								List.of(new SimpleGrantedAuthority("ROLE_" + role.name())));
						SecurityContextHolder.getContext().setAuthentication(auth);
					} catch (Exception e) {
						sendUnauthorized(response);
						return;
					}
				}
			}
			filterChain.doFilter(request, response);
		} finally {
			SecurityContextHolder.clearContext();
		}
	}

	private static void sendUnauthorized(HttpServletResponse response) throws IOException {
		response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
		response.setContentType("application/json;charset=UTF-8");
		response.getWriter().write("{\"error\":\"No autenticado o token inválido.\"}");
	}
}
