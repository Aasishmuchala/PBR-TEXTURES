"use client";

import { useCallback, useRef, useState } from "react";

export function Uploader({
  preview,
  onSelect,
  disabled,
}: {
  preview: string;
  onSelect: (file: File) => void;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (f && f.type.startsWith("image/")) onSelect(f);
    },
    [onSelect],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`relative grid aspect-square w-full cursor-pointer place-items-center overflow-hidden rounded-[1.25rem] transition-all duration-500 ease-spring ${
        preview
          ? "ring-1 ring-black/[0.06]"
          : drag
            ? "bg-forge-accent/[0.06] ring-2 ring-forge-accent/50"
            : "bg-black/[0.025] ring-1 ring-inset ring-black/[0.07] hover:bg-black/[0.04]"
      } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="source" className="h-full w-full object-cover" />
      ) : (
        <div className="px-6 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-forge-panel text-xl text-forge-muted shadow-softer ring-1 ring-black/[0.05]">
            ↑
          </div>
          <p className="text-sm font-medium text-forge-text">Drop a photo</p>
          <p className="mt-1 text-xs text-forge-muted">or click to browse · JPG / PNG</p>
        </div>
      )}
      {preview && (
        <span className="absolute bottom-3 right-3 rounded-full bg-forge-text/80 px-3 py-1 text-[11px] text-forge-bg backdrop-blur">
          replace
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}
