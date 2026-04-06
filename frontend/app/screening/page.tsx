"use client";

/**
 * =============================================================================
 * SCREENING PAGE
 * =============================================================================
 * 
 * This page implements the 5-step autism screening assessment flow.
 * Users progress through each module, answering questions about behaviors.
 * 
 * MODULES:
 * 1. Eye Contact - Slider input (0-100)
 * 2. Response to Name - Radio selection
 * 3. Vocalization - Radio selection
 * 4. Gestures - Slider input (0-100)
 * 5. Repetitive Behavior - Radio selection
 * 
 * DATA FLOW:
 * ----------
 * 1. User completes each step
 * 2. Responses stored in React state
 * 3. On submit: responses converted to numeric values
 * 4. Numeric payload sent to backend API
 * 5. Backend runs ML algorithms (A*, BFS, CSP)
 * 6. Results stored and user redirected
 * 
 * BACKEND INTEGRATION:
 * --------------------
 * - API endpoint: POST /api/analyze
 * - See lib/api.ts for detailed documentation
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ProgressStepper } from "@/components/screening/progress-stepper";
import { ScreeningCard } from "@/components/screening/screening-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Ear, MessageSquare, Hand, RotateCcw, ArrowLeft, ArrowRight, Check } from "lucide-react";

// Import API functions and types
import { 
  submitScreening, 
  prepareScreeningPayload,
  type ScreeningResult 
} from "@/lib/api";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Screening Step Configuration
 * 
 * Defines each module in the screening process.
 * Each step has:
 * - id: Unique identifier for navigation
 * - label: Short name for progress stepper
 * - icon: Visual indicator
 * - title/description: User-facing text
 * - questionType: Input type (slider or radio)
 * - options: For radio inputs, available choices
 * - helpText: Additional context for users
 */
const SCREENING_STEPS = [
  {
    id: 1,
    label: "Eye Contact",
    icon: Eye,
    title: "Eye Contact Assessment",
    description: "How often does the child make eye contact during interactions?",
    questionType: "slider" as const,
    helpText: "Consider typical daily interactions with family members and caregivers. Move the slider to indicate frequency.",
  },
  {
    id: 2,
    label: "Response to Name",
    icon: Ear,
    title: "Response to Name",
    description: "How consistently does the child respond when their name is called?",
    questionType: "radio" as const,
    options: [
      { value: "always", label: "Always responds immediately" },
      { value: "usually", label: "Usually responds within a few seconds" },
      { value: "sometimes", label: "Sometimes responds, often needs multiple calls" },
      { value: "rarely", label: "Rarely responds, seems not to hear" },
      { value: "never", label: "Never responds to name" },
    ],
  },
  {
    id: 3,
    label: "Vocalization",
    icon: MessageSquare,
    title: "Vocalization & Communication",
    description: "How would you describe the child's verbal communication?",
    questionType: "radio" as const,
    options: [
      { value: "advanced", label: "Uses words/sentences appropriate for age" },
      { value: "developing", label: "Babbles or uses some words" },
      { value: "limited", label: "Limited sounds or vocalization" },
      { value: "echolalia", label: "Repeats words/phrases (echolalia)" },
      { value: "nonverbal", label: "Mostly non-verbal" },
    ],
  },
  {
    id: 4,
    label: "Gestures",
    icon: Hand,
    title: "Gestures & Pointing",
    description: "How often does the child use gestures to communicate?",
    questionType: "slider" as const,
    helpText: "Consider pointing, waving, nodding, and showing objects to others. Move the slider to indicate frequency.",
  },
  {
    id: 5,
    label: "Repetitive Behavior",
    icon: RotateCcw,
    title: "Repetitive Behaviors",
    description: "Does the child display repetitive movements or behaviors?",
    questionType: "radio" as const,
    options: [
      { value: "none", label: "No repetitive behaviors observed" },
      { value: "occasional", label: "Occasional repetitive movements" },
      { value: "frequent", label: "Frequent repetitive behaviors (hand flapping, rocking)" },
      { value: "intense", label: "Intense focus on specific routines or objects" },
      { value: "distress", label: "Shows distress when routines are changed" },
    ],
  },
];

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * ScreeningResponses Interface
 * 
 * Represents the raw user responses before conversion to numeric values.
 * 
 * WHY MIXED TYPES?
 * - Sliders naturally produce numbers (0-100)
 * - Radio buttons produce string labels for better UX
 * - Conversion to all-numeric happens in prepareScreeningPayload()
 */
interface ScreeningResponses {
  /** Eye contact frequency: 0 (never) to 100 (always) */
  eye_contact: number;
  /** Response to name: "always" | "usually" | "sometimes" | "rarely" | "never" */
  response_to_name: string;
  /** Vocalization level: "advanced" | "developing" | "limited" | "echolalia" | "nonverbal" */
  vocalization: string;
  /** Gesture usage: 0 (never) to 100 (always) */
  gestures: number;
  /** Repetitive behavior: "none" | "occasional" | "frequent" | "intense" | "distress" */
  repetitive_behavior: string;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * ScreeningPage Component
 * 
 * Main screening flow with 5-step progressive assessment.
 * Manages state for all responses and handles navigation between steps.
 * 
 * STATE MANAGEMENT:
 * - currentStep: Which module user is viewing (1-5)
 * - responses: All user answers
 * - isSubmitting: Loading state during API call
 * - error: Error message if submission fails
 */
export default function ScreeningPage() {
  // Navigation hook for redirecting after submission
  const router = useRouter();
  
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  /** Current step in the assessment (1-5) */
  const [currentStep, setCurrentStep] = useState(1);
  
  /** Loading state while submitting to backend */
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  /** Error message to display if submission fails */
  const [error, setError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const lastSubmitAtRef = useRef(0);
  
  /**
   * User responses state
   * 
   * Initialized with default values:
   * - Sliders start at 50 (middle position)
   * - Radio buttons start empty (must select)
   */
  const [responses, setResponses] = useState<ScreeningResponses>({
    eye_contact: 50,
    response_to_name: "",
    vocalization: "",
    gestures: 50,
    repetitive_behavior: "",
  });

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================
  
  /** Get configuration for the current step */
  const currentStepConfig = SCREENING_STEPS.find((step) => step.id === currentStep);

  // ==========================================================================
  // VALIDATION
  // ==========================================================================
  
  /**
   * isCurrentStepComplete
   * 
   * Checks if the current step has a valid response.
   * Used to enable/disable the "Next" button.
   * 
   * LOGIC:
   * - Sliders: Always have a value (initialized to 50)
   * - Radio: Must have non-empty string selection
   */
  const isCurrentStepComplete = (): boolean => {
    switch (currentStep) {
      case 1: // Eye Contact (slider) - always valid
        return responses.eye_contact !== undefined;
      case 2: // Response to Name (radio) - must select
        return responses.response_to_name !== "";
      case 3: // Vocalization (radio) - must select
        return responses.vocalization !== "";
      case 4: // Gestures (slider) - always valid
        return responses.gestures !== undefined;
      case 5: // Repetitive Behavior (radio) - must select
        return responses.repetitive_behavior !== "";
      default:
        return false;
    }
  };

  // ==========================================================================
  // NAVIGATION HANDLERS
  // ==========================================================================
  
  /**
   * handleNext
   * 
   * Advances to the next step if not at the end.
   * Clears any previous error messages.
   */
  const handleNext = () => {
    if (currentStep < SCREENING_STEPS.length) {
      setCurrentStep(currentStep + 1);
      setError(null); // Clear any previous errors
    }
  };

  /**
   * handleBack
   * 
   * Returns to the previous step if not at the beginning.
   */
  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null); // Clear any previous errors
    }
  };

  // ==========================================================================
  // RESPONSE UPDATE HANDLER
  // ==========================================================================
  
  /**
   * updateResponse
   * 
   * Updates a specific field in the responses state.
   * Called when user interacts with slider or radio inputs.
   * 
   * @param field - The response field to update
   * @param value - The new value (number for sliders, string for radios)
   */
  const updateResponse = (field: keyof ScreeningResponses, value: number | string) => {
    setResponses((prev) => ({ ...prev, [field]: value }));
  };

  // ==========================================================================
  // FORM SUBMISSION
  // ==========================================================================
  
  /**
   * handleSubmit
   * 
   * Submits the completed screening for analysis.
   * 
   * PROCESS:
   * 1. Set loading state
   * 2. Convert string responses to numeric values using mapping functions
   * 3. Send payload to backend API (POST /api/analyze)
   * 4. Store session_id and results for the results page
   * 5. Navigate to results page
   * 
   * ERROR HANDLING:
   * - Displays user-friendly error message
   * - Allows retry by keeping form data
   * 
   * BACKEND ALGORITHMS:
   * The backend processes this data using:
   * - A* Algorithm: Finds optimal path through decision tree
   * - BFS: Explores symptom relationship graph
   * - CSP: Validates screening constraints are met
   */
  const handleSubmit = async () => {
    const now = Date.now();
    if (isSubmittingRef.current || now - lastSubmitAtRef.current < 800) {
      return;
    }
    lastSubmitAtRef.current = now;
    isSubmittingRef.current = true;

    // Reset error state and set loading
    setError(null);
    setIsSubmitting(true);

    try {
      // ========================================
      // STEP 1: Prepare the API payload
      // ========================================
      
      /**
       * Convert frontend responses to backend-ready format.
       * 
       * WHY CONVERSION IS NEEDED:
       * - Backend ML models require numeric inputs (0-100 scale)
       * - Radio button strings like "always" become numbers like 100
       * - This standardization allows mathematical processing
       * 
       * See lib/api.ts for detailed mapping documentation.
       */
      const payload = prepareScreeningPayload(responses);
      
      // Log payload for debugging (remove in production)
      console.log("[Screening] Prepared payload:", payload);

      // ========================================
      // STEP 2: Submit to backend API
      // ========================================
      
      /**
       * API CALL: POST /api/analyze
       *
       * Sends numeric screening data to backend.
       * Backend processes using A*, BFS, CSP algorithms.
       * Returns risk assessment and recommendations.
       */
      const result: ScreeningResult = await submitScreening(payload);
      console.log("[Screening] API response received:", result.session_id);

      // ========================================
      // STEP 3: Store results for results page
      // ========================================
      
      /**
       * Store session data for cross-page access.
       * 
       * session_id: Used to fetch full results from API
       * The results page always fetches live data from backend by session_id.
       */
      sessionStorage.setItem("session_id", result.session_id);
      
      console.log("[Screening] Results stored, navigating to results page");

      // ========================================
      // STEP 4: Navigate to results page
      // ========================================
      
      router.push("/results");
      
    } catch (err) {
      // Handle any unexpected errors
      console.error("[Screening] Submission failed:", err);
      
      setError(
        err instanceof Error 
          ? err.message 
          : "An unexpected error occurred. Please try again."
      );
    } finally {
      // Always reset loading state
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/20">
        <div className="container mx-auto px-4 py-8">
          {/* Page Header */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Autism Screening Assessment
            </h1>
            <p className="text-muted-foreground">
              Complete each module to receive your screening results
            </p>
          </div>

          {/* Progress Stepper - Shows all 5 steps */}
          <div className="mb-8 max-w-4xl mx-auto">
            <ProgressStepper steps={SCREENING_STEPS} currentStep={currentStep} />
          </div>

          {/* Current Step Card */}
          <div className="max-w-2xl mx-auto">
            {currentStepConfig && (
              <Card className="shadow-lg">
                <CardHeader className="text-center pb-4">
                  {/* Step Icon */}
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                    <currentStepConfig.icon className="h-8 w-8 text-primary" />
                  </div>
                  
                  {/* Step Title and Description */}
                  <CardTitle className="text-2xl">{currentStepConfig.title}</CardTitle>
                  <CardDescription className="text-base">
                    {currentStepConfig.description}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  {/* Error Message Display */}
                  {error && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
                      {error}
                    </div>
                  )}

                  {/* Slider Input (Steps 1 and 4) */}
                  {currentStepConfig.questionType === "slider" && (
                    <ScreeningCard
                      title=""
                      description={currentStepConfig.helpText || ""}
                      icon={currentStepConfig.icon}
                      questionType="slider"
                      sliderValue={
                        currentStep === 1 ? responses.eye_contact : responses.gestures
                      }
                      onSliderChange={(value) => {
                        // Determine which field to update based on current step
                        const field = currentStep === 1 ? "eye_contact" : "gestures";
                        updateResponse(field, value[0]);
                      }}
                      isActive={true}
                    />
                  )}

                  {/* Radio Input (Steps 2, 3, and 5) */}
                  {currentStepConfig.questionType === "radio" && currentStepConfig.options && (
                    <ScreeningCard
                      title=""
                      description="Select the option that best describes the behavior"
                      icon={currentStepConfig.icon}
                      questionType="radio"
                      radioOptions={currentStepConfig.options}
                      radioValue={
                        currentStep === 2
                          ? responses.response_to_name
                          : currentStep === 3
                          ? responses.vocalization
                          : responses.repetitive_behavior
                      }
                      onRadioChange={(value) => {
                        // Determine which field to update based on current step
                        const field =
                          currentStep === 2
                            ? "response_to_name"
                            : currentStep === 3
                            ? "vocalization"
                            : "repetitive_behavior";
                        updateResponse(field, value);
                      }}
                      isActive={true}
                    />
                  )}

                  {/* Navigation Buttons */}
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    {/* Back Button */}
                    <Button
                      variant="outline"
                      onClick={handleBack}
                      disabled={currentStep === 1 || isSubmitting}
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>

                    {/* Next or Submit Button */}
                    {currentStep < SCREENING_STEPS.length ? (
                      <Button onClick={handleNext} disabled={!isCurrentStepComplete()}>
                        Next
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        onClick={handleSubmit}
                        disabled={!isCurrentStepComplete() || isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Analyzing with AI...
                          </>
                        ) : (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Submit Assessment
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Mobile Step Indicator */}
            <div className="mt-6 text-center text-sm text-muted-foreground md:hidden">
              Module {currentStep} of {SCREENING_STEPS.length}
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
