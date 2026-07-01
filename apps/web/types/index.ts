export type ApplicationStatus =
  | "pending"
  | "sent"
  | "no_answer"
  | "interview"
  | "rejected"
  | "liked"
  | "contact";

export interface JobApplication {
  id: string;
  jobTitle: string;
  company: string;
  jobUrl?: string;
  jobDescription?: string;
  recruiterEmail?: string;
  recruiterPhone?: string;
  contactName?: string;
  language: "nl" | "en";
  matchScore?: number;
  status: ApplicationStatus;
  emailBody?: string;
  letterPath?: string;
  emailSentDate?: string;
  interviewDate?: string;
  followUpDate?: string;
  letterBase64?: string;
  letterText?: string;
  notes?: string;
  followUpEmailBody?: string;
  tokensUsed?: number;
  costUsd?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CV {
  id: string;
  userId: string;
  language: string;   // 'nl' | 'en' | 'fr' | 'de' | etc.
  filename: string;
  storagePath: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  phone?: string;
  address?: string;
  hobbies?: string;
  masterEmailTemplate?: string;
  masterLetterTemplate?: string;
  onboardingComplete?: boolean;
  updatedAt: string;
}

export interface ProcessJobRequest {
  jobUrl?: string;
  rawJobText?: string;
}

export interface ProcessJobResult {
  jobTitle: string;
  company: string;
  jobUrl?: string;
  recruiterEmail?: string;
  recruiterPhone?: string;
  contactName?: string;
  language: "nl" | "en";
  matchScore: number;
  emailBody: string;
  jobDescription: string;
  letterBase64: string;
  letterFilename: string;
  letterText: string;
  tokensUsed?: number;
  costUsd?: number;
}
