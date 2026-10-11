// YN Assistant core — free, runs in the browser, no API keys.
// Voice in  = Web Speech API (SpeechRecognition)  → always listening for its name
// Voice out = Web Speech API (speechSynthesis)    → British (en-GB) voice

export type AssistantPhase = 'sleep' | 'awake' | 'thinking' | 'speaking';

export interface CommandContext {
  text: string;
  groups: Record<string, string>;
  assistant: Assistant;
}
export type CommandResult = string | void | Promise<string | void>;
export type CommandHandler = (ctx: CommandContext) => CommandResult;

export interface AssistantOptions {
  name?: string;
  aliases?: string[];
  lang?: string;
  voiceHint?: 'male' | 'female';
  rate?: number;
  pitch?: number;
  navigate?: (path: string) => void;
  onPhase?: (p: AssistantPhase) => void;
  onListening?: (on: boolean) => void;
  onTranscript?: (t: string) => void;
  onReply?: (t: string) => void;
  onUnknown?: (text: string, a: Assistant) => Promise<string | void> | string | void;
}

const SR: any =
  typeof window !== 'undefined' &&
  ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "go to {page}" -> /^go to (?<page>.+)$/i
function patternToRegex(p: string | RegExp): RegExp {
  if (p instanceof RegExp) return p;
  const src = escapeRe(p.toLowerCase().trim()).replace(/\\\{(\w+)\\\}/g, '(?<$1>.+)');
  return new RegExp(`^${src}$`, 'i');
}

const AWAKE_MS = 9000; // how long it waits for a command after hearing its name

export class Assistant {
  name: string;
  aliases: string[];
  lang: string;
  voiceHint: 'male' | 'female';
  rate: number;
  pitch: number;
  navigate: (path: string) => void;
  opts: AssistantOptions;
  commands: { regexes: RegExp[]; run: CommandHandler }[] = [];
  phase: AssistantPhase = 'sleep';
  enabled = false; // user wants the mic on
  private rec: any = null;
  private wanted = false;
  private awakeTimer: number | undefined;
  private sleepTimer: number | undefined;
  private speaking = false;
  private busy = false;
  private voice: SpeechSynthesisVoice | null = null;
  private pending: { label: string; run: () => CommandResult } | null = null;
  private restartDelay = 300;

  constructor(opts: AssistantOptions = {}) {
    this.opts = opts;
    this.name = (opts.name || 'Alfie').toLowerCase();
    // Speech engines often mishear names, so a few spellings are accepted.
    this.aliases = [this.name, ...(opts.aliases || []).map((a) => a.toLowerCase())];
    this.lang = opts.lang || 'en-GB';
    this.voiceHint = opts.voiceHint || 'male';
    this.rate = opts.rate ?? 1;
    this.pitch = opts.pitch ?? 1;
    this.navigate = opts.navigate || ((p) => window.location.assign(p));
    this.loadVoices();
  }

  get supported() {
    return !!SR;
  }

  private setPhase(p: AssistantPhase) {
    if (this.phase === p) return;
    this.phase = p;
    this.opts.onPhase?.(p);
  }

  private loadVoices() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const isFemale = (v: SpeechSynthesisVoice) =>
      /female|serena|kate|stephanie|libby|sonia|hazel|martha|susan/i.test(v.name);
    const pick = () => {
      const all = window.speechSynthesis.getVoices();
      if (!all.length) return;
      const gb = all.filter((v) => v.lang.replace('_', '-').toLowerCase() === 'en-gb');
      const want = this.voiceHint === 'female' ? isFemale : (v: SpeechSynthesisVoice) => !isFemale(v);
      this.voice = gb.find(want) || gb[0] || all.find((v) => /^en/i.test(v.lang)) || null;
    };
    pick();
    window.speechSynthesis.addEventListener('voiceschanged', pick);
  }

  // ---------- commands ----------
  // register('dark mode on', () => 'Dark mode on.')
  // register(['go to {page}', 'open {page}'], ({ groups }) => ...)
  // Later registrations win over earlier ones.
  register(patterns: string | RegExp | (string | RegExp)[], run: CommandHandler) {
    const entry = { regexes: ([] as (string | RegExp)[]).concat(patterns).map(patternToRegex), run };
    this.commands.push(entry);
    return () => {
      this.commands = this.commands.filter((c) => c !== entry);
    };
  }

  /** Ask for a spoken "confirm" before doing something risky (delete, pay...). */
  askConfirm(label: string, run: () => CommandResult): string {
    this.pending = { label, run };
    window.setTimeout(() => {
      if (this.pending?.label === label) this.pending = null;
    }, 15000);
    return `${label} Say confirm to go ahead, or cancel.`;
  }

  // ---------- speaking ----------
  speak(text: string): Promise<void> {
    this.opts.onReply?.(text);
    if (typeof window === 'undefined' || !window.speechSynthesis) return Promise.resolve();
    window.speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.lang;
      if (this.voice) u.voice = this.voice;
      u.rate = this.rate;
      u.pitch = this.pitch;
      this.speaking = true;
      this.setPhase('speaking');
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        this.speaking = false;
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      // Some browsers never fire onend; never get stuck.
      window.setTimeout(done, Math.min(20000, 1500 + text.length * 90));
      window.speechSynthesis.speak(u);
    });
  }

  shutUp() {
    window.speechSynthesis?.cancel();
    this.speaking = false;
  }

  // ---------- wake / sleep ----------
  wake() {
    window.clearTimeout(this.sleepTimer);
    window.clearTimeout(this.awakeTimer);
    this.setPhase(this.busy ? 'thinking' : 'awake');
    this.awakeTimer = window.setTimeout(() => {
      if (!this.busy && !this.speaking) this.sleep();
    }, AWAKE_MS);
  }

  sleep() {
    window.clearTimeout(this.awakeTimer);
    window.clearTimeout(this.sleepTimer);
    this.setPhase('sleep');
  }

  private sleepSoon(ms = 900) {
    window.clearTimeout(this.sleepTimer);
    this.sleepTimer = window.setTimeout(() => {
      if (!this.busy && !this.speaking) this.sleep();
    }, ms);
  }

  // ---------- understanding ----------
  private findWake(text: string): { index: number; length: number } | null {
    for (const a of this.aliases) {
      const m = new RegExp(`(^|[^a-z])${escapeRe(a)}(?![a-z])`, 'i').exec(text);
      if (m) return { index: m.index + m[1].length, length: a.length };
    }
    return null;
  }

  private clean(s: string) {
    return s.toLowerCase().trim().replace(/[.,!?]+$/g, '').replace(/^[\s,]+/, '');
  }

  async handle(raw: string) {
    let text = this.clean(raw);
    const hit = this.findWake(text);
    const wasAwake = this.phase !== 'sleep';
    if (hit) {
      text = this.clean(text.slice(hit.index + hit.length));
    } else if (!wasAwake) {
      return; // not for me
    }
    this.wake();
    if (!text) return; // just its name → glow and wait for the command

    this.busy = true;
    this.setPhase('thinking');
    this.opts.onTranscript?.(raw);
    try {
      await this.run(text);
    } catch (e) {
      console.error('[assistant] command failed', e);
      await this.speak('Sorry, that one did not go to plan.');
    } finally {
      this.busy = false;
      this.sleepSoon(1200);
    }
  }

  private async run(text: string) {
    // pending confirmation
    if (this.pending) {
      const p = this.pending;
      if (/^(confirm|yes|yeah|yep|do it|go ahead|proceed)$/.test(text)) {
        this.pending = null;
        const r = await p.run();
        if (r) await this.speak(r);
        return;
      }
      if (/^(cancel|no|nope|stop|never mind|don't)$/.test(text)) {
        this.pending = null;
        return void (await this.speak('Cancelled.'));
      }
    }

    for (const cmd of [...this.commands].reverse()) {
      for (const re of cmd.regexes) {
        const m = text.match(re);
        if (!m) continue;
        const reply = await cmd.run({ text, groups: m.groups || {}, assistant: this });
        if (reply) await this.speak(reply);
        return;
      }
    }

    if (this.opts.onUnknown) {
      const r = await this.opts.onUnknown(text, this);
      if (r) return void (await this.speak(r));
    }
    await this.speak("Sorry, I don't have a command for that yet.");
  }

  // ---------- listening ----------
  /** Start always-on listening (only reacts after it hears its name). */
  start(): boolean {
    if (!SR) return false;
    this.wanted = true;
    this.enabled = true;
    this.spin();
    return true;
  }

  stop() {
    this.wanted = false;
    this.enabled = false;
    window.clearTimeout(this.awakeTimer);
    window.clearTimeout(this.sleepTimer);
    try {
      this.rec?.abort?.();
    } catch {
      /* ignore */
    }
    this.rec = null;
    this.opts.onListening?.(false);
    this.shutUp();
    this.setPhase('sleep');
  }

  private spin() {
    if (!this.wanted || this.rec) return;
    const rec = new SR();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true; // lets the glow appear the moment it hears its name
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      this.restartDelay = 300;
      this.opts.onListening?.(true);
    };
    rec.onend = () => {
      this.rec = null;
      this.opts.onListening?.(false);
      if (this.wanted) {
        window.setTimeout(() => this.spin(), this.restartDelay);
        this.restartDelay = Math.min(this.restartDelay * 1.5, 4000);
      }
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.wanted = false;
        this.enabled = false;
        this.opts.onListening?.(false);
        this.opts.onReply?.('I need microphone permission to hear you.');
      }
    };
    rec.onresult = (e: any) => {
      if (this.speaking || this.busy) return; // don't hear ourselves
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t: string = r[0].transcript;
        if (!r.isFinal) {
          // glow immediately when the name is heard
          if (this.phase === 'sleep' && this.findWake(t.toLowerCase())) this.wake();
        } else {
          void this.handle(t);
        }
      }
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.rec = null;
    }
  }
}
