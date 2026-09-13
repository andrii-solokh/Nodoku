type GoogleIdentity = {
  initialize(options: { client_id: string; nonce: string; ux_mode: 'popup'; auto_select: false; callback: (response: { credential: string }) => void }): void;
  renderButton(host: HTMLElement, options: { theme: 'outline'; size: 'large'; shape: 'pill'; text: 'continue_with'; width: number }): void;
};
let loading: Promise<GoogleIdentity> | undefined;
export function loadGoogleIdentity(): Promise<GoogleIdentity> {
  return loading ??= new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => { clearTimeout(timer); script.remove(); loading = undefined; reject(new Error('Google sign-in could not load. Please try again.')); };
    const timer = setTimeout(fail, 12000);
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    script.onerror = fail;
    script.onload = () => {
      const identity = (window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }).google?.accounts?.id;
      if (!identity) { fail(); return; }
      clearTimeout(timer); resolve(identity);
    };
    document.head.append(script);
  });
}
