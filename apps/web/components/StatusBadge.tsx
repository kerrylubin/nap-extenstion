"use client";
import { ApplicationStatus } from "@/types";

const config: Record<ApplicationStatus, { label: string; classes: string }> = {
  pending: { label: "Pending", classes: "bg-gray-100 text-gray-600" },
  sent: { label: "Sent", classes: "bg-blue-100 text-blue-700" },
  no_answer: { label: "No Answer", classes: "bg-yellow-100 text-yellow-700" },
  interview: { label: "Interview", classes: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", classes: "bg-red-100 text-red-700" },
  liked: { label: "Liked", classes: "bg-pink-50 text-pink-700 border border-pink-100" },
  contact: { label: "Contact", classes: "bg-purple-100 text-purple-700" },
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const { label, classes } = config[status] ?? config.pending;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}
