export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startScheduler } = await import("./lib/jobs/scheduler");
      startScheduler();
    } catch (error) {
      console.error("[familybrain] Scheduler failed to start:", error);
    }
    try {
      const { startTelegramPollLoop } = await import("./lib/telegram/poll");
      startTelegramPollLoop();
    } catch (error) {
      console.error("[familybrain] Telegram poll failed to start:", error);
    }
  }
}
