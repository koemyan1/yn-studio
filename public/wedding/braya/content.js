// Default content for the "Braya" theme. Admin can change everything visually at /wedding/braya/?edit=1
// (changes are saved to Supabase / downloaded as a new content.js — this file is just the starting point).
window.BRAYA_DEFAULT = {
  theme: "braya",
  colors: { accent: "#c8603f", text: "#8a6414", muted: "#8a6a20", card: "rgba(255,252,244,0.78)", gold: "#c9a96a", goldLight: "#f2dc98" },
  fonts: { heading: "pali" },
  bgImage: "img/garden-bg.png",
  show: { couple: true, calendar: true, countdown: true, schedule: true, venue: true, gallery: true, gift: true, thanks: true, ending: true },

  cover: {
    bgImage: "img/cover-bg.png",
    video: "https://www.braya-malis.love/videos/vid-3.mp4",
    names: "Braya\nMalis",
    guestLabel: "សូមគោរពអញ្ជើញ",
    guestDefault: "ភ្ញៀវកិត្តិយស",
    btnKm: "សូមចុចបើកសំបុត្រ",
    btnEn: "Click to Open The Invitation"
  },
  music: "https://www.braya-malis.love/music/song-2.mp3",

  intro: {
    title: "សិរីមង្គលអាពាហ៍ពិពាហ៍",
    line: "យើងខ្ញុំមានកិត្តិយសសូមគោរពអញ្ជើញ",
    text: "ឯកឧត្តម លោកជំទាវ លោកអ្នកឧកញ៉ា អ្នកឧកញ៉ា ឧកញ៉ា លោក លោកស្រី អ្នកនាង កញ្ញា និងប្រិយមិត្ត អញ្ជើញចូលរួមជាភ្ញៀវកិត្តិយស ដើម្បីប្រសិទ្ធពរជ័យ សិរីសួស្តី ជ័យមង្គលក្នុងសិរី មង្គលពិធីមង្គលការ កូនប្រុស-កូនស្រីរបស់យើងខ្ញុំ។"
  },
  groom: { km: "ប្រាយ៉ា", en: "CHEAT CHANCHAOBRAYA", role: "កូនកំលោះ", photo: "https://www.braya-malis.love/images/braya-1.png" },
  bride: { km: "ម៉ាលីស", en: "KHEANG JUTIMONMALIS", role: "កូនក្រមុំ", photo: "https://www.braya-malis.love/images/malis-1.png" },
  andText: "និង",

  date: "2026-11-19T17:00:00+07:00",
  dateKm: "ថ្ងៃព្រហស្បតិ៍ ទី១៩ ខែវិច្ឆិកា ឆ្នាំ២០២៦ វេលាម៉ោង ៥:០០ ល្ងាច",
  lunarKm: "ត្រូវនឹងថ្ងៃ ទី១០ កើត ខែកត្តិក ឆ្នាំមមី អដ្ឋស័ក ពុទ្ធសករាជ ២៥៦៩",

  calendar: { km: "កាលបរិច្ឆេទ", en: "Save the Date" },
  countdown: { km: "រាប់ថយក្រោយ", en: "Countdown" },

  scheduleTitle: { km: "កាលវិភាគពិធីមង្គលការ", en: "Schedule" },
  schedule: [
    { time: "៦:៣០ ព្រឹក", text: "ជួបជុំភ្ញៀវកិត្តិយសរៀបចំពិធីហែជំនូន", icon: "https://www.braya-malis.love/images/e-1.PNG" },
    { time: "៧:០០ ព្រឹក", text: "ពិធីហែជំនូន", icon: "https://www.braya-malis.love/images/e-2.PNG" },
    { time: "៧:៣០ ព្រឹក", text: "ពិធីរៀបរាប់ផ្លែឈើ", icon: "https://www.braya-malis.love/images/e-3.PNG" },
    { time: "៨:០០ ព្រឹក", text: "ពិធីបំពាក់ចិញ្ចៀន", icon: "https://www.braya-malis.love/images/e-4.PNG" },
    { time: "៨:៤០ ព្រឹក", text: "ពិធីសូត្រមន្តចម្រើនព្រះបរិត្ត", icon: "https://www.braya-malis.love/images/e-5.PNG" },
    { time: "៩:៣០ ព្រឹក", text: "ពិធីចម្រើនកេសាកេសី", icon: "https://www.braya-malis.love/images/e-6.PNG" },
    { time: "១០:៥០ ថ្ងៃត្រង់", text: "ពិធីសំពះផ្ទឹម សែនចងដៃ", icon: "https://www.braya-malis.love/images/e-7.PNG" },
    { time: "១១:៣០ ថ្ងៃត្រង់", text: "អញ្ជើញភ្ញៀវកិត្តិយសពិសារអាហារថ្ងៃត្រង់", icon: "https://www.braya-malis.love/images/e-8.PNG" },
    { time: "៥:០០ ល្ងាច", text: "អញ្ជើញភ្ញៀវកិត្តិយសពិសារភោជនាអាហារពេលល្ងាច", icon: "https://www.braya-malis.love/images/e-9.PNG" }
  ],

  venue: {
    km: "ទីតាំងកម្មវិធី", en: "Venue",
    nameKm: "សេវេនប្រាយឃីង (ទល់មុខសាលាបឋមទួលគោក)", nameEn: "Seven Bright King",
    mapUrl: "https://maps.app.goo.gl/CATJwpn1kcq6gHum8",
    mapBtn: "បើកផែនទី · Open Map",
    youtube: "https://www.youtube.com/embed/UxWxprF7P68"
  },

  galleryTitle: { km: "វិចិត្រសាល", en: "PHOTO GALLERY" },
  gallery: [
    "1_IMG_9145.PNG", "3_IMG_9143.PNG", "4_IMG_9148.PNG", "8_IMG_2850.PNG", "IMG_2852.PNG", "IMG_2872.jpg", "IMG_2875.jpg",
    "IMG_2990.JPG", "IMG_2992.JPG", "IMG_2996.JPG", "IMG_2997.JPG", "IMG_9141.PNG", "RAK_4539.jpg", "RAK_5016.jpg", "RAK_5062.JPG"
  ].map((f) => "https://www.braya-malis.love/images/gallery/" + f),

  gift: {
    km: "ចំណងដៃឌីជីថល", en: "Wedding Gift",
    introKm: "សួស្ដីនេះជាព័ត៌មានគណនេយ្យ ABA របស់ពួកខ្ញុំ", introEn: "(Hello Here is Our ABA Information)",
    holderLabel: "ម្ចាស់គណនី", holder: "KHEANG JUTIMONMALIS",
    account: "", qr: "https://www.braya-malis.love/images/malis-qr-v2.jpg"
  },

  thanks: {
    km: "សេចក្តីថ្លែងអំណរគុណនិងសូមអភ័យទោស", en: "OUR GRATITUDE AND APOLOGY",
    textKm: "យើងខ្ញុំជាមាតាបិតាកូនទាំងពីរសូមថ្លែងអំណរគុណយ៉ាងជ្រាលជ្រៅចំពោះវត្តមានដ៏ឧដុង្គឧត្តមរបស់ ឯកឧត្តម លោកជំទាវ លោកអ្នកឧកញ៉ា អ្នកឧកញ៉ា ឧកញ៉ា លោក លោកស្រី អ្នកនាង កញ្ញា ដែលបានអញ្ជើញចូលរួមជាកិត្តិយសក្នុងពិធីសិរីសួស្ដីអាពាហ៍ពិពាហ៍កូនប្រុសកូនស្រីរបស់យើងខ្ញុំនាពេលខាងមុខនេះ។ យើងខ្ញុំសូមការខន្តីអភ័យទោសដែលពុំបានជូនលិខិតអញ្ជើញនេះដោយផ្ទាល់។ ដោយគារវកិច្ចដ៏ខ្ពង់ខ្ពស់ពីយើងខ្ញុំ",
    textEn: "We are extremely thankful for H.E., L.C.T. Neak Okhna, Okhna, ladies and gentlemen for your presence at the wedding of our son and daughter. Please accept our sincere apology for not delivering this invitation in person. With our highest respect."
  },

  ending: { video: "https://www.braya-malis.love/videos/vid-3.mp4", text: "19 November 2026" }
};
