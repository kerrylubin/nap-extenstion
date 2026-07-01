"use client";
import { useEffect, useState } from "react";
import { JobApplication, ApplicationStatus, ProcessJobResult, Profile } from "@/types";
import { ApplicationTable } from "@/components/ApplicationTable";
import { ProcessJobModal } from "@/components/ProcessJobModal";
import { ReviewModal } from "@/components/ReviewModal";
import { JobSearchPanel } from "@/components/JobSearchPanel";
import { BulkImportModal } from "@/components/BulkImportModal";
import { FollowUpModal } from "@/components/FollowUpModal";
import { ScrapedJob } from "@/app/api/search-jobs/route";
import Link from "next/link";

interface DuplicateGroup {
  key: string;
  type: "url" | "title_company";
  apps: JobApplication[];
}

function getDuplicateGroups(apps: JobApplication[]): DuplicateGroup[] {
  const urlMap = new Map<string, JobApplication[]>();
  const titleCompanyMap = new Map<string, JobApplication[]>();

  apps.forEach((app) => {
    if (app.jobUrl && app.jobUrl.trim()) {
      const url = app.jobUrl.trim().toLowerCase();
      if (!urlMap.has(url)) urlMap.set(url, []);
      urlMap.get(url)!.push(app);
    }

    const normTitle = app.jobTitle.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    const normCompany = app.company.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    if (normTitle && normCompany) {
      const key = `${normTitle}_${normCompany}`;
      if (!titleCompanyMap.has(key)) titleCompanyMap.set(key, []);
      titleCompanyMap.get(key)!.push(app);
    }
  });

  const groups: DuplicateGroup[] = [];
  const seenAppIds = new Set<string>();

  urlMap.forEach((groupApps, url) => {
    if (groupApps.length > 1) {
      groups.push({ key: url, type: "url", apps: groupApps });
      groupApps.forEach((a) => seenAppIds.add(a.id));
    }
  });

  titleCompanyMap.forEach((groupApps, key) => {
    const remaining = groupApps.filter((a) => !seenAppIds.has(a.id));
    if (remaining.length > 1) {
      groups.push({ key, type: "title_company", apps: remaining });
      remaining.forEach((a) => seenAppIds.add(a.id));
    }
  });

  return groups;
}

export default function Home() {
  const [apps, setApps] = useState<JobApplication[]>([]);
  const [showProcess, setShowProcess] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [reviewApp, setReviewApp] = useState<JobApplication | null>(null);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [reapplyingId, setReapplyingId] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    action: "reapply" | "send";
    done: number;
    total: number;
    errors: number;
    failedItems?: { jobTitle: string; company: string; error: string }[];
    isCompleted?: boolean;
  } | null>(null);
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [reviewQueue, setReviewQueue] = useState<string[]>([]);
  const [followUpApp, setFollowUpApp] = useState<JobApplication | null>(null);
  const [bulkFollowUpProgress, setBulkFollowUpProgress] = useState<{
    done: number;
    total: number;
    errors: number;
    isCompleted?: boolean;
  } | null>(null);

  function handleReviewSingle(app: JobApplication) {
    setReviewQueue([app.id]);
    setReviewApp(app);
  }

  function handleBulkReview(ids: string[]) {
    if (ids.length === 0) return;
    setReviewQueue(ids);
    const firstApp = apps.find((a) => a.id === ids[0]);
    if (firstApp) setReviewApp(firstApp);
  }

  useEffect(() => {
    loadApps();
    checkGmail();
    loadUserProfile();
    if (window.location.search.includes("gmail=connected")) {
      setGmailConnected(true);
      window.history.replaceState({}, "", "/");
    }
  }, []);

  async function loadUserProfile() {
    try {
      const res = await fetch("/api/upload-cv");
      if (res.ok) {
        const data = await res.json();
        const profile = data.profile ?? null;
        if (profile) {
          if (profile.hobbies) {
            localStorage.setItem("napai_hobbies", profile.hobbies);
          } else {
            const localH = localStorage.getItem("napai_hobbies");
            if (localH) profile.hobbies = localH;
          }
        }
        setUserProfile(profile);
      }
    } catch {
      // non-critical
    }
  }

  async function loadApps() {
    setLoading(true);
    const res = await fetch("/api/applications");
    const data = await res.json();
    setApps(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function checkGmail() {
    const res = await fetch("/api/auth/status");
    const data = await res.json();
    setGmailConnected(data.connected);
  }

  async function handleStatusChange(id: string, status: ApplicationStatus) {
    const app = apps.find((a) => a.id === id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: any = { id, status };
    if (status === "sent" && app) {
      updates.emailSentDate = new Date().toISOString();
      const d = new Date();
      d.setDate(d.getDate() + 5);
      updates.followUpDate = d.toISOString();
    } else if (status === "liked" || status === "pending") {
      updates.emailSentDate = null;
      updates.followUpDate = null;
    }

    const res = await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Sollicitatie verwijderen?")) return;
    await fetch("/api/applications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setApps((prev) => prev.filter((a) => a.id !== id));
  }

  async function saveResult(result: ProcessJobResult): Promise<void> {
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobTitle: result.jobTitle,
        company: result.company,
        jobUrl: result.jobUrl,
        recruiterEmail: result.recruiterEmail,
        recruiterPhone: result.recruiterPhone,
        contactName: result.contactName,
        language: result.language,
        matchScore: result.matchScore,
        emailBody: result.emailBody,
        jobDescription: result.jobDescription,
        letterBase64: result.letterBase64,
        letterPath: result.letterFilename,
        letterText: result.letterText,
        status: "liked",
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
      }),
    });
    const newApp = await res.json();
    if (!res.ok) throw new Error(newApp.error ?? "Failed to save application");
    setApps((prev) => [newApp, ...prev]);
  }

  async function handleProcessResult(result: ProcessJobResult) {
    setShowProcess(false);
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobTitle: result.jobTitle,
        company: result.company,
        jobUrl: result.jobUrl,
        recruiterEmail: result.recruiterEmail,
        recruiterPhone: result.recruiterPhone,
        contactName: result.contactName,
        language: result.language,
        matchScore: result.matchScore,
        emailBody: result.emailBody,
        jobDescription: result.jobDescription,
        letterBase64: result.letterBase64,
        letterPath: result.letterFilename,
        letterText: result.letterText,
        status: "liked",
        tokensUsed: result.tokensUsed,
        costUsd: result.costUsd,
      }),
    });
    const newApp = await res.json();
    if (!res.ok) {
      alert("Failed to save application: " + (newApp.error ?? "Unknown error") + "\n\nMake sure you have run the Supabase migration (supabase/migrations/001_initial.sql).");
      return;
    }
    setApps((prev) => [newApp, ...prev]);
    setReviewApp(newApp);
  }

  async function handleBulkResults(results: ProcessJobResult[]) {
    setShowBulk(false);
    for (const result of results) {
      await saveResult(result);
    }
  }

  async function handleAddLikedLinks(urls: string[]) {
    const newApps: JobApplication[] = [];
    for (const url of urls) {
      if (!url.trim()) continue;

      let company = "Link Added";
      try {
        const parsed = new URL(url);
        company = parsed.hostname.replace("www.", "");
      } catch { /* ignore */ }

      try {
        const res = await fetch("/api/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobTitle: "Job Posting",
            company: company,
            jobUrl: url,
            status: "liked" as ApplicationStatus,
          }),
        });
        if (res.ok) {
          const newApp = await res.json();
          newApps.push(newApp);
        } else {
          const errData = await res.json();
          console.error("Failed to add liked link:", url, errData.error);
        }
      } catch (e) {
        console.error("Failed to add liked link:", url, e);
      }
    }
    if (newApps.length > 0) {
      setApps((prev) => [...newApps, ...prev]);
    }
  }

  async function handleReapply(app: JobApplication) {
    if (!app.jobDescription && !app.jobUrl) return;
    setReapplyingId(app.id);
    try {
      const processRes = await fetch("/api/process-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobUrl: app.jobUrl || undefined,
          rawJobText: app.jobUrl ? undefined : app.jobDescription,
          hobbies: localStorage.getItem("napai_hobbies") || undefined,
        }),
      });
      const data = await processRes.json();
      if (!processRes.ok) throw new Error(data.error);

      // PATCH the existing record instead of creating a new one
      const patchRes = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: app.id,
          jobTitle: data.jobTitle || app.jobTitle || "Job Posting",
          company: data.company || app.company || "Unknown Company",
          jobDescription: data.jobDescription || app.jobDescription,
          emailBody: data.emailBody,
          letterBase64: data.letterBase64,
          letterPath: data.letterFilename,
          letterText: data.letterText,
          matchScore: data.matchScore,
          recruiterEmail: data.recruiterEmail ?? app.recruiterEmail,
          recruiterPhone: data.recruiterPhone ?? app.recruiterPhone,
          contactName: data.contactName ?? app.contactName,
          language: data.language,
          status: app.status,
          tokensUsed: (app.tokensUsed ?? 0) + (data.tokensUsed ?? 0),
          costUsd: (app.costUsd ?? 0.0) + (data.costUsd ?? 0.0),
        }),
      });
      const updated = await patchRes.json();
      setApps((prev) => prev.map((a) => (a.id === app.id ? updated : a)));
      setReviewApp(updated);
    } catch (e: unknown) {
      alert("Re-apply failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReapplyingId(null);
    }
  }

  async function handleBulkReapply(ids: string[]) {
    const targets = apps.filter((a) => ids.includes(a.id) && (a.jobDescription || a.jobUrl));
    if (targets.length === 0) return;
    setBulkProgress({ action: "reapply", done: 0, total: targets.length, errors: 0, failedItems: [] });
    let errors = 0;
    const failedItems: { jobTitle: string; company: string; error: string }[] = [];
    for (let i = 0; i < targets.length; i++) {
      const app = targets[i];
      try {
        const processRes = await fetch("/api/process-job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobUrl: app.jobUrl || undefined,
            rawJobText: app.jobUrl ? undefined : app.jobDescription,
            hobbies: localStorage.getItem("napai_hobbies") || undefined,
          }),
        });
        const data = await processRes.json();
        if (!processRes.ok) throw new Error(data.error ?? "Failed to process vacancy");
        const patchRes = await fetch("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: app.id,
            jobTitle: data.jobTitle || app.jobTitle || "Job Posting",
            company: data.company || app.company || "Unknown Company",
            jobDescription: data.jobDescription || app.jobDescription,
            emailBody: data.emailBody,
            letterBase64: data.letterBase64,
            letterPath: data.letterFilename,
            letterText: data.letterText,
            matchScore: data.matchScore,
            recruiterEmail: data.recruiterEmail ?? app.recruiterEmail,
            recruiterPhone: data.recruiterPhone ?? app.recruiterPhone,
            contactName: data.contactName ?? app.contactName,
            language: data.language,
            status: app.status,
            tokensUsed: (app.tokensUsed ?? 0) + (data.tokensUsed ?? 0),
            costUsd: (app.costUsd ?? 0.0) + (data.costUsd ?? 0.0),
          }),
        });
        if (!patchRes.ok) {
          const patchData = await patchRes.json();
          throw new Error(patchData.error ?? "Failed to update record in database");
        }
        const updated = await patchRes.json();
        setApps((prev) => prev.map((a) => (a.id === app.id ? updated : a)));
      } catch (e: unknown) {
        errors++;
        failedItems.push({
          jobTitle: app.jobTitle,
          company: app.company,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      setBulkProgress({ action: "reapply", done: i + 1, total: targets.length, errors, failedItems });
    }
    setBulkProgress({ action: "reapply", done: targets.length, total: targets.length, errors, failedItems, isCompleted: true });
  }

  async function handleBulkSend(ids: string[]) {
    const TEST_EMAIL = userProfile?.email || "kerrytheartist31@gmail.com";
    const targets = apps.filter((a) => ids.includes(a.id) && a.letterBase64 && a.emailBody);
    if (targets.length === 0) return;
    setBulkProgress({ action: "send", done: 0, total: targets.length, errors: 0, failedItems: [] });
    let errors = 0;
    const failedItems: { jobTitle: string; company: string; error: string }[] = [];
    for (let i = 0; i < targets.length; i++) {
      const app = targets[i];
      const sendTo = testMode ? TEST_EMAIL : app.recruiterEmail;
      if (!sendTo) {
        errors++;
        failedItems.push({
          jobTitle: app.jobTitle,
          company: app.company,
          error: "Recruiter email is missing and test mode is off",
        });
        setBulkProgress({ action: "send", done: i + 1, total: targets.length, errors, failedItems });
        continue;
      }
      try {
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId: app.id,
            to: sendTo,
            jobTitle: app.jobTitle,
            company: app.company,
            emailBody: app.emailBody,
            letterBase64: app.letterBase64,
            letterFilename: app.letterPath?.replace(/_/g, " "),
            language: app.language,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Gmail API call failed");
        setApps((prev) =>
          prev.map((a) =>
            a.id === app.id
              ? {
                  ...a,
                  status: "sent" as ApplicationStatus,
                  emailSentDate: new Date().toISOString(),
                  followUpDate: (() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 5);
                    return d.toISOString();
                  })(),
                }
              : a
          )
        );
      } catch (e: unknown) {
        errors++;
        failedItems.push({
          jobTitle: app.jobTitle,
          company: app.company,
          error: e instanceof Error ? e.message : String(e),
        });
      }
      setBulkProgress({ action: "send", done: i + 1, total: targets.length, errors, failedItems });
    }
    setBulkProgress({ action: "send", done: targets.length, total: targets.length, errors, failedItems, isCompleted: true });
  }

  async function handleFieldUpdate(id: string, fields: Partial<import("@/types").JobApplication>) {
    const res = await fetch("/api/applications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    if (res.ok) {
      const updated = await res.json();
      setApps((prev) => prev.map((a) => (a.id === id ? updated : a)));
    }
  }

  async function handleLikeJob(job: ScrapedJob) {
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: job.title,
          company: job.company,
          jobUrl: job.link,
          matchScore: job.matchScore,
          language: job.language || "nl",
          status: "liked" as ApplicationStatus,
        }),
      });
      const newApp = await res.json();
      if (!res.ok) throw new Error(newApp.error ?? "Failed to like vacancy");
      setApps((prev) => [newApp, ...prev]);
    } catch (e: unknown) {
      alert("Failed to like job: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  async function handleUnlikeJob(appId: string) {
    try {
      const res = await fetch("/api/applications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: appId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to unlike vacancy");
      }
      setApps((prev) => prev.filter((a) => a.id !== appId));
    } catch (e: unknown) {
      alert("Failed to unlike job: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  function handleExportCSV() {
    const headers = ["Company", "Role", "Status", "Match %", "Language", "Recruiter Email", "Sent Date", "Interview Date", "Follow-up Date", "Notes", "Job URL"];
    const rows = apps.map((a) => [
      a.company,
      a.jobTitle,
      a.status,
      a.matchScore ?? "",
      a.language,
      a.recruiterEmail ?? "",
      a.emailSentDate ? new Date(a.emailSentDate).toLocaleDateString("en-GB") : "",
      a.interviewDate ? new Date(a.interviewDate).toLocaleDateString("en-GB") : "",
      a.followUpDate ? new Date(a.followUpDate).toLocaleDateString("en-GB") : "",
      (a.notes ?? "").replace(/"/g, '""'),
      a.jobUrl ?? "",
    ].map((v) => `"${v}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `NAPAI_applications_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleBulkStatusChange(ids: string[], status: ApplicationStatus) {
    await Promise.all(
      ids.map((id) => {
        const app = apps.find((a) => a.id === id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates: any = { id, status };
        if (status === "sent" && app) {
          updates.emailSentDate = new Date().toISOString();
          const d = new Date();
          d.setDate(d.getDate() + 5);
          updates.followUpDate = d.toISOString();
        } else if (status === "liked" || status === "pending") {
          updates.emailSentDate = null;
          updates.followUpDate = null;
        }
        return fetch("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
      })
    );
    setApps((prev) =>
      prev.map((a) => {
        if (ids.includes(a.id)) {
          let emailSentDate = a.emailSentDate;
          let followUpDate = a.followUpDate;
          if (status === "sent") {
            emailSentDate = new Date().toISOString();
            const d = new Date();
            d.setDate(d.getDate() + 5);
            followUpDate = d.toISOString();
          } else if (status === "liked" || status === "pending") {
            emailSentDate = undefined;
            followUpDate = undefined;
          }
          return { ...a, status, emailSentDate, followUpDate };
        }
        return a;
      })
    );
  }

  function handleSent(id: string) {
    setApps((prev) =>
      prev.map((a) => {
        if (a.id === id) {
          const d = new Date();
          d.setDate(d.getDate() + 5);
          return {
            ...a,
            status: "sent" as ApplicationStatus,
            emailSentDate: new Date().toISOString(),
            followUpDate: d.toISOString(),
          };
        }
        return a;
      })
    );
  }

  function isOverdue(app: JobApplication): boolean {
    if (!app.followUpDate) return false;
    if (["interview", "rejected", "contact"].includes(app.status)) return false;
    return new Date(app.followUpDate) < new Date();
  }

  async function handleSnooze(id: string) {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    await handleFieldUpdate(id, { followUpDate: d.toISOString() });
  }

  async function handleMarkContacted(id: string) {
    await handleStatusChange(id, "contact");
  }

  function handleFollowUp(app: JobApplication) {
    setFollowUpApp(app);
  }

  async function handleContactSaved(id: string, email: string, contactName?: string) {
    setApps((prev) =>
      prev.map((a) =>
        a.id === id ? { ...a, recruiterEmail: email, ...(contactName ? { contactName } : {}) } : a
      )
    );
    const updated = apps.find((a) => a.id === id);
    if (updated && followUpApp?.id === id) {
      setFollowUpApp({ ...updated, recruiterEmail: email, ...(contactName ? { contactName } : {}) });
    }
  }

  async function handleBulkFollowUp(appsToFollowUp: JobApplication[]) {
    if (appsToFollowUp.length === 0) return;
    setBulkFollowUpProgress({ done: 0, total: appsToFollowUp.length, errors: 0 });
    let errors = 0;
    for (let i = 0; i < appsToFollowUp.length; i++) {
      const app = appsToFollowUp[i];
      try {
        // Generate follow-up body
        const genRes = await fetch("/api/generate-followup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobTitle: app.jobTitle,
            company: app.company,
            contactName: app.contactName,
            language: app.language ?? "nl",
            emailSentDate: app.emailSentDate,
          }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) throw new Error(genData.error ?? "Generate failed");
        const sendTo = testMode ? (userProfile?.email ?? "") : app.recruiterEmail;
        if (!sendTo) throw new Error("No recruiter email");
        const sendRes = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId: app.id,
            to: sendTo,
            jobTitle: app.jobTitle,
            company: app.company,
            emailBody: genData.emailBody,
            letterBase64: app.letterBase64 ?? null,
            letterFilename: app.letterPath ?? `${app.company} Motivatiebrief.pdf`,
            language: app.language ?? "nl",
            includeCV: true,
          }),
        });
        if (!sendRes.ok) {
          const sd = await sendRes.json();
          throw new Error(sd.error ?? "Send failed");
        }
        setApps((prev) => prev.map((a) => a.id === app.id ? { ...a, status: "contact" as ApplicationStatus } : a));
      } catch {
        errors++;
      }
      setBulkFollowUpProgress({ done: i + 1, total: appsToFollowUp.length, errors });
    }
    setBulkFollowUpProgress({ done: appsToFollowUp.length, total: appsToFollowUp.length, errors, isCompleted: true });
  }

  const overdueApps = apps.filter(isOverdue).sort((a, b) => {
    const da = a.followUpDate ? new Date(a.followUpDate).getTime() : 0;
    const db = b.followUpDate ? new Date(b.followUpDate).getTime() : 0;
    return da - db;
  });

  async function handleKeepOnlyOne(group: DuplicateGroup) {
    const statusPriority: Record<ApplicationStatus, number> = {
      interview: 5,
      contact: 4,
      no_answer: 3,
      sent: 2,
      pending: 1,
      liked: 0,
      rejected: -1,
    };

    const sorted = [...group.apps].sort((a, b) => {
      const pa = statusPriority[a.status] ?? 0;
      const pb = statusPriority[b.status] ?? 0;
      if (pa !== pb) return pb - pa;

      const ha = a.letterBase64 ? 1 : 0;
      const hb = b.letterBase64 ? 1 : 0;
      if (ha !== hb) return hb - ha;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const best = sorted[0];
    const toDelete = sorted.slice(1);

    if (confirm(`Keep the application with status "${best.status}" added on ${new Date(best.createdAt).toLocaleDateString("en-GB")} and delete the other ${toDelete.length} duplicates?`)) {
      for (const item of toDelete) {
        await fetch("/api/applications", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id }),
        });
      }
      const deletedIds = new Set(toDelete.map((item) => item.id));
      setApps((prev) => prev.filter((a) => !deletedIds.has(a.id)));
    }
  }

  const duplicateGroups = getDuplicateGroups(apps);

  const sentCount = apps.filter((a) => a.status === "sent").length;
  const responded = apps.filter((a) => ["interview", "no_answer", "rejected", "contact"].includes(a.status)).length;
  const totalSentOrMore = apps.filter((a) => !["pending", "liked"].includes(a.status)).length;
  const totalCost = apps.reduce((sum, a) => sum + (a.costUsd ?? 0), 0);
  const stats = {
    total: apps.filter((a) => a.status !== "liked").length,
    liked: apps.filter((a) => a.status === "liked").length,
    sent: sentCount,
    interview: apps.filter((a) => a.status === "interview").length,
    pending: apps.filter((a) => a.status === "pending").length,
    responseRate: totalSentOrMore > 0 ? Math.round((responded / totalSentOrMore) * 100) : 0,
    totalCost: totalCost.toFixed(4),
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-brand-900 text-white border-b border-brand-700/30 sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <span className="bg-brand-300 text-brand-900 px-2 py-0.5 rounded-lg text-sm font-black">N</span>
              <span>NAPAI</span>
            </h1>
            <p className="text-[10px] text-brand-300 font-semibold tracking-wider uppercase">Job Application Hub</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Profile link */}
            <Link
              href="/profile"
              className="flex items-center gap-2 text-xs text-brand-300 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5"
            >
              {userProfile?.avatarUrl ? (
                <img src={userProfile.avatarUrl} alt={userProfile.name ?? ""} className="w-6 h-6 rounded-full border border-white/20" />
              ) : (
                <span className="w-6 h-6 rounded-full bg-brand-700 flex items-center justify-center text-xs font-bold text-white">
                  {userProfile?.name?.[0] ?? "?"}
                </span>
              )}
              <span className="hidden sm:inline font-medium">{userProfile?.name ?? "Profile"}</span>
            </Link>
            {/* Test mode toggle */}
            <button
              onClick={() => setTestMode((v) => !v)}
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                testMode
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/30 font-medium"
                  : "bg-white/5 text-brand-300 border-white/10 hover:border-white/25 hover:text-white"
              }`}
              title={testMode ? `Test mode ON — emails go to ${userProfile?.email || "your email"}` : "Enable test mode"}
            >
              <span className={`w-2 h-2 rounded-full ${testMode ? "bg-amber-400" : "bg-gray-500"}`} />
              Test mode
            </button>

            {gmailConnected === false && (
              <a
                href="/api/auth/connect"
                className="text-xs px-3 py-1.5 bg-red-500/20 text-red-200 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors"
              >
                Connect Gmail
              </a>
            )}
            {gmailConnected === true && (
              <span className="text-xs text-green-300 border border-green-500/20 bg-green-500/10 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block animate-pulse"></span>
                Gmail connected
              </span>
            )}
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-white/5 border border-white/10 hover:border-white/25 text-white text-xs rounded-lg hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors"
            >
              <span>⬇</span> Export CSV
            </button>
            <button
              onClick={() => setShowBulk(true)}
              className="px-4 py-2 bg-brand-300 text-brand-900 text-xs font-bold rounded-lg hover:bg-brand-500 flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-brand-300/10 hover:shadow-brand-300/20 hover:scale-[1.02] transform"
            >
              <span>📋</span> Import Jobs
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
          {[
            { label: "Total Apps", value: stats.total, color: "text-brand-900", sub: null },
            { label: "Liked", value: stats.liked, color: "text-rose-500", sub: "to apply later" },
            { label: "Sent", value: stats.sent, color: "text-brand-700", sub: null },
            { label: "Interview", value: stats.interview, color: "text-green-600", sub: null },
            { label: "Pending", value: stats.pending, color: "text-brand-500", sub: null },
            { label: "Response Rate", value: `${stats.responseRate}%`, color: stats.responseRate >= 30 ? "text-green-600" : stats.responseRate > 0 ? "text-amber-600" : "text-brand-900/60", sub: "of sent applications" },
            { label: "Total AI Cost", value: `$${stats.totalCost}`, color: "text-purple-600", sub: "cumulative AI cost" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-brand-900/10 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                s.label === "Total Apps" ? "bg-brand-900" :
                s.label === "Liked" ? "bg-rose-400" :
                s.label === "Sent" ? "bg-brand-700" :
                s.label === "Interview" ? "bg-green-400" :
                s.label === "Pending" ? "bg-brand-500" :
                s.label === "Response Rate" ? "bg-brand-300" :
                "bg-purple-400"
              }`} />
              <div className={`text-3xl font-black tracking-tight ${s.color}`}>{s.value}</div>
              <div className="text-xs text-brand-900 font-bold mt-1 uppercase tracking-wider">{s.label}</div>
              {s.sub && <div className="text-[10px] text-gray-400 font-medium mt-0.5">{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Follow-up Alerts */}
        {overdueApps.length > 0 && (
          <div className="bg-brand-900/[0.04] border border-brand-900/10 p-5 rounded-3xl shadow-sm mb-8 animate-fadeIn">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xl">⏰</span>
                <h2 className="text-sm font-extrabold text-brand-900 uppercase tracking-wider">Follow-up Action Needed</h2>
                <span className="bg-brand-900 text-white px-2.5 py-0.5 rounded-full text-xs font-black font-mono">
                  {overdueApps.length}
                </span>
              </div>
              {/* Bulk follow-up button */}
              {overdueApps.filter((a) => a.recruiterEmail).length > 1 && (
                <button
                  onClick={() => handleBulkFollowUp(overdueApps.filter((a) => a.recruiterEmail))}
                  className="text-xs bg-brand-900 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  📨 Bulk Follow-up ({overdueApps.filter((a) => a.recruiterEmail).length})
                </button>
              )}
            </div>

            {/* Bulk follow-up progress bar */}
            {bulkFollowUpProgress && (
              <div className="mb-4 bg-white border border-brand-900/10 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-brand-900 mb-2">
                  <span>{bulkFollowUpProgress.isCompleted ? "Bulk follow-up complete" : "Sending follow-ups…"}</span>
                  <span>{bulkFollowUpProgress.done}/{bulkFollowUpProgress.total}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-brand-900 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(bulkFollowUpProgress.done / bulkFollowUpProgress.total) * 100}%` }}
                  />
                </div>
                {bulkFollowUpProgress.errors > 0 && (
                  <p className="text-xs text-red-600 mt-1.5 font-medium">{bulkFollowUpProgress.errors} failed (no email or send error)</p>
                )}
                {bulkFollowUpProgress.isCompleted && (
                  <button
                    onClick={() => setBulkFollowUpProgress(null)}
                    className="mt-2 text-xs text-brand-700 hover:text-brand-900 font-semibold underline cursor-pointer"
                  >
                    Dismiss
                  </button>
                )}
              </div>
            )}

            <div className="divide-y divide-brand-900/10 max-h-80 overflow-y-auto pr-1">
              {overdueApps.map((app) => {
                const overdueDays = Math.max(0, Math.round((new Date().getTime() - new Date(app.followUpDate!).getTime()) / (1000 * 60 * 60 * 24)));
                return (
                  <div key={app.id} className="flex flex-col md:flex-row md:items-center justify-between py-3.5 first:pt-0 last:pb-0 gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => { setReviewQueue([app.id]); setReviewApp(app); }}
                          className="font-semibold text-gray-900 hover:text-brand-700 hover:underline text-sm text-left transition-colors cursor-pointer font-sans"
                        >
                          {app.jobTitle}
                        </button>
                        <span className="text-xs text-gray-800 font-semibold">at {app.company}</span>
                      </div>
                      <div className="text-xs text-brand-700 mt-1 font-medium">
                        Scheduled follow-up: <span className="font-semibold">{new Date(app.followUpDate!).toLocaleDateString("en-GB")}</span> ({overdueDays} {overdueDays === 1 ? "day" : "days"} overdue)
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {app.recruiterPhone && (
                        <a
                          href={`tel:${app.recruiterPhone}`}
                          className="text-xs bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-semibold shadow-xs flex items-center gap-1 transition-all active:scale-95 whitespace-nowrap"
                        >
                          📞 {app.recruiterPhone}
                        </a>
                      )}
                      {/* View application — opens the original job posting */}
                      {app.jobUrl ? (
                        <a
                          href={app.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs bg-white text-brand-900 border border-brand-900/20 hover:bg-brand-900/5 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all active:scale-95 whitespace-nowrap"
                        >
                          👁 View Job
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400 px-3 py-1.5 border border-dashed border-gray-200 rounded-lg whitespace-nowrap">No URL</span>
                      )}
                      {/* Follow Up / Add email */}
                      <button
                        onClick={() => handleFollowUp(app)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer whitespace-nowrap ${
                          app.recruiterEmail
                            ? "bg-brand-900 hover:bg-brand-700 text-white shadow-sm"
                            : "bg-brand-500/10 text-brand-900 hover:bg-brand-500/20 border border-brand-500/30"
                        }`}
                      >
                        {app.recruiterEmail ? "📨 Follow Up" : "⚠️ Add email"}
                      </button>
                      <button
                        onClick={() => handleSnooze(app.id)}
                        className="text-xs bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg font-medium shadow-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                        title="Snooze for 5 more days"
                      >
                        📅 Snooze
                      </button>
                      {/* Status dropdown */}
                      <select
                        value={app.status}
                        onChange={(e) => handleStatusChange(app.id, e.target.value as ApplicationStatus)}
                        className="text-xs bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 px-2 py-1.5 rounded-lg font-semibold shadow-xs transition-all cursor-pointer whitespace-nowrap appearance-none pr-6"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236b7280'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                        title="Update status"
                      >
                        <option value="pending">⏳ Pending</option>
                        <option value="liked">❤️ Liked</option>
                        <option value="sent">📤 Sent</option>
                        <option value="no_answer">🔕 No Answer</option>
                        <option value="contact">✅ Contacted</option>
                        <option value="interview">🎤 Interview</option>
                        <option value="rejected">❌ Rejected</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Duplicate Alerts */}
        {duplicateGroups.length > 0 && (
          <div className="bg-rose-50/70 border border-rose-200/80 p-5 rounded-2xl shadow-sm mb-8 animate-fadeIn">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">👯</span>
              <h2 className="text-sm font-bold text-rose-800 uppercase tracking-wider">Duplicate Applications Detected</h2>
              <span className="bg-rose-200 text-rose-900 px-2 py-0.5 rounded-full text-xs font-bold font-mono">
                {duplicateGroups.length}
              </span>
            </div>
            <div className="divide-y divide-rose-100 max-h-80 overflow-y-auto pr-1">
              {duplicateGroups.map((group) => (
                <div key={group.key} className="flex flex-col md:flex-row md:items-center justify-between py-3.5 first:pt-0 last:pb-0 gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{group.apps[0].jobTitle}</span>
                      <span className="text-xs text-gray-800 font-semibold">at {group.apps[0].company}</span>
                    </div>
                    <div className="text-[10px] text-rose-700 mt-1 font-semibold uppercase tracking-wider">
                      Reason: {group.type === "url" ? "Same job posting URL" : "Same job title & company name"}
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {group.apps.map((item) => (
                        <div key={item.id} className="text-xs text-gray-800 flex items-center gap-2 flex-wrap font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0"></span>
                          <span className="text-gray-900">
                            Status: <strong className="font-bold">{item.status}</strong>
                          </span>
                          <span className="text-gray-500 font-bold">·</span>
                          <span>Added: {new Date(item.createdAt).toLocaleDateString("en-GB")}</span>
                          {item.matchScore !== undefined && (
                            <>
                              <span className="text-gray-500 font-bold">·</span>
                              <span>Match: {item.matchScore}%</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-start md:items-end lg:items-center gap-3 flex-shrink-0">
                    <button
                      onClick={() => handleKeepOnlyOne(group)}
                      className="text-xs bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-lg font-bold shadow-xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                      title="Keep the best/newest version and delete the other duplicates"
                    >
                      🪄 Keep best & clean others
                    </button>
                    <div className="flex flex-col gap-2 bg-white/70 border border-rose-100/50 rounded-xl p-2.5 shadow-2xs">
                      {group.apps.map((item) => (
                        <div key={item.id} className="flex items-center gap-2.5 flex-wrap justify-between min-w-[200px]">
                          <span className="text-[10px] text-gray-700 font-bold uppercase tracking-wider bg-rose-50 border border-rose-100/30 px-2 py-0.5 rounded">
                            {item.status} ({new Date(item.createdAt).toLocaleDateString("en-GB")})
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => { setReviewQueue([item.id]); setReviewApp(item); }}
                              className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline font-bold cursor-pointer flex items-center gap-0.5"
                              title="Review details"
                            >
                              👁️ View
                            </button>
                            <span className="text-gray-300 text-[10px]">|</span>
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="text-[10px] text-red-600 hover:text-red-800 hover:underline font-bold cursor-pointer flex items-center gap-0.5"
                              title="Delete this version"
                            >
                              ❌ Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Job Search */}
        <JobSearchPanel
          onResult={handleProcessResult}
          applications={apps}
          onLike={handleLikeJob}
          onUnlike={handleUnlikeJob}
        />

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            Loading...
          </div>
        ) : (
          <ApplicationTable
            applications={apps}
            onStatusChange={handleStatusChange}
            onDelete={handleDelete}
            onReview={handleReviewSingle}
            onReapply={handleReapply}
            onFieldUpdate={handleFieldUpdate}
            reapplyingId={reapplyingId}
            onBulkStatusChange={handleBulkStatusChange}
            onBulkReapply={handleBulkReapply}
            onBulkSend={handleBulkSend}
            onBulkReview={handleBulkReview}
            bulkProgress={bulkProgress}
            onDismissBulkProgress={() => setBulkProgress(null)}
            testMode={testMode}
          />
        )}
      </main>

      {/* Modals */}
      {showProcess && (
        <ProcessJobModal
          onClose={() => setShowProcess(false)}
          onResult={handleProcessResult}
          onAddLinks={handleAddLikedLinks}
        />
      )}
      {showBulk && (
        <BulkImportModal
          onClose={() => setShowBulk(false)}
          onResults={handleBulkResults}
        />
      )}
      {reviewApp && (() => {
        const queueIndex = reviewQueue.indexOf(reviewApp.id);
        const hasPrev = queueIndex > 0;
        const hasNext = queueIndex !== -1 && queueIndex < reviewQueue.length - 1;
        const onPrev = hasPrev ? () => {
          const prevApp = apps.find((a) => a.id === reviewQueue[queueIndex - 1]);
          if (prevApp) setReviewApp(prevApp);
        } : undefined;
        const onNext = hasNext ? () => {
          const nextApp = apps.find((a) => a.id === reviewQueue[queueIndex + 1]);
          if (nextApp) setReviewApp(nextApp);
        } : undefined;

        return (
          <ReviewModal
            key={reviewApp.id + (reviewApp.updatedAt ?? "")}
            app={reviewApp}
            onClose={() => { setReviewApp(null); setReviewQueue([]); }}
            onSent={handleSent}
            testMode={testMode}
            onLetterUpdated={(id, updates) => {
              setApps((prev) => prev.map((a) => a.id === id ? { ...a, ...updates } : a));
              setReviewApp((prev) => prev && prev.id === id ? { ...prev, ...updates } : prev);
            }}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={onPrev}
            onNext={onNext}
            userName={userProfile?.name}
            userEmail={userProfile?.email}
          />

        );
      })()}
      {/* Follow-up Modal */}
      {followUpApp && (
        <FollowUpModal
          key={followUpApp.id}
          app={followUpApp}
          testMode={testMode}
          userEmail={userProfile?.email}
          onClose={() => setFollowUpApp(null)}
          onSent={(id) => {
            setApps((prev) => prev.map((a) => a.id === id ? { ...a, status: "contact" as ApplicationStatus } : a));
            setFollowUpApp(null);
          }}
          onContactSaved={handleContactSaved}
          onDraftSaved={(id, draft) => {
            setApps((prev) => prev.map((a) => a.id === id ? { ...a, followUpEmailBody: draft } : a));
            setFollowUpApp((prev) => prev && prev.id === id ? { ...prev, followUpEmailBody: draft } : prev);
          }}
        />
      )}
    </div>
  );
}
