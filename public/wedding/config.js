// ✏️ EDIT THIS FILE to personalise the invitation. No build step needed.
window.CONFIG = {
  groom: { km: "សុខា", en: "Sokha" },
  bride: { km: "ដារ៉ា", en: "Dara" },

  // Wedding day (ISO format, Cambodia time = +07:00)
  date: "2026-12-20T17:30:00+07:00",
  dateTextKm: "ថ្ងៃអាទិត្យ ទី២០ ខែធ្នូ ឆ្នាំ២០២៦",
  dateTextEn: "Sunday, 20 December 2026",

  venueKm: "សណ្ឋាគារ អង្គរ ផាឡេស ភ្នំពេញ",
  venueEn: "Angkor Palace Hotel, Phnom Penh",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=Phnom+Penh",

  // Programme: edit, add or remove rows
  schedule: [
    { time: "07:00", km: "ពិធីហែជំនួន", en: "Groom's procession" },
    { time: "09:00", km: "ពិធីមង្គលការ", en: "Wedding ceremony" },
    { time: "11:30", km: "ពិធីសូត្រមន្តនិងសំពះផ្ទឹម", en: "Blessing & Sampeah Pteah" },
    { time: "17:30", km: "ពិធីជប់លៀង", en: "Wedding dinner" }
  ],

  // Photos: put files in /images and list them here (leave [] for pretty placeholders)
  photos: [], // e.g. ["images/1.jpg", "images/2.jpg", "images/3.jpg"]

  // Background music: put music.mp3 next to index.html (optional)
  music: "music.mp3",

  // Gift QR (KHQR / ABA / Wing): save image as images/khqr.png (optional)
  khqrImage: "images/khqr.png",
  khqrNote: "ABA · 000 000 000 · SOKHA & DARA",

  // Supabase (see README). Leave blank to run in demo mode (saves in this browser only).
  supabaseUrl: "https://fdqrmzlnahrrqfervlde.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkcXJtemxuYWhycnFmZXJ2bGRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MDE1MzcsImV4cCI6MjEwNjA3NzUzN30.X4_P5yB4i2nM4IoyC7reKykMpsYghMQ-2qI1dsaGKXk"
};
