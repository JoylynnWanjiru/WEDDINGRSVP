// QR codes for gate passes (PROJECT_SPEC §2, §9). Dark wine on white: high contrast
// scans reliably on cheap phone cameras in daylight.

import QRCode from "qrcode";

const OPTIONS = { errorCorrectionLevel: "M" as const, color: { dark: "#28030A", light: "#FFFFFF" } };

/** For the pass page. */
export const qrSvg = (text: string): Promise<string> => QRCode.toString(text, { ...OPTIONS, type: "svg", margin: 1 });

/** For email attachments (Gmail blocks data: URIs and SVG). */
export const qrPng = (text: string): Promise<Buffer> => QRCode.toBuffer(text, { ...OPTIONS, type: "png", margin: 2, width: 480 });
