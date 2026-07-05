"use client";
import { Fragment, useState, useRef, useEffect } from "react";
import { JobApplication, ApplicationStatus } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { Sparkles, Trash2, Eye, Search, CheckCircle2, Loader2, Send } from "lucide-react";

const STATUS_OPTIONS: { value: ApplicationStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "no_answer", label: "No Answer" },
  { value: "interview", label: "Interview" },
  { value: "rejected", label: "Rejected" },
  { value: "liked", label: "Liked" },
  { value: "contact", label: "Contact" },
];

const STATUS_FILTERS: { value: ApplicationStatus | "all" | "liked_with_contact"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "liked", label: "Liked ❤️" },
  { value: "liked_with_contact", label: "Liked w/ Email ✉️" },
  { value: "pending", label: "Pending" },
  { value: "sent", label: "Sent" },
  { value: "interview", label: "Interview" },
  { value: "no_answer", label: "No Answer" },
  { value: "rejected", label: "Rejected" },
  { value: "contact", label: "Contact" },
];

type SortKey = "none" | "matchScore" | "updatedAt";

interface BulkError {
  jobTitle: string;
  company: string;
  error: string;
}

interface BulkProgress {
  action: "reapply" | "send";
  done: number;
  total: number;
  errors: number;
  failedItems?: BulkError[];
  isCompleted?: boolean;
}

interface Props {
  applications: JobApplication[];
  onStatusChange: (id: string, status: ApplicationStatus) => void;
  onDelete: (id: string) => void;
  onReview: (app: JobApplication) => void;
  onReapply: (app: JobApplication) => void;
  onFieldUpdate: (id: string, fields: Partial<JobApplication>) => void;
  reapplyingId: string | null;
  onBulkStatusChange: (ids: string[], status: ApplicationStatus) => void;
  onBulkReapply: (ids: string[]) => void;
  onBulkSend: (ids: string[]) => void;
  onBulkReview: (ids: string[]) => void;
  onBulkDelete: (ids: string[]) => void;
  bulkProgress: BulkProgress | null;
  onDismissBulkProgress: () => void;
  testMode: boolean;
}

function fmtDate(iso?: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toInputDate(iso?: string) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function SortIndicator({ k, sortKey, sortAsc }: { k: SortKey; sortKey: SortKey; sortAsc: boolean }) {
  if (sortKey !== k) return <span className="text-gray-300 ml-1">↕</span>;
  return <span className="text-gray-700 ml-1">{sortAsc ? "↑" : "↓"}</span>;
}

function Spinner({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function isOverdue(app: JobApplication): boolean {
  if (!app.followUpDate) return false;
  if (["interview", "rejected", "contact"].includes(app.status)) return false;
  return new Date(app.followUpDate) < new Date();
}

// Inline editable email cell
function InlineEmail({ app, onSave }: { app: JobApplication; onSave: (email: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(app.recruiterEmail ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    setEditing(false);
    if (value !== (app.recruiterEmail ?? "")) onSave(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(app.recruiterEmail ?? ""); setEditing(false); } }}
        autoFocus
        className="text-xs border border-blue-300 rounded px-1.5 py-0.5 text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 w-44"
      />
    );
  }

  return (
    <button
      onClick={() => { setEditing(true); }}
      className="text-xs text-left group flex items-center gap-1"
      title="Click to edit email"
    >
      {app.recruiterEmail ? (
        <span className="text-blue-600 group-hover:underline font-medium">{app.recruiterEmail}</span>
      ) : (
        <span className="text-amber-600 group-hover:text-amber-800">No email — click to add</span>
      )}
      <span className="text-gray-300 group-hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✎</span>
    </button>
  );
}

// Inline editable phone cell
function InlinePhone({ app, onSave }: { app: JobApplication; onSave: (phone: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(app.recruiterPhone ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    setEditing(false);
    if (value !== (app.recruiterPhone ?? "")) onSave(value);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(app.recruiterPhone ?? ""); setEditing(false); } }}
        autoFocus
        className="text-xs border border-blue-300 rounded px-1.5 py-0.5 text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 w-44"
      />
    );
  }

  return (
    <button
      onClick={() => { setEditing(true); }}
      className="text-xs text-left group flex items-center gap-1"
      title="Click to edit phone"
    >
      {app.recruiterPhone ? (
        <span className="text-gray-700 group-hover:underline flex items-center gap-0.5">📞 {app.recruiterPhone}</span>
      ) : (
        <span className="text-amber-600 group-hover:text-amber-800 flex items-center gap-0.5">📞 click to add phone</span>
      )}
      <span className="text-gray-300 group-hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✎</span>
    </button>
  );
}

// Custom Dropdown for Status Badge (combats transparent/double native options rendering)
function StatusDropdown({ app, onChange }: { app: JobApplication; onChange: (status: ApplicationStatus) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        className="focus:outline-none hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center"
        title="Click to change status"
      >
        <StatusBadge status={app.status} />
        <span className="text-[10px] text-gray-400 ml-1.5 select-none">▼</span>
      </button>

      {open && (
        <div className="absolute left-0 mt-1 w-32 bg-white rounded-lg shadow-lg border border-gray-150 py-1 z-30 animate-fadeIn">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                app.status === o.value ? "font-bold text-gray-900 bg-gray-50" : "text-gray-700"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Expandable detail row for notes + dates
function DetailRow({ app, onSave }: { app: JobApplication; onSave: (fields: Partial<JobApplication>) => void }) {
  const [notes, setNotes] = useState(app.notes ?? "");
  const [followUpDate, setFollowUpDate] = useState(toInputDate(app.followUpDate));
  const [interviewDate, setInterviewDate] = useState(toInputDate(app.interviewDate));

  return (
    <tr className="bg-gray-50 border-b border-gray-100">
      <td colSpan={8} className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Notes */}
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => { if (notes !== (app.notes ?? "")) onSave({ notes }); }}
              rows={3}
              placeholder="e.g. Called recruiter, had phone screen, follow up next week..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>

          {/* Dates */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Follow-up date</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setFollowUpDate(val);
                  const iso = val ? new Date(val).toISOString() : null;
                  onSave({ followUpDate: iso ?? undefined });
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Interview date</label>
              <input
                type="date"
                value={interviewDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setInterviewDate(val);
                  const iso = val ? new Date(val).toISOString() : null;
                  onSave({ interviewDate: iso ?? undefined });
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            {app.tokensUsed !== undefined && app.tokensUsed > 0 && (
              <div className="pt-2 border-t border-gray-150">
                <span className="block text-xs font-semibold text-gray-700 mb-0.5">AI Token Usage</span>
                <span className="text-xs text-gray-900 font-mono">
                  {app.tokensUsed.toLocaleString()} tokens (${app.costUsd?.toFixed(4)})
                </span>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

export function ApplicationTable({
  applications,
  onStatusChange,
  onDelete,
  onReview,
  onReapply,
  onFieldUpdate,
  reapplyingId,
  onBulkStatusChange,
  onBulkReapply,
  onBulkSend,
  onBulkReview,
  onBulkDelete,
  bulkProgress,
  onDismissBulkProgress,
  testMode,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ApplicationStatus>("sent");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | "all" | "liked_with_contact">("all");
  const [sortKey, setSortKey] = useState<SortKey>("none");
  const [sortAsc, setSortAsc] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState<Record<string, boolean | "checking">>({});
  
  const checkOnline = async (id: string, url: string) => {
    setOnlineStatus(prev => ({ ...prev, [id]: "checking" }));
    try {
      const res = await fetch("/api/check-online", {
        method: "POST",
        body: JSON.stringify({ url })
      });
      const data = await res.json();
      setOnlineStatus(prev => ({ ...prev, [id]: data.isOnline }));
    } catch {
      setOnlineStatus(prev => ({ ...prev, [id]: true }));
    }
  };

  const checkOnlineBulk = async (ids: string[]) => {
    const targets = sorted.filter(a => ids.includes(a.id) && a.jobUrl);
    for (const app of targets) {
      await checkOnline(app.id, app.jobUrl!);
    }
  };

  // Filter
  const filtered = statusFilter === "all"
    ? applications
    : statusFilter === "liked_with_contact"
    ? applications.filter((a) => a.status === "liked" && a.recruiterEmail)
    : applications.filter((a) => a.status === statusFilter);

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "matchScore") {
      const diff = (b.matchScore ?? 0) - (a.matchScore ?? 0);
      return sortAsc ? -diff : diff;
    }
    if (sortKey === "updatedAt") {
      const aDate = a.updatedAt || a.createdAt || "";
      const bDate = b.updatedAt || b.createdAt || "";
      const diff = bDate.localeCompare(aDate);
      return sortAsc ? -diff : diff;
    }
    return 0;
  });

  const allSelected = sorted.length > 0 && selectedIds.size === sorted.length;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(sorted.map((a) => a.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function applyBulk() {
    onBulkStatusChange(Array.from(selectedIds), bulkStatus);
    setSelectedIds(new Set());
  }

  function cycleSort(key: SortKey) {
    if (sortKey !== key) { setSortKey(key); setSortAsc(false); }
    else if (!sortAsc) setSortAsc(true);
    else { setSortKey("none"); setSortAsc(false); }
  }



  if (applications.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-4xl mb-3">📭</p>
        <p className="text-sm">No applications yet. Add one to get started!</p>
      </div>
    );
  }

  const overdueCount = applications.filter(isOverdue).length;

  return (
    <div className="space-y-2">
      {/* Filter + sort bar */}
      <div className="flex flex-wrap items-center gap-2 mb-1">
        {/* Status pills */}
        <div className="flex flex-wrap gap-1">
          {STATUS_FILTERS.map((f) => {
            const count = f.value === "all"
              ? applications.length
              : f.value === "liked_with_contact"
              ? applications.filter((a) => a.status === "liked" && a.recruiterEmail).length
              : applications.filter((a) => a.status === f.value).length;
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                  statusFilter === f.value
                    ? "bg-brand-900 text-white border-brand-900 font-bold"
                    : "bg-white text-brand-900 hover:text-brand-700 border-brand-700/30 hover:border-brand-700 hover:bg-brand-900/5 font-extrabold"
                }`}
              >
                {f.label} {count > 0 && <span className="opacity-60">({count})</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Overdue warning */}
        {overdueCount > 0 && (
          <button
            onClick={() => setStatusFilter("sent")}
            className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
          >
            {overdueCount} overdue
          </button>
        )}
      </div>

      {bulkProgress && (
        <div className="bg-brand-900 text-white rounded-2xl p-4 shadow-lg mb-6 border border-brand-700/20 flex flex-col gap-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            {!bulkProgress.isCompleted ? (
              <Spinner className="h-4 w-4 text-white" />
            ) : bulkProgress.errors > 0 ? (
              <span className="text-xl">⚠️</span>
            ) : (
              <span className="text-xl">✓</span>
            )}
            <div className="flex-1">
              <div className="flex justify-between text-xs font-bold text-gray-200 mb-1">
                <span>
                  {bulkProgress.isCompleted ? "Batch Process Completed" : `${bulkProgress.action === "reapply" ? "Applying" : "Sending"}...`}
                </span>
                <span>{Math.round((bulkProgress.done / bulkProgress.total) * 100)}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${bulkProgress.errors > 0 ? "bg-amber-400" : "bg-green-400"}`}
                  style={{ width: `${(bulkProgress.done / bulkProgress.total) * 100}%` }}
                />
              </div>
            </div>
            {bulkProgress.isCompleted && (
              <button
                onClick={onDismissBulkProgress}
                className="text-xs bg-white text-gray-900 hover:bg-gray-150 px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-all active:scale-95 whitespace-nowrap"
              >
                Close
              </button>
            )}
          </div>

          <div className="text-xs text-gray-300 font-medium">
            Processed <span className="text-white font-semibold">{bulkProgress.done}</span> of <span className="text-white font-semibold">{bulkProgress.total}</span> items. 
            {bulkProgress.errors > 0 ? (
              <span className="text-red-400 ml-1.5 font-semibold">({bulkProgress.errors} failed)</span>
            ) : (
              <span className="text-green-400 ml-1.5 font-semibold">(All succeeded!)</span>
            )}
          </div>

          {bulkProgress.isCompleted && bulkProgress.failedItems && bulkProgress.failedItems.length > 0 && (
            <div className="bg-brand-900/40 border border-brand-700/20 rounded-xl p-3 max-h-48 overflow-y-auto mt-1">
              <div className="text-[10px] font-bold text-red-300 uppercase tracking-wider mb-2">Failure Report</div>
              <div className="space-y-3">
                {bulkProgress.failedItems.map((item, idx) => (
                  <div key={idx} className="text-xs border-b border-gray-800 pb-2 last:border-0 last:pb-0">
                    <div className="font-semibold text-gray-100">
                      {item.jobTitle} <span className="text-gray-300 font-normal">at {item.company}</span>
                    </div>
                    <div className="text-red-300 font-medium font-mono mt-1 bg-red-950/20 border border-red-900/20 rounded p-1.5 max-w-full overflow-x-auto whitespace-pre-wrap">
                      {item.error}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && !bulkProgress && (
        <div className="flex items-center gap-2 bg-brand-900 text-white text-sm rounded-xl px-4 py-2.5 flex-wrap">
          <span className="text-gray-300 text-xs flex-shrink-0">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button
            onClick={() => { onBulkReview(Array.from(selectedIds)); setSelectedIds(new Set()); }}
            className="text-xs px-2 py-1.5 bg-brand-700 border border-brand-500/30 text-white rounded-lg hover:bg-brand-500 flex items-center justify-center cursor-pointer transition-colors"
            title="Review Selected"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={() => { checkOnlineBulk(Array.from(selectedIds)); }}
            className="text-xs px-2 py-1.5 bg-brand-700 border border-brand-500/30 text-white rounded-lg hover:bg-brand-500 flex items-center justify-center cursor-pointer transition-colors"
            title="Verify Online Status"
          >
            <Search size={16} />
          </button>
          <button
            onClick={() => { onBulkReapply(Array.from(selectedIds)); setSelectedIds(new Set()); }}
            className="text-xs px-2 py-1.5 bg-brand-700 hover:bg-brand-500 text-white rounded-lg border border-transparent flex items-center justify-center cursor-pointer transition-colors"
            title="Prepare Selected"
          >
            <Sparkles size={16} />
          </button>
          <button
            onClick={() => { onBulkDelete(Array.from(selectedIds)); setSelectedIds(new Set()); }}
            className="text-xs px-2 py-1.5 bg-red-600 border border-red-500/30 text-white rounded-lg hover:bg-red-500 flex items-center justify-center cursor-pointer transition-colors"
            title="Delete Selected"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => { onBulkSend(Array.from(selectedIds)); setSelectedIds(new Set()); }}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap cursor-pointer transition-all active:scale-95 ${
              testMode ? "bg-amber-400 text-amber-950 hover:bg-amber-300" : "bg-white text-brand-900 hover:bg-gray-100"
            }`}
          >
            {testMode ? "Send selected (test)" : "Send selected via Gmail"}
          </button>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as ApplicationStatus)}
            className="text-xs bg-brand-700 border border-brand-500/40 rounded-lg px-2 py-1 text-white focus:outline-none"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={applyBulk} className="text-xs px-3 py-1.5 bg-brand-500 hover:bg-brand-300 hover:text-brand-900 font-semibold text-white rounded-lg whitespace-nowrap cursor-pointer transition-colors">
            Set status
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-white flex-shrink-0">
            Clear
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          No applications match this filter.
        </div>
      ) : (
        <div className="overflow-auto max-h-[600px] rounded-2xl border border-brand-900/10 shadow-sm relative">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-[#f0f4f8] text-brand-900 text-xs uppercase tracking-wider font-extrabold sticky top-0 z-10 shadow-[0_1px_0_0_rgba(15,58,95,0.15)]">
              <tr>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="rounded border-gray-300 text-gray-900 focus:ring-0 cursor-pointer" />
                </th>
                <th className="px-4 py-3 text-left">Role / Company</th>
                <th className="px-4 py-3 text-left cursor-pointer select-none hover:text-brand-700"
                  onClick={() => cycleSort("matchScore")}>
                  Match <SortIndicator k="matchScore" sortKey={sortKey} sortAsc={sortAsc} />
                </th>
                <th className="px-4 py-3 text-left cursor-pointer select-none hover:text-brand-700"
                  onClick={() => cycleSort("updatedAt")}>
                  Last Updated <SortIndicator k="updatedAt" sortKey={sortKey} sortAsc={sortAsc} />
                </th>
                <th className="px-4 py-3 text-left">Follow-up</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sorted.map((app) => {
                const overdue = isOverdue(app);
                const expanded = expandedId === app.id;
                return (
                  <Fragment key={app.id}>
                    <tr
                      className={`transition-colors ${
                        selectedIds.has(app.id) ? "bg-blue-50" :
                        overdue ? "bg-red-50 hover:bg-red-100" :
                        "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.has(app.id)} onChange={() => toggleOne(app.id)}
                          className="rounded border-gray-300 text-gray-900 focus:ring-0 cursor-pointer" />
                      </td>

                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => onReview(app)}
                            className="font-medium text-gray-900 hover:text-blue-600 hover:underline text-left cursor-pointer transition-colors"
                            title="Click to review application"
                          >
                            {app.jobTitle}
                          </button>
                          {overdue && (
                            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-600 rounded-full font-medium">
                              Overdue
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-900 font-semibold mt-0.5 flex items-center gap-1.5">
                          <span>{app.company}</span>
                          {app.jobUrl && (
                            <div 
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                onlineStatus[app.id] === false ? 'bg-red-500' : 
                                onlineStatus[app.id] === true ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                              title={
                                onlineStatus[app.id] === false ? "Job is Offline" : 
                                onlineStatus[app.id] === true ? "Job is Online" : "Status Unknown"
                              }
                            />
                          )}
                          {app.costUsd !== undefined && app.costUsd > 0 && (
                            <span className="text-[10px] text-purple-600 font-mono font-medium ml-1 bg-purple-50 px-1 py-0.2 rounded border border-purple-100" title={`${app.tokensUsed?.toLocaleString() || 0} tokens`}>
                              ${app.costUsd.toFixed(4)}
                            </span>
                          )}
                        </div>
                        <InlineEmail
                          app={app}
                          onSave={(email) => onFieldUpdate(app.id, { recruiterEmail: email })}
                        />
                        <div className="mt-0.5">
                          <InlinePhone
                            app={app}
                            onSave={(phone) => onFieldUpdate(app.id, { recruiterPhone: phone })}
                          />
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {app.matchScore !== undefined ? (
                          <div className="flex items-center gap-2">
                            <div className="w-14 bg-gray-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${app.matchScore >= 70 ? "bg-green-500" : app.matchScore >= 40 ? "bg-yellow-400" : "bg-red-400"}`}
                                style={{ width: `${app.matchScore}%` }}
                              />
                            </div>
                            <span className="text-xs font-mono font-semibold text-gray-800">{app.matchScore}%</span>
                          </div>
                        ) : <span className="text-gray-400">—</span>}
                      </td>

                      <td className="px-4 py-3 text-xs text-gray-800 font-medium">
                        {fmtDate(app.updatedAt || app.createdAt) || <span className="text-gray-400">—</span>}
                      </td>

                      <td className="px-4 py-3 text-xs">
                        {app.followUpDate ? (
                          <span className={overdue ? "text-red-700 font-bold" : "text-gray-800 font-medium"}>
                            {fmtDate(app.followUpDate)}
                          </span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>

                      <td className="px-4 py-3">
                        <StatusDropdown
                          app={app}
                          onChange={(status) => onStatusChange(app.id, status)}
                        />
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {app.jobUrl && (
                            <button
                              onClick={() => checkOnline(app.id, app.jobUrl!)}
                              className="p-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                              title="Verify Online Status"
                            >
                              {onlineStatus[app.id] === "checking" ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                            </button>
                          )}
                          
                          {app.status === "liked" ? (
                            <button
                              onClick={() => onReapply(app)}
                              disabled={reapplyingId === app.id}
                              className="p-1.5 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 transition-colors disabled:opacity-50"
                              title="Prepare Application"
                            >
                              {reapplyingId === app.id ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            </button>
                          ) : (
                            <>
                              <button 
                                onClick={() => onReview(app)} 
                                className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                                title="Review Details"
                              >
                                <Eye size={16} />
                              </button>
                              <button
                                onClick={() => onReapply(app)}
                                disabled={reapplyingId === app.id}
                                className="p-1.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50"
                                title="Auto-Fill / Apply"
                              >
                                {reapplyingId === app.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => onDelete(app.id)} 
                            className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>

                      {/* Expand chevron */}
                      <td className="px-2 py-3">
                        <button
                          onClick={() => setExpandedId(expanded ? null : app.id)}
                          className="text-gray-300 hover:text-gray-600 transition-colors p-1"
                          title="Notes & dates"
                        >
                          <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </td>
                    </tr>

                     {expanded && (
                      <DetailRow
                        key={app.id + "-" + (app.updatedAt ?? "")}
                        app={app}
                        onSave={(fields) => onFieldUpdate(app.id, fields)}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
