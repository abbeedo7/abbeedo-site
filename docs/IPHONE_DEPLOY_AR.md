# إدارة نشر ابوناصر 2.1 من الآيفون

الموقع **https://www.abbeedo.com** وتطبيق `/app` منشوران بالفعل. في **20 نوفمبر 2026** كانت المراجعة الحية `web-c4d68d97eb2c7944`؛ الموقع **2.1.0** والتطبيق **1.2.0**. المستودع [abbeedo7/abbeedo-site](https://github.com/abbeedo7/abbeedo-site) **Public** ومتاح، ومخزن Private Blob متصل، و`/api/health` يعيد **200** مع `storage: true` و`mediaConfigured: true`.

استخدم المستودع ومشروع Vercel الحاليين؛ خطوات إنشاء المستودع أو المخزن من جديد لم تعد مطلوبة. اعتمد المالك اختبار التعديلات المطلوبة ونشرها مباشرة عبر Vercel ضمن المهمة عند توفر الوصول.

## 1. حدّث المصدر الحالي

1. افتح [المستودع](https://github.com/abbeedo7/abbeedo-site) في Safari وسجّل الدخول إلى حساب `abbeedo7`. قد يساعد **طلب موقع سطح المكتب** من قائمة Safari.
2. لتعديل نص أو ملف صغير، افتح الملف واختر التعديل ثم راجع الفرق قبل **Commit changes**. للتغييرات الأوسع افتح **Code → Codespaces → Create codespace on main** إذا كانت الخدمة وحصتك متاحتين.
3. إذا كنت تستعيد المصدر من حزمة **abbeedo-com-Vercel-2.1.0.zip**، ارفعها إلى Codespaces ثم افتح **Terminal → New Terminal**. فكها من جذر المستودع الحالي:

```sh
unzip -o abbeedo-com-Vercel-2.1.0.zip
rm abbeedo-com-Vercel-2.1.0.zip
git status --short
git diff --stat
```

الحزمة تضع الملفات مباشرة في الجذر. راجع الفروق حتى لا تستبدل تعديلات أحدث بنسخة قديمة. يحذف `rm` ملف ZIP بعد فكه فقط.

4. أبقِ `package.json` و`vercel.json` في الجذر، مع `.github/workflows` و`windows/` و`release-assets/`. لا ترفع `.env` أو `.vercel` أو `node_modules` أو `windows/dist` أو EXE أو شهادات Samsung أو كلمات مرورها. أبقِ APK المدقق و`release-assets/android.json` ضمن المصدر.
5. اختبر التغيير في بيئة Node.js 22 ثم راجع الملفات واحفظ المصدر:

```sh
npm ci
npm run build
npm test
git status --short
git add .
git commit -m "Update abbeedo website"
git push origin main
```

رفع ZIP وحده إلى المستودع لا يحدث الموقع. ملفات Windows النهائية تُبنى في Actions ولا تدخل سجل Git.

## 2. انشر على مشروع الدومين الحالي

1. افتح [Vercel](https://vercel.com/dashboard)، واختر فريق **abbeedo** ثم مشروع **abbeedo-tv-1.1**.
2. راجع **Settings → Git**: إذا كان النشر من Git مستخدمًا، يجب أن يكون المستودع `abbeedo7/abbeedo-site` وفرع الإنتاج `main`. إذا لم يكن الربط مفعّلًا، يمكن ربط المستودع بالمشروع نفسه؛ النشر المباشر عبر Vercel معتمد أيضًا عند توفر الوصول.
3. راجع إعدادات البناء: **Other** وNode.js **22**، والجذر الذي فيه `package.json`، والتثبيت **npm ci** والبناء **npm run build**. إعداد المخرجات موجود في `vercel.json`.
4. تأكد من نجاح نشر **Production** ومن وصول المراجعة الجديدة إلى الدومين؛ المعاينة الناجحة وحدها لا تثبت تحديثه.

احتفظ بـ **www.abbeedo.com** أصلًا رئيسيًا وتحويل **abbeedo.com** إليه، وبمخزن **abbeedo-tv-private** ومتغيرات البيئة ومفاتيح التشفير والجلسات. المخزن متصل بالفعل؛ لا تنشئ بديلًا ولا تنقل بياناته أو أسراره إلى GitHub. عند عودة `HOSTING_CONFIG` اتبع [خطوات التعافي](DEPLOY_2_1_AR.md).

## 3. تحقّق من أول إصدار تنزيلات

نشر الموقع لا يثبت نجاح أول إصدار Windows وAndroid. افتح **Actions → Publish application downloads**. إذا لم يبدأ تلقائيًا من دفع المصدر، اختر **Run workflow → main → Run workflow** وانتظر نجاحه، ثم تحقق في **Releases** من:

- `abbeedo-TV-Android.apk` — أندرويد 3.9.4 المرفق بعد فحص البصمة.
- `abbeedo-TV-Setup.exe` — مثبت Windows 1.2.0.
- `abbeedo-TV-Portable.exe` — Windows 1.2.0 المحمول في ملف واحد.
- `releases.json` — الإصدارات والبصمات والأحجام.

يبني workflow نسختي Windows، ولا يعيد بناء Android أو يغيّر توقيعه. لا ينشر الإصدار للعامة قبل رفع الملفات الأربعة. عند الفشل راجع [دليل الإصدارات](RELEASES_GITHUB_AR.md). تعديلات `docs/**` و`README_AR.md` مستثناة من إعادة بناء البرامج.

## 4. اختبر الموقع والتطبيق

افتح الموقع https://www.abbeedo.com/ والتطبيق https://www.abbeedo.com/app وصفحة https://www.abbeedo.com/apps. تحقق من https://www.abbeedo.com/api/health ومن المراجعة الجديدة. بعد نجاح إصدار التنزيلات اختبر روابطه الثابتة. جرّب دخول مزود وتشغيل محتوى بحساب مصرح باستخدامه؛ health الناجح وحده لا يثبت نجاح هذا المسار.

إضافة الرئيسية للشاشة الرئيسية تبقيها موقع **ابوناصر / abbeedo**. لتثبيت **ابوناصر TV / abbeedo TV** افتح `/app` في Safari ثم **مشاركة → إضافة إلى الشاشة الرئيسية**. قد يلزم حذف الاختصار القديم وإضافته من المسار الصحيح لتجديد أيقونة iOS. الآيفون يستخدم PWA، وليس IPA موقعًا.

Windows يحتاج تثبيت **1.2.0** أول مرة لتفعيل المحدّث الأصلي؛ المحمول يستخدم Setup عند التحديث أيضًا. أندرويد يحتاج تثبيت **3.9.4** أول مرة لمسار التحديث الجديد، ثم تبقى موافقة مثبت النظام وإذن المصادر غير المعروفة عند طلبهما. Windows غير موقع، ولم يُختبر على جهاز فعلي. LG حزمة IPK، وSamsung حزمة WGT كاملة غير موقعة تحتاج شهادتي المالك والاختبار؛ راجع [دليل التلفزيون](TV_STORES_AR.md).
