"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  title?: string;
};

/** Offizielle Markenfarben als SVG (nicht Lucide-Platzhalter). */

export function GoogleLogo({ className, title = "Google" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function MicrosoftLogo({ className, title = "Microsoft" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  );
}

export function MicrosoftTeamsLogo({
  className,
  title = "Microsoft Teams",
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#5059C9"
        d="M19.25 7.5a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5z"
      />
      <path
        fill="#5059C9"
        d="M13.5 8.25c0-.966.784-1.75 1.75-1.75h5.5c.966 0 1.75.784 1.75 1.75V14a4.5 4.5 0 0 1-4.5 4.5h-.5A4.5 4.5 0 0 1 13 14V8.25z"
      />
      <path
        fill="#7B83EB"
        d="M4.75 5.5A2.25 2.25 0 0 1 7 3.25h6.5A2.25 2.25 0 0 1 15.75 5.5v9.25a4.5 4.5 0 0 1-4.5 4.5H7a4.5 4.5 0 0 1-4.5-4.5V7.75A2.25 2.25 0 0 1 4.75 5.5z"
      />
      <path
        fill="#fff"
        d="M8.35 9.15h1.9v5.7h-1.9c-.66 0-1.2-.54-1.2-1.2v-3.3c0-.66.54-1.2 1.2-1.2z"
      />
      <path fill="#5059C9" d="M10.25 9.15h2.1v5.7h-2.1z" />
    </svg>
  );
}

export function GoogleDriveLogo({
  className,
  title = "Google Drive",
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path fill="#4285F4" d="M4.5 20.5 8.2 14h7.6l-3.7 6.5H4.5z" />
      <path fill="#EA4335" d="m8.2 14 3.8-6.5L15.8 14H8.2z" />
      <path fill="#FBBC04" d="M15.8 14 12 7.5h7.5L23 14h-7.2z" />
      <path fill="#34A853" d="M1 14 4.5 20.5h7.6L8.2 14H1z" />
      <path fill="#188038" d="m4.75 7.5 3.45 6.5H1L4.75 7.5z" />
      <path fill="#1967D2" d="M12 7.5 8.2 14l-3.45-6.5H12z" />
    </svg>
  );
}

export function OutlookLogo({ className, title = "Outlook" }: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#0078D4"
        d="M12.5 3.5h7A1.5 1.5 0 0 1 21 5v14a1.5 1.5 0 0 1-1.5 1.5h-7V3.5z"
      />
      <path
        fill="#28A8EA"
        d="M12.5 3.5v17H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5h7.5z"
      />
      <circle cx="8.25" cy="12" r="3.1" fill="#fff" />
      <path
        fill="#0078D4"
        d="M8.25 9.6c-1.32 0-2.4 1.08-2.4 2.4s1.08 2.4 2.4 2.4 2.4-1.08 2.4-2.4-1.08-2.4-2.4-2.4zm0 .9c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5z"
      />
    </svg>
  );
}

export function MicrosoftPlannerLogo({
  className,
  title = "Microsoft Planner",
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect x="2" y="3" width="5.5" height="18" rx="1" fill="#31752F" />
      <rect x="9.25" y="3" width="5.5" height="12" rx="1" fill="#3FA33D" />
      <rect x="16.5" y="3" width="5.5" height="8" rx="1" fill="#6BCB6A" />
    </svg>
  );
}

/** Microsoft To Do checkmark mark. */
export function MicrosoftToDoLogo({
  className,
  title = "Microsoft To Do",
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#2564CF" />
      <path
        fill="#fff"
        d="M10.2 16.2 6.6 12.6l1.4-1.4 2.2 2.2 5.4-5.4 1.4 1.4-6.8 6.8z"
      />
    </svg>
  );
}

export function GoogleTasksLogo({
  className,
  title = "Google Tasks",
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="12" cy="12" r="10" fill="#2684FC" />
      <path
        fill="#fff"
        d="M10.2 15.7 6.8 12.3l1.4-1.4 2 2 5.2-5.2 1.4 1.4-6.6 6.6z"
      />
    </svg>
  );
}

/** Gmail 2020 Markenzeichen (mehrfarbiges „M“). */
export function GmailLogo({ className, title = "Gmail" }: LogoProps) {
  return (
    <svg
      viewBox="52 42 88 66"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path fill="#4285F4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
      <path fill="#34A853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
      <path
        fill="#FBBC04"
        d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2"
      />
      <path fill="#EA4335" d="M72 74V48l24 18 24-18v26L96 92" />
      <path
        fill="#C5221F"
        d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2"
      />
    </svg>
  );
}

/**
 * Maringo Support-Markenzeichen: gestreiftes „M“ aus dem Maringo-Wortbild
 * (Navy #003060) plus AI-Funke in MARIProject-Gold (#fab900).
 */
export function MaringoLogo({ className, title = "Maringo" }: LogoProps) {
  const uid = useId().replace(/:/g, "");
  const clipId = `maringo-m-${uid}`;

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-4 shrink-0", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={clipId}>
          <path d="M2.8 20.5V3.5h3.9l4.3 10.6L15.3 3.5h3.9v17h-3.35V9.6L13 19.6h-2L7.15 9.6v10.9H2.8z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {[3.4, 5.6, 7.8, 10, 12.2, 14.4, 16.6, 18.8].map((y) => (
          <rect
            key={y}
            x="2"
            y={y}
            width="18"
            height="1.55"
            fill="#003060"
          />
        ))}
      </g>
      {/* AI-Akzent */}
      <path
        fill="#fab900"
        d="M19.1 1.6 19.85 3.5l1.9.75-1.9.75-.75 1.9-.75-1.9-1.9-.75 1.9-.75z"
      />
      <circle cx="17.35" cy="8.15" r="1.05" fill="#fab900" />
    </svg>
  );
}
