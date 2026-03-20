"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

type GeneratedItem = {
  id: string;
  originalName: string;
  pngBlob: Blob;
  pngUrl: string;
  downloadName: string;
  isPreviewOpen: boolean;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function getFileId(file: File): string {
  return `${file.name}__${file.size}__${file.lastModified}`;
}

function getFilenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const simpleMatch = header.match(/filename="?([^"]+)"?/i);
  if (simpleMatch?.[1]) {
    return simpleMatch[1];
  }

  return null;
}

function downloadBlob(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function parseErrorMessage(text: string): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.detail) {
      return typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
    }
  } catch {
    // ignore
  }
  return text || "Something went wrong.";
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(61,94,168,0.18) 0%, rgba(11,15,25,1) 38%), #0b0f19",
  } as const,
  container: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "48px 18px 80px",
  } as const,
  hero: {
    marginBottom: 22,
  } as const,
  heroTitle: {
    margin: 0,
    fontSize: 36,
    letterSpacing: -0.8,
    color: "white",
    fontWeight: 800,
  } as const,
  heroText: {
    marginTop: 12,
    marginBottom: 0,
    color: "rgba(255,255,255,0.72)",
    lineHeight: 1.6,
    maxWidth: 760,
    fontSize: 15,
  } as const,
  card: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 22,
    padding: 22,
    backdropFilter: "blur(14px)",
    boxShadow: "0 18px 40px rgba(0,0,0,0.18)",
  } as const,
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    marginBottom: 18,
  } as const,
  sectionTitleWrap: {
    display: "grid",
    gap: 6,
  } as const,
  sectionTitle: {
    margin: 0,
    color: "rgba(255,255,255,0.94)",
    fontSize: 18,
    fontWeight: 700,
  } as const,
  sectionSubtext: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 13,
    lineHeight: 1.5,
  } as const,
  actionRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  } as const,
  primaryButton: {
    padding: "11px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "white",
    color: "#0b0f19",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 13,
    boxShadow: "0 8px 24px rgba(255,255,255,0.12)",
  } as const,
  secondaryButton: {
    padding: "11px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 13,
  } as const,
  subtleButton: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "transparent",
    color: "rgba(255,255,255,0.88)",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
  } as const,
  disabledButton: {
    padding: "11px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.20)",
    color: "rgba(0,0,0,0.55)",
    cursor: "not-allowed",
    fontWeight: 800,
    fontSize: 13,
  } as const,
  uploadDropzone: {
    borderRadius: 18,
    border: "1px dashed rgba(255,255,255,0.18)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.16) 100%)",
    padding: 18,
  } as const,
  uploadMetaBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 14,
  } as const,
  pill: {
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  } as const,
  list: {
    display: "grid",
    gap: 12,
  } as const,
  fileRow: {
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    padding: 14,
    display: "grid",
    gap: 12,
  } as const,
  fileTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 14,
  } as const,
  fileName: {
    color: "rgba(255,255,255,0.94)",
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.35,
    wordBreak: "break-word",
  } as const,
  fileMeta: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    marginTop: 4,
  } as const,
  smallButton: {
    padding: "8px 11px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "transparent",
    color: "rgba(255,255,255,0.84)",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: "nowrap",
  } as const,
  resultRow: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.14) 100%)",
    overflow: "hidden",
  } as const,
  resultHeader: {
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    flexWrap: "wrap",
  } as const,
  resultPreviewArea: {
    padding: "0 16px 16px",
  } as const,
  previewImage: {
    width: "100%",
    maxWidth: 960,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.22)",
    display: "block",
  } as const,
  emptyState: {
    borderRadius: 18,
    border: "1px dashed rgba(255,255,255,0.16)",
    padding: 20,
    background: "rgba(0,0,0,0.16)",
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    lineHeight: 1.6,
  } as const,
  errorBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    background: "rgba(239,68,68,0.12)",
    border: "1px solid rgba(239,68,68,0.28)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    lineHeight: 1.45,
  } as const,
  footerNote: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 12,
  } as const,
};

export default function HomePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [generatedItems, setGeneratedItems] = useState<GeneratedItem[]>([]);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [zipUrl, setZipUrl] = useState<string | null>(null);
  const [zipDownloadName, setZipDownloadName] = useState<string>("mcp_plots.zip");

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const zipUrlRef = useRef<string | null>(null);
  const generatedUrlsRef = useRef<string[]>([]);

  const totalSelectedBytes = useMemo(
    () => selectedFiles.reduce((sum, file) => sum + file.size, 0),
    [selectedFiles]
  );

  const hasSelectedFiles = selectedFiles.length > 0;
  const hasGeneratedItems = generatedItems.length > 0;

  useEffect(() => {
    return () => {
      if (zipUrlRef.current) {
        URL.revokeObjectURL(zipUrlRef.current);
      }
      generatedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function registerGeneratedUrls(items: GeneratedItem[]) {
    generatedUrlsRef.current = items.map((item) => item.pngUrl);
  }

  function clearGeneratedState() {
    if (zipUrlRef.current) {
      URL.revokeObjectURL(zipUrlRef.current);
      zipUrlRef.current = null;
    }

    generatedUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    generatedUrlsRef.current = [];

    setZipBlob(null);
    setZipUrl(null);
    setZipDownloadName("mcp_plots.zip");
    setGeneratedItems([]);
  }

  function triggerFilePicker() {
    fileInputRef.current?.click();
  }

  function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    if (incoming.length === 0) return;

    setError(null);
    clearGeneratedState();

    setSelectedFiles((prev) => {
      const map = new Map(prev.map((file) => [getFileId(file), file]));
      incoming.forEach((file) => map.set(getFileId(file), file));
      return Array.from(map.values());
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function removeSelectedFile(fileId: string) {
    setSelectedFiles((prev) => prev.filter((file) => getFileId(file) !== fileId));
  }

  function clearAllSelectedFiles() {
    setSelectedFiles([]);
    setError(null);
    clearGeneratedState();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function extractZipEntries(zipBlobInput: Blob): Promise<GeneratedItem[]> {
    const JSZipModule = await import("jszip");
    const JSZip = JSZipModule.default;
    const zip = await JSZip.loadAsync(zipBlobInput);
    const entries: GeneratedItem[] = [];

    const fileNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

    for (const entryName of fileNames) {
      const entry = zip.files[entryName];
      const rawBlob = await entry.async("blob");
      const pngBlob = new Blob([rawBlob], { type: "image/png" });
      const pngUrl = URL.createObjectURL(pngBlob);

      entries.push({
        id: entryName,
        originalName: entryName.replace(/\.png$/i, ".csv"),
        pngBlob,
        pngUrl,
        downloadName: entryName.split("/").pop() || "plot.png",
        isPreviewOpen: false,
      });
    }

    entries.sort((a, b) => a.downloadName.localeCompare(b.downloadName));
    return entries;
  }

  async function handleGenerateGraphs() {
    setError(null);

    if (!API_BASE) {
      setError(
        "Missing NEXT_PUBLIC_API_BASE_URL. Set it in .env.local or your Vercel environment variables."
      );
      return;
    }

    if (selectedFiles.length === 0) {
      setError("Please select at least one CSV file.");
      return;
    }

    setIsGenerating(true);
    clearGeneratedState();

    try {
      const form = new FormData();
      selectedFiles.forEach((file) => {
        form.append("files", file);
      });

      const response = await fetch(`${API_BASE}/render-batch`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(parseErrorMessage(text) || `Request failed (${response.status})`);
      }

      const rawZipBlob = await response.blob();
      const zipBlobTyped = new Blob([rawZipBlob], { type: "application/zip" });

      const contentDisposition = response.headers.get("content-disposition");
      const resolvedZipName =
        getFilenameFromContentDisposition(contentDisposition) || "mcp_plots.zip";

      const resolvedZipUrl = URL.createObjectURL(zipBlobTyped);
      const extractedItems = await extractZipEntries(zipBlobTyped);

      zipUrlRef.current = resolvedZipUrl;
      registerGeneratedUrls(extractedItems);

      setZipBlob(zipBlobTyped);
      setZipUrl(resolvedZipUrl);
      setZipDownloadName(resolvedZipName);

      setSelectedFiles([]);
      setGeneratedItems(extractedItems);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate graphs.");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleDownloadAll() {
    if (!zipBlob || !zipUrl) return;
    downloadBlob(zipUrl, zipDownloadName);
  }

  function handleDownloadSingle(item: GeneratedItem) {
    downloadBlob(item.pngUrl, item.downloadName);
  }

  function togglePreview(id: string) {
    setGeneratedItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isPreviewOpen: !item.isPreviewOpen } : item
      )
    );
  }

  function resetWorkflow() {
    clearGeneratedState();
    setSelectedFiles([]);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.hero}>
          <h1 style={styles.heroTitle}>MCP Plot Generator</h1>
          <p style={styles.heroText}>
            Upload one or more MCP CSV files, generate standardized graphs, and download them as a
            complete zip or as individual PNG files. Graph titles and output filenames are derived
            automatically from the uploaded filenames.
          </p>
        </div>

        <section style={styles.card}>
          <div style={styles.sectionHeader}>
            <div style={styles.sectionTitleWrap}>
              <h2 style={styles.sectionTitle}>
                {hasGeneratedItems ? "Generated graphs" : "Upload files"}
              </h2>
              <div style={styles.sectionSubtext}>
                {hasGeneratedItems
                  ? "Review each generated graph below. Open a preview only when you want to inspect it."
                  : "Select the CSV files you want to process. Files stay in the queue until you generate the graphs."}
              </div>
            </div>

            <div style={styles.actionRow}>
              {!hasGeneratedItems ? (
                <>
                  {hasSelectedFiles ? (
                    <button
                      type="button"
                      onClick={clearAllSelectedFiles}
                      disabled={isGenerating}
                      style={isGenerating ? styles.disabledButton : styles.subtleButton}
                    >
                      Clear all
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={triggerFilePicker}
                    disabled={isGenerating}
                    style={isGenerating ? styles.disabledButton : styles.secondaryButton}
                  >
                    Choose CSVs
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleDownloadAll}
                    style={styles.secondaryButton}
                  >
                    Download all
                  </button>
                  <button
                    type="button"
                    onClick={resetWorkflow}
                    style={styles.subtleButton}
                  >
                    Start new batch
                  </button>
                </>
              )}
            </div>
          </div>

          {!hasGeneratedItems ? (
            <div style={styles.uploadDropzone}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                multiple
                style={{ display: "none" }}
                onChange={handleFilesSelected}
              />

              <div style={styles.uploadMetaBar}>
                <div>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.94)",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {hasSelectedFiles
                      ? `${selectedFiles.length} file${selectedFiles.length === 1 ? "" : "s"} selected`
                      : "No files selected"}
                  </div>
                  <div style={styles.footerNote}>
                    {hasSelectedFiles
                      ? `${formatBytes(totalSelectedBytes)} total`
                      : "Choose one or more MCP CSV files to begin."}
                  </div>
                </div>

                <span
                  style={{
                    ...styles.pill,
                    background: hasSelectedFiles
                      ? "rgba(34,197,94,0.18)"
                      : "rgba(255,255,255,0.10)",
                    color: hasSelectedFiles
                      ? "rgba(34,197,94,0.96)"
                      : "rgba(255,255,255,0.66)",
                  }}
                >
                  {hasSelectedFiles ? "Ready to generate" : "Waiting for files"}
                </span>
              </div>

              <div style={styles.list}>
                {hasSelectedFiles ? (
                  selectedFiles.map((file) => {
                    const fileId = getFileId(file);

                    return (
                      <div key={fileId} style={styles.fileRow}>
                        <div style={styles.fileTopRow}>
                          <div style={{ minWidth: 0 }}>
                            <div style={styles.fileName}>{file.name}</div>
                            <div style={styles.fileMeta}>{formatBytes(file.size)} • CSV</div>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeSelectedFile(fileId)}
                            disabled={isGenerating}
                            style={
                              isGenerating
                                ? { ...styles.smallButton, cursor: "not-allowed", opacity: 0.6 }
                                : styles.smallButton
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={styles.emptyState}>
                    Upload files to build a processing queue. Nothing will be previewed automatically,
                    and no graph actions will appear until the batch has been generated.
                  </div>
                )}
              </div>

              <div style={{ ...styles.actionRow, marginTop: 18 }}>
                <button
                  type="button"
                  onClick={handleGenerateGraphs}
                  disabled={!hasSelectedFiles || isGenerating}
                  style={!hasSelectedFiles || isGenerating ? styles.disabledButton : styles.primaryButton}
                >
                  {isGenerating ? "Generating graphs…" : "Generate graphs"}
                </button>

                <div style={{ marginLeft: "auto", ...styles.footerNote }}>
                  {API_BASE ? `Backend: ${API_BASE}` : "Backend not configured"}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  padding: "4px 2px 0",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "rgba(255,255,255,0.94)",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {generatedItems.length} graph{generatedItems.length === 1 ? "" : "s"} created
                  </div>
                  <div style={styles.footerNote}>
                    Download everything at once or expand any graph below for a preview.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadAll}
                  style={styles.secondaryButton}
                >
                  Download all
                </button>
              </div>

              <div style={styles.list}>
                {generatedItems.map((item) => (
                  <div key={item.id} style={styles.resultRow}>
                    <div style={styles.resultHeader}>
                      <div style={{ minWidth: 0 }}>
                        <div style={styles.fileName}>{item.downloadName}</div>
                        <div style={styles.fileMeta}>
                          Generated from {item.originalName}
                        </div>
                      </div>

                      <div style={styles.actionRow}>
                        <button
                          type="button"
                          onClick={() => togglePreview(item.id)}
                          style={styles.secondaryButton}
                        >
                          {item.isPreviewOpen ? "Hide preview" : "Preview"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadSingle(item)}
                          style={styles.subtleButton}
                        >
                          Download PNG
                        </button>
                      </div>
                    </div>

                    {item.isPreviewOpen ? (
                      <div style={styles.resultPreviewArea}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.pngUrl}
                          alt={`Preview of ${item.downloadName}`}
                          style={styles.previewImage}
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error ? (
            <div style={styles.errorBox}>
              <strong style={{ color: "rgba(255,255,255,0.96)" }}>Error:</strong>{" "}
              <span style={{ color: "rgba(255,255,255,0.88)" }}>{error}</span>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}