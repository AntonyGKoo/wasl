"use client";
import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes } from "react";
import { ArrowUpRight, LoaderCircle, X } from "lucide-react";
import { fieldLabels, profileFields, type Profile, type ProfileField } from "@/lib/types";
import { initials } from "@/lib/client";
export function Button({children,busy,variant="primary",className="",...props}:ButtonHTMLAttributes<HTMLButtonElement>&{busy?:boolean;variant?:"primary"|"secondary"|"ghost"|"danger"}) {
  return <button {...props} disabled={props.disabled||busy} className={`button ${variant} ${className}`}>{busy?<LoaderCircle size={17} className="spin"/>:null}{children}</button>;
}
export function Avatar({name,size="normal",color="ocean"}:{name:string;size?:"normal"|"large";color?:string}) {
  return <span className={`avatar ${size} ${color}`} aria-hidden="true">{initials(name)}</span>;
}
export function Brand(){return <span className="brand"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span>wasl<span className="arabic" lang="ar">وصل</span></span>;}
export function Notice({children,error=false}:{children:ReactNode;error?:boolean}){return <div className={`notice ${error?"error":""}`} role={error?"alert":"status"}>{children}</div>;}
export function Modal({title,description,children,onClose,wide=false}:{title:string;description?:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const before=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const focus=()=>ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    focus();
    function key(e:KeyboardEvent){
      if(e.key==="Escape")onClose();
      if(e.key!=="Tab")return;
      const items=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,a[href]')||[]).filter(el=>el.offsetParent!==null);
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
    document.addEventListener("keydown",key);
    return()=>{document.removeEventListener("keydown",key);document.body.style.overflow=before;previous?.focus();};
  },[onClose]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`modal ${wide?"wide":""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
    <header className="modal-heading"><div><h2>{title}</h2>{description?<p>{description}</p>:null}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></header>{children}
  </div></div>;
}
export function ProfileFields({value,onChange,compact=false}:{value:Profile;onChange:(value:Profile)=>void;compact?:boolean}){
  const fields=compact?profileFields.filter(f=>f!=="bio"):profileFields;
  return <div className="form-grid">{fields.map((field:ProfileField)=><label key={field} className={field==="bio"?"span-2":""}><span>{fieldLabels[field]}{field==="name"?" *":""}</span>{field==="bio"?<textarea value={value[field]} maxLength={1500} onChange={e=>onChange({...value,[field]:e.target.value})}/>:<input value={value[field]} required={field==="name"} type={field==="email"?"email":["website","linkedin","instagram"].includes(field)?"url":field==="phone"?"tel":"text"} placeholder={["website","linkedin","instagram"].includes(field)?"https://":""} maxLength={field==="name"?100:field==="phone"?50:field==="email"?254:200} onChange={e=>onChange({...value,[field]:e.target.value})}/>}</label>)}</div>;
}
export function ProfileLinks({profile}:{profile:Partial<Profile>}){
  const links=[profile.email?{label:profile.email,href:`mailto:${profile.email}`}:null,profile.phone?{label:profile.phone,href:`tel:${profile.phone.replace(/[^+\d]/g,"")}`}:null,...(["linkedin","instagram","website"] as const).filter(key=>profile[key]&&/^https?:\/\//i.test(profile[key]!)).map(key=>({label:key==="linkedin"?"LinkedIn":key==="instagram"?"Instagram":"Website",href:profile[key]!}))].filter((v):v is {label:string;href:string}=>!!v);
  return <div className="profile-links">{links.map(link=><a key={link.href} href={link.href} target={link.href.startsWith("http")?"_blank":undefined} rel="noopener noreferrer">{link.label}<ArrowUpRight size={15}/></a>)}</div>;
}
