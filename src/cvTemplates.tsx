import React, { createContext, useContext } from 'react';
import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ---------------------------------------------------------------------------------------------
   CV templates (7 designs, A4 = 794 x 1123 px).
   Every template renders from the same CvData. In "blank" mode (template picker) all text and the
   photo are replaced by grey placeholder bars, so the customer only sees the design.
   --------------------------------------------------------------------------------------------- */

export type Level = 1 | 2 | 3 | 4;
export type CvData = {
  name: string; title: string; about: string; summary: string;
  phone: string; email: string; address: string; website: string; photo: string;
  skills: { name: string; level: Level }[];
  softSkills: string[];
  languages: { name: string; level: Level }[];
  education: { period: string; school: string; degree: string; note: string }[];
  experience: { period: string; company: string; role: string; desc: string }[];
  references: { name: string; role: string; phone: string; email: string }[];
  achievements: { period: string; text: string; title?: string }[];
  /** what the work-experience slot shows: 'work' (default) or 'achievements' (customer's choice) */
  expKind?: 'work' | 'achievements';
  certs: { name: string; year: string }[];
};

export const emptyCv = (): CvData => ({
  name: '', title: '', about: '', summary: '', phone: '', email: '', address: '', website: '', photo: '',
  skills: [], softSkills: [], languages: [], education: [], experience: [], references: [], achievements: [], certs: [], expKind: 'work',
});

export type Section = 'photo' | 'about' | 'summary' | 'contact' | 'website' | 'skills' | 'softSkills' | 'languages'
  | 'education' | 'experience' | 'references' | 'achievements' | 'certs';
export type TplKey = 'rosa' | 'jonathan' | 'donna' | 'daniel' | 'muhammad' | 'richard' | 'director';

/* ------------------------------------- shared helpers ------------------------------------- */
type Ctx = { blank: boolean; km: boolean; ach?: boolean };
const C = createContext<Ctx>({ blank: false, km: false });
const useC = () => useContext(C);

const HL: Record<string, [string, string]> = {
  about: ['About Me', 'អំពីខ្ញុំ'], profile: ['Profile', 'ប្រវត្តិរូប'], profileInfo: ['Profile Info', 'ព័ត៌មានផ្ទាល់ខ្លួន'],
  summary: ['Summary', 'សេចក្តីសង្ខេប'], contact: ['Contact', 'ទំនាក់ទំនង'], education: ['Education', 'ការអប់រំ'],
  experience: ['Experience', 'បទពិសោធន៍'], work: ['Work Experience', 'បទពិសោធន៍ការងារ'], works: ['Work Experiences', 'បទពិសោធន៍ការងារ'],
  skills: ['Skills', 'ជំនាញ'], designSkills: ['Design Skills', 'ជំនាញរចនា'], softSkills: ['Soft Skills', 'ជំនាញទន់'],
  expertise: ['Expertise', 'ជំនាញឯកទេស'], certs: ['Certifications', 'វិញ្ញាបនបត្រ'], languages: ['Languages', 'ភាសា'],
  language: ['Language', 'ភាសា'], references: ['References', 'អ្នកផ្តល់ការយោង'], reference: ['Reference', 'អ្នកផ្តល់ការយោង'],
  achievements: ['Achievements', 'សមិទ្ធផល'], phone: ['Phone', 'ទូរស័ព្ទ'], email: ['Email', 'អ៊ីមែល'],
};
export const LEVEL_LANG: [string, string][] = [['Basic', 'មូលដ្ឋាន'], ['Intermediate', 'មធ្យម'], ['Fluent', 'ស្ទាត់'], ['Native', 'ភាសាកំណើត']];
export const LEVEL_SKILL: [string, string][] = [['Beginner', 'ចាប់ផ្តើម'], ['Intermediate', 'មធ្យម'], ['Advanced', 'ខ្ពស់'], ['Expert', 'អ្នកជំនាញ']];

const nonEmpty = (o: unknown) => (typeof o === 'string' ? o.trim() !== '' : Object.values(o as object).some(v => typeof v === 'string' && v.trim() !== ''));
function rows<T>(a: T[], n: number, blank: boolean): (T | null)[] {
  return blank ? Array.from({ length: n }, () => null) : a.filter(nonEmpty);
}
const lines = (s?: string) => String(s || '').split('\n').map(x => x.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean);
const pct = (l?: number) => Math.min(100, Math.max(1, (l || 3) * 25));

/** Text, or a grey bar when the template is shown blank. */
function V({ v, w = 60 }: { v?: string; w?: number }) {
  const { blank } = useC();
  if (blank) return <i className="cvsk" style={{ width: w + '%' }} />;
  return v ? <>{v}</> : null;
}
/** Paragraph, or several grey lines when blank. */
function Lines({ v, n = 3 }: { v?: string; n?: number }) {
  const { blank } = useC();
  if (blank) return <>{Array.from({ length: n }, (_, i) => <i key={i} className="cvsk cvblk" style={{ width: (i === n - 1 ? 55 : 100) + '%' }} />)}</>;
  return v ? <span className="cvpre">{v}</span> : null;
}
/** Bullet text lines (one bullet per line the customer typed). */
function Bullets({ v, n = 2 }: { v?: string; n?: number }) {
  const { blank } = useC();
  const l = blank ? Array.from({ length: n }, () => '') : lines(v);
  if (!l.length) return null;
  return <ul className="cvbl">{l.map((x, i) => <li key={i}>{blank ? <i className="cvsk cvblk" style={{ width: (i % 2 ? 70 : 95) + '%' }} /> : x}</li>)}</ul>;
}
function Photo({ d, cls }: { d: CvData; cls: string }) {
  const { blank } = useC();
  const ini = (d.name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => Array.from(w)[0]).join('').toUpperCase();
  const img = !blank && d.photo;
  return (
    <div className={'cvph ' + cls}>
      {img ? <img src={d.photo} alt="" /> : (!blank && ini) ? <b>{ini}</b>
        : <svg viewBox="0 0 24 24"><circle cx="12" cy="8.6" r="4.3" /><path d="M3.2 22c.5-5.2 4.3-8 8.8-8s8.3 2.8 8.8 8z" /></svg>}
    </div>
  );
}
function Contact({ d, site = true, cls = '' }: { d: CvData; site?: boolean; cls?: string }) {
  const { blank } = useC();
  const all: [LucideIcon, string, number][] = [[Phone, d.phone, 55], [Mail, d.email, 85], [MapPin, d.address, 75]];
  if (site) all.push([Globe, d.website, 80]);
  const r = all.filter(([, v]) => blank || v);
  return <ul className={'cvct ' + cls}>{r.map(([I, v, w], i) => <li key={i}><span className="cvci"><I /></span><span className="cvx"><V v={v} w={w} /></span></li>)}</ul>;
}
const nameParts = (d: CvData): [string, string] => {
  const p = (d.name || '').trim().split(/\s+/).filter(Boolean);
  return p.length < 2 ? [p[0] || '', ''] : [p[0], p.slice(1).join(' ')];
};
function Name2({ d }: { d: CvData }) {
  const { blank } = useC();
  const [a, b] = nameParts(d);
  if (blank) return <><span className="cvnm"><i className="cvsk cvblk" style={{ width: '86%' }} /></span><span className="cvnm"><i className="cvsk cvblk" style={{ width: '100%' }} /></span></>;
  return <><span className="cvnm">{a}</span>{b && <span className="cvnm">{b}</span>}</>;
}
const lvText = (l: number | undefined, km: boolean, t = LEVEL_LANG) => t[Math.min(3, Math.max(0, (l || 3) - 1))][km ? 1 : 0];

type Hf = (k: string) => string;
const useH = (): Hf => { const { km, ach } = useC(); return (k: string) => (HL[ach && (k === 'works' || k === 'experience' || k === 'work') ? 'achievements' : k] || [k, k])[km ? 1 : 0]; };

/* ------------------------------------- 1. Rosa (dark sidebar) ------------------------------------- */
function T1({ d }: { d: CvData }) {
  const { blank, km } = useC(); const h = useH();
  const edu = rows(d.education, 3, blank), exp = rows(d.experience, 3, blank), sk = rows(d.skills, 5, blank), lg = rows(d.languages, 4, blank);
  return (
    <div className="cvPage t1">
      <svg className="cvbg" viewBox="0 0 794 1123" aria-hidden="true">
        <path d="M0 263H232Q325 283 325 400V780C325 960 365 1060 427 1123H0Z" fill="#37383e" />
        <path d="M302 101H715Q735 101 735 121V152Q735 229 650 229H302Z" fill="#37383e" />
      </svg>
      <Photo d={d} cls="t1p" />
      <div className="t1h"><b><V v={d.name} w={78} /></b><span><V v={d.title} w={46} /></span></div>
      <div className="t1l">
        <section><h4>{h('about')}</h4><p className="t1ab"><Lines v={d.about} n={3} /></p></section>
        <section><h4>{h('contact')}</h4><Contact d={d} /></section>
        <section><h4>{h('languages')}</h4>
          <div className="t1lg">{lg.map((x, i) => <React.Fragment key={i}><b><V v={x?.name} w={70} /></b><em>{blank ? <i className="cvsk" style={{ width: '70%' }} /> : lvText(x?.level, km)}</em></React.Fragment>)}</div>
        </section>
      </div>
      <div className="t1r">
        <section><h4>{h('summary')}</h4><p className="t1p2"><Lines v={d.summary} n={2} /></p></section>
        <section><h4>{h('education')}</h4>
          <div className="t1ed">{edu.map((x, i) => <React.Fragment key={i}><b><V v={x?.school} w={80} /></b><span><V v={x?.period} w={70} /></span></React.Fragment>)}</div>
        </section>
        <section><h4>{h('works')}</h4>
          {exp.map((x, i) => (
            <div className="t1ex" key={i}>
              <div><b><V v={x?.company} w={80} /></b><span><V v={x?.period} w={40} /></span></div>
              <div><b><V v={x?.role} w={85} /></b><p><Lines v={x?.desc} n={2} /></p></div>
            </div>
          ))}
        </section>
        <section><h4>{h('skills')}</h4>
          <div className="t1sk">{sk.map((x, i) => <React.Fragment key={i}><b><V v={x?.name} w={80} /></b><i className="cvbar"><u style={{ width: (blank ? 62 : pct(x?.level)) + '%' }} /></i></React.Fragment>)}</div>
        </section>
      </div>
    </div>
  );
}

/* ------------------------------------- 2. Jonathan (square photo, divider) ------------------------------------- */
function T2({ d }: { d: CvData }) {
  const { blank, km } = useC(); const h = useH();
  const exp = rows(d.experience, 2, blank), edu = rows(d.education, 3, blank), sk = rows(d.skills, 6, blank), lg = rows(d.languages, 3, blank);
  return (
    <div className="cvPage t2">
      <Photo d={d} cls="t2p" />
      <div className="t2h"><h1><Name2 d={d} /></h1><p><V v={d.title} w={60} /></p></div>
      <i className="t2line" />
      <div className="t2l">
        <Contact d={d} cls="cvround" />
        <h4>{h('expertise')}</h4>
        <ul className="cvbl">{sk.map((x, i) => <li key={i}><V v={x?.name} w={70} /></li>)}</ul>
        <h4>{h('language')}</h4>
        {lg.map((x, i) => <div className="t2lg" key={i}><b><V v={x?.name} w={40} /></b><i className="cvbar"><u style={{ width: (blank ? 70 : pct(x?.level)) + '%' }} /></i></div>)}
      </div>
      <div className="t2r">
        <h4>{h('about')}</h4><p className="t2a"><Lines v={d.summary} n={3} /></p>
        <h4>{h('experience')}</h4>
        {exp.map((x, i) => <div className="t2ex" key={i}><b><V v={[x?.company, x?.period].filter(Boolean).join('  ·  ')} w={60} /></b><em><V v={x?.role} w={40} /></em><p><Lines v={x?.desc} n={3} /></p></div>)}
        <h4>{h('education')}</h4>
        {edu.map((x, i) => <div className="t2ed" key={i}><b className="cvyr"><V v={x?.period} w={90} /></b><div><b><V v={x?.degree} w={80} /></b><em><V v={x?.school} w={55} /></em></div></div>)}
      </div>
    </div>
  );
}

/* ------------------------------------- 3. Donna (light blue, circle photo) ------------------------------------- */
function T3({ d }: { d: CvData }) {
  const { blank, km } = useC(); const h = useH();
  const edu = rows(d.education, 2, blank), sk = rows(d.skills, 4, blank), lg = rows(d.languages, 2, blank), exp = rows(d.experience, 3, blank), rf = rows(d.references, 2, blank);
  return (
    <div className="cvPage t3">
      <div className="t3band" />
      <div className="t3ring" />
      <Photo d={d} cls="t3p" />
      <div className="t3h"><h1><V v={d.name} w={80} /></h1><p><V v={d.title} w={45} /></p></div>
      <div className="t3side">
        <Contact d={d} site={false} cls="cvthin" />
        <h4>{h('education')}</h4>
        {edu.map((x, i) => <div className="t3ed" key={i}><span><V v={x?.degree} w={85} /></span><b><V v={x?.school} w={65} /></b><small><V v={x?.period} w={40} /></small></div>)}
        <h4>{h('skills')}</h4>
        <ul className="cvbl">{sk.map((x, i) => <li key={i}><V v={x?.name} w={75} /></li>)}</ul>
        <h4>{h('language')}</h4>
        <div className="t3lg">{lg.map((x, i) => <span key={i}><V v={x?.name} w={40} /></span>)}</div>
      </div>
      <div className="t3main">
        <h3>{h('about')}</h3><p className="t3a"><Lines v={d.summary} n={4} /></p>
        <h3>{h('work')}</h3>
        {exp.map((x, i) => <div className="t3ex" key={i}><small><V v={x?.period} w={40} /></small><small><V v={x?.company} w={45} /></small><span><V v={x?.role} w={55} /></span><Bullets v={x?.desc} n={2} /></div>)}
        <h3>{h('references')}</h3>
        <div className="t3rf">{rf.map((x, i) => (
          <div key={i}><b><V v={x?.name} w={60} /></b><span><V v={x?.role} w={70} /></span>
            <p><b>{h('phone')}:</b> <V v={x?.phone} w={60} /></p><p><b>{h('email')}:</b> <V v={x?.email} w={80} /></p></div>
        ))}</div>
      </div>
    </div>
  );
}

/* ------------------------------------- 4. Daniel (blue + yellow) ------------------------------------- */
function T4({ d }: { d: CvData }) {
  const { blank } = useC(); const h = useH();
  const sk = rows(d.skills, 5, blank), ss = rows(d.softSkills, 4, blank), ce = rows(d.certs, 2, blank), exp = rows(d.experience, 3, blank), edu = rows(d.education, 3, blank);
  return (
    <div className="cvPage t4">
      <svg className="cvbg" viewBox="0 0 794 1123" aria-hidden="true">
        <polygon points="0,0 487,0 292,81 80,167 0,200" fill="#004a7c" />
        <polygon points="0,0 157,0 0,50" fill="#ffcc00" />
        <rect x="0" y="190" width="329" height="933" fill="#004a7c" />
        <polygon points="0,375 128,273 128,320 0,375" fill="#ffcc00" />
        <polygon points="0,375 128,320 128,330 0,385" fill="#ffcc00" />
        <polygon points="712,990 794,960 794,1040 716,1040" fill="#004a7c" />
        <polygon points="560,1123 794,1040 794,1123" fill="#ffcc00" />
      </svg>
      <Photo d={d} cls="t4p" />
      <div className="t4h"><h1><Name2 d={d} /></h1><p><V v={d.title} w={50} /></p></div>
      <div className="t4l">
        <h4>{h('contact')}</h4><Contact d={d} cls="cvdots" />
        <h4>{h('designSkills')}</h4><ul className="cvbl">{sk.map((x, i) => <li key={i}><V v={x?.name} w={70} /></li>)}</ul>
        <h4>{h('softSkills')}</h4><ul className="cvbl">{ss.map((x, i) => <li key={i}><V v={typeof x === 'string' ? x : ''} w={60} /></li>)}</ul>
        <h4>{h('certs')}</h4><ul className="cvbl">{ce.map((x, i) => <li key={i}><V v={[x?.name, x?.year].filter(Boolean).join(' – ')} w={80} /></li>)}</ul>
      </div>
      <div className="t4r">
        <h4>{h('profile')}</h4><p className="t4a"><Lines v={d.summary} n={5} /></p>
        <h4>{h('experience')}</h4>
        {exp.map((x, i) => <div className="t4ex" key={i}><b><V v={x?.role} w={60} /></b><span><V v={[x?.company, x?.period].filter(Boolean).join('  |  ')} w={50} /></span><Bullets v={x?.desc} n={2} /></div>)}
        <h4>{h('education')}</h4>
        {edu.map((x, i) => <div className="t4ex" key={i}><b><V v={x?.degree} w={65} /></b><ul className="cvbl"><li><V v={[x?.school, x?.period].filter(Boolean).join('  |  ')} w={75} /></li></ul></div>)}
      </div>
    </div>
  );
}

/* ------------------------------------- 5. Muhammad (brown) ------------------------------------- */
function T5({ d }: { d: CvData }) {
  const { blank, km } = useC(); const h = useH();
  const sk = rows(d.skills, 6, blank), lg = rows(d.languages, 3, blank), edu = rows(d.education, 2, blank), exp = rows(d.experience, 3, blank), rf = rows(d.references, 1, blank);
  const Head = ({ k }: { k: string }) => <div className="t5pill"><span>{h(k)}</span></div>;
  const Ic = ({ children }: { children: React.ReactNode }) => <svg className="t5i" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
  return (
    <div className="cvPage t5">
      <div className="t5top" /><div className="t5side" /><div className="t5foot" />
      <Photo d={d} cls="t5p" />
      <div className="t5h"><h1><V v={(d.name || '').toUpperCase()} w={75} /></h1><p><V v={d.title} w={45} /></p></div>
      <div className="t5l">
        <Head k="contact" /><Contact d={d} site={false} cls="cvround" />
        <Head k="skills" /><ul className="cvbl">{sk.map((x, i) => <li key={i}><V v={x?.name} w={60} /></li>)}</ul>
        <Head k="language" />
        {lg.map((x, i) => <div className="t5lg" key={i}><span><V v={x?.name} w={60} /></span><i className="cvbar"><u style={{ width: (blank ? 70 : pct(x?.level)) + '%' }} /></i></div>)}
        <Head k="reference" />
        {rf.map((x, i) => <div className="t5rf" key={i}><b><V v={x?.name} w={60} /></b><span><V v={x?.role} w={70} /></span><p><b>{h('phone')} :</b> <V v={x?.phone} w={55} /></p></div>)}
      </div>
      <div className="t5r">
        <h4><Ic><circle cx="12" cy="7.5" r="4" /><path d="M4 21c.4-5 3.8-7.6 8-7.6s7.6 2.6 8 7.6z" /></Ic>{h('about')}</h4>
        <p className="t5a"><Lines v={d.summary} n={4} /></p>
        <h4><Ic><path d="M12 4 1 9l11 5 9-4.1V15h2V9z" /><path d="M5 12.2V16c0 1.6 3.1 3 7 3s7-1.4 7-3v-3.8l-7 3.2z" /></Ic>{h('education')}</h4>
        {edu.map((x, i) => <div className="t5ed" key={i}><b className="cvyr"><V v={x?.period} w={90} /></b><div><b><V v={x?.school} w={80} /></b><span><V v={x?.degree} w={65} /></span></div></div>)}
        <h4><Ic><path d="M9 3h6l1 2h5v14H3V5h5z" /></Ic>{h('work')}</h4>
        {exp.map((x, i) => <div className="t5ex" key={i}><i className="cvdot" /><div><b><V v={x?.company} w={55} /></b><span><V v={x?.role} w={50} /></span></div><em><V v={x?.period} w={80} /></em><p><Lines v={x?.desc} n={3} /></p></div>)}
      </div>
    </div>
  );
}

/* ------------------------------------- 6. Richard (navy + blue) ------------------------------------- */
function T6({ d }: { d: CvData }) {
  const { blank } = useC(); const h = useH();
  const edu = rows(d.education, 2, blank), sk = rows(d.skills, 7, blank), exp = rows(d.experience, 2, blank), rf = rows(d.references, 2, blank);
  const [a, b] = nameParts(d);
  return (
    <div className="cvPage t6">
      <svg className="cvbg" viewBox="0 0 794 1123" aria-hidden="true">
        <polygon points="0,0 340,0 351,124 0,124" fill="#2c4459" />
        <polygon points="340,0 794,0 794,63 312,63" fill="#4a88c1" />
        <polygon points="312,63 386,63 351,124" fill="#235a8c" />
        <rect x="0" y="1100" width="580" height="23" fill="#4a88c1" />
        <polygon points="590,1123 600,1069 794,1069 794,1123" fill="#2c4459" />
      </svg>
      <Photo d={d} cls="t6p" />
      <div className="t6h"><h1>{blank ? <i className="cvsk" style={{ width: '70%' }} /> : <><b>{a}</b> {b}</>}</h1><p><V v={(d.title || '').toUpperCase()} w={45} /></p><u /></div>
      <div className="t6l">
        <h4>{h('contact')}</h4><Contact d={d} />
        <h4>{h('education')}</h4>
        {edu.map((x, i) => <div className="t6ed" key={i}><small><V v={x?.period} w={50} /></small><b><V v={(x?.school || '').toUpperCase()} w={80} /></b><ul className="cvbl"><li><V v={x?.degree} w={70} /></li>{(blank || x?.note) && <li><V v={x?.note} w={40} /></li>}</ul></div>)}
        <h4>{h('skills')}</h4><ul className="cvbl">{sk.map((x, i) => <li key={i}><V v={x?.name} w={65} /></li>)}</ul>
      </div>
      <div className="t6r">
        <h4>{h('profile')}</h4><p className="t6a"><Lines v={d.summary} n={6} /></p>
        <h4>{h('work')}</h4>
        <div className="t6tl">
          {exp.map((x, i) => <div className="t6ex" key={i}><i className="cvdot" /><div className="cvr"><b><V v={x?.company} w={50} /></b><small><V v={(x?.period || '').toUpperCase()} w={60} /></small></div><span><V v={x?.role} w={60} /></span><Bullets v={x?.desc} n={3} /></div>)}
        </div>
        <h4>{h('reference')}</h4>
        <div className="t6rf">{rf.map((x, i) => <div key={i}><b><V v={x?.name} w={60} /></b><span><V v={x?.role} w={70} /></span><p><b>{h('phone')}:</b> <V v={x?.phone} w={60} /></p><p><b>{h('email')}:</b> <V v={x?.email} w={85} /></p></div>)}</div>
      </div>
    </div>
  );
}

/* ------------------------------------- 7. Director (arch + timeline) ------------------------------------- */
function T7({ d }: { d: CvData }) {
  const { blank, km } = useC(); const h = useH();
  const edu = rows(d.education, 2, blank), sk = rows(d.skills, 6, blank), lg = rows(d.languages, 3, blank), exp = rows(d.experience, 3, blank), ac = rows(d.achievements, 2, blank);
  const Hd = ({ k }: { k: string }) => <h4><span>{h(k)}</span><i /></h4>;
  return (
    <div className="cvPage t7">
      <div className="t7top" /><div className="t7arch" />
      <Photo d={d} cls="t7p" />
      <div className="t7h"><h1><Name2 d={d} /></h1><p><V v={d.title} w={40} /></p></div>
      <div className="t7l">
        <Hd k="education" />
        {edu.map((x, i) => <div className="t7ed" key={i}><span><V v={x?.period} w={40} /></span><b><V v={(x?.degree || '').toUpperCase()} w={80} /></b><b><V v={(x?.school || '').toUpperCase()} w={70} /></b>{(blank || x?.note) && <ul className="cvbl"><li><V v={x?.note} w={75} /></li></ul>}</div>)}
        <Hd k="skills" /><ul className="cvbl cvwide">{sk.map((x, i) => <li key={i}><V v={x?.name} w={60} /></li>)}</ul>
        <Hd k="languages" /><ul className="cvbl cvwide">{lg.map((x, i) => <li key={i}>{blank ? <i className="cvsk" style={{ width: '45%' }} /> : <>{x?.name} ({lvText(x?.level, km).toLowerCase()})</>}</li>)}</ul>
        <Hd k="contact" /><Contact d={d} cls="cvplain" />
      </div>
      <div className="t7r">
        <Hd k="profileInfo" /><p className="t7a"><Lines v={d.summary} n={6} /></p>
        <Hd k="experience" />
        <div className="t7tl">
          {exp.map((x, i) => <div className="t7ex" key={i}><i className="cvring" /><div className="cvr"><b><V v={(x?.role || '').toUpperCase()} w={70} /></b><small><V v={x?.period} w={85} /></small></div><b><V v={(x?.company || '').toUpperCase()} w={50} /></b><p><Lines v={x?.desc} n={3} /></p></div>)}
        </div>
        <Hd k="achievements" />
        <div className="t7ac">{ac.map((x, i) => <div key={i}><b><V v={x?.period} w={50} /></b><p><Lines v={x?.text} n={3} /></p></div>)}</div>
      </div>
    </div>
  );
}

/* ------------------------------------- registry ------------------------------------- */
export type Tpl = { key: TplKey; en: string; km: string; sections: Section[]; skillBars?: boolean; Comp: (p: { d: CvData }) => React.ReactElement };
export const TEMPLATES: Tpl[] = [
  { key: 'rosa', en: 'Dark sidebar', km: 'ផ្នែកចំហៀងងងឹត', Comp: T1, skillBars: true, sections: ['photo', 'about', 'summary', 'contact', 'website', 'languages', 'education', 'experience', 'skills'] },
  { key: 'jonathan', en: 'Clean classic', km: 'បុរាណស្អាត', Comp: T2, skillBars: true, sections: ['photo', 'summary', 'contact', 'website', 'skills', 'languages', 'experience', 'education'] },
  { key: 'donna', en: 'Soft blue', km: 'ខៀវទន់', Comp: T3, sections: ['photo', 'summary', 'contact', 'skills', 'languages', 'education', 'experience', 'references'] },
  { key: 'daniel', en: 'Blue & yellow', km: 'ខៀវ និងលឿង', Comp: T4, sections: ['photo', 'summary', 'contact', 'website', 'skills', 'softSkills', 'certs', 'experience', 'education'] },
  { key: 'muhammad', en: 'Warm brown', km: 'ត្នោតកក់ក្តៅ', Comp: T5, skillBars: true, sections: ['photo', 'summary', 'contact', 'skills', 'languages', 'references', 'education', 'experience'] },
  { key: 'richard', en: 'Navy timeline', km: 'បន្ទាត់ពេលវេលា', Comp: T6, sections: ['photo', 'summary', 'contact', 'website', 'education', 'skills', 'experience', 'references'] },
  { key: 'director', en: 'Modern arch', km: 'ទំនើប រាងកោង', Comp: T7, sections: ['photo', 'summary', 'contact', 'website', 'education', 'skills', 'languages', 'experience', 'achievements'] },
];
export const tplOf = (k: string) => TEMPLATES.find(t => t.key === k) || TEMPLATES[0];

/** When the customer chose "Achievements" for the work-experience slot, the achievements are fed to that slot (same layout, new heading). */
function slotView(d: CvData, tpl: TplKey): CvData {
  if (d.expKind !== 'achievements') return d;
  const titleFirst = tpl === 'daniel';   // this design puts the job title (not the company) on the bold first line
  return { ...d, experience: (d.achievements || []).map(a => ({ period: a.period, company: titleFirst ? '' : (a.title || ''), role: titleFirst ? (a.title || '') : '', desc: a.text })) };
}

/** One CV page (794 x 1123 px). blank = design only (no text, no photo). onFit tells the editor when the text is too long for the page. */
export function CvSheet({ tpl, data, blank = false, km = false, onFit }: { tpl: TplKey; data: CvData; blank?: boolean; km?: boolean; onFit?: (overflow: boolean) => void }) {
  const T = tplOf(tpl);
  const root = React.useRef<HTMLDivElement | null>(null);
  /* AUTO-FIT: the page is a fixed A4 sheet. When a column (sidebar, main text...) is longer than the space left on the page,
     its contents are zoomed down just enough to fit, so any number of items always fits on the page (min 20%).
     onFit(true) is only reported if even that smallest size is not enough. */
  React.useLayoutEffect(() => {
    if (blank) return;
    let live = true;
    const LIMIT = 1123 - 24;
    const run = () => {
      const rootEl = root.current, page = rootEl?.querySelector('.cvPage') as HTMLElement | null;
      if (!rootEl || !page || !live || !rootEl.offsetWidth) return;   // hidden / not laid out yet: ResizeObserver runs us again
      let over = false;
      const cols = Array.from(page.querySelectorAll(':scope > div')) as HTMLElement[];
      for (const col of cols) {
        const kids = Array.from(col.children) as HTMLElement[];
        if (!kids.length) continue;
        const last = kids[kids.length - 1];
        const setZoom = (k: number) => kids.forEach(c => { (c.style as any).zoom = k >= 1 ? '' : String(k); });
        const bottom = () => {
          const rr = rootEl.getBoundingClientRect(), sc = rr.width / rootEl.offsetWidth || 1;
          return (last.getBoundingClientRect().bottom - rr.top) / sc;
        };
        setZoom(1);
        if (bottom() <= LIMIT) continue;
        let lo = 0.2, hi = 1;
        setZoom(lo);
        if (bottom() > LIMIT) { over = true; continue; }
        for (let i = 0; i < 10; i++) { const mid = (lo + hi) / 2; setZoom(mid); if (bottom() <= LIMIT) lo = mid; else hi = mid; }
        setZoom(lo);
      }
      onFit?.(over);
    };
    run();
    (document as any).fonts?.ready?.then(run);
    const ro = typeof ResizeObserver !== 'undefined' && root.current ? new ResizeObserver(run) : null;
    if (ro && root.current) ro.observe(root.current);
    return () => { live = false; ro?.disconnect(); };
  }, [tpl, data, blank, km, onFit]);
  return (
    <C.Provider value={{ blank, km, ach: !blank && data.expKind === 'achievements' && !(T.sections as string[]).includes('achievements') }}>
      <div ref={root} className={'cvSheetRoot' + (km ? ' km' : '')} data-notranslate="1"><T.Comp d={(T.sections as string[]).includes('achievements') ? data : slotView(data, tpl)} /></div>
    </C.Provider>
  );
}
