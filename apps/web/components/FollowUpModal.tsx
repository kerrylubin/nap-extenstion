"use client";
import { useState, useEffect } from "react";
import { JobApplication } from "@/types";

interface Props {
  app: JobApplication;
  testMode?: boolean;
  userEmail?: string;
  onClose: () => void;
  onSent: (id: string) => void;
  onContactSaved?: (id: string, email: string, contactName?: string) => void;
  onDraftSaved?: (id: string, draft: string) => void;
}

type Step = "contact" | "draft" | "sending" | "sent";
type Panel = "email" | "letter";

export function FollowUpModal({
  app,
  testMode = false,
  userEmail,
  onClose,
  onSent,
  onContactSaved,
  onDraftSaved,
}: Props) {
  const hasSavedDraft = !!app.followUpEmailBody;
  const [step, setStep] = useState<Step>(app.recruiterEmail ? "draft" : "contact");
  const [activePanel, setActivePanel] = useState<Panel>("email");

  // Contact step state
  const [contactEmail, setContactEmail] = useState(app.recruiterEmail ?? "");
  const [contactName, setContactName] = useState(app.contactName ?? "");
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState("");

  // Draft step state — pre-fill from saved draft if it exists
  const [emailBody, setEmailBody] = useState(app.followUpEmailBody ?? "");
  const [toEmail, setToEmail] = useState(app.recruiterEmail ?? contactEmail);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [attachCV, setAttachCV] = useState(true);
  const [attachLetter, setAttachLetter] = useState(!!app.letterBase64);

  // Sending
  const [sendError, setSendError] = useState("");

  // Auto-generate only if there is no saved draft yet
  useEffect(() => {
    if (step === "draft" && !hasSavedDraft && !emailBody) {
      generateDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function saveContactAndProceed() {
    if (!contactEmail.trim()) { setContactError("Please enter a recruiter email."); return; }
    setSavingContact(true);
    setContactError("");
    try {
      const res = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: app.id,
          recruiterEmail: contactEmail.trim(),
          ...(contactName.trim() ? { contactName: contactName.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error("Failed to save contact info.");
      onContactSaved?.(app.id, contactEmail.trim(), contactName.trim() || undefined);
      setStep("draft");
    } catch (e) {
      setContactError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingContact(false);
    }
  }

  async function generateDraft() {
    setGenerating(true);
    setGenError("");
    try {
      const res = await fetch("/api/generate-followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: app.jobTitle,
          company: app.company,
          contactName: app.contactName || contactName || undefined,
          language: app.language ?? "nl",
          emailSentDate: app.emailSentDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate follow-up.");
      const draft = data.emailBody as string;
      setEmailBody(draft);

      // Persist the draft to DB so it's not regenerated next time
      await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: app.id, followUpEmailBody: draft }),
      });
      onDraftSaved?.(app.id, draft);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleBodyBlur() {
    // Auto-save edits to the draft when the user leaves the textarea
    if (emailBody !== app.followUpEmailBody) {
      await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: app.id, followUpEmailBody: emailBody }),
      });
      onDraftSaved?.(app.id, emailBody);
    }
  }

  async function sendFollowUp() {
    setSendError("");
    setStep("sending");
    try {
      const to = testMode ? (userEmail ?? "") : toEmail;
      if (!to) throw new Error("Recipient email is required.");
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: app.id,
          to,
          jobTitle: app.jobTitle,
          company: app.company,
          emailBody,
          letterBase64: attachLetter && app.letterBase64 ? app.letterBase64 : null,
          letterFilename: app.letterPath ?? `${app.company} Motivatiebrief.pdf`,
          language: app.language ?? "nl",
          includeCV: attachCV,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed.");
      setStep("sent");
      onSent(app.id);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : String(e));
      setStep("draft");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>

        {/* Header */}
        <div className="bg-brand-900 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-white font-bold text-base">Follow-up Email</h2>
            <p className="text-brand-300 text-xs mt-0.5 font-medium">{app.jobTitle} · {app.company}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white text-xl font-bold leading-none transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-0 overflow-hidden flex-1">

          {/* ─── STEP: Contact ─── */}
          {step === "contact" && (
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-brand-900 font-medium">
                No recruiter email found for this application. Enter the contact details to enable the follow-up.
              </p>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Recruiter Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => { setContactEmail(e.target.value); setContactError(""); }}
                  placeholder="recruiter@company.com"
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Contact Name (optional)</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Sarah de Vries"
                  className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
                />
              </div>
              {contactError && <p className="text-xs text-red-600 font-medium">{contactError}</p>}
              <button
                onClick={saveContactAndProceed}
                disabled={!contactEmail.trim() || savingContact}
                className="mt-1 bg-brand-900 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-2.5 text-sm font-bold transition-all active:scale-95 cursor-pointer"
              >
                {savingContact ? "Saving…" : "Save & Generate Follow-up →"}
              </button>
            </div>
          )}

          {/* ─── STEP: Draft ─── */}
          {step === "draft" && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-gray-100 px-6 pt-4 gap-1 flex-shrink-0">
                <button
                  onClick={() => setActivePanel("email")}
                  className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors cursor-pointer ${
                    activePanel === "email"
                      ? "bg-brand-900 text-white"
                      : "text-gray-500 hover:text-brand-900 hover:bg-gray-50"
                  }`}
                >
                  ✉️ Email Draft
                </button>
                <button
                  onClick={() => setActivePanel("letter")}
                  disabled={!app.letterText && !app.letterBase64}
                  className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    activePanel === "letter"
                      ? "bg-brand-900 text-white"
                      : "text-gray-500 hover:text-brand-900 hover:bg-gray-50"
                  }`}
                  title={!app.letterText && !app.letterBase64 ? "No motivational letter available" : "Preview motivational letter"}
                >
                  📄 Motivational Letter
                </button>
              </div>

              <div className="p-6 flex flex-col gap-4 overflow-y-auto flex-1">
                {/* ── Email panel ── */}
                {activePanel === "email" && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email draft</span>
                        {hasSavedDraft && !generating && (
                          <span className="text-xs text-green-600 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Saved</span>
                        )}
                      </div>
                      <button
                        onClick={generateDraft}
                        disabled={generating}
                        className="text-xs text-brand-700 hover:text-brand-900 font-bold underline disabled:opacity-40 cursor-pointer transition-colors"
                      >
                        {generating ? "Generating…" : "↺ Regenerate"}
                      </button>
                    </div>

                    {generating ? (
                      <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
                        <span className="animate-spin text-lg">⟳</span> Generating follow-up…
                      </div>
                    ) : genError ? (
                      <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3">
                        {genError}
                        <button onClick={generateDraft} className="ml-2 underline font-semibold cursor-pointer">Retry</button>
                      </div>
                    ) : (
                      <textarea
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        onBlur={handleBodyBlur}
                        rows={10}
                        className="w-full border border-gray-200 rounded-xl p-3.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900 resize-y font-mono leading-relaxed"
                        placeholder="Your follow-up email draft will appear here…"
                      />
                    )}

                    {/* Sending to — editable */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-gray-700 whitespace-nowrap">To:</span>
                      {testMode ? (
                        <span className="font-mono bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg text-gray-500">
                          {userEmail} (test mode)
                        </span>
                      ) : (
                        <input
                          type="email"
                          value={toEmail}
                          onChange={(e) => setToEmail(e.target.value)}
                          onBlur={async () => {
                            if (toEmail && toEmail !== app.recruiterEmail) {
                              await fetch("/api/applications", {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: app.id, recruiterEmail: toEmail }),
                              });
                            }
                          }}
                          placeholder="recruiter@company.com"
                          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1 text-xs font-mono text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
                        />
                      )}
                    </div>

                    {/* Attachments */}
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Attachments</span>
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={attachCV}
                          onChange={(e) => setAttachCV(e.target.checked)}
                          className="w-4 h-4 accent-brand-900 rounded"
                        />
                        CV (auto-fetched from your profile)
                      </label>
                      <label className={`flex items-center gap-2 text-sm cursor-pointer select-none ${app.letterBase64 ? "text-gray-700" : "text-gray-400"}`}>
                        <input
                          type="checkbox"
                          checked={attachLetter}
                          onChange={(e) => setAttachLetter(e.target.checked)}
                          disabled={!app.letterBase64}
                          className="w-4 h-4 accent-brand-900 rounded disabled:opacity-40"
                        />
                        Motivational Letter
                        {!app.letterBase64 && <span className="text-xs text-gray-400">(not available)</span>}
                      </label>
                    </div>

                    {sendError && (
                      <p className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-xl px-3 py-2">{sendError}</p>
                    )}
                  </>
                )}

                {/* ── Letter preview panel ── */}
                {activePanel === "letter" && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Motivational Letter Preview</span>
                      <span className="text-xs text-gray-400">{app.letterPath ?? "—"}</span>
                    </div>
                    {app.letterText ? (
                      <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl p-4 font-sans overflow-y-auto max-h-80">
                        {app.letterText}
                      </pre>
                    ) : (
                      <div className="text-sm text-gray-400 italic py-8 text-center">
                        Letter text not available — only the PDF attachment is stored.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── STEP: Sending ─── */}
          {step === "sending" && (
            <div className="p-6 flex flex-col items-center justify-center py-14 gap-3 text-gray-500">
              <span className="text-3xl animate-spin">⟳</span>
              <p className="text-sm font-medium">Sending follow-up…</p>
            </div>
          )}

          {/* ─── STEP: Sent ─── */}
          {step === "sent" && (
            <div className="p-6 flex flex-col items-center justify-center py-14 gap-4 text-center">
              <span className="text-5xl">✅</span>
              <div>
                <p className="text-base font-bold text-brand-900">Follow-up sent!</p>
                <p className="text-sm text-gray-500 mt-1">Your email has been delivered to {app.recruiterEmail || contactEmail}.</p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 bg-brand-900 hover:bg-brand-700 text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-all active:scale-95 cursor-pointer"
              >
                Done
              </button>
            </div>
          )}
        </div>

        {/* Footer — only on draft/email panel */}
        {step === "draft" && activePanel === "email" && !generating && !genError && emailBody && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 flex-shrink-0">
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium px-4 py-2 rounded-xl hover:bg-gray-50 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={sendFollowUp}
              className="bg-brand-900 hover:bg-brand-700 text-white rounded-xl px-6 py-2.5 text-sm font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-2 shadow-sm"
            >
              📨 Send Follow-up
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
