package com.SistemaConciliacion.Consiliacion.modules.conciliacion.domain;

import java.util.Collections;
import java.util.List;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto.ImportFileSummaryDto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class ImportFileSummaryListConverter implements AttributeConverter<List<ImportFileSummaryDto>, String> {

	private static final ObjectMapper JSON = new ObjectMapper();
	private static final TypeReference<List<ImportFileSummaryDto>> TYPE = new TypeReference<>() {
	};

	@Override
	public String convertToDatabaseColumn(List<ImportFileSummaryDto> attribute) {
		if (attribute == null || attribute.isEmpty()) {
			return null;
		}
		try {
			return JSON.writeValueAsString(attribute);
		} catch (JsonProcessingException e) {
			throw new IllegalStateException("No se pudo serializar resumen de archivos importados", e);
		}
	}

	@Override
	public List<ImportFileSummaryDto> convertToEntityAttribute(String dbData) {
		if (dbData == null || dbData.isBlank()) {
			return Collections.emptyList();
		}
		try {
			List<ImportFileSummaryDto> list = JSON.readValue(dbData, TYPE);
			return list != null ? list : Collections.emptyList();
		} catch (JsonProcessingException e) {
			return Collections.emptyList();
		}
	}
}
