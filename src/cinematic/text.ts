/* All fixed wording in one place (Khmer + English). Wedding details never live here. */
export type Dict = typeof TEXT.km;
export const TEXT = {
  km: {
    title: 'សិរីសួស្តីអាពាហ៍ពិពាហ៍', sub: 'The Wedding Invitation', tap: 'ចុចដើម្បីបើក', invite: 'សូមគោរពអញ្ជើញ', scroll: 'រំកិលចុះក្រោម',
    labels: ['ថ្ងៃ', 'ទី', 'ខែ', 'ឆ្នាំ'], phG: 'ឈ្មោះកូនកំលោះ', phB: 'ឈ្មោះកូនក្រមុំ', phV: 'ទីតាំងកម្មវិធី', phD: ['ថ្ងៃ', 'ទី', 'ខែ', 'ឆ្នាំ'], phL: 'ថ្ងៃខែចន្ទគតិ',
    wordsHead: 'សូមគោរពអញ្ជើញ', parentsG: 'មាតាបិតាកូនកំលោះ', parentsB: 'មាតាបិតាកូនក្រមុំ', mr: 'លោក', mrs: 'និងលោកស្រី',
    wordsDefault: 'ជាមួយក្រុមគ្រួសារទាំងសងខាង\nយើងខ្ញុំសូមគោរពអញ្ជើញលោក លោកស្រី អ្នកនាង\nអញ្ជើញចូលរួមជាភ្ញៀវកិត្តិយស\nដើម្បីប្រសិទ្ធពរជ័យសិរីសួស្តីមង្គល\nក្នុងពិធីអាពាហ៍ពិពាហ៍កូនប្រុស កូនស្រីរបស់យើងខ្ញុំ',
    groom: 'កូនកំលោះ', bride: 'កូនក្រមុំ', coupleHead: 'អាពាហ៍ពិពាហ៍',
    blessingDefault: 'ពរជ័យ សិរីសួស្តី មង្គល', countHead: 'រាប់ថយក្រោយដល់ថ្ងៃមង្គលការ', units: ['ថ្ងៃ', 'ម៉ោង', 'នាទី', 'វិនាទី'], over: 'ថ្ងៃមង្គលការមកដល់ហើយ',
    prog: 'កម្មវិធី', story: 'រឿងរ៉ាវស្នេហា', candle: 'ប៉ះទឹក ដើម្បីដាក់ផ្កាឈូកអណ្តែត', gallery: 'កម្រងរូបភាព', close: 'បិទ',
    venue: 'ទីតាំង', openMap: 'បើក Google Maps', saveCal: 'រក្សាទុកក្នុងប្រតិទិន', gift: 'ចំណងដៃ', saveQr: 'រក្សាទុក QR',
    thanksHead: 'សូមអរគុណ', shareHead: 'ចែករំលែកធៀបអញ្ជើញនេះ', shareTg: 'ផ្ញើតាម Telegram', shareMs: 'ផ្ញើតាម Messenger', shareFb: 'ផ្ញើតាម Facebook', copy: 'ចម្លងតំណភ្ជាប់', copied: 'បានចម្លងហើយ', credit: 'Design inspired by ynstudio',
  },
  en: {
    title: 'The Wedding Invitation', sub: 'សិរីសួស្តីអាពាហ៍ពិពាហ៍', tap: 'Tap to open', invite: 'You are warmly invited', scroll: 'Scroll',
    labels: ['Day', 'Date', 'Month', 'Year'], phG: 'Groom', phB: 'Bride', phV: 'Venue', phD: ['Day', 'Date', 'Month', 'Year'], phL: 'Lunar date',
    wordsHead: 'You are invited', parentsG: "Groom's parents", parentsB: "Bride's parents", mr: 'Mr.', mrs: 'and Mrs.',
    wordsDefault: 'Together with both our families\nwe warmly invite you\nto share in the joy of our wedding\nand to bless our new beginning.',
    groom: 'The Groom', bride: 'The Bride', coupleHead: 'The Couple',
    blessingDefault: 'Blessings · Happiness · Joy', countHead: 'Counting down to our day', units: ['Days', 'Hours', 'Minutes', 'Seconds'], over: 'Our day is here',
    prog: 'Programme', story: 'Our love story', candle: 'Touch the water to float a lotus lantern', gallery: 'Gallery', close: 'Close',
    venue: 'Venue', openMap: 'Open Google Maps', saveCal: 'Save to Calendar', gift: 'Wedding gift', saveQr: 'Save QR',
    thanksHead: 'Thank you', shareHead: 'Share this invitation', shareTg: 'Send via Telegram', shareMs: 'Send via Messenger', shareFb: 'Send via Facebook', copy: 'Copy link', copied: 'Link copied', credit: 'Design inspired by ynstudio',
  },
} as const;
