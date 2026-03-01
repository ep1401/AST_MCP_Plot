"use client";

import React, { useMemo, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function HomePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState<string>(
    "MCP Output Plot"
  );
  const [file, setFile] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);

  const canSubmit = useMemo(() => !!file && !isLoading, [file, isLoading]);

  async function handleGenerate() {
    setError(null);
    setIsLoading(true);

    // Cleanup prior preview URL
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setImageBlob(null);

    try {
      if (!API_BASE) {
        throw new Error(
          "Missing NEXT_PUBLIC_API_BASE_URL. Set it in .env.local (local) or Vercel env vars (prod)."
        );
      }
      if (!file) throw new Error("Please select a CSV file.");

      const form = new FormData();
      form.append("title", title);
      form.append("file", file);

      const resp = await fetch(`${API_BASE}/render`, {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        let detail = `Request failed (${resp.status})`;
        const ct = resp.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const j = await resp.json();
          if (j?.detail)
            detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
        } else {
          const txt = await resp.text();
          if (txt) detail = txt.slice(0, 500);
        }
        throw new Error(detail);
      }

      const blob = await resp.blob();
      if (!blob.type.includes("image")) throw new Error("Backend did not return an image.");

      const url = URL.createObjectURL(blob);
      setImageBlob(blob);
      setImageUrl(url);
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleDownload() {
    if (!imageBlob || !imageUrl) return;

    const a = document.createElement("a");
    a.href = imageUrl;

    const safe = (title || "mcp_plot")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    a.download = `${safe || "mcp_plot"}.png`;

    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  function clearFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0b0f19" }}>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "48px 16px 80px" }}>
        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 34, letterSpacing: -0.6, color: "white" }}>
            MCP Plot Generator
          </h1>
          <p style={{ marginTop: 10, marginBottom: 0, color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
            Upload a CSV file and generate a standardized MCP plot.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 16,
          }}
        >
          {/* Control card */}
          <section
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 16,
              padding: 18,
              backdropFilter: "blur(10px)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 14,
              }}
            >
              {/* Title input */}
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                  Plot title
                </label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter plot title"
                  style={{
                    padding: "12px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.16)",
                    outline: "none",
                    background: "rgba(0,0,0,0.25)",
                    color: "white",
                    fontSize: 14,
                  }}
                />
              </div>

              {/* File picker row */}
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
                      CSV file
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
                      Select a MCP CSV to generate the plot.
                    </span>
                  </div>

                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />

                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {file ? (
                      <button
                        type="button"
                        onClick={clearFile}
                        disabled={isLoading}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.18)",
                          background: "transparent",
                          color: "rgba(255,255,255,0.85)",
                          cursor: isLoading ? "not-allowed" : "pointer",
                          fontSize: 13,
                        }}
                      >
                        Clear
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={triggerFilePicker}
                      disabled={isLoading}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.10)",
                        color: "white",
                        cursor: isLoading ? "not-allowed" : "pointer",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      Choose CSV
                    </button>
                  </div>
                </div>

                {/* File “pill” */}
                <div
                  style={{
                    padding: "12px 12px",
                    borderRadius: 12,
                    border: "1px dashed rgba(255,255,255,0.18)",
                    background: "rgba(0,0,0,0.18)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: file ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)",
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={file?.name ?? ""}
                    >
                      {file ? file.name : "No file selected"}
                    </div>
                    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 4 }}>
                      {file ? `${formatBytes(file.size)} • CSV` : "Click “Choose CSV” to select a file."}
                    </div>
                  </div>

                  <span
                    style={{
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: file ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.10)",
                      color: file ? "rgba(34,197,94,0.95)" : "rgba(255,255,255,0.65)",
                      fontSize: 12,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file ? "Ready" : "Waiting"}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canSubmit}
                  style={{
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: canSubmit ? "white" : "rgba(255,255,255,0.35)",
                    color: canSubmit ? "#0b0f19" : "rgba(0,0,0,0.6)",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  {isLoading ? "Generating…" : "Generate plot"}
                </button>

                {imageUrl ? (
                  <button
                    type="button"
                    onClick={handleDownload}
                    style={{
                      padding: "11px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.10)",
                      color: "white",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    Download PNG
                  </button>
                ) : null}

                <div style={{ marginLeft: "auto", color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                  {API_BASE ? `Backend: ${API_BASE}` : "Backend not configured"}
                </div>
              </div>

              {/* Error */}
              {error ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: "rgba(239,68,68,0.12)",
                    border: "1px solid rgba(239,68,68,0.28)",
                    color: "rgba(255,255,255,0.92)",
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ color: "rgba(255,255,255,0.95)" }}>Error:</strong>{" "}
                  <span style={{ color: "rgba(255,255,255,0.88)" }}>{error}</span>
                </div>
              ) : null}
            </div>
          </section>

          {/* Preview card */}
          <section
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 16,
              padding: 18,
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 16, color: "rgba(255,255,255,0.92)" }}>Preview</h2>
              {imageUrl ? (
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}
                >
                  Open in new tab
                </a>
              ) : null}
            </div>

            <div style={{ marginTop: 12 }}>
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrl}
                  alt="Generated MCP plot"
                  style={{
                    width: "100%",
                    maxWidth: 940,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(0,0,0,0.2)",
                  }}
                />
              ) : (
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px dashed rgba(255,255,255,0.18)",
                    padding: 18,
                    background: "rgba(0,0,0,0.18)",
                    color: "rgba(255,255,255,0.62)",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  Upload a CSV and click <strong style={{ color: "rgba(255,255,255,0.85)" }}>Generate plot</strong>.
                  The image will appear here.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}