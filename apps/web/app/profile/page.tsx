"use client";
import { useState, useEffect, useRef } from "react";
import { CV, Profile } from "@/types";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

const LANGUAGES = [
  { code: "nl", label: "Dutch (NL)" },
  { code: "en", label: "English (EN)" },
  { code: "fr", label: "French (FR)" },
  { code: "de", label: "German (DE)" },
  { code: "es", label: "Spanish (ES)" },
];

import { getDefaultEmailTemplate, getDefaultLetterTemplate } from "@/lib/defaults";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cvs, setCvs] = useState<CV[]>([]);
  const [loading, setLoading] = useState(true);

  // Personal details state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [hobbies, setHobbies] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);

  // Email template state
  const [template, setTemplate] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  // Letter template state
  const [letterTemplate, setLetterTemplate] = useState("");
  const [savingLetterTemplate, setSavingLetterTemplate] = useState(false);
  const [letterTemplateSaved, setLetterTemplateSaved] = useState(false);

  // CV upload state
  const [uploadLang, setUploadLang] = useState("nl");
  const [uploadPrimary, setUploadPrimary] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  async function loadData() {
    const res = await fetch("/api/upload-cv");
    const data = await res.json();
    setProfile(data.profile);
    setCvs(data.cvs ?? []);
    setName(data.profile?.name ?? "");
    setPhone(data.profile?.phone ?? "");
    setAddress(data.profile?.address ?? "");
    
    // Sync with localStorage
    if (data.profile?.hobbies) {
      setHobbies(data.profile.hobbies);
      localStorage.setItem("napai_hobbies", data.profile.hobbies);
    } else {
      const localH = localStorage.getItem("napai_hobbies");
      setHobbies(localH ?? "");
    }

    setTemplate(data.profile?.masterEmailTemplate ?? getDefaultEmailTemplate(data.profile));
    setLetterTemplate(data.profile?.masterLetterTemplate ?? getDefaultLetterTemplate(data.profile));
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  async function saveDetails() {
    setSavingDetails(true);
    try {
      localStorage.setItem("napai_hobbies", hobbies);
      const res = await fetch("/api/upload-cv", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, address, hobbies }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update profile record");
      }
      setDetailsSaved(true);
      setTimeout(() => setDetailsSaved(false), 2000);
    } catch (err) {
      alert("Error saving profile details: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingDetails(false);
    }
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    await fetch("/api/upload-cv", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterEmailTemplate: template }),
    });
    setSavingTemplate(false);
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 2000);
  }

  async function saveLetterTemplate() {
    setSavingLetterTemplate(true);
    await fetch("/api/upload-cv", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ masterLetterTemplate: letterTemplate }),
    });
    setSavingLetterTemplate(false);
    setLetterTemplateSaved(true);
    setTimeout(() => setLetterTemplateSaved(false), 2000);
  }

  async function uploadCV(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("language", uploadLang);
    fd.append("isPrimary", String(uploadPrimary));
    const res = await fetch("/api/upload-cv", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) { setUploadError(typeof data.error === "string" ? data.error : "Upload failed"); }
    else { setCvs((prev) => [...prev, data]); if (fileRef.current) fileRef.current.value = ""; }
    setUploading(false);
  }

  async function setPrimary(cvId: string) {
    await fetch("/api/upload-cv", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setPrimaryId: cvId }),
    });
    setCvs((prev) => prev.map((c) => ({ ...c, isPrimary: c.id === cvId })));
  }

  async function deleteCV(cvId: string) {
    if (!confirm("Delete this CV?")) return;
    await fetch("/api/upload-cv", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cvId }),
    });
    setCvs((prev) => prev.filter((c) => c.id !== cvId));
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-brand-900 to-[#0e304f] text-white border-b border-brand-700/30 sticky top-0 z-40 shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-brand-300 hover:text-white transition-colors">
              ← Dashboard
            </Link>
            <span className="text-brand-700">|</span>
            <span className="text-sm font-bold text-white">Profile & Settings</span>
          </div>
          <button onClick={signOut} className="text-xs text-brand-300 hover:text-red-400 cursor-pointer transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">

        {/* Profile info */}
        <section className="bg-white rounded-3xl border border-brand-900/10 shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-brand-900" />
          <h2 className="text-sm font-extrabold text-brand-900 mb-4 uppercase tracking-wider">Profile</h2>
          <div className="flex items-center gap-4 mb-5">
            {profile?.avatarUrl ? (
              <img src={profile.avatarUrl} alt={name} className="w-14 h-14 rounded-full border border-gray-200" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center text-lg text-gray-500 font-bold">
                {name?.[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div>
              <div className="font-medium text-gray-900">{name || "—"}</div>
              <div className="text-sm text-gray-400">{profile?.email}</div>
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Full name</label>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
                  placeholder="Jane Doe" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
                  placeholder="+31 6 12345678" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Address</label>
              <input value={address} onChange={(e) => setAddress(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
                placeholder="Street 12 | 1234AB City" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hobbies & Interests</label>
              <textarea value={hobbies} onChange={(e) => setHobbies(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-brand-900 h-20 resize-none placeholder:text-gray-400"
                placeholder="e.g. playing chess, hiking in nature, baking sourdough bread..." />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={saveDetails} disabled={savingDetails}
              className="px-4 py-2 bg-brand-900 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50 cursor-pointer transition-colors">
              {savingDetails ? "Saving..." : "Save details"}
            </button>
            {detailsSaved && <span className="text-xs text-green-600">Saved</span>}
          </div>
        </section>

        {/* Document Vault */}
        <section className="bg-white rounded-3xl border border-brand-900/10 shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-brand-500" />
          <h2 className="text-sm font-extrabold text-brand-900 mb-1 uppercase tracking-wider">Document Vault</h2>
          <p className="text-xs text-gray-400 mb-4">
            Upload one CV per language. When processing a job, the matching language CV is used automatically.
            English jobs use the EN CV. No match → primary CV is used and its content is translated for AI prompts.
          </p>

          {/* Existing CVs */}
          {cvs.length > 0 && (
            <div className="mb-4 space-y-2">
              {cvs.map((cv) => (
                <div key={cv.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono px-2 py-0.5 bg-gray-100 rounded text-gray-600 uppercase">
                      {cv.language}
                    </span>
                    <span className="text-sm text-gray-700">{cv.filename}</span>
                    {cv.isPrimary
                      ? <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">Primary</span>
                      : <button
                          onClick={() => setPrimary(cv.id)}
                          className="text-xs text-gray-400 hover:text-blue-600 underline"
                        >Set as primary</button>
                    }
                  </div>
                  <button
                    onClick={() => deleteCV(cv.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload form */}
          <form onSubmit={uploadCV} className="flex flex-wrap items-end gap-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Language</label>
              <select
                value={uploadLang}
                onChange={(e) => setUploadLang(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">PDF file</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,application/pdf"
                required
                className="text-sm text-gray-600 file:mr-3 file:text-xs file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={uploadPrimary}
                onChange={(e) => setUploadPrimary(e.target.checked)}
                className="rounded border-gray-300"
              />
              Set as primary
            </label>
            <button
              type="submit"
              disabled={uploading}
              className="px-4 py-2 bg-brand-900 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {uploading ? "Uploading..." : "Upload CV"}
            </button>
            {uploadError && <p className="w-full text-xs text-red-500">{uploadError}</p>}
          </form>
        </section>

        {/* Master Email Template */}
        <section className="bg-white rounded-3xl border border-brand-900/10 shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-brand-700" />
          <h2 className="text-sm font-extrabold text-brand-900 mb-1 uppercase tracking-wider">Master Email Template</h2>
          <p className="text-xs text-gray-400 mb-3">
            The AI uses this as the base style for every application email.
            It personalises the content per job, but maintains this structure and tone.
          </p>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={14}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={saveTemplate}
              disabled={savingTemplate}
              className="px-4 py-2 bg-brand-900 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {savingTemplate ? "Saving..." : "Save template"}
            </button>
            {templateSaved && <span className="text-xs text-green-600">Saved</span>}
          </div>
        </section>

        {/* Master Motivation Letter Template */}
        <section className="bg-white rounded-3xl border border-brand-900/10 shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-brand-300" />
          <h2 className="text-sm font-extrabold text-brand-900 mb-1 uppercase tracking-wider">Master Motivation Letter Template</h2>
          <p className="text-xs text-gray-400 mb-3">
            The AI uses this as a style and structure reference when generating motivation letters.
            Content is personalised per job, but tone, flow, and format follow this template.
          </p>
          <textarea
            value={letterTemplate}
            onChange={(e) => setLetterTemplate(e.target.value)}
            rows={18}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={saveLetterTemplate}
              disabled={savingLetterTemplate}
              className="px-4 py-2 bg-brand-900 text-white text-sm rounded-lg hover:bg-brand-700 disabled:opacity-50 cursor-pointer transition-colors"
            >
              {savingLetterTemplate ? "Saving..." : "Save template"}
            </button>
            {letterTemplateSaved && <span className="text-xs text-green-600">Saved</span>}
          </div>
        </section>

      </main>
    </div>
  );
}
