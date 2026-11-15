import type { ShopState } from "../../platform/billing";
import { Icon } from "./icons";
import { PageHead } from "./ui";

/** দোকানদারের ইমেইল আর মোবাইল যাচাই */
export const VerifyPage = (p: { state: ShopState; email: string; phone: string; emailReady: boolean; smsReady: boolean; otpSent?: boolean }) => {
  const v = p.state.verify ?? { email: true, phone: true };
  const done = v.email && v.phone;
  return (
    <>
      <PageHead title="দোকান যাচাই" desc="প্রতারণা ঠেকাতে নতুন দোকানের ইমেইল আর মোবাইল যাচাই করা হয় — এতে SellxBD-এর সব দোকানের ক্রেতা নিরাপদ থাকে। যাচাই শেষ হলে অর্ডার নেওয়া চালু হবে আর দোকান Google-এ দেখাবে।" />
      {done ? (
        <div class="sa-card verify-done"><Icon name="circle-check-big" /> <b>যাচাই শেষ।</b> দোকানে অর্ডার নেওয়া চালু আছে। (পরিবর্তন দেখাতে ১ মিনিট পর্যন্ত লাগতে পারে)</div>
      ) : null}
      <div class="verify-grid">
        <section class={`sa-card verify-card${v.email ? " ok" : ""}`}>
          <h3><Icon name="mail" size="sm" /> ইমেইল {v.email ? <span class="pill pill-ok">যাচাই হয়েছে</span> : <span class="pill pill-warn">বাকি</span>}</h3>
          <p class="muted">{p.email}</p>
          {!v.email && (p.emailReady ? (
            <form method="post" action="/admin/verify/email">
              <p class="small">ইমেইলে একটা লিংক পাঠানো হয়েছে — সেটায় চাপলেই যাচাই। না পেলে স্প্যাম ফোল্ডার দেখুন বা আবার পাঠান।</p>
              <button class="btn btn-outline"><Icon name="send" size="sm" /> লিংক আবার পাঠান</button>
            </form>
          ) : <p class="small muted">ইমেইল পাঠানোর ব্যবস্থা এখনো চালু হয়নি — SellxBD সাপোর্টে জানান।</p>)}
        </section>
        <section class={`sa-card verify-card${v.phone ? " ok" : ""}`}>
          <h3><Icon name="smartphone" size="sm" /> মোবাইল {v.phone ? <span class="pill pill-ok">যাচাই হয়েছে</span> : <span class="pill pill-warn">বাকি</span>}</h3>
          <p class="muted">{p.phone}</p>
          {!v.phone && (p.smsReady ? (
            <>
              <form method="post" action="/admin/verify/phone/send">
                <button class="btn btn-outline"><Icon name="send" size="sm" /> {p.otpSent ? "কোড আবার পাঠান" : "কোড পাঠান"}</button>
              </form>
              <form method="post" action="/admin/verify/phone" class="verify-otp">
                <label class="field"><span>SMS-এ আসা ৬ অঙ্কের কোড</span>
                  <input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength={6} pattern="[0-9০-৯]{6}" placeholder="১২৩৪৫৬" required /></label>
                <button class="btn btn-primary"><Icon name="check" size="sm" /> যাচাই করুন</button>
              </form>
            </>
          ) : <p class="small muted">SMS পাঠানোর ব্যবস্থা এখনো চালু হয়নি — SellxBD সাপোর্টে জানান।</p>)}
        </section>
      </div>
      <p class="muted small">নম্বর বা ইমেইল ভুল দিয়ে থাকলে SellxBD সাপোর্টে জানান — যাচাই করে ঠিক করে দেওয়া হবে।</p>
    </>
  );
};
