// `qrcode` ships no type declarations and the project does not install @types/qrcode.
// Invitations.tsx imports it dynamically and casts the result to `any`, so a shorthand declaration is all tsc needs.
declare module 'qrcode';
