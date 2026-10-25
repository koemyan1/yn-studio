// `qrcode` ships no type declarations and the project does not install @types/qrcode.
// WalletTransfer.tsx imports it dynamically and casts the result to `any`, so a shorthand declaration is all tsc needs.
declare module 'qrcode';
