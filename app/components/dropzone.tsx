"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import Error from "next/error";

export function Dropzone() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    sheet?: string;
    attempted?: number;
    inserted?: number;
    duplicates?: number;
    errors?: string[];
    error?: string;
    message?: string;
  } | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFile(acceptedFiles[0]);
    setResult(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
  });

  async function handleSubmit() {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload-sales", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      setResult(json);
    } catch (e: unknown) {
      setResult({ error: "An unexpected error occurred." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition
          ${isDragActive ? "bg-neutral-800 border-neutral-600" : "border-neutral-700"}`}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p className="text-neutral-300">Drop the Excel file here...</p>
        ) : (
          <p className="text-neutral-500">
            Drag & drop your Excel file here, or click to select it
          </p>
        )}
      </div>

      {file && (
        <div className="text-neutral-300">
          <p>
            Selected file: <strong>{file.name}</strong>
          </p>
        </div>
      )}

      <Button
        className="bg-white text-black hover:bg-neutral-200"
        disabled={!file || uploading}
        onClick={handleSubmit}
      >
        {uploading ? "Uploading..." : "Submit"}
      </Button>

      {result && (
        <div className="rounded-md border border-neutral-700 p-4 text-sm space-y-2">
          {result.error && (
            <p className="text-red-400">Error: {result.error}</p>
          )}
          {result.message && !result.error && <p>{result.message}</p>}
          {result.sheet && (
            <p>
              Sheet: <strong>{result.sheet}</strong>
            </p>
          )}
          {typeof result.attempted === "number" && (
            <p>
              Attempted: <strong>{result.attempted}</strong>
            </p>
          )}
          {typeof result.inserted === "number" && (
            <p>
              Inserted: <strong>{result.inserted}</strong>
            </p>
          )}
          {typeof result.duplicates === "number" && (
            <p>
              Duplicates skipped: <strong>{result.duplicates}</strong>
            </p>
          )}
          {result.errors && result.errors.length > 0 && (
            <details>
              <summary className="cursor-pointer">
                {result.errors.length} row issues
              </summary>
              <ul className="list-disc pl-5 mt-2 space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-yellow-300">
                    {e}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
