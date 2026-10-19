"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export function RecoveryCodeList({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
  }

  return (
    <div>
      <ul aria-label="Recovery codes" className="grid grid-cols-2 gap-2 rounded-md border border-line bg-surface p-3 font-mono text-sm text-ink">
        {codes.map((code) => (
          <li key={code} className="select-all text-center tracking-wider">
            {code}
          </li>
        ))}
      </ul>
      <button
        className="mt-2 inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink shadow-panel transition hover:border-muted"
        onClick={copy}
        type="button"
      >
        {copied ? <Check aria-hidden="true" className="h-4 w-4" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
        {copied ? "Copied" : "Copy codes"}
      </button>
    </div>
  );
}
