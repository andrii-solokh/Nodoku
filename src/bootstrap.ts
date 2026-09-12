// Keep initialization errors catchable, including failures in imported modules.
import("./main")
  .then(() => window.dispatchEvent(new Event("nodoku:startup-ready")))
  .catch(error => {
    console.error("Nodoku startup failed", error);
    window.dispatchEvent(new Event("nodoku:startup-error"));
  });
