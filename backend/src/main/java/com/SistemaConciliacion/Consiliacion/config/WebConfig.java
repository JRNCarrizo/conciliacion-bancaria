package com.SistemaConciliacion.Consiliacion.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS para <code>/api/**</code> lo define {@link SecurityConfig} (necesario con Spring Security).
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {
}
