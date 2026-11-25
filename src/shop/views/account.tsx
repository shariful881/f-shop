/** নিজের অ্যাকাউন্ট (পাসওয়ার্ড বদল, সব ডিভাইস থেকে লগআউট) আর পাসওয়ার্ড ভুলে গেলে — security/step-3 */
import { ROLE_LABEL, type Role } from "../lib/auth";
import { bn } from "../lib/format";

export const AccountPage = (p: { email: string; name: string; role: Role; sessions: number; support: boolean; errors?: Record<string, string> }) => {
  const e = p.errors ?? {};
  return (
    <>
      <h1>আমার অ্যাকাউন্ট</h1>
      <div class="panel">
        <p style="margin:0"><strong>{p.name}</strong> · {p.email} · <span class="pill">{ROLE_LABEL[p.role]}</span></p>
      </div>

      <div class="panel">
        <h2>পাসওয়ার্ড বদলান</h2>
        {p.support ? (
          <p class="muted">সাপোর্ট মোডে (সুপার অ্যাডমিন থেকে ঢুকলে) দোকানদারের পাসওয়ার্ড বদলানো যায় না।</p>
        ) : (
          <form method="post" action="/admin/account/password" class="order-form" style="max-width:420px">
            {e.form && <div class="alert alert-error">{e.form}</div>}
            <label class="field"><span>এখনকার পাসওয়ার্ড</span><input type="password" name="current" required autocomplete="current-password" />{e.current && <small class="error">{e.current}</small>}</label>
            <label class="field"><span>নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)</span><input type="password" name="password" required minlength={8} maxlength={200} autocomplete="new-password" />{e.password && <small class="error">{e.password}</small>}</label>
            <label class="field"><span>নতুন পাসওয়ার্ড আবার</span><input type="password" name="password2" required minlength={8} maxlength={200} autocomplete="new-password" />{e.password2 && <small class="error">{e.password2}</small>}</label>
            <button class="btn btn-primary">পাসওয়ার্ড বদলান</button>
            <p class="muted small">বদলালে এই ডিভাইস ছাড়া বাকি সব জায়গা থেকে আপনি লগআউট হয়ে যাবেন।</p>
          </form>
        )}
      </div>

      <div class="panel">
        <h2>সব ডিভাইস থেকে লগআউট</h2>
        <p class="muted">
          {p.sessions > 1
            ? `এই ডিভাইস ছাড়া আরও ${bn(p.sessions - 1)}টা জায়গায় আপনি লগইন করা আছেন।`
            : "এই ডিভাইস ছাড়া আর কোথাও আপনি লগইন করা নেই।"}{" "}
          ফোন হারালে বা অন্যের কম্পিউটারে লগইন করে থাকলে এটা চাপুন।
        </p>
        <form method="post" action="/admin/account/logout-others" data-confirm="এই ডিভাইস ছাড়া বাকি সব জায়গা থেকে লগআউট করবেন?">
          <button class="btn btn-outline" disabled={p.sessions <= 1}>বাকি সব ডিভাইস থেকে লগআউট</button>
        </form>
      </div>
    </>
  );
};

export const ForgotPage = (p: { sent?: boolean; error?: string; email?: string; unavailable?: boolean }) => (
  <div class="login-box">
    <div class="login-brand"><span class="mark">S</span>SellxBD</div>
    <h1>পাসওয়ার্ড ভুলে গেছেন?</h1>
    {p.sent ? (
      <div class="alert alert-ok">এই ইমেইলে দোকানের অ্যাকাউন্ট থাকলে নতুন পাসওয়ার্ড দেওয়ার লিংক পাঠানো হয়েছে (৩০ মিনিট কাজ করবে)। ইনবক্স আর স্প্যাম দেখুন।</div>
    ) : p.unavailable ? (
      <div class="alert alert-error">এখন ইমেইল পাঠানো যাচ্ছে না। SellxBD সাপোর্টে (WhatsApp 01724212271) যোগাযোগ করুন।</div>
    ) : (
      <>
        <p class="muted small" style="text-align:center;margin:0">লগইনের ইমেইল দিন — নতুন পাসওয়ার্ড দেওয়ার লিংক পাঠানো হবে</p>
        {p.error && <div class="alert alert-error">{p.error}</div>}
        <form method="post" action="/admin/forgot" class="order-form">
          <label class="field"><span>ইমেইল</span><input type="email" name="email" value={p.email ?? ""} required autocomplete="username" /></label>
          <button class="btn btn-primary btn-block">লিংক পাঠান</button>
        </form>
      </>
    )}
    <p class="small" style="text-align:center"><a href="/admin/login">লগইনে ফিরুন</a></p>
  </div>
);

export const ResetPage = (p: { token: string; email?: string; error?: string; invalid?: boolean }) => (
  <div class="login-box">
    <div class="login-brand"><span class="mark">S</span>SellxBD</div>
    <h1>নতুন পাসওয়ার্ড</h1>
    {p.invalid ? (
      <>
        <div class="alert alert-error">লিংকটা আর কাজ করছে না (মেয়াদ শেষ বা আগেই ব্যবহার হয়েছে)।</div>
        <p class="small" style="text-align:center"><a href="/admin/forgot">নতুন লিংক চান</a></p>
      </>
    ) : (
      <>
        {p.email && <p class="muted small" style="text-align:center;margin:0">{p.email}</p>}
        {p.error && <div class="alert alert-error">{p.error}</div>}
        <form method="post" action="/admin/reset" class="order-form">
          <input type="hidden" name="t" value={p.token} />
          <label class="field"><span>নতুন পাসওয়ার্ড (কমপক্ষে ৮ অক্ষর)</span><input type="password" name="password" required minlength={8} maxlength={200} autocomplete="new-password" /></label>
          <label class="field"><span>আবার লিখুন</span><input type="password" name="password2" required minlength={8} maxlength={200} autocomplete="new-password" /></label>
          <button class="btn btn-primary btn-block">পাসওয়ার্ড সেভ করুন</button>
        </form>
      </>
    )}
  </div>
);
