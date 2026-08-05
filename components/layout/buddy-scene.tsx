/** Soft AI wallpaper atmosphere for dashboard chrome. */
export function BuddyScene({
  variant = "default",
}: {
  variant?: "default" | "chat";
}) {
  return (
    <div
      className={
        variant === "chat" ? "buddy-scene buddy-scene--chat" : "buddy-scene"
      }
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative full-bleed bg */}
      <img
        className="buddy-scene__image"
        src="/buddy-wallpaper.png"
        alt=""
        decoding="async"
      />
      <div className="buddy-scene__wash" />
    </div>
  );
}
