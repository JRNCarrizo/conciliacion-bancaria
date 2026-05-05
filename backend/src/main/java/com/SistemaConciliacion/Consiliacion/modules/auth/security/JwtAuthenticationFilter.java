package com.SistemaConciliacion.Consiliacion.modules.auth.security;

import java.io.IOException;
import java.util.Optional;

import org.springframework.http.HttpHeaders;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

	private final JwtBearerAuthenticator jwtBearerAuthenticator;

	public JwtAuthenticationFilter(JwtBearerAuthenticator jwtBearerAuthenticator) {
		this.jwtBearerAuthenticator = jwtBearerAuthenticator;
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
					Optional<Authentication> authOpt = jwtBearerAuthenticator.authenticate(token);
					if (authOpt.isEmpty()) {
						sendUnauthorized(response);
						return;
					}
					SecurityContextHolder.getContext().setAuthentication(authOpt.get());
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
