// lib/types.ts
// Shared TypeScript interfaces for the entire portal
// These match the Supabase database schema exactly

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
    status: "Good Standing" | "Needs Attention" | "Default";
    total_returns: number;
    last_return_date: string | null;
    maturity_date: string | null;
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
  
  // Form state for adding a new client — uses strings since inputs are strings
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
  }
  
  // Parsed row from ACH Works upload file
  export interface ParsedPaymentRow {
    invoice: string;
    date: string;
    amount: number;
  }