// GymMemberRecord — from gym_users/{uid}
export interface GymMemberRecord {
  id: string;          // Firebase Auth UID
  displayName: string;
  photoURL: string | undefined;
  age: string | undefined;     // "28"
  gender: string | undefined;  // "Male" | "Female" | "Other" | "Prefer not to say"
  goals: string[];
  memberSince: string;         // ISO date string
  gymId: string;               // "prolife360"
}

// TrainingPlanRecord — from gym_training_plans/{uid}/plans/{planId}
export interface PlannedExercise {
  id: string;
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeightKg: number | undefined;
  restSeconds: number;
  instructions: string | undefined;
  videoURL: string | undefined;
  orderIndex: number;
}

export interface TrainingPlanWeekDay {
  id: string;   // "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  label: string;
  exercises: PlannedExercise[];
}

export interface TrainingPlanRecord {
  id: string;
  userId: string;
  gymId: string;
  trainerName: string;
  name: string;
  startDate: string;           // ISO date string
  endDate: string | undefined; // ISO date string
  days: TrainingPlanWeekDay[];
  createdAt: string;
  updatedAt: string;
}

// PhysicalEvaluationRecord — from gym_evaluations/{uid}/evaluations/{evalId}
export interface StrengthAssessment {
  exerciseName: string;
  weightKg: number;
  reps: number;
  notes?: string;
}

export interface MobilityAssessment {
  jointName: string;
  rangeOfMotionDegrees: number;
  side?: string;
  notes?: string;
}

export interface AnthropometryAssessment {
  weightKg?: number;
  heightCm?: number;
  bodyFatPercent?: number;
  bmi?: number;
  waistCm?: number;
  hipCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
}

export interface PainAssessment {
  bodyArea: string;
  painScale: number;  // 0-10
  notes?: string;
}

export interface PhysicalEvaluationRecord {
  id: string;
  userId: string;
  gymId: string;
  evaluatorName: string;
  date: string;                // ISO date string
  clinicalHistoryId: string | undefined;
  strength: StrengthAssessment[];
  mobility: MobilityAssessment[];
  anthropometry: AnthropometryAssessment | undefined;
  pain: PainAssessment[];
  createdAt: string;
  updatedAt: string;
}

// NutritionPlanRecord — from gym_nutrition/{uid}/plans/{planId}
export interface NutritionFood {
  id: string;
  name: string;
  portionDescription: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface NutritionMeal {
  id: string;
  name: string;
  orderIndex: number;
  foods: NutritionFood[];
}

export interface NutritionDay {
  id: string;   // "monday" etc.
  label: string;
  meals: NutritionMeal[];
}

export interface NutritionPlanRecord {
  id: string;
  userId: string;
  gymId: string;
  nutritionistName: string;
  name: string;
  startDate: string;           // ISO date string
  endDate: string | undefined;
  days: NutritionDay[];
  createdAt: string;
  updatedAt: string;
}

// BookingSlotRecord — from gym_booking_slots/prolife360/slots/{slotId}
export interface BookingSlotRecord {
  id: string;
  gymId: string;              // "prolife360"
  date: string;               // ISO date string (calendar date of slot)
  startTime: string;          // ISO timestamp
  endTime: string;            // ISO timestamp
  type: "class" | "session";
  title: string;
  maxCapacity: number;
  currentCount: number;
  trainerId: string | undefined;
  createdAt: string;
  updatedAt: string;
}

// BookingRecord — from gym_bookings/{bookingId}
export interface BookingRecord {
  id: string;
  slotId: string;
  userId: string;
  gymId: string;
  status: "confirmed" | "cancelled";
  bookedAt: string;            // ISO timestamp
  cancelledAt: string | undefined;
}

// ClinicalHistoryRecord — from gym_clinical_histories/{uid}/histories/{histId}
export interface MedicalCondition {
  name: string;
  notes: string | undefined;
}

export interface InjuryRecord {
  bodyArea: string;
  description: string;
  year: string | undefined;
}

export interface MedicationRecord {
  name: string;
  dosage: string | undefined;
  frequency: string | undefined;
}

export interface AllergyRecord {
  substance: string;
  reaction: string | undefined;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface ClinicalHistoryRecord {
  id: string;
  userId: string;
  gymId: string;
  createdAt: string;           // ISO timestamp (append-only, no updatedAt)
  medicalConditions: MedicalCondition[];
  injuries: InjuryRecord[];
  medications: MedicationRecord[];
  allergies: AllergyRecord[];
  emergencyContact: EmergencyContact | undefined;
  additionalNotes: string | undefined;
  isSigned: boolean;
  signatureAuditId: string | undefined;
}

// AchievementRecord — from gym_achievements/{achievementId}
export type AchievementTriggerType =
  | "workoutCount"
  | "attendanceStreak"
  | "evaluationMilestone"
  | "profileComplete";

export interface AchievementRecord {
  id: string;
  name: string;
  description: string;
  iconName: string;          // SF Symbol name
  xpReward: number;
  triggerType: AchievementTriggerType;
  triggerThreshold: number;
  createdAt: string;
  updatedAt: string;
}

// ChallengeRecord — from gym_challenges/{challengeId}
export type ChallengeType =
  | "workoutCount"
  | "attendanceStreak"
  | "nutritionCompliance";

export interface ChallengeRecord {
  id: string;
  gymId: string;
  name: string;
  description: string;
  targetValue: number;
  deadline: string;            // ISO date string
  type: ChallengeType;
  createdAt: string;
  updatedAt: string;
}

// GymStatsRecord — from gym/stats aggregation
export interface GymStatsRecord {
  memberCount: number;
  activeTrainingPlanCount: number;
  upcomingBookingCount: number;
}

// WorkoutSessionRecord — from gym_workout_sessions/{uid}/sessions/{sessionId}
export interface LoggedSet {
  id: string;
  setNumber: number;
  actualReps: number;
  actualWeightKg: number;
  completed: boolean;
}

export interface LoggedExercise {
  id: string;
  exerciseName: string;
  sets: LoggedSet[];
  isPersonalRecord: boolean;
}

export interface WorkoutSessionRecord {
  id: string;
  userId: string;
  gymId: string;
  planId: string;
  dayId: string;
  dayLabel: string;
  date: string;                // ISO timestamp
  durationSeconds: number | undefined;
  exercises: LoggedExercise[];
  notes: string | undefined;
}

// MealComplianceRecord — from gym_meal_compliance/{uid}/entries/{entryId}
export type MealComplianceStatus = "eaten" | "skipped" | "modified";

export interface MealComplianceRecord {
  id: string;
  userId: string;
  gymId: string;
  planId: string;
  date: string;                // ISO date string (calendar date)
  mealId: string;
  status: MealComplianceStatus;
  notes: string | undefined;
  loggedAt: string;            // ISO timestamp
}

// GymDocumentRecord — from gym_documents/{uid}/documents/{docId}
export type GymDocumentType = "medical_cert" | "fitness_clearance" | "other";

export interface GymDocumentRecord {
  id: string;
  userId: string;
  gymId: string;
  name: string;
  type: GymDocumentType;
  uploadedAt: string;            // ISO timestamp
  expiresAt: string | undefined; // ISO timestamp or undefined
  storagePath: string;           // "gym_documents/{userId}/{docId}.pdf"
  fileSize: number;              // bytes
}

// UserAchievementRecord — from gym_user_achievements/{docId} (top-level, filtered by userId)
export interface UserAchievementRecord {
  id: string;
  userId: string;
  achievementId: string;
  earnedAt: string;              // ISO timestamp
  xpEarned: number;
}
