package com.SistemaConciliacion.Consiliacion.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Rutas del SPA (client-side) para devolver {@code index.html} al recargar en el
 * JAR. Si agregan rutas en el front, incluirlas aquí o usar siempre bajo
 * <code>BrowserRouter</code> sin anidar según hoy.
 */
@Controller
public class SpaController {

	@GetMapping({ "/login", "/login/", "/setup", "/setup/", "/conciliacion", "/conciliacion/**", "/usuarios", "/usuarios/**" })
	public String index() {
		return "forward:/index.html";
	}
}
