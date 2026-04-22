export interface Shift {
  id?: string;
  patientName: string;
  healthInsurance: string;
  patientDob: string;
  patientGender: 'M' | 'F' | 'Outro';
  patientResponsible: string;
  techName: string;
  techCoren: string;
  nfsNumber: string;
  competence: string; // YYYY-MM
  shiftCount: number;
  shiftValue: number;
  bankPix: string;
  pixKeyType?: 'CPF/CNPJ' | 'Telefone' | 'E-mail';
  bankName: string;
  bankAccount: string;
  bankAgency: string;
  totalValue: number;
  hasMealAllowance?: boolean;
  mealAllowanceValue?: number;
  responsiblePhone: string;
  techWhatsapp: string;
  isConfirmed: boolean;
  createdBy: string;
  createdAt: any;
}

export interface Patient {
  id?: string;
  name: string;
  healthInsurance: string;
  dob: string;
  gender: 'M' | 'F' | 'Outro';
  responsibleName: string;
  responsiblePhone: string;
  hasMealAllowance: boolean;
  mealAllowanceValue: number;
  createdAt: any;
}

export interface Settings {
  logoUrl?: string;
  menuTitle1?: string;
  menuTitle2?: string;
  helpText?: string;
}

export interface PatientSummary {
  patientName: string;
  totalShifts: number;
  limitShifts: number;
  isOverLimit: boolean;
  shifts: Shift[];
}

export interface MonthSummary {
  competence: string;
  patients: Record<string, PatientSummary>;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'tech';
  techName?: string;
  techCoren?: string;
  techWhatsapp?: string;
  createdAt: any;
}
