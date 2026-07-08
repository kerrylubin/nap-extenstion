import { useState } from "react";
import { supabase } from "../lib/supabase";

interface Job {
  id: string;
  job_url: string;
  job_title: string;
  company: string;
  status: string;
  email_body?: string;
  recruiter_email?: string;
  match_score?: number;
  letter_base64?: string;
  letter_path?: string;
  letter_text?: string;
  tokens_used?: number;
  cost_usd?: number;
  contact_name?: string;
  recruiter_phone?: string;
  language?: string;
  job_description?: string;
}

interface Props {
  app: Job;
  session: any;
  onClose: () => void;
  onSent: (id: string) => void;
  onLetterUpdated?: (id: string, updates: Partial<Job>) => void;
}

type LetterTab = "preview" | "edit" | "ai";

export default function ReviewModal({
  app,
  session,
  onClose,
  onSent,
  onLetterUpdated,
}: Props) {
  const userName = session?.user?.user_metadata?.full_name || session?.user?.email?.split("@")[0] || "Applicant";
  
  const [emailTo, setEmailTo] = useState(app.recruiter_email ?? "");
  const [emailPhone] = useState(app.recruiter_phone ?? "");
  const [emailBody, setEmailBody] = useState(app.email_body ?? "");
  const [letterBase64, setLetterBase64] = useState(app.letter_base64 ?? "");
  const [letterFilename, setLetterFilename] = useState(
    (app.letter_path ?? `${userName} ${app.company} Motivatiebrief.pdf`).replace(/_/g, " ")
  );

  const [letterTab, setLetterTab] = useState<LetterTab>("preview");
  const [costUsd, setCostUsd] = useState(app.cost_usd ?? 0.0);
  const [letterText, setLetterText] = useState(app.letter_text ?? "");
  const [aiPrompt, setAiPrompt] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const apiUrl = "http://localhost:3000";

  async function handleSend() {
    if (!emailTo.trim()) return setError("Please enter an email address.");
    const isFollowUp = app.status === 'sent' || app.status === 'no_answer';
    if (!letterBase64) return setError("No motivation letter found. Process the job again.");
    setSending(true);
    setError("");
    try {
      const res = await fetch(`${apiUrl}/api/send-email`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}` 
        },
        body: JSON.stringify({
          applicationId: app.id,
          to: emailTo,
          jobTitle: app.job_title,
          company: app.company,
          emailBody,
          letterBase64,
          letterFilename,
          language: app.language,
          recruiterPhone: emailPhone,
          isFollowUp,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send email");
      setSuccess(true);
      onSent(app.id);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSending(false);
    }
  }

  function downloadLetter() {
    if (!letterBase64) return;
    
    try {
      const binaryString = window.atob(letterBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      link.download = letterFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      alert("Download failed: " + e.message);
    }
  }

  async function applyManualEdit() {
    if (!letterText.trim()) return;
    setRegenerating(true);
    setRegenError("");
    try {
      const res = await fetch(`${apiUrl}/api/regenerate-letter`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          applicationId: app.id,
          jobTitle: app.job_title,
          company: app.company,
          contactName: app.contact_name,
          jobDescription: app.job_description,
          language: app.language,
          currentLetter: letterText,
          prompt: "Reformat this letter into a clean professional motivation letter. Keep all the content exactly as written.",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const cleanFilename = data.letterFilename.replace(/_/g, " ");
      setLetterBase64(data.letterBase64);
      setLetterFilename(cleanFilename);
      setCostUsd(data.costUsd ?? 0.0);
      onLetterUpdated?.(app.id, {
        letter_base64: data.letterBase64,
        letter_path: cleanFilename,
        tokens_used: data.tokensUsed,
        cost_usd: data.costUsd,
        letter_text: letterText,
      });
      setLetterTab("preview");
    } catch (e: any) {
      setRegenError(e.message || String(e));
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
      const { error } = await supabase.from('applications').update({
        letter_text: letterText
      }).eq('id', app.id);
      
      if (error) throw new Error(error.message);
      
      onLetterUpdated?.(app.id, { letter_text: letterText });
      setLetterTab("preview");
    } catch (e: any) {
      setRegenError(e.message || String(e));
    } finally {
      setSavingText(false);
    }
  }

  async function applyAiPrompt() {
    if (!aiPrompt.trim()) return;
    setRegenerating(true);
    setRegenError("");
    try {
      const res = await fetch(`${apiUrl}/api/regenerate-letter`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          applicationId: app.id,
          jobTitle: app.job_title,
          company: app.company,
          contactName: app.contact_name,
          jobDescription: app.job_description,
          language: app.language,
          currentLetter: letterText || undefined,
          prompt: aiPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const cleanFilename = data.letterFilename.replace(/_/g, " ");
      setLetterBase64(data.letterBase64);
      setLetterFilename(cleanFilename);
      setLetterText(data.letterText ?? "");
      setCostUsd(data.costUsd ?? 0.0);
      onLetterUpdated?.(app.id, {
        letter_base64: data.letterBase64,
        letter_path: cleanFilename,
        tokens_used: data.tokensUsed,
        cost_usd: data.costUsd,
        letter_text: data.letterText ?? "",
      });
      setAiPrompt("");
      setLetterTab("preview");
    } catch (e: any) {
      setRegenError(e.message || String(e));
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4 overflow-hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[360px] h-[90vh] flex flex-col relative my-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-gray-100 flex-shrink-0">
          <div className="pr-4">
            <h2 className="text-sm font-bold text-gray-900 line-clamp-1">{app.job_title}</h2>
            <p className="text-xs text-gray-600 font-medium line-clamp-1">{app.company}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800 text-xl leading-none">&times;</button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-4 space-y-4 scrollbar-thin">
          
          {/* Match Score */}
          {app.match_score !== undefined && (
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div className="text-xl font-bold text-gray-900">{app.match_score}%</div>
              <div className="flex-1">
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Match Score</div>
                <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                  <div
                    className={`h-1 rounded-full ${app.match_score >= 70 ? "bg-green-500" : app.match_score >= 40 ? "bg-yellow-400" : "bg-red-400"}`}
                    style={{ width: `${app.match_score}%` }}
                  />
                </div>
              </div>
              {costUsd > 0 && (
                <div className="text-right">
                   <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">AI Cost</div>
                   <div className="text-xs font-semibold text-purple-600">${costUsd.toFixed(4)}</div>
                </div>
              )}
            </div>
          )}

          {/* Email Info */}
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">To (Email)</label>
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="recruiter@company.com"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Email Message</label>
              <textarea
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={5}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Motivation Letter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Motivation Letter</label>
            </div>
            
            <div className="flex bg-gray-100 rounded-lg p-1 mb-2">
              {(["preview", "edit", "ai"] as LetterTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setLetterTab(t)}
                  className={`flex-1 py-1.5 text-[10px] rounded-md font-medium transition-colors ${letterTab === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {t === "preview" ? "Preview" : t === "edit" ? "Manual Edit" : "AI Edit"}
                </button>
              ))}
            </div>

            {letterTab === "preview" && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={downloadLetter}
                  disabled={!letterBase64}
                  className="w-full justify-center flex items-center gap-1.5 bg-gray-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 disabled:opacity-40 font-semibold"
                >
                  📄 {letterFilename || "Letter.pdf"}
                </button>
                {letterText && (
                  <button
                    onClick={applyManualEdit}
                    disabled={regenerating}
                    className="w-full justify-center flex items-center gap-1.5 bg-brand-900 hover:bg-brand-700 text-white rounded-lg px-3 py-2 text-xs disabled:opacity-40 transition-colors"
                  >
                    {regenerating ? "Generating PDF..." : "✨ Update PDF from Text"}
                  </button>
                )}
              </div>
            )}

            {letterTab === "edit" && (
              <div>
                <textarea
                  value={letterText}
                  onChange={(e) => setLetterText(e.target.value)}
                  rows={8}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[11px] text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                />
                {regenError && <p className="text-xs text-red-500 mt-1">{regenError}</p>}
                <button
                  onClick={saveTextOnly}
                  disabled={savingText || !letterText.trim()}
                  className="mt-2 w-full justify-center py-2 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {savingText ? "Saving..." : "Save Draft"}
                </button>
              </div>
            )}

            {letterTab === "ai" && (
              <div>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={3}
                  placeholder='e.g. "Make it shorter" or "Sound more excited"'
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {regenError && <p className="text-xs text-red-500 mt-1">{regenError}</p>}
                <button
                  onClick={applyAiPrompt}
                  disabled={regenerating || !aiPrompt.trim()}
                  className="mt-2 w-full justify-center py-2 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  {regenerating ? "Rewriting..." : "✨ Rewrite with AI"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          {error && (
            <div className="flex items-center justify-between bg-red-50 rounded px-2 py-1.5 mb-2 border border-red-100">
              <p className="text-[10px] text-red-600 font-medium">{error}</p>
              {error.toLowerCase().includes("gmail") && (
                <a
                  href="http://localhost:3000/api/auth/connect"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700 font-bold ml-2 flex-shrink-0 transition-colors uppercase tracking-wide"
                >
                  Connect
                </a>
              )}
            </div>
          )}
          {success && <p className="text-[10px] text-green-600 bg-green-50 rounded px-2 py-1.5 mb-2 font-medium">Sent via Gmail! ✓</p>}
          <div className="flex gap-2">
             <button onClick={onClose} className="flex-1 py-2 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
               Close
             </button>
             <button
               onClick={handleSend}
               disabled={sending || success}
               className="flex-1 py-2 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
             >
               {sending ? "Sending..." : success ? "Sent ✓" : "Send Email"}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
