import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Digital Asset Links for Android TWA verification.
 * Set ANDROID_PACKAGE_NAME and ANDROID_SHA256_CERT_FINGERPRINTS (comma-separated).
 */
export async function GET() {
  const packageName =
    process.env.ANDROID_PACKAGE_NAME?.trim() || "ch.buddy.app";
  const fps = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS || "")
    .split(",")
    .map((s) => s.trim().toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);

  if (fps.length === 0) {
    return NextResponse.json(
      [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: {
            namespace: "android_app",
            package_name: packageName,
            sha256_cert_fingerprints: [
              "REPLACE_WITH_RELEASE_KEY_SHA256",
            ],
          },
        },
      ],
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      }
    );
  }

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: packageName,
          sha256_cert_fingerprints: fps,
        },
      },
    ],
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    }
  );
}
