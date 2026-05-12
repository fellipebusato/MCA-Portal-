// lib/holidays.ts
// Single source of truth for bank holidays and business day utilities
// Used by ClientDashboard and PaymentHistory
// Add next year's holidays each January

export const BANK_HOLIDAYS = new Set([
    // 2025
    "2025-01-01","2025-01-20","2025-02-17","2025-05-26","2025-06-19",
    "2025-07-04","2025-09-01","2025-10-13","2025-11-11","2025-11-27","2025-12-25",
    // 2026
    "2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19",
    "2026-07-03","2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25",
    // 2027
    "2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18",
    "2027-07-05","2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24",
    // 2028
    "2028-01-01","2028-01-17","2028-02-21","2028-05-27","2028-06-19",
    "2028-07-04","2028-09-04","2028-10-09","2028-11-11","2028-11-23","2028-12-25",
  ]);
  
  export function toDateStr(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  
  export function isWeekend(date: Date): boolean {
    return date.getDay() === 0 || date.getDay() === 6;
  }
  
  export function isHoliday(date: Date): boolean {
    return BANK_HOLIDAYS.has(toDateStr(date));
  }
  
  export function isBusinessDay(date: Date): boolean {
    return !isWeekend(date) && !isHoliday(date);
  }
  
  export function addBusinessDays(date: Date, days: number): Date {
    const result = new Date(date);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      if (isBusinessDay(result)) added++;
    }
    return result;
  }

  // Go backwards — used when the Excel file contains settlement dates
  // and we need to derive the original ACH pull date
  export function subtractBusinessDays(date: Date, days: number): Date {
    const result = new Date(date);
    let subtracted = 0;
    while (subtracted < days) {
      result.setDate(result.getDate() - 1);
      if (isBusinessDay(result)) subtracted++;
    }
    return result;
  }
  
  export function formatDate(dateStr: string): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    const utc = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return utc.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
  }
  
  export function money(amount: number): string {
    return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }
