package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

public record DeferMovementRequestDto(String side, long transactionId, String note) {
}
