import type { PuzzleSettings } from "./puzzle";

type ShareSettings = Pick<PuzzleSettings, "size" | "depth" | "difficulty">;

const DIFFICULTY = { easy: "Gentle", medium: "Focused", hard: "Intricate" };
// Brand silhouettes: https://github.com/simple-icons/simple-icons/tree/develop/icons
// Reference marks: about.x.com/en/who-we-are/brand-toolkit,
// meta.com/brand/resources/whatsapp/whatsapp-brand, telegram.org/tour/screenshots.
const SHARE_ICONS = {
  instagram: '<rect x="2.5" y="2.5" width="19" height="19" rx="5.25"/><circle cx="12" cy="12" r="4.35"/><circle cx="17.55" cy="6.45" r=".8" fill="currentColor" stroke="none"/>',
  tiktok: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.96-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.93-3.59 3.17-5.92 3.13-1.43-.01-2.85-.4-4.07-1.16-2.02-1.24-3.44-3.47-3.64-5.84-.02-.5-.03-1-.01-1.5.17-1.89 1.08-3.7 2.52-4.93 1.63-1.45 3.98-2.15 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.13-.22-2.96.39-.6.39-1.05.99-1.24 1.67-.16.39-.11.82-.11 1.23.17 1.16 1.27 2.13 2.48 2.08.81.01 1.58-.47 2-1.15.14-.25.25-.52.26-.82.07-1.32.04-2.63.05-3.95.01-2.97-.01-5.93.02-8.9z"/>',
  x: '<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>',
  whatsapp: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>',
  telegram: '<path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>',
  native: '<path d="M12 15V3m-4 4 4-4 4 4M7 10H4v11h16V10h-3"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
};
const shareIcon = (name: keyof typeof SHARE_ICONS) => {
  const paint = name === "instagram" || name === "native" || name === "copy"
    ? 'fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"'
    : 'fill="currentColor"';
  return `<svg viewBox="0 0 24 24" ${paint} aria-hidden="true">${SHARE_ICONS[name]}</svg>`;
};
let shareId = 0;

export function createCompletionShare(settings: ShareSettings, connections: number, pageUrl: string) {
  const dimensions = settings.depth === 1
    ? `${settings.size} × ${settings.size}`
    : `${settings.size} × ${settings.size} × ${settings.depth}`;
  const text = `I cleared every dot in a ${dimensions} Nodoku puzzle (${DIFFICULTY[settings.difficulty]}) with ${connections} connections! Can you solve one too?`;
  const page = new URL(pageUrl);
  // Local admin links and payment returns must never become part of an invite.
  const url = page.origin + page.pathname;
  return { title: "Every dot cleared · Nodoku", text, url, message: `${text}\n\n${url}` };
}

export function mountCompletionShare(host: HTMLElement): {
  update(settings: ShareSettings, connections: number): void;
} {
  const id = `completion-share-${++shareId}`;
  host.innerHTML = `
    <section class="completion-share" aria-labelledby="${id}-title" hidden>
      <h3 class="completion-share-title" id="${id}-title">Share your little victory</h3>
      <p class="completion-share-preview"></p>
      <div class="completion-share-controls">
        <div class="completion-share-networks" role="group" aria-label="Share on a social network">
          <a class="share-button" data-network="x" target="_blank" rel="noopener noreferrer" aria-label="Share on X (opens in a new tab)" title="Share on X">${shareIcon("x")}</a>
          <a class="share-button" data-network="instagram" target="_blank" rel="noopener noreferrer" aria-label="Open Instagram to share (opens in a new tab)" title="Open Instagram to share">${shareIcon("instagram")}</a>
          <a class="share-button" data-network="tiktok" target="_blank" rel="noopener noreferrer" aria-label="Open TikTok to share (opens in a new tab)" title="Open TikTok to share">${shareIcon("tiktok")}</a>
          <a class="share-button" data-network="whatsapp" target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp (opens in a new tab)" title="Share on WhatsApp">${shareIcon("whatsapp")}</a>
          <a class="share-button" data-network="telegram" target="_blank" rel="noopener noreferrer" aria-label="Share on Telegram (opens in a new tab)" title="Share on Telegram">${shareIcon("telegram")}</a>
        </div>
        <div class="completion-share-actions">
          <button class="share-button share-native" type="button" aria-label="Share using your device" title="Share using your device">${shareIcon("native")}</button>
          <button class="share-button share-copy" type="button" aria-label="Copy message" title="Copy message">${shareIcon("copy")}</button>
        </div>
      </div>
      <p class="completion-share-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <div class="completion-share-fallback" hidden>
        <label for="${id}-message">Copy and share this message</label>
        <textarea class="completion-share-message" id="${id}-message" rows="4" readonly></textarea>
      </div>
    </section>`;
  const section = host.querySelector<HTMLElement>(".completion-share")!;
  const preview = host.querySelector<HTMLElement>(".completion-share-preview")!;
  const status = host.querySelector<HTMLElement>(".completion-share-status")!;
  const nativeButton = host.querySelector<HTMLButtonElement>(".share-native")!;
  const copyButton = host.querySelector<HTMLButtonElement>(".share-copy")!;
  const fallback = host.querySelector<HTMLElement>(".completion-share-fallback")!;
  const textarea = host.querySelector<HTMLTextAreaElement>(".completion-share-message")!;
  nativeButton.hidden = typeof navigator.share !== "function";

  let payload: ReturnType<typeof createCompletionShare> | null = null;
  let version = 0;
  let busy = false;

  function startAction(): number | null {
    if (!payload || busy) return null;
    busy = true;
    nativeButton.disabled = copyButton.disabled = true;
    status.textContent = "";
    fallback.hidden = true;
    return version;
  }

  function finishAction(actionVersion: number): void {
    if (actionVersion !== version) return;
    busy = false;
    nativeButton.disabled = copyButton.disabled = false;
  }

  function showFallback(message: string): void {
    textarea.value = message;
    fallback.hidden = false;
    const dialog = host.closest("dialog");
    if (host.isConnected && (!dialog || dialog.open)) {
      textarea.focus();
      textarea.select();
    }
  }

  nativeButton.addEventListener("click", async () => {
    const actionVersion = startAction();
    if (actionVersion === null || !payload) return;
    const current = payload;
    try {
      await navigator.share({ title: current.title, text: current.text, url: current.url });
      if (actionVersion === version) status.textContent = "Thanks for sharing!";
    } catch (error) {
      if (actionVersion !== version || (error instanceof Error && error.name === "AbortError")) return;
      status.textContent = "Sharing isn’t available here. Copy the message below.";
      showFallback(current.message);
    } finally {
      finishAction(actionVersion);
    }
  });

  copyButton.addEventListener("click", async () => {
    const actionVersion = startAction();
    if (actionVersion === null || !payload) return;
    const current = payload;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(current.message);
      if (actionVersion === version) status.textContent = "Message copied. Share it wherever you like.";
    } catch {
      if (actionVersion !== version) return;
      status.textContent = "Select and copy the message below.";
      showFallback(current.message);
    } finally {
      finishAction(actionVersion);
    }
  });

  return {
    update(settings, connections) {
      version++;
      payload = createCompletionShare(settings, connections, location.href);
      busy = false;
      nativeButton.disabled = copyButton.disabled = false;
      status.textContent = "";
      fallback.hidden = true;
      textarea.value = "";
      preview.textContent = payload.text;

      const links = {
        x: `https://x.com/intent/tweet?${new URLSearchParams({ text: payload.text, url: payload.url })}`,
        instagram: "https://www.instagram.com/",
        tiktok: "https://www.tiktok.com/",
        whatsapp: `https://wa.me/?${new URLSearchParams({ text: payload.message })}`,
        telegram: `https://t.me/share/url?${new URLSearchParams({ url: payload.url, text: payload.text })}`,
      };
      for (const [network, url] of Object.entries(links))
        host.querySelector<HTMLAnchorElement>(`[data-network="${network}"]`)!.href = url;
      section.hidden = false;
    },
  };
}
