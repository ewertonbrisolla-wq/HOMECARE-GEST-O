import { getDaysInMonth, parse } from 'date-fns';

export function getShiftLimit(competence: string): number {
  // competence format: YYYY-MM
  const date = parse(competence, 'yyyy-MM', new Date());
  const month = date.getMonth(); // 0-indexed
  const days = getDaysInMonth(date);

  if (month === 1) { // February
    return 56;
  }
  
  if (days === 30) {
    return 60;
  }
  
  if (days === 31) {
    return 62;
  }
  
  return days * 2;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatMonth(competence: string): string {
  const date = parse(competence, 'yyyy-MM', new Date());
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}
