import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, MicOff } from 'lucide-react';
import { Assistant, type AssistantPhase } from './assistant';
import { registerBuiltins } from './builtins';
import { registerYNCommands } from './commands';

const PREF_KEY = 'yn-assistant-on';

/* Apple-Intelligence-style glow: a soft rainbow that grows in from the screen edges. */
const CSS = `
@property --yn-angle{syntax:'<angle>';inherits:false;initial-value:0deg}
@property --yn-edge{syntax:'<length>';inherits:true;initial-value:0px}
.ynGlow{position:fixed;inset:0;pointer-events:none;z-index:2147483000;opacity:0;--yn-edge:0px;
  transition:opacity .45s ease,--yn-edge .7s cubic-bezier(.2,.8,.2,1)}
.ynGlow.on{opacity:1;--yn-edge:clamp(46px,9vmin,96px)}
.ynGlow.speaking{--yn-edge:clamp(60px,12vmin,120px)}
.ynGlow i{position:absolute;inset:0;display:block;
  background:conic-gradient(from var(--yn-angle),#ff6a5f,#ffb347,#ffe66d,#5ee7a0,#38bdf8,#6366f1,#c084fc,#f472b6,#ff6a5f);
  animation:ynSpin 4s linear infinite}
/* soft light spilling inward from all four edges */
.ynGlow .soft{filter:blur(26px) saturate(1.35);
  -webkit-mask-image:linear-gradient(to right,#000,transparent var(--yn-edge)),linear-gradient(to left,#000,transparent var(--yn-edge)),linear-gradient(to bottom,#000,transparent var(--yn-edge)),linear-gradient(to top,#000,transparent var(--yn-edge));
  -webkit-mask-composite:source-over;
  mask-image:linear-gradient(to right,#000,transparent var(--yn-edge)),linear-gradient(to left,#000,transparent var(--yn-edge)),linear-gradient(to bottom,#000,transparent var(--yn-edge)),linear-gradient(to top,#000,transparent var(--yn-edge));
  mask-composite:add;opacity:.85}
/* crisp thin line right at the edge */
.ynGlow .line{padding:3px;filter:blur(.6px);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
.ynGlow.thinking i{animation-duration:1.6s}
.ynGlow.on .soft{animation:ynSpin 4s linear infinite,ynBreathe 2.4s ease-in-out infinite}
.ynGlow.speaking .soft{animation:ynSpin 2.6s linear infinite,ynBreathe 1.1s ease-in-out infinite}
@keyframes ynSpin{to{--yn-angle:360deg}}
@keyframes ynBreathe{0%,100%{opacity:.7}50%{opacity:1}}
.ynCaption{position:fixed;top:calc(env(safe-area-inset-top,0px) + 16px);left:50%;transform:translate(-50%,-8px);
  z-index:2147483001;max-width:min(88vw,460px);padding:10px 18px;border-radius:999px;
  font:600 14px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;text-align:center;
  background:rgba(20,16,32,.62);backdrop-filter:blur(18px) saturate(1.5);-webkit-backdrop-filter:blur(18px) saturate(1.5);
  box-shadow:0 8px 30px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:opacity .3s,transform .3s}
.ynCaption.on{opacity:1;transform:translate(-50%,0)}
.ynMic{position:fixed;left:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);z-index:2147483001;
  width:34px;height:34px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;color:#fff;
  background:rgba(60,45,90,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  opacity:.55;transition:opacity .2s,background .2s,box-shadow .2s}
.ynMic:hover,.ynMic:focus-visible{opacity:1}
.ynMic.live{opacity:.9;background:rgba(124,58,237,.85);box-shadow:0 0 0 4px rgba(124,58,237,.2)}
@media(prefers-reduced-motion:reduce){.ynGlow i,.ynGlow .soft{animation:none!important}}
`;

export default function YNAssistant({
  name = 'Alfie',
  aliases,
  voice = 'male',
}: {
  name?: string;
  aliases?: string[];
  voice?: 'male' | 'female';
}) {
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  const ref = useRef<Assistant | null>(null);
  const [phase, setPhase] = useState<AssistantPhase>('sleep');
  const [listening, setListening] = useState(false);
  const [line, setLine] = useState('');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const a = new Assistant({
      name,
      aliases,
      voiceHint: voice,
      navigate: (p) => navRef.current(p),
      onPhase: setPhase,
      onListening: setListening,
      onTranscript: (t) => setLine(t),
      onReply: (t) => setLine(t),
    });
    registerBuiltins(a);
    registerYNCommands(a);
    ref.current = a;
    (window as any).ynAssistant = a; // handy: window.ynAssistant.register(...)
    setSupported(a.supported);

    const wanted = () => {
      try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; }
    };
    const boot = () => { if (wanted() && !a.enabled) a.start(); };
    boot();
    // Some browsers only allow the mic after a tap, so also start on the first touch.
    const first = () => {
      boot();
      if (a.enabled) {
        window.removeEventListener('pointerdown', first);
        window.removeEventListener('keydown', first);
      }
    };
    window.addEventListener('pointerdown', first);
    window.addEventListener('keydown', first);

    return () => {
      window.removeEventListener('pointerdown', first);
      window.removeEventListener('keydown', first);
      a.stop();
      delete (window as any).ynAssistant;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.enabled) {
      a.stop();
      try { localStorage.setItem(PREF_KEY, '0'); } catch { /* ignore */ }
    } else {
      try { localStorage.setItem(PREF_KEY, '1'); } catch { /* ignore */ }
      a.start();
    }
  };

  const on = phase !== 'sleep';
  return (
    <div data-yn-ignore>
      <style>{CSS}</style>
      <div className={`ynGlow${on ? ' on' : ''}${phase === 'speaking' ? ' speaking' : ''}${phase === 'thinking' ? ' thinking' : ''}`} aria-hidden="true">
        <i className="soft" />
        <i className="line" />
      </div>
      <div className={`ynCaption${on && line ? ' on' : ''}`} role="status" aria-live="polite">
        {line}
      </div>
      {supported && (
        <button
          className={`ynMic${listening ? ' live' : ''}`}
          onClick={toggle}
          aria-label={listening ? `Stop listening for ${name}` : `Start listening for ${name}`}
          title={listening ? `Listening for “${name}” — tap to turn off` : `Tap to turn on “${name}”`}
        >
          {listening ? <Mic size={16} /> : <MicOff size={16} />}
        </button>
      )}
    </div>
  );
}
