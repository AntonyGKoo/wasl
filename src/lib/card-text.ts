import { blankProfile } from "./types";
export function parseCardText(text:string){
  const lines=text.split(/[\n\r]+/).map(l=>l.trim()).filter(Boolean);
  return {...blankProfile,
    name:lines.find(l=>!l.includes("@")&&!/https?:|^\+?\d/.test(l))?.slice(0,100)||"",
    email:text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||"",
    phone:text.match(/(?:\+\d[\d ()-]{7,}\d|\b\d[\d ()-]{8,}\d\b)/)?.[0]||"",
    website:text.match(/https?:\/\/[^\s<>]+/i)?.[0]||"",
  };
}
