import { raw } from "hono/html";
import type { Settings } from "../lib/settings";

export type BrowserEvent = {
  name: string;
  id: string;
  params?: Record<string, unknown>;
  /** একই ব্রাউজারে একবারই (যেমন ধন্যবাদ পেজ রিফ্রেশ করলে Lead আবার যাবে না) */
  once?: boolean;
};

/** <script> এর ভিতরে নিরাপদে JSON বসানো */
function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/**
 * Facebook Pixel (ব্রাউজার)। প্রতিটা ইভেন্টে সার্ভারের সাথে একই eventID।
 * Pixel ID সেট না থাকলে কিছুই লোড হয় না।
 */
export const PixelHead = ({ settings, deviceId, events }: { settings: Settings; deviceId: string; events: BrowserEvent[] }) => {
  const id = settings.fb_pixel_id;
  if (!id) {
    return raw(`<script>window.fshopTrack=function(){};</script>`);
  }
  return raw(`<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', ${safeJson(id)}, {external_id: ${safeJson(deviceId)}});
window.fshopTrack=function(name,params,eventId){fbq('track',name,params||{},{eventID:eventId});};
(function(evs){evs.forEach(function(e){
  if(e.once){try{var k='fbev_'+e.id;if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1');}catch(x){}}
  window.fshopTrack(e.name,e.params,e.id);
});})(${safeJson(events)});
</script>`);
};
