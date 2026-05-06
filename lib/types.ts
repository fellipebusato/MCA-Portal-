// lib/types.ts
// Shared TypeScript interfaces for the entire portal

export type PaymentStatus = "active" | "paused" | "frozen" | "paid_off" | "weekly_off";

export type BusinessType = "llc" | "sole_prop" | "corp" | "partnership" | "other";

export interface Organization {
  id: string;
  name: string;
  owner_email: string;
  created_at: string;
}

export interface Client {
  id: number;
  org_id: string;
  business_name: string;
  invoice: string;
  owner_name: string;
  client_email: string;
  funded_date: string;
  funded: number;
  payback: number;
  paid: number;
  balance: number;
  payment: number;
  total_term: number;
  payment_frequency: "daily" | "weekly";
  payment_day: string | null;
  status: string;
  payment_status: PaymentStatus;
  pause_start: string | null;
  pause_end: string | null;
  total_returns: number;
  last_return_date: string | null;
  maturity_date: string | null;
  // Business profile
  state: string | null;
  sic_code: string | null;
  business_type: BusinessType | null;
  fico_score: number | null;
  avg_monthly_revenue: number | null;
  time_in_business_months: number | null;
  position: number | null;
}

export interface Payment {
  id: number;
  org_id: string;
  invoice: string;
  payment_date: string;
  ach_date: string;
  settlement_date: string;
  description: string;
  credit: number;
  debit: number;
  returns: number;
  running_balance: number | null;
}

export interface ConsentLog {
  id: number;
  org_id: string;
  email: string;
  portal_version: string;
  created_at: string;
}

export interface NewClientForm {
  businessName: string;
  invoice: string;
  ownerName: string;
  clientEmail: string;
  fundedDate: string;
  funded: string;
  payback: string;
  payment: string;
  totalTerm: string;
  paymentFrequency: "daily" | "weekly";
  paymentDay: string;
  // Business profile
  state: string;
  sicCode: string;
  businessType: string;
  ficoScore: string;
  avgMonthlyRevenue: string;
  timeInBusinessMonths: string;
  position: string;
}

export interface ParsedPaymentRow {
  invoice: string;
  date: string;
  amount: number;
}
