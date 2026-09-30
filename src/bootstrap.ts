// Keep initialization errors catchable, including failures in imported modules.
import("./main")
  .then(async () => {
    if (/^\/dots\/?$/.test(location.pathname)) await import("./character-theme.css");
    if (/^\/groks\/?$/.test(location.pathname)) {
      await import("./character-theme.css");
      await import("./groks-theme.css");
    }
  })
  .then(() => window.dispatchEvent(new Event("nodoku:startup-ready")))
  .catch(error => {
    console.error("Nodoku startup failed", error);
    window.dispatchEvent(new CustomEvent("nodoku:startup-error", {
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }));
  });
