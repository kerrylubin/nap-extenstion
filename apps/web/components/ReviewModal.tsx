"use client";
import { useState, useEffect } from "react";
import { JobApplication } from "@/types";

interface Props {
  app: JobApplication;
  onClose: () => void;
  onSent: (id: string) => void;
  testMode?: boolean;
  onLetterUpdated?: (id: string, updates: Partial<JobApplication>) => void;
  hasNext?: boolean;
  hasPrev?: boolean;
  onNext?: () => void;
  onPrev?: () => void;
  userName?: string;
  userEmail?: string;
}

type LetterTab = "preview" | "edit" | "ai";

export function ReviewModal({
  app,
  onClose,
  onSent,
  testMode = false,
  onLetterUpdated,
  hasNext = false,
  hasPrev = false,
  onNext,
  onPrev,
  userName = "Applicant",
  userEmail,
}: Props) {
  const TEST_EMAIL = userEmail || "kerrytheartist31@gmail.com";
  const [emailTo, setEmailTo] = useState(app.recruiterEmail ?? "");
  const [emailPhone, setEmailPhone] = useState(app.recruiterPhone ?? "");
  const [emailBody, setEmailBody] = useState(app.emailBody ?? "");
  const [letterBase64, setLetterBase64] = useState(app.letterBase64 ?? "");
  const [letterFilename, setLetterFilename] = useState(
    (app.letterPath ?? `${userName} ${app.company} Motivatiebrief.pdf`).replace(/_/g, " ")
  );

  const [letterTab, setLetterTab] = useState<LetterTab>(app.letterText ? "edit" : "preview");
  const [tokensUsed, setTokensUsed] = useState(app.tokensUsed ?? 0);
  const [costUsd, setCostUsd] = useState(app.costUsd ?? 0.0);
  const [letterText, setLetterText] = useState(app.letterText ?? "");
  const [aiPrompt, setAiPrompt] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }
      if (e.key === "ArrowRight" && hasNext && onNext) {
        onNext();
      } else if (e.key === "ArrowLeft" && hasPrev && onPrev) {
        onPrev();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasNext, hasPrev, onNext, onPrev]);

  async function handleSend() {
    if (!testMode && !emailTo.trim()) return setError("Please enter an email address.");
    if (!letterBase64) return setError("No motivation letter found. Process the job again.");
    setSending(true);
    setError("");
    const sendTo = testMode ? TEST_EMAIL : emailTo;
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: app.id,
          to: sendTo,
          jobTitle: app.jobTitle,
          company: app.company,
          emailBody,
          letterBase64,
          letterFilename,
          language: app.language,
          recruiterPhone: emailPhone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send email");
      setSuccess(true);
      onSent(app.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  function downloadLetter() {
    if (!letterBase64) return;
    const link = document.createElement("a");
    link.href = `data:application/pdf;base64,${letterBase64}`;
    link.download = letterFilename;
    link.click();
  }

  async function applyManualEdit() {
    if (!letterText.trim()) return;
    setRegenerating(true);
    setRegenError("");
    try {
      const res = await fetch("/api/regenerate-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: app.id,
          jobTitle: app.jobTitle,
          company: app.company,
          contactName: app.contactName,
          jobDescription: app.jobDescription,
          language: app.language,
          currentLetter: letterText,
          prompt: "Reformat this letter into a clean professional motivation letter. Keep all the content exactly as written.",
          hobbies: localStorage.getItem("napai_hobbies") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const cleanFilename = data.letterFilename.replace(/_/g, " ");
      setLetterBase64(data.letterBase64);
      setLetterFilename(cleanFilename);
      setTokensUsed(data.tokensUsed ?? 0);
      setCostUsd(data.costUsd ?? 0.0);
      onLetterUpdated?.(app.id, {
        letterBase64: data.letterBase64,
        letterPath: cleanFilename,
        tokensUsed: data.tokensUsed,
        costUsd: data.costUsd,
        letterText,
      });
      setLetterTab("preview");
    } catch (e: unknown) {
      setRegenError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  }

  const [savingText, setSavingText] = useState(false);

  async function saveTextOnly() {
    if (!letterText.trim()) return;
    setSavingText(true);
    setRegenError("");
    try {
      const res = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: app.id,
          letterText: letterText,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save edits");
      }
      onLetterUpdated?.(app.id, { letterText });
      setLetterTab("preview");
    } catch (e: unknown) {
      setRegenError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingText(false);
    }
  }

  async function applyAiPrompt() {
    if (!aiPrompt.trim()) return;
    setRegenerating(true);
    setRegenError("");
    try {
      const res = await fetch("/api/regenerate-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: app.id,
          jobTitle: app.jobTitle,
          company: app.company,
          contactName: app.contactName,
          jobDescription: app.jobDescription,
          language: app.language,
          currentLetter: letterText || undefined,
          prompt: aiPrompt,
          hobbies: localStorage.getItem("napai_hobbies") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const cleanFilename = data.letterFilename.replace(/_/g, " ");
      setLetterBase64(data.letterBase64);
      setLetterFilename(cleanFilename);
      setLetterText(data.letterText ?? "");
      setTokensUsed(data.tokensUsed ?? 0);
      setCostUsd(data.costUsd ?? 0.0);
      onLetterUpdated?.(app.id, {
        letterBase64: data.letterBase64,
        letterPath: cleanFilename,
        tokensUsed: data.tokensUsed,
        costUsd: data.costUsd,
        letterText: data.letterText ?? "",
      });
      setAiPrompt("");
      setLetterTab("preview");
    } catch (e: unknown) {
      setRegenError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] flex flex-col relative">
        {/* Prev Arrow */}
        {hasPrev && onPrev && (
          <button
            onClick={onPrev}
            className="absolute top-1/2 -left-3 md:-left-16 -translate-y-1/2 bg-white text-gray-700 hover:text-gray-900 border border-gray-200 shadow-lg p-2.5 rounded-full hover:scale-110 transition-all flex items-center justify-center cursor-pointer z-50 focus:outline-none"
            title="Previous application (ArrowLeft)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Next Arrow */}
        {hasNext && onNext && (
          <button
            onClick={onNext}
            className="absolute top-1/2 -right-3 md:-right-16 -translate-y-1/2 bg-white text-gray-700 hover:text-gray-900 border border-gray-200 shadow-lg p-2.5 rounded-full hover:scale-110 transition-all flex items-center justify-center cursor-pointer z-50 focus:outline-none"
            title="Next application (ArrowRight)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {/* Header */}
        <div className="flex items-start justify-between mb-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{app.jobTitle}</h2>
            <p className="text-sm text-gray-700 font-medium">{app.company}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 text-2xl leading-none ml-4">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* Match score */}
          {app.matchScore !== undefined && (
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
              <div className="text-2xl font-bold text-gray-900">{app.matchScore}%</div>
              <div>
                <div className="text-xs font-medium text-gray-700">Match score</div>
                <div className="w-32 bg-gray-200 rounded-full h-1.5 mt-1">
                  <div
                    className={`h-1.5 rounded-full ${app.matchScore >= 70 ? "bg-green-500" : app.matchScore >= 40 ? "bg-yellow-400" : "bg-red-400"}`}
                    style={{ width: `${app.matchScore}%` }}
                  />
                </div>
              </div>
              <div className="ml-auto flex flex-col items-end text-xs text-gray-600 font-semibold">
                <div>Language: <span className="font-medium text-gray-800">{app.language === "nl" ? "Dutch" : "English"}</span></div>
                {costUsd > 0 && (
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="font-mono text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-bold border border-purple-100" title={`${tokensUsed?.toLocaleString()} tokens`}>
                      AI Cost: ${costUsd.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Test mode banner */}
          {testMode && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
              <span className="text-base leading-none">🧪</span>
              <div>
                <span className="font-semibold">Test mode is on.</span> This email will be sent to{" "}
                <span className="font-mono font-medium">{TEST_EMAIL}</span> instead of the recruiter.
                The email will look exactly as the recruiter would receive it.
              </div>
            </div>
          )}

          {/* To & Phone Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                To (email)
                {!app.recruiterEmail && !testMode && (
                  <span className="ml-2 text-orange-400 font-normal">— not found</span>
                )}
              </label>
              <input
                type="email"
                value={testMode ? TEST_EMAIL : emailTo}
                onChange={(e) => !testMode && setEmailTo(e.target.value)}
                readOnly={testMode}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 ${testMode
                    ? "border-amber-200 bg-amber-50 text-amber-700 cursor-not-allowed"
                    : emailTo
                      ? "border-gray-200 text-gray-900"
                      : "border-orange-300 bg-orange-50 text-gray-900"
                  }`}
                placeholder="recruiter@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Phone
                {!app.recruiterPhone && (
                  <span className="ml-2 text-orange-400 font-normal">— not found</span>
                )}
              </label>
              <input
                type="text"
                value={emailPhone}
                onChange={(e) => setEmailPhone(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-900 ${emailPhone ? "border-gray-200 text-gray-900 bg-white" : "border-orange-300 bg-orange-50 text-gray-900"
                  }`}
                placeholder="+31 6 12345678"
              />
            </div>
          </div>

          {/* Subject */}
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-800 font-medium">
            <span className="text-xs font-semibold text-gray-600 block mb-0.5">Subject</span>
            {app.language === "en" ? "Application" : "Sollicitatie"}: {app.jobTitle} | {userName}
          </div>


          {/* Email body */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email message</label>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Motivation letter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Motivation letter</label>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
                {(["preview", "edit", "ai"] as LetterTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setLetterTab(t)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${letterTab === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
                      }`}
                  >
                    {t === "preview" ? "Preview" : t === "edit" ? "Edit manually" : "Edit with AI"}
                  </button>
                ))}
              </div>
            </div>

            {letterTab === "preview" && (
              <div className="flex gap-2">
                <button
                  onClick={downloadLetter}
                  disabled={!letterBase64}
                  className="flex items-center gap-1.5 bg-gray-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-40 font-semibold"
                >
                  <span>📝</span> {letterFilename} <span className="text-gray-600 font-bold ml-1">↓ Download</span>
                </button>
                {letterText && (
                  <button
                    onClick={applyManualEdit}
                    disabled={regenerating}
                    className="flex items-center gap-1.5 bg-brand-900 hover:bg-brand-700 text-white rounded-lg px-3 py-2 text-xs disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {regenerating ? (
                      <><svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Generating PDF...</>
                    ) : (
                      <><span>✨</span> Generate PDF</>
                    )}
                  </button>
                )}
              </div>
            )}

            {letterTab === "edit" && (
              <div>
                <textarea
                  value={letterText}
                  onChange={(e) => setLetterText(e.target.value)}
                  rows={12}
                  placeholder="Your motivation letter will appear here. Edit it, then click 'Save changes'."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-brand-900 font-mono placeholder:text-gray-400"
                />
                {regenError && <p className="text-xs text-red-500 mt-1">{regenError}</p>}
                <button
                  onClick={saveTextOnly}
                  disabled={savingText || !letterText.trim()}
                  className="mt-2 px-4 py-2 text-sm bg-brand-900 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {savingText ? (
                    <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Saving...</>
                  ) : "Save changes"}
                </button>
              </div>
            )}

            {letterTab === "ai" && (
              <div>
                <p className="text-xs text-gray-700 font-medium mb-2 leading-relaxed">
                  Tell the AI what to change — e.g. &quot;Make it shorter&quot;, &quot;Add more about my Python skills&quot;, &quot;Change the tone to be more formal&quot;
                </p>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={3}
                  placeholder='e.g. "Make the opening paragraph more direct" or "Regenerate the whole letter"'
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
                />
                {regenError && <p className="text-xs text-red-500 mt-1">{regenError}</p>}
                <button
                  onClick={applyAiPrompt}
                  disabled={regenerating || !aiPrompt.trim()}
                  className="mt-2 px-4 py-2 text-sm bg-brand-900 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {regenerating ? (
                    <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Rewriting...</>
                  ) : "Rewrite with AI"}
                </button>
              </div>
            )}
          </div>

          {/* Attachments summary */}
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <div className="text-xs font-bold text-gray-800 mb-2 uppercase tracking-wide">Attachments</div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs">
                <span>📄</span> {userName.replace(/\s+/g, "_")}_CV.pdf
              </div>

              {letterBase64 && (
                <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-600">
                  <span>📝</span> {letterFilename}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 mt-4 pt-4 border-t border-gray-100">
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}
          {success && <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 mb-3">Email sent! Application marked as Sent.</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Close</button>
            <button
              onClick={handleSend}
              disabled={sending || success}
              className="px-4 py-2 text-sm bg-brand-900 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              {sending ? (
                <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Sending...</>
              ) : success ? "Sent ✓" : "Send via Gmail"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
