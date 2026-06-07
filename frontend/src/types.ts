export interface Prescription {
  doctor_name?: string;
  doctor_reg?: string;
  diagnosis?: string;
  medicines_prescribed?: string[];
  procedures?: string[];
  tests_prescribed?: string[];
  treatment?: string;
}

export interface Claim {
  member_id: string;
  member_name: string;
  member_join_date?: string;
  treatment_date: string;
  claim_amount: number;
  hospital?: string;
  cashless_request?: boolean;
  pre_authorized?: boolean;
  previous_claims_same_day?: number;
  prescription?: Prescription;
  bill: Record<string, number>;
}

export type DecisionType = 'APPROVED' | 'REJECTED' | 'PARTIAL' | 'MANUAL_REVIEW';

export interface Decision {
  claim_id: string;
  decision: DecisionType;
  approved_amount: number;
  rejection_reasons: string[];
  rejected_items: string[];
  flags: string[];
  deductions: Record<string, number>;
  cashless_approved: boolean | null;
  confidence_score: number;
  notes: string;
  next_steps: string;
  ai_fraud_risk?: {
    risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
    risk_score: number;
    flags: string[];
    reasoning: string;
  } | null;
}

export interface ClaimRecord {
  id: string;
  submittedAt: Date;
  claim: Claim;
  decision: Decision;
}
