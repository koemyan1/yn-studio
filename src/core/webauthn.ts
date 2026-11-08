// Browser side of passkeys. This is the REAL WebAuthn API: on an iPhone / Mac the operating system shows its own Face ID /
// Touch ID sheet. The page never sees a face, a fingerprint or a PIN; it only receives a signed answer from the device.
const toBuf = (s: string): ArrayBuffer => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u.buffer;
};
const toB64u = (b: ArrayBuffer): string => {
  let s = ''; new Uint8Array(b).forEach(x => { s += String.fromCharCode(x); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const passkeysSupported = (): boolean => typeof window !== 'undefined' && !!(window as any).PublicKeyCredential && !!navigator.credentials;
export const isNativeApp = (): boolean => !!(window as any).Capacitor?.isNativePlatform?.();

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  try { return !!(await (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()); } catch { return false; }
}

const friendly = (e: any): Error => {
  const n = e?.name;
  if (n === 'NotAllowedError') return new Error('The passkey check was cancelled or timed out.');
  if (n === 'InvalidStateError') return new Error('This device already has a passkey for your account.');
  if (n === 'SecurityError') return new Error('Open YN CORE at your main address (passkeys only work there).');
  if (n === 'NotSupportedError') return new Error('This browser or device cannot make this kind of passkey.');
  return e instanceof Error ? e : new Error('Passkey error.');
};

/** navigator.credentials.create() with the server's options. Returns JSON the server can verify. */
export async function createPasskey(pk: any): Promise<any> {
  try {
    const publicKey: any = { ...pk, challenge: toBuf(pk.challenge), user: { ...pk.user, id: toBuf(pk.user.id) },
      excludeCredentials: (pk.excludeCredentials || []).map((c: any) => ({ ...c, id: toBuf(c.id) })) };
    const cred = (await navigator.credentials.create({ publicKey })) as any;
    const r = cred.response;
    return { id: cred.id, rawId: toB64u(cred.rawId), type: cred.type, transports: r.getTransports?.() ?? [],
      response: { clientDataJSON: toB64u(r.clientDataJSON), attestationObject: toB64u(r.attestationObject) } };
  } catch (e) { throw friendly(e); }
}

/** navigator.credentials.get(): the device asks for Face ID / Touch ID / PIN (userVerification is "required"). */
export async function getPasskey(pk: any): Promise<any> {
  try {
    const publicKey: any = { ...pk, challenge: toBuf(pk.challenge), allowCredentials: (pk.allowCredentials || []).map((c: any) => ({ ...c, id: toBuf(c.id) })) };
    const cred = (await navigator.credentials.get({ publicKey })) as any;
    const r = cred.response;
    return { id: cred.id, rawId: toB64u(cred.rawId), type: cred.type,
      response: { clientDataJSON: toB64u(r.clientDataJSON), authenticatorData: toB64u(r.authenticatorData), signature: toB64u(r.signature), userHandle: r.userHandle ? toB64u(r.userHandle) : null } };
  } catch (e) { throw friendly(e); }
}
