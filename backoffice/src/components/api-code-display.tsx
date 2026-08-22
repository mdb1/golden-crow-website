"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, Maximize2, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ApiCodeDisplayProps = {
  title: string;
  code: string;
  className?: string;
};

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className="text-slate-300 hover:bg-white/10 hover:text-white"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function CodeRows({ code }: { code: string }) {
  const lines = code.length > 0 ? code.split("\n") : [""];

  return (
    <div className="min-w-max py-3 font-mono text-xs leading-5">
      {lines.map((line, index) => (
        <div
          key={`${index}-${line}`}
          className="grid grid-cols-[3.25rem_minmax(max-content,1fr)]"
        >
          <span
            aria-hidden="true"
            className="sticky left-0 border-r border-white/10 bg-slate-900/95 px-3 text-right tabular-nums text-slate-500"
          >
            {index + 1}
          </span>
          <code className="whitespace-pre px-3 text-slate-100">
            {line || " "}
          </code>
        </div>
      ))}
    </div>
  );
}

function CodeViewport({
  code,
  fullscreen,
}: {
  code: string;
  fullscreen?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 overflow-auto bg-slate-950",
        fullscreen ? "min-h-0" : "max-h-80",
      )}
    >
      <CodeRows code={code} />
    </div>
  );
}

export function ApiCodeDisplay({ title, code, className }: ApiCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <TooltipProvider>
      <Dialog>
        <div
          className={cn(
            "min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 shadow-sm",
            className,
          )}
        >
          <div className="flex min-w-0 items-center justify-between gap-2 border-b border-white/10 bg-slate-900/95 px-2 py-1.5">
            <p className="min-w-0 truncate px-1 text-xs font-medium text-slate-300">
              {title}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                label={copied ? "Copied" : "Copy"}
                onClick={() => void copyCode()}
              >
                {copied ? <Check /> : <Copy />}
              </IconButton>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Open fullscreen"
                      className="text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                      <Maximize2 />
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent>Open fullscreen</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <CodeViewport code={code} />
        </div>

        <DialogContent
          showCloseButton={false}
          className="h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden border-slate-800 bg-slate-950 p-0 text-slate-50 sm:max-w-[calc(100vw-3rem)]"
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-white/10 bg-slate-900/95 px-3 py-2">
            <DialogTitle className="min-w-0 truncate text-sm text-slate-100">
              {title}
            </DialogTitle>
            <div className="flex shrink-0 items-center gap-1">
              <IconButton
                label={copied ? "Copied" : "Copy"}
                onClick={() => void copyCode()}
              >
                {copied ? <Check /> : <Copy />}
              </IconButton>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Close fullscreen"
                      className="text-slate-300 hover:bg-white/10 hover:text-white"
                    >
                      <X />
                    </Button>
                  </DialogClose>
                </TooltipTrigger>
                <TooltipContent>Close fullscreen</TooltipContent>
              </Tooltip>
            </div>
          </DialogHeader>
          <CodeViewport code={code} fullscreen />
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
