# Solar

تطبيق عربي RTL لإدارة ومراقبة منظومة الطاقة الشمسية المنزلية، مبني على Next.js App Router وPrisma/PostgreSQL.

## البنية الحالية

```
الإنفرتر
   ↓
Gateway محلي (ESP32 / Raspberry Pi / Wi‑Fi dongle أو جهاز محلي مناسب)
   ↓ HTTPS + Authorization: Bearer <TELEMETRY_INGEST_TOKEN>
/api/telemetry
   ↓
Prisma / PostgreSQL
   ↓
لوحة Solar
```

Vercel لا يتصل مباشرة بمنفذ USB/RS485 أو COM الموجود داخل المنزل. القراءة الفعلية من الإنفرتر تتم محلياً، والـ Gateway يحوّل القراءات إلى صيغة telemetry الموحدة ويرسلها إلى التطبيق.

## Telemetry API

المسار المخصص لاستقبال بيانات الـ Gateway هو:

`POST /api/telemetry`

يجب إرسال:

```http
Authorization: Bearer <TELEMETRY_INGEST_TOKEN>
Content-Type: application/json
```

مثال payload:

```json
{
  "timestamp": "2026-09-29T12:00:00.000Z",
  "pv_power": 4200,
  "load_power": 3350,
  "battery_soc": 78,
  "battery_power": 850,
  "battery_voltage": 51.2,
  "battery_current": 16.6,
  "battery_temperature": 28,
  "grid_status": false,
  "grid_power": 0,
  "source": "inverter"
}
```

في Solar، القيمة الموجبة لـ `battery_power` و`battery_current` تعني الشحن، والقيمة السالبة تعني التفريغ. يجب على الـ Gateway تطبيع إشارة الإنفرتر وفق هذه القاعدة قبل الإرسال.

## المصادقة

- صفحات التطبيق محمية بجلسة المتصفح.
- `/api/auth/*` و`/api/telemetry` مستثناة من حماية middleware.
- استقبال telemetry لا يعتمد على Cookie؛ يعتمد على Bearer Token.
- جلسة المتصفح موقعة باستخدام Web Crypto، لذلك `verifySessionToken` متوافق مع Edge middleware.
- صفحة تسجيل الدخول ترفض قيم `next` التي تبدأ بـ `//`، ويوجد حد لمحاولات الدخول الفاشلة.

## قاعدة البيانات

Prisma هو مصدر البيانات الأساسي.

المتغير الأساسي هو:

`DATABASE_URL`

ويتم تطبيق migrations في build production قبل توليد Prisma Client وبناء Next.js:

```bash
prisma migrate deploy
node scripts/prisma-generate.mjs
next build
```

للتطوير:

```bash
npm run db:migrate
npm run db:generate
npm run typecheck
npm run lint
npm run build
```

المجلد `prisma/migrations` يحتوي migrations الخاصة بالطاقة، إعدادات الإنفرتر، الـ Gateway، الرقم التسلسلي، العملة SYP، وإعدادات Safe Zone.

## Secrets

لا تضع أي secret داخل الواجهة أو متغيرات `NEXT_PUBLIC_*`.

### متغيرات Vercel

أضف القيم التالية في **Project → Settings → Environment Variables** لكل بيئة تريد تشغيلها:

- `DATABASE_URL` — رابط PostgreSQL المستخدم من Prisma. هو المتغير الأساسي؛ لا حاجة إلى `PRISMA_DATABASE_URL` أو `POSTGRES_URL` عند ضبطه.
- `SOLAR_AUTH_SECRET` — مفتاح عشوائي قوي لتوقيع الجلسات.
- بيانات دخول واحدة على الأقل: `SOLAR_AUTH_USERNAME` مع `SOLAR_AUTH_PASSWORD` (أو `SOLAR_PASSWORD_HASH` بدلاً من كلمة المرور)، أو `SOLAR_OWNER_USER` مع `SOLAR_OWNER_PASSWORD`.
- `SMARTESS_USERNAME` و`SMARTESS_PASSWORD` و`SMARTESS_PN` — حساب SmartESS للدنجل؛ يعتمده اتصال الإنفرتر تلقائياً ما لم يُحفظ حساب من صفحة الإعدادات.
- `TELEMETRY_INGEST_TOKEN` — مطلوب إذا كان الـ Gateway سيرسل القراءات إلى `/api/telemetry`.
- `CRON_SECRET` — مطلوب إذا كان مجدول خارجي يستدعي `/api/telemetry/sync`. يجب أن يكون 16 حرفاً على الأقل؛ أرسله في ترويسة `Authorization: Bearer <secret>`.
- `INVERTER_CONFIG_SECRET` — موصى به كمفتاح عشوائي مستقل لتشفير إعدادات الإنفرتر؛ يمكن للتطبيق استخدام `AUTH_SECRET` عند غيابه.

أنشئ قيمة مختلفة لكل مفتاح سري، ولا تستخدم القيم التوضيحية في `.env.example`. أضف القيم الحساسة إلى Vercel مباشرة ولا ترسلها أو تحفظها في Git. استخدم قاعدة بيانات منفصلة لبيئة Preview إذا كانت مفعلة.

متغيرات اختيارية بحسب التكامل:

- `SOLAR_SESSION_EPOCH` — غيّره لإبطال كل الجلسات الحالية.
- `SOLAR_GATEWAY_URL` و`SOLAR_GATEWAY_TOKEN` — قيم احتياطية لاتصال الـ Gateway عند عدم حفظها في إعدادات التطبيق.
- `SOLAR_DESSMONITOR_URL` — عنوان SmartESS/DESSMonitor بديل عند الحاجة.

ضع قيمة `TELEMETRY_INGEST_TOKEN` نفسها في الـ Gateway تحت `SOLAR_TELEMETRY_TOKEN`. لا تضبط `SOLAR_MOCK_INVERTER=true` في Production.

## Drivers والإنفرترات

الـ Gateway هو المكان الصحيح لتعريف بروتوكول الإنفرتر:

- `voltronic_pi30`: بروتوكول QPI/PI30 لإنفرترات Axpert/MPP/MAST المتوافقة.
- `modbus_generic`: Modbus RTU/TCP فقط عندما يكون Register Profile الخاص بالموديل معروفاً وموثوقاً.

لا يتم اعتبار نتيجة discovery الرقمية دليلاً على أن Register Map موثقة من الشركة المصنعة.

## ملاحظات مهمة

- لا يوجد endpoint بديل لاستقبال بيانات الإنفرتر خارج `/api/telemetry`.
- لا تستخدم Cookie من الـ Gateway.
- لا يتم اختراع Register Map لإنفرتر غير محدد الموديل.
- اختبار الـ Fake Modbus لا يعني أن الاتصال بالإنفرتر الحقيقي تم اختباره.