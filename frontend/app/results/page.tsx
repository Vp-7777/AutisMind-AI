"use client";

/**
 * =============================================================================
 * RESULTS PAGE
 * =============================================================================
 * 
 * This page displays comprehensive screening results after assessment completion.
 * 
 * DISPLAYS:
 * - Overall risk score and band (low/moderate/high)
 * - Module-wise score breakdown with progress bars
 * - AI-generated explanation of results
 * - Recommended next steps and therapy plan
 * 
 * DATA FLOW:
 * ----------
 * 1. Read session_id from sessionStorage
 * 2. Fetch full results from backend API (GET /api/results/{session_id})
 * 3. If backend unavailable, fall back to stored data
 * 4. Display results with appropriate UI states
 * 
 * BACKEND INTEGRATION:
 * --------------------
 * - API endpoint: GET /api/results/{session_id}
 * - Returns complete analysis from ML algorithms
 * - See lib/api.ts for detailed documentation
 * 
 * IMPORTANT NOTE:
 * ---------------
 * The risk scoring and analysis is handled ENTIRELY by the backend.
 * The backend uses sophisticated algorithms:
 * - A* Algorithm: Optimal decision path finding
 * - BFS (Breadth-First Search): Symptom relationship exploration
 * - CSP (Constraint Satisfaction): Criteria validation
 * 
 * This frontend does NOT perform any diagnostic calculations.
 * All fallback scoring is temporary for development purposes only.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { RiskBadge } from "@/components/results/risk-badge";
import { ModuleScoreCard } from "@/components/results/module-score-card";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Eye,
  Ear,
  MessageSquare,
  Hand,
  RotateCcw,
  Download,
  Share2,
  ArrowRight,
  FileText,
  ClipboardList,
  RefreshCw,
  Clock3,
} from "lucide-react";

// Import API functions
import { 
  getResults, 
  type ScreeningResult,
} from "@/lib/api";

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface DisplayModuleScores {
  eye_contact: number;
  response_to_name: number;
  vocalization: number;
  gestures: number;
  repetitive_behavior: number;
}

type ResultsData = Omit<ScreeningResult, "module_scores"> & {
  module_scores: DisplayModuleScores;
};

/**
 * Error types for different scenarios
 */
type ErrorType = "no_data" | "api_error" | null;

// =============================================================================
// BACKEND → UI MODULE SCORE MAPPING
// =============================================================================

/**
 * FastAPI returns aggregated `module_scores` (social/communication/motor/behavior).
 * The results UI (`MODULE_CONFIG`) expects one bar per screening question label.
 *
 * Mapping (as required for display):
 * - eye_contact           ← social_attention
 * - response_to_name      ← communication
 * - vocalization          ← communication (same backend signal, two cards)
 * - gestures              ← motor_expression
 * - repetitive_behavior   ← behavioral_regulation
 */
interface BackendModuleScores {
  social_attention: number;
  communication: number;
  motor_expression: number;
  behavioral_regulation: number;
}

function isBackendModuleScores(raw: unknown): raw is BackendModuleScores {
  if (raw === null || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    typeof o.social_attention === "number" &&
    typeof o.communication === "number" &&
    typeof o.motor_expression === "number" &&
    typeof o.behavioral_regulation === "number"
  );
}

function mapBackendModuleScoresToDisplay(
  b: BackendModuleScores
): ResultsData["module_scores"] {
  const communication = b.communication;
  return {
    eye_contact: b.social_attention,
    response_to_name: communication,
    vocalization: communication,
    gestures: b.motor_expression,
    repetitive_behavior: b.behavioral_regulation,
  };
}

/**
 * Normalize `module_scores` whether they come from the API, sessionStorage, or legacy UI shape.
 */
function normalizeModuleScoresForDisplay(
  raw: unknown
): ResultsData["module_scores"] {
  if (isBackendModuleScores(raw)) {
    return mapBackendModuleScoresToDisplay(raw);
  }
  if (raw !== null && typeof raw === "object") {
    const m = raw as Record<string, unknown>;
    const n = (key: string) =>
      typeof m[key] === "number" ? (m[key] as number) : 0;
    return {
      eye_contact: n("eye_contact"),
      response_to_name: n("response_to_name"),
      vocalization: n("vocalization"),
      gestures: n("gestures"),
      repetitive_behavior: n("repetitive_behavior"),
    };
  }
  return {
    eye_contact: 0,
    response_to_name: 0,
    vocalization: 0,
    gestures: 0,
    repetitive_behavior: 0,
  };
}

/**
 * Ensures `results.module_scores` always matches `MODULE_CONFIG` keys before render.
 * Safe for: GET /api/results, `screeningResult` in sessionStorage, and local fallback payloads.
 */
function normalizeScreeningResultForUi(data: ScreeningResult): ResultsData {
  return {
    ...data,
    module_scores: normalizeModuleScoresForDisplay(data.module_scores),
    created_at:
      typeof data.created_at === "string" && data.created_at.length > 0
        ? data.created_at
        : new Date().toISOString(),
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Module Display Configuration
 * 
 * Maps backend module keys to user-friendly display information.
 * Used to render the module breakdown section.
 */
const MODULE_CONFIG = [
  { 
    key: "eye_contact", 
    label: "Eye Contact", 
    icon: Eye, 
    description: "Visual attention and engagement during interactions" 
  },
  { 
    key: "response_to_name", 
    label: "Response to Name", 
    icon: Ear, 
    description: "Responsiveness when name is called" 
  },
  { 
    key: "vocalization", 
    label: "Vocalization", 
    icon: MessageSquare, 
    description: "Verbal communication patterns and abilities" 
  },
  { 
    key: "gestures", 
    label: "Gestures & Pointing", 
    icon: Hand, 
    description: "Non-verbal communication through gestures" 
  },
  { 
    key: "repetitive_behavior", 
    label: "Repetitive Behaviors", 
    icon: RotateCcw, 
    description: "Presence of repetitive movements or routines" 
  },
];

function normalizeTherapyPlan(plan: string[]): Array<{ label: string; detail: string }> {
  const fallback = ["Early Week", "Mid Week", "Late Week"];
  return [0, 1, 2].map((idx) => {
    const raw = plan[idx] ?? "";
    const [, ...rest] = raw.split(":");
    return {
      label: fallback[idx],
      detail: rest.length > 0 ? rest.join(":").trim() : raw || "No plan provided",
    };
  });
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * ResultsPage Component
 * 
 * Displays comprehensive screening results.
 * Handles loading, error, and empty states appropriately.
 * 
 * STATE:
 * - results: The fetched/processed results data
 * - isLoading: Whether data is being loaded
 * - error: Type of error if any occurred
 * - errorMessage: User-friendly error message
 */
function ResultsPageContent() {
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  /** The screening results to display */
  const [results, setResults] = useState<ResultsData | null>(null);
  
  /** Loading state while fetching from API */
  const [isLoading, setIsLoading] = useState(true);
  
  /** Error type for conditional rendering */
  const [error, setError] = useState<ErrorType>(null);
  
  /** Human-readable error message */
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [animatedRisk, setAnimatedRisk] = useState(0);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const inFlightRef = useRef(false);
  const searchParams = useSearchParams();
  const sessionFromQuery = searchParams.get("session");
  const [sessionId, setSessionId] = useState<string | null>(null);

  const loadResults = async () => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setIsLoading(true);
    setError(null);
    setErrorMessage("");

    try {
      if (!sessionId) {
        setError("no_data");
        setIsLoading(false);
        return;
    }
      const apiResults = await getResults(sessionId);
      setResults(normalizeScreeningResultForUi(apiResults));
    } catch (err) {
      setError("api_error");
      setErrorMessage(
        err instanceof Error 
          ? err.message 
          : "An unexpected error occurred while loading results."
      );
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  // 🔵 1. Handle session safely (SSR-safe)
useEffect(() => {
  let id = sessionFromQuery;

  if (typeof window !== "undefined") {
    if (sessionFromQuery) {
      sessionStorage.setItem("session_id", sessionFromQuery);
      id = sessionFromQuery;
    } else {
      id = sessionStorage.getItem("session_id");
    }
  }

  setSessionId(id);
}, [sessionFromQuery]);

// 🔵 2. Fetch results ONLY after sessionId is set
useEffect(() => {
  if (sessionId) {
    loadResults();
  }
}, [sessionId]);

// 🔵 3. Animate risk score (UI only)
useEffect(() => {
  if (!results) return;

  const timer = window.setTimeout(() => {
    setAnimatedRisk(results.risk_score);
  }, 80);

  return () => window.clearTimeout(timer);
}, [results]);

// 🔵 4. Prepare therapy timeline (memoized)
const timeline = useMemo(() => {
  return normalizeTherapyPlan(results?.therapy_plan ?? []);
}, [results?.therapy_plan]);

  const buildShareUrl = () => {
    if (!results) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/results?session=${encodeURIComponent(results.session_id)}`;
  };

  const handleShareReport = async () => {
    if (!results) return;
    const shareUrl = buildShareUrl();
    const shareTitle = `AutiScreen Report - Session ${results.session_id}`;
    const shareText = `Risk: ${results.risk_score}% (${results.risk_band})`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      window.alert("Report link copied to clipboard.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to share this report.";
      window.alert(message);
    }
  };

  const handleDownloadPdf = async () => {
    if (!results || isDownloadingPdf) return;
    setIsDownloadingPdf(true);
    try {
      const pdfDoc = await PDFDocument.create();
      const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 48;
      const contentWidth = pageWidth - margin * 2;
      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y = pageHeight - 56;

      const ensureSpace = (minSpace = 20) => {
        if (y - minSpace >= 48) return;
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - 56;
      };

      const drawLine = (line: string, size = 11, bold = false) => {
        ensureSpace(size + 6);
        page.drawText(line, {
          x: margin,
          y,
          size,
          font: bold ? fontBold : fontRegular,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= size + 5;
      };

      const wrapText = (text: string, size = 11) => {
        const words = text.split(/\s+/).filter(Boolean);
        const lines: string[] = [];
        let current = "";
        for (const word of words) {
          const next = current ? `${current} ${word}` : word;
          const width = fontRegular.widthOfTextAtSize(next, size);
          if (width <= contentWidth) {
            current = next;
          } else {
            if (current) lines.push(current);
            current = word;
          }
        }
        if (current) lines.push(current);
        return lines;
      };

      const addBodyParagraph = (text: string, size = 11) => {
        const lines = wrapText(text, size);
        lines.forEach((line) => drawLine(line, size, false));
      };

      const addHeading = (text: string) => {
        drawLine(text, 16, true);
        y -= 2;
      };

      const printDate = new Date(results.created_at).toLocaleString();
      drawLine("AutiScreen Assessment Report", 22, true);
      y -= 2;
      drawLine(`Session ID: ${results.session_id}`, 11);
      drawLine(`Generated: ${printDate}`, 11);
      drawLine(`Risk Score: ${results.risk_score}% (${results.risk_band})`, 11);
      y -= 8;

      addHeading("Module Breakdown");
      drawLine(`Eye Contact: ${results.module_scores.eye_contact}/100`);
      drawLine(`Response to Name: ${results.module_scores.response_to_name}/100`);
      drawLine(`Vocalization: ${results.module_scores.vocalization}/100`);
      drawLine(`Gestures & Pointing: ${results.module_scores.gestures}/100`);
      drawLine(
        `Repetitive Behaviors: ${results.module_scores.repetitive_behavior}/100`
      );
      y -= 8;

      addHeading("Detailed Explanation");
      addBodyParagraph(results.explanation);
      y -= 8;

      addHeading("Recommended Next Steps");
      timeline.forEach((item, index) => {
        addBodyParagraph(`${index + 1}. ${item.label}: ${item.detail}`);
      });
      y -= 12;

      addBodyParagraph(
        "Disclaimer: This screening tool is not a diagnostic instrument. Please consult qualified healthcare professionals for formal evaluation."
      );

      const pdfBytes = await pdfDoc.save();
      const fileName = `autiscreen-report-${results.session_id}.pdf`;
      const pdfBuffer = pdfBytes.buffer.slice(
        pdfBytes.byteOffset,
        pdfBytes.byteOffset + pdfBytes.byteLength
      ) as ArrayBuffer;
      const blob = new Blob([pdfBuffer], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to generate PDF report.";
      window.alert(message);
    } finally {
      setIsDownloadingPdf(false);
    }
  };
  // ==========================================================================
  // RENDER: Loading State
  // ==========================================================================
  
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <LoadingState message="Analyzing screening results..." />
        </main>
        <Footer />
      </div>
    );
  }

  // ==========================================================================
  // RENDER: Error States
  // ==========================================================================
  
  // No screening data found
  if (error === "no_data") {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <EmptyState
            icon={ClipboardList}
            title="No Screening Results"
            description="You haven't completed a screening yet. Start a new assessment to see your results."
            actionLabel="Start Screening"
            actionHref="/screening"
          />
        </main>
        <Footer />
      </div>
    );
  }
  
  // API or unexpected error
  if (error === "api_error" || !results) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-lg">Unable to Load Results</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {errorMessage || "There was a problem loading your results."}
                </p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button variant="outline" onClick={loadResults}>
                  Try Again
                </Button>
                <Button asChild>
                  <Link href="/screening">New Screening</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  // ==========================================================================
  // RENDER: Results Display
  // ==========================================================================

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1 bg-muted/20">
        <div className="container mx-auto px-4 py-8">
          {/* Page Header */}
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Screening Results
              </h1>
              <p className="text-muted-foreground">
                Session ID: {results.session_id}
              </p>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
              >
                <Download className="mr-2 h-4 w-4" />
                {isDownloadingPdf ? "Generating PDF..." : "Download PDF"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleShareReport}>
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Content - 2 columns */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Overall Risk Score Card */}
              <Card className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-xl">Overall Risk Assessment</CardTitle>
                      <CardDescription>
                        Based on your screening responses
                      </CardDescription>
                    </div>
                    <RiskBadge level={results.risk_band} size="lg" />
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-8">
                    {/* Large Score Display */}
                    <div className="text-center">
                      <div className="text-5xl font-bold text-foreground tabular-nums">
                        {results.risk_score}%
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Risk Score
                      </p>
                    </div>
                    
                    {/* Risk Visualization Bar */}
                    <div className="flex-1">
                      <div className="flex justify-between text-sm text-muted-foreground mb-2">
                        <span>Low Risk</span>
                        <span>High Risk</span>
                      </div>
                      <div className="relative h-4 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${
                            results.risk_band === "low"
                              ? "bg-success"
                              : results.risk_band === "moderate"
                              ? "bg-warning"
                              : "bg-destructive"
                          }`}
                          style={{ width: `${animatedRisk}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Module Scores Breakdown */}
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-4">
                  Module Breakdown
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {MODULE_CONFIG.map((module) => (
                    <ModuleScoreCard
                      key={module.key}
                      title={module.label}
                      score={
                        results.module_scores[
                          module.key as keyof typeof results.module_scores
                        ]
                      }
                      icon={module.icon}
                      description={module.description}
                    />
                  ))}
                </div>
              </div>

              {/* Detailed Explanation Section */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Detailed Explanation</CardTitle>
                      <CardDescription>
                        Understanding your results
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground leading-relaxed">
                    {results.explanation}
                  </p>
                  
                  {/* Note about backend processing */}
                  <p className="mt-4 text-xs text-muted-foreground/70 italic">
                    This analysis is generated by our AI system using advanced algorithms 
                    including A* pathfinding, BFS graph traversal, and CSP constraint validation.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar - 1 column */}
            <div className="space-y-6">
              
              {/* Recommended Next Steps */}
              <Card>
                <CardHeader>
                  <CardTitle>Recommended Next Steps</CardTitle>
                  <CardDescription>
                    Based on your screening results
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-5">
                    {timeline.map((item, index) => (
                      <li key={item.label} className="relative pl-8">
                        {index < timeline.length - 1 ? (
                          <span className="absolute left-[11px] top-6 h-8 w-px bg-border" />
                        ) : null}
                        <span className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Clock3 className="h-3.5 w-3.5" />
                        </span>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {item.label}
                        </p>
                        <p className="text-sm text-foreground">{item.detail}</p>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <Button asChild className="w-full">
                    <Link href="/guidance">
                      View Full Guidance
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/history">View Session History</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/screening">Take New Assessment</Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Important Disclaimer */}
              <Card className="border-warning/30 bg-warning/5">
                <CardContent className="pt-6">
                  <p className="text-sm text-warning-foreground">
                    <strong>Reminder:</strong> This screening tool is not a diagnostic 
                    instrument. Please consult with qualified healthcare professionals 
                    for proper evaluation and diagnosis.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1 flex items-center justify-center">
            <LoadingState message="Loading results..." />
          </main>
          <Footer />
        </div>
      }
    >
      <ResultsPageContent />
    </Suspense>
  );
}
