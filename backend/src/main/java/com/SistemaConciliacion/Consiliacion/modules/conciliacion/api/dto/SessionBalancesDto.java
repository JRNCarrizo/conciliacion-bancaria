package com.SistemaConciliacion.Consiliacion.modules.conciliacion.api.dto;

import java.math.BigDecimal;

/**
 * Saldos de período declarados por el usuario (opcionales). PUT reemplaza los cuatro valores.
 */
public record SessionBalancesDto(BigDecimal openingBankBalance, BigDecimal closingBankBalance,
		BigDecimal openingCompanyBalance, BigDecimal closingCompanyBalance) {
}
