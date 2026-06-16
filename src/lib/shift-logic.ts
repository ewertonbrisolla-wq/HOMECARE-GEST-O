import { getDaysInMonth, parse, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function getShiftLimit(competence: string, patientName?: string, profession?: string): number {
  // competence format: YYYY-MM or YYYY-MM-FX or YYYY-MM-MC
  const baseMonth = competence.substring(0, 7);
  const period = competence.substring(8);
  const date = parse(baseMonth, "yyyy-MM", new Date());
  const days = getDaysInMonth(date);
  
  if (patientName === "RAIMUNDO RODRIGUES DE LIMA FILHO" && 
     (!profession || profession === "Técnico de enfermagem")) {
    return days * 2; // Full month, 2 shifts a day
  }

  // If no period is specified, fallback to old combined max
  if (!period) {
    if (date.getMonth() === 1) return 56;
    if (days === 30) return 60;
    if (days === 31) return 62;
    return days * 2;
  }
  
  if (period === "MC") {
    return days * 2;
  }
  
  if (period === "F1") {
    // 01 to 15 mapped to 30 as requested 
    return 30;
  }
  
  if (period === "F2") {
    const days = getDaysInMonth(date);
    if (days === 30) return 30;
    if (days === 31) return 32;
    if (days === 29) return 28; // Feb 16 to 29 = 14 days -> 28 shifts
    if (days === 28) return 26; // Feb 16 to 28 = 13 days -> 26 shifts
    return 30; 
  }
  
  return 30;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMonth(competence: string): string {
  if (competence.length === 7) {
    const date = parse(competence, "yyyy-MM", new Date());
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(date);
  } else {
    // Expected format: YYYY-MM-F1 or YYYY-MM-F2
    const baseMonth = competence.substring(0, 7);
    const period = competence.substring(8);
    const date = parse(baseMonth, "yyyy-MM", new Date());
    const monthYear = format(date, "MMMM/yyyy", { locale: ptBR });

    if (period === "F1") {
      return `01 a 15 de ${monthYear}`;
    } else if (period === "F2") {
      const lastDay = format(endOfMonth(date), "dd");
      return `16 a ${lastDay} de ${monthYear}`;
    } else if (period === "MC") {
      return `Mês Completo de ${monthYear}`;
    } else {
      return monthYear;
    }
  }
}
