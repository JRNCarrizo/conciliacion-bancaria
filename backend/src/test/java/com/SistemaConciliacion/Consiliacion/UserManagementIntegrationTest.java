package com.SistemaConciliacion.Consiliacion;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.MethodOrderer.OrderAnnotation;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@TestPropertySource(properties = {
		"spring.datasource.url=jdbc:h2:mem:user_mgmt_it;MODE=MySQL;DATABASE_TO_LOWER=TRUE;CASE_INSENSITIVE_IDENTIFIERS=TRUE;DB_CLOSE_DELAY=-1"
})
@TestMethodOrder(OrderAnnotation.class)
class UserManagementIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	private static final ObjectMapper MAPPER = new ObjectMapper();

	private static final String IT_USER = "itestadmin";
	private static final String IT_PASS = "itest-pass-12";

	private String authToken() throws Exception {
		boolean canBootstrap = MAPPER.readTree(
				mockMvc.perform(get("/api/v1/auth/bootstrap-available")).andReturn().getResponse().getContentAsString())
				.get("available").asBoolean();
		String body;
		if (canBootstrap) {
			body = mockMvc.perform(post("/api/v1/auth/bootstrap")
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"username\":\"" + IT_USER + "\",\"password\":\"" + IT_PASS + "\"}"))
					.andExpect(status().isOk())
					.andReturn().getResponse().getContentAsString();
		} else {
			body = mockMvc.perform(post("/api/v1/auth/login")
					.contentType(MediaType.APPLICATION_JSON)
					.content("{\"username\":\"" + IT_USER + "\",\"password\":\"" + IT_PASS + "\"}"))
					.andExpect(status().isOk())
					.andReturn().getResponse().getContentAsString();
		}
		return "Bearer " + MAPPER.readTree(body).get("token").asText();
	}

	@Test
	@Order(1)
	void cannotDisableLastEnabledAdmin() throws Exception {
		String auth = authToken();
		String listJson = mockMvc.perform(get("/api/v1/users").header(HttpHeaders.AUTHORIZATION, auth))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		long adminId = -1;
		for (JsonNode u : MAPPER.readTree(listJson)) {
			if ("ADMIN".equals(u.get("role").asText()) && u.get("enabled").asBoolean()) {
				adminId = u.get("id").asLong();
				break;
			}
		}
		mockMvc.perform(patch("/api/v1/users/" + adminId).header(HttpHeaders.AUTHORIZATION, auth)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"enabled\":false}"))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error").exists());
	}

	@Test
	@Order(2)
	void canDisableAdminWhenAnotherEnabledAdminExists() throws Exception {
		String auth = authToken();
		mockMvc.perform(post("/api/v1/users").header(HttpHeaders.AUTHORIZATION, auth)
				.contentType(MediaType.APPLICATION_JSON)
				.content(
						"{\"username\":\"second-admin\",\"password\":\"second-pass-12\",\"role\":\"ADMIN\"}"))
				.andExpect(status().isCreated());

		String listJson = mockMvc.perform(get("/api/v1/users").header(HttpHeaders.AUTHORIZATION, auth))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		long firstAdminId = -1;
		for (JsonNode u : MAPPER.readTree(listJson)) {
			if (IT_USER.equals(u.get("username").asText())) {
				firstAdminId = u.get("id").asLong();
				break;
			}
		}
		mockMvc.perform(patch("/api/v1/users/" + firstAdminId).header(HttpHeaders.AUTHORIZATION, auth)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"enabled\":false}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.enabled").value(false));

		String secondAuthBody = mockMvc
				.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
						.content("{\"username\":\"second-admin\",\"password\":\"second-pass-12\"}"))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();
		String secondAuth = "Bearer " + MAPPER.readTree(secondAuthBody).get("token").asText();
		mockMvc.perform(patch("/api/v1/users/" + firstAdminId).header(HttpHeaders.AUTHORIZATION, secondAuth)
				.contentType(MediaType.APPLICATION_JSON)
				.content("{\"enabled\":true}"))
				.andExpect(status().isOk());
	}
}
