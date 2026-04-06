"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History, Search, Plus } from "lucide-react";
import { getSessionHistory, type SessionSummary } from "@/lib/api";

const riskClass: Record<SessionSummary["risk_band"], string> = {
  low: "bg-green-500/10 text-green-700 border-green-500/20",
  moderate: "bg-yellow-500/10 text-yellow-700 border-yellow-500/20",
  high: "bg-red-500/10 text-red-700 border-red-500/20",
};

function formatDateTime(iso: string): { date: string; time: string } {
  const dt = new Date(iso);
  return {
    date: dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    time: dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inFlightRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const load = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setIsLoading(true);
      setError(null);
      try {
        const data = await getSessionHistory();
        setSessions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session history");
      } finally {
        inFlightRef.current = false;
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const filteredSessions = useMemo(() => {
    if (!debouncedQuery) return sessions;
    return sessions.filter((s) => {
      const dt = formatDateTime(s.created_at);
      return (
        s.session_id.toLowerCase().includes(debouncedQuery) ||
        dt.date.toLowerCase().includes(debouncedQuery)
      );
    });
  }, [sessions, debouncedQuery]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <LoadingState message="Analyzing with AI..." />
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <ErrorState title="Failed to Load History" message={error} onRetry={() => window.location.reload()} />
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 bg-muted/20">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Session History</h1>
              <p className="text-muted-foreground">All previously saved backend sessions.</p>
            </div>
            <Button asChild>
              <Link href="/screening">
                <Plus className="mr-2 h-4 w-4" />
                New Screening
              </Link>
            </Button>
          </div>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by session id or date..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {filteredSessions.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon={History}
                  title="No Sessions Found"
                  description="No screening sessions are available yet."
                  actionLabel="Start Screening"
                  actionHref="/screening"
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Saved Sessions</CardTitle>
                <CardDescription>Persistent data from MongoDB (`autis_mind.results`).</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Session ID</TableHead>
                      <TableHead>Risk Score</TableHead>
                      <TableHead>Risk Band</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSessions.map((s) => {
                      const dt = formatDateTime(s.created_at);
                      return (
                        <TableRow key={s.session_id}>
                          <TableCell className="font-mono text-xs md:text-sm">{s.session_id}</TableCell>
                          <TableCell className="font-semibold">{s.risk_score}%</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={riskClass[s.risk_band]}>
                              {s.risk_band}
                            </Badge>
                          </TableCell>
                          <TableCell>{dt.date} {dt.time}</TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/results?session=${encodeURIComponent(s.session_id)}`}>View</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
