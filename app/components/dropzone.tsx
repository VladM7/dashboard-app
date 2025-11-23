"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";

export function Dropzone() {
  const [file, setFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFile(acceptedFiles[0]);
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
        disabled={!file}
      >
        Submit
      </Button>
    </div>
  );
}
