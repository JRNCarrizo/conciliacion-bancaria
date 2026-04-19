package com.SistemaConciliacion.Consiliacion;

import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.containsString;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@SpringBootTest
@AutoConfigureMockMvc
class ConciliacionImportIntegrationTest {

	@Autowired
	private MockMvc mockMvc;

	private static final ObjectMapper MAPPER = new ObjectMapper();

	private static final String IT_USER = "itestadmin";
	private static final String IT_PASS = "itest-pass-12";

	/** Alta inicial si la BD está vacía; si no, login (órdenes de test no garantizados). */
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
	void importSampleFiles() throws Exception {
		String auth = authToken();
		byte[] bankBytes = new ClassPathResource("fixtures/Octubre-Banco.xls").getInputStream().readAllBytes();
		byte[] companyBytes = new ClassPathResource("fixtures/Octubre-Plataforma.xlsx").getInputStream()
				.readAllBytes();

		MockMultipartFile bank = new MockMultipartFile("bank", "Octubre-Banco.xls", "application/vnd.ms-excel",
				bankBytes);
		MockMultipartFile company = new MockMultipartFile("company", "Octubre-Plataforma.xlsx",
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", companyBytes);

		String body = mockMvc.perform(multipart("/api/v1/conciliacion/import").file(bank).file(company)
				.header(HttpHeaders.AUTHORIZATION, auth))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sessionId").exists())
				.andExpect(jsonPath("$.bankRows").value(greaterThan(0)))
				.andExpect(jsonPath("$.companyRows").value(greaterThan(0)))
				.andReturn().getResponse().getContentAsString();

		JsonNode root = MAPPER.readTree(body);
		long sessionId = root.get("sessionId").asLong();

		mockMvc.perform(post("/api/v1/conciliacion/sessions/{id}/conciliar", sessionId).param("dateToleranceDays", "5")
				.param("amountTolerance", "0.01")
				.header(HttpHeaders.AUTHORIZATION, auth))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.pairsCreated").exists())
				.andExpect(jsonPath("$.amountTolerance").exists())
				.andExpect(jsonPath("$.sessionId").value(sessionId));

		mockMvc.perform(get("/api/v1/conciliacion/sessions/{id}/export.xlsx", sessionId)
				.header(HttpHeaders.AUTHORIZATION, auth))
				.andExpect(status().isOk())
				.andExpect(header().string("Content-Type", containsString("spreadsheetml")));

		String balancesJson = """
				{
				  "openingBankBalance": 1000.50,
				  "closingBankBalance": 27000000.00,
				  "openingCompanyBalance": null,
				  "closingCompanyBalance": 27000000.00
				}
				""";
		mockMvc.perform(put("/api/v1/conciliacion/sessions/{id}/balances", sessionId)
				.contentType("application/json")
				.content(balancesJson)
				.header(HttpHeaders.AUTHORIZATION, auth))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.closingBankBalance").value(27000000.00));

		mockMvc.perform(get("/api/v1/conciliacion/sessions/{id}", sessionId)
				.header(HttpHeaders.AUTHORIZATION, auth))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.session.closingBankBalance").value(27000000.00))
				.andExpect(jsonPath("$.session.openingBankBalance").value(1000.50))
				.andExpect(jsonPath("$.session.amountTolerance").value(0.01))
				.andExpect(jsonPath("$.session.dateToleranceDays").value(5));
	}

	@Test
	void conciliarWithZeroAmountToleranceIsSavedAndReturned() throws Exception {
		String auth = authToken();
		byte[] bankBytes = new ClassPathResource("fixtures/Octubre-Banco.xls").getInputStream().readAllBytes();
		byte[] companyBytes = new ClassPathResource("fixtures/Octubre-Plataforma.xlsx").getInputStream()
				.readAllBytes();

		MockMultipartFile bank = new MockMultipartFile("bank", "Octubre-Banco.xls", "application/vnd.ms-excel",
				bankBytes);
		MockMultipartFile company = new MockMultipartFile("company", "Octubre-Plataforma.xlsx",
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", companyBytes);

		String body = mockMvc.perform(multipart("/api/v1/conciliacion/import").file(bank).file(company)
				.header(HttpHeaders.AUTHORIZATION, auth))
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsString();

		long sessionId = MAPPER.readTree(body).get("sessionId").asLong();

		mockMvc.perform(post("/api/v1/conciliacion/sessions/{id}/conciliar", sessionId).param("dateToleranceDays", "0")
				.param("amountTolerance", "0")
				.header(HttpHeaders.AUTHORIZATION, auth))
				.andExpect(status().isOk());

		mockMvc.perform(get("/api/v1/conciliacion/sessions/{id}", sessionId)
				.header(HttpHeaders.AUTHORIZATION, auth)).andExpect(status().isOk())
				.andExpect(jsonPath("$.session.amountTolerance").value(0));
	}
}
