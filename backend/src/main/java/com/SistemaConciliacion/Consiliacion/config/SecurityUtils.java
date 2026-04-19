package com.SistemaConciliacion.Consiliacion.config;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public final class SecurityUtils {

	private SecurityUtils() {
	}

	/**
	 * Nombre de usuario autenticado (JWT subject), o null si no hay sesión.
	 */
	public static String currentUsername() {
		Authentication a = SecurityContextHolder.getContext().getAuthentication();
		if (a == null || !a.isAuthenticated()) {
			return null;
		}
		Object p = a.getPrincipal();
		if (p == null || "anonymousUser".equals(p.toString())) {
			return null;
		}
		return a.getName();
	}
}
