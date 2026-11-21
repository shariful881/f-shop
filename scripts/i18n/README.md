# দুই ভাষা (বাংলা/ইংরেজি) — অনুবাদের অভিধান

কোড বাংলাতেই লেখা থাকে। দোকান বা প্যানেল ইংরেজিতে থাকলে পেজ তৈরির পর
`src/shop/i18n/en.json` দেখে বাংলা লেখা ইংরেজি হয় (`src/shop/i18n/index.ts`)।

নতুন বাংলা লেখা যোগ করলে:

1. নতুন লেখা খোঁজা: `node scripts/i18n/extract.cjs $(ls src/shop/views/*.tsx src/shop/routes/*.tsx src/shop/lib/*.ts public/js/*.js)`
   → `strings.json`; অভিধানে নেই এমনগুলো বের করুন।
2. ইংরেজি যোগ করুন `scripts/i18n/extra.json`-এ: `"বাংলা লেখা": "English"`।
   - সংখ্যার জায়গায় `{n}`, কোডের পরিবর্তনশীল অংশের জায়গায় `{x}` (ক্রম বদলালে `{x1}`, `{x2}`)।
3. `node scripts/i18n/build.cjs` → `en.json`, `en-client.json`, `en-site.json` তৈরি হয়।

অভিধানে না থাকলে লেখা বাংলাতেই দেখায় — কিছু ভাঙে না।
