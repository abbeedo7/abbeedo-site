# رفع المشروع وربط التحديثات من الآيفون

## أنشئ المستودع

1. افتح [GitHub](https://github.com/new) في Safari وسجّل الدخول.
2. اكتب اسم المستودع **abbeedo-site**. يمكن جعله **Private**.
3. فعّل **Add a README file**، ثم اضغط **Create repository**.

## ارفع الملفات

فك ضغط الملف في تطبيق «الملفات». من GitHub اختر **Add file → Upload files** إذا استطعت رفع المجلدات بمساراتها. يجب أن ترى package.json مباشرة في جذر المستودع، وبجانبه src وpublic وapplication وapi وscripts. لا يكفي رفع ZIP كملف داخل المستودع.

إذا منعك الجوال من رفع المجلدات، استخدم بيئة GitHub عبر Safari:

1. افتح المستودع واضغط الزر الأخضر **Code → Codespaces → Create codespace on main**. قد يساعد اختيار «طلب موقع سطح المكتب» من Safari.
2. بعد فتح المحرر، من قائمة مستكشف الملفات اختر رفع ملف **Upload** وارفع **abbeedo-com-Vercel-Ready.zip** إلى جذر المشروع.
3. افتح **Terminal → New Terminal**، والصق الأوامر التالية في جذر المستودع:

    unzip -o abbeedo-com-Vercel-Ready.zip
    rm abbeedo-com-Vercel-Ready.zip
    git add .
    git commit -m "Publish abbeedo TV website"
    git push

الحزمة تحتوي الملفات مباشرة، فلا تحتاج نقل مجلد داخلي. أمر rm يزيل ZIP بعد فكه فقط. استخدام Codespaces مرتبط بتوفر حصتك المجانية وإعدادات حسابك؛ يمكن رفع المجلدات بالطريقة العادية إن كانت متاحة على جهازك.

## اربطه بمشروع الدومين الحالي

1. افتح [لوحة Vercel](https://vercel.com/dashboard).
2. اختر **المشروع الذي يظهر فيه abbeedo.com حاليًا**. استخدام المشروع نفسه يحافظ على إعدادات الدومين ومتغيرات التخزين.
3. من **Settings → Git** اختر **Connect Git Repository** ثم abbeedo-site. امنح تطبيق Vercel الوصول إلى المستودع إذا طلب GitHub ذلك.
4. اختر فرع الإنتاج **main**، ثم تحقق من **Settings → Build and Deployment**:
   - Framework: **Other**.
   - Root Directory: جذر المستودع.
   - Install Command: **npm ci**.
   - Build Command: **npm run build**.
   - Node.js: **22**.
5. نفّذ **Deploy** أو **Redeploy** عند الربط الأول، وانتظر نجاحه قبل الاختبار.
6. من **Settings → Domains** تأكد أن abbeedo.com وwww.abbeedo.com تابعان للمشروع. احتفظ بالتحويل الرئيسي الحالي إلى www إن كان موجودًا، كي يبقى أصل بيانات التطبيق المثبت نفسه.

## اربط التخزين الخاص

الموقع التجاري وروابط التنزيل تعملان دون مخزن حسابات. تسجيل الاشتراك والمشاهدة والربط داخل /app تحتاج مخزنًا دائمًا:

1. افتح **Storage** في مشروع Vercel.
2. إذا يوجد مخزن **Private Blob** متصل فاحتفظ به؛ لا تستبدله بمخزن فارغ.
3. إذا لا يوجد مخزن، أنشئ **Blob → Private** واربطه بالمشروع وبيئة **Production**.
4. تحقق من إضافة **BLOB_READ_WRITE_TOKEN** تلقائيًا إلى **Environment Variables**، ثم نفّذ **Redeploy**. لا تضع قيمة المفتاح في GitHub أو JavaScript ولا ترسله في المحادثة.
5. افتح https://www.abbeedo.com/api/health. يجب أن تظهر **storage: true** و**mediaConfigured: true**.

## بعد الربط

عدّل ملفًا من GitHub بالضغط على القلم ثم **Commit changes** إلى main. بعد كل Commit ناجح، يبني Vercel المشروع تلقائيًا ويحدث الدومين نفسه. لست بحاجة لتكرار الربط أو رفع ZIP من البداية.

الإصدارات الرسمية الجديدة لأندرويد وويندوز تظهر في صفحة التنزيل عبر التغذية المباشرة، وروابطها وباركوداتها ثابتة. يتأخر ظهورها بقدر نشر التغذية وفترة التحقق في الصفحة المفتوحة، وهي دقيقة تقريبًا.

التحديثات التي نجهزها هنا تصل تلقائيًا بعد حفظ المصدر في المستودع المرتبط. لم تُمنح لهذه الجلسة صلاحية الكتابة إلى حسابك أو مستودعك، ولذلك لم يتغير الدومين الحي بعد.
