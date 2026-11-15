import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Share } from 'lucide-react';
import { tr, useLang } from './lang';
import { PushState, disablePush, enablePush, getPushState } from './push';
import './push.css';

/** Card that turns phone notifications on/off for this device. Used on Profile, Notifications and Admin > Notifications. */
export default function PushToggle({ admin = false }: { admin?: boolean }) {
  useLang();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { getPushState().then(setState); }, []);
  if (state === null || state === 'unsupported' || state === 'no-key') return null;

  async function turnOn() {
    setBusy(true); setErr('');
    try { setState(await enablePush()); }
    catch (e: any) { setErr(e?.message || tr('Could not turn on notifications.', 'មិនអាចបើកការជូនដំណឹងបានទេ។')); }
    finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true); setErr('');
    try { setState(await disablePush()); } finally { setBusy(false); }
  }

  const title = admin
    ? tr('Phone alerts for new orders and requests', 'ការជូនដំណឹងលើទូរស័ព្ទសម្រាប់ការបញ្ជាទិញ និងសំណើថ្មី')
    : tr('Get order updates on your phone', 'ទទួលព័ត៌មានការបញ្ជាទិញលើទូរស័ព្ទ');

  return (
    <section className={'pushCard ' + state} aria-label={tr('Phone notifications', 'ការជូនដំណឹងលើទូរស័ព្ទ')}>
      <span className="pushIcon">{state === 'on' ? <BellRing /> : state === 'blocked' ? <BellOff /> : <Bell />}</span>
      <div className="pushText">
        {state === 'on' && <>
          <b>{tr('Notifications are on', 'ការជូនដំណឹងត្រូវបានបើក')}</b>
        </>}
        {state === 'off' && <>
          <b>{title}</b>
        </>}
        {state === 'blocked' && <>
          <b>{tr('Notifications are blocked', 'ការជូនដំណឹងត្រូវបានរារាំង')}</b>
          <small>{tr('Allow notifications in your browser settings.', 'អនុញ្ញាតការជូនដំណឹងក្នុងការកំណត់កម្មវិធីរុករក។')}</small>
        </>}
        {state === 'ios-install' && <>
          <b>{title}</b>
          <small>{tr('On iPhone, first add YN Studio to your Home Screen:', 'នៅលើ iPhone សូមបន្ថែម YN Studio ទៅអេក្រង់ដើមជាមុនសិន៖')}</small>
          <ol>
            <li>{tr('Tap the Share button', 'ចុចប៊ូតុងចែករំលែក')} <Share aria-hidden="true" /></li>
            <li>{tr('Choose Add to Home Screen', 'ជ្រើសរើស «បន្ថែមទៅអេក្រង់ដើម»')}</li>
            <li>{tr('Open YN Studio from the Home Screen and come back here', 'បើក YN Studio ពីអេក្រង់ដើម ហើយត្រឡប់មកទីនេះ')}</li>
          </ol>
        </>}
        {err && <small className="pushErr" role="alert">{err}</small>}
      </div>
      {state === 'off' && <button type="button" disabled={busy} onClick={turnOn}>{busy ? tr('Please wait…', 'សូមរង់ចាំ…') : tr('Turn on', 'បើក')}</button>}
      {state === 'on' && <button type="button" className="ghost" disabled={busy} onClick={turnOff}>{tr('Turn off', 'បិទ')}</button>}
    </section>
  );
}
