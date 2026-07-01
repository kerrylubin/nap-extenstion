"use client";
import { useState } from "react";
import { ProcessJobResult } from "@/types";

interface Props {
  onClose: () => void;
  onResult: (result: ProcessJobResult) => void;
  onAddLinks: (urls: string[]) => void;
}

export function ProcessJobModal({ onClose, onResult, onAddLinks }: Props) {
  const [tab, setTab] = useState<"url" | "paste">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");
    if (tab === "url") {
      const urls = url
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
          if (!/^https?:\/\//i.test(line)) {
            return `https://${line}`;
          }
          return line;
        })
        .filter((line) => {
          try {
            new URL(line);
            return true;
          } catch {
            return false;
          }
        });

      if (urls.length === 0) {
        return setError("Please enter at least one valid URL (starting with http:// or https://).");
      }
      onAddLinks(urls);
      return;
    }

    if (tab === "paste" && !text.trim()) return setError("Please paste the job text.");

    setLoading(true);
    try {
      const res = await fetch("/api/process-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawJobText: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      onResult(data as ProcessJobResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">Process Job Posting</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-5">
          <button
            onClick={() => setTab("url")}
            className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${
              tab === "url" ? "bg-white shadow text-gray-900" : "text-gray-500"
            }`}
          >
            Paste URL
          </button>
          <button
            onClick={() => setTab("paste")}
            className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${
              tab === "paste" ? "bg-white shadow text-gray-900" : "text-gray-500"
            }`}
          >
            Paste Text
          </button>
        </div>

        {tab === "url" ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Job URLs (one per line)
            </label>
            <textarea
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              rows={6}
              placeholder="https://www.indeed.com/viewjob?jk=...\nhttps://www.linkedin.com/jobs/view/..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
            />
            <p className="mt-1.5 text-xs text-gray-700 font-medium leading-relaxed">
              Note: Links will be saved instantly as <strong className="text-gray-900 font-bold">Liked</strong>. You can run the AI generator for them later from the dashboard.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Paste the full job description
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="Copy the full job posting here, including company name, job title, and contact details..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-900 placeholder:text-gray-400"
            />
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm bg-brand-900 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Processing... (~15s)
              </>
            ) : (
              tab === "url" ? "Add to Liked (Instant)" : "Process with AI"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
