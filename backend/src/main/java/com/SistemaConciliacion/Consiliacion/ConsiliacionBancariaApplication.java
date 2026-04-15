package com.SistemaConciliacion.Consiliacion;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

import com.SistemaConciliacion.Consiliacion.config.UploadProperties;

@SpringBootApplication
@EnableConfigurationProperties(UploadProperties.class)
public class ConsiliacionBancariaApplication {

	public static void main(String[] args) {
		SpringApplication.run(ConsiliacionBancariaApplication.class, args);
	}

}
