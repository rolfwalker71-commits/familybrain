/** Decorative mountain atmosphere for dashboard chrome (CSS + inline SVG). */
export function BuddyScene({ variant = "default" }: { variant?: "default" | "chat" }) {
  return (
    <div
      className={
        variant === "chat" ? "buddy-scene buddy-scene--chat" : "buddy-scene"
      }
      aria-hidden
    >
      <svg
        className="buddy-scene__mountains buddy-scene__mountains--far"
        viewBox="0 0 1440 320"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="currentColor"
          d="M0 320V180L180 95l140 70 160-110 200 95 150-65 190 90 220-120 200 85V320H0z"
        />
      </svg>
      <svg
        className="buddy-scene__mountains"
        viewBox="0 0 1440 280"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill="currentColor"
          d="M0 280V150l120 55 160-95 140 70 180-100 170 80 150-55 200 95 160-70 160 55V280H0z"
        />
      </svg>
    </div>
  );
}
