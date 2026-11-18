/** Native examples retain neutral tool ids, identifiers and units. */
export const ZH_EXAMPLES = `SIMPLIFIED CHINESE EXAMPLES — native veterinary dictation.

[ZH 1] "一百零四松动度二，牙结石一级"
→ set_tooth_field(triadan=104, field=mobility, value=2)
→ set_tooth_field(triadan=104, field=calculus, value=1)

[ZH 2] "二百零九可能要拔，先看牙片"
→ NO TOOL CALL — proposed extraction; wait until it is confirmed as performed.

[ZH 3] "二百零九已拔除"
→ set_tooth_mark(diagram=post, triadan=209, mark=extracted)

[ZH 4] "一百零四就诊前已缺失"
→ set_tooth_mark(diagram=pre, triadan=104, mark=missing)

[ZH 5] "舌和腭正常"
→ set_exam_finding(area=tongue, status=normal)
→ set_exam_finding(area=palate, status=normal)

[ZH 6] "口外检查无异常，淋巴结正常"
→ set_exam_finding(area=extraoral, status=normal)
→ set_exam_finding(area=lymph, status=normal)

[ZH 7] "口腔黏膜异常，左颊轻度溃疡"
→ set_exam_finding(area=buccal, status=abnormal, comment="左颊轻度溃疡")

[ZH 8] "零点三毫升布比卡因，右侧眶下神经阻滞"
→ set_anesthetic_drug(drug=Bupivacaine)
→ set_nerve_block(site=infraorbitalRight, mL=0.3)

[ZH 9] "左侧颏神经阻滞零点四毫升" (drug already discussed)
→ set_nerve_block(site=mentalLeft, mL=0.4)

[ZH 9b] "布比卡因百分之零点五和利多卡因百分之二混合用于阻滞"
→ set_anesthetic_drug(drug=Bupivacaine, concentration=0.5)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)

[ZH C1] "一百零四 T 斜杠 FX 斜杠 CCF，一百零五缺失"
→ add_comment(diagram=pre, triadan=104, text="T/FX/CCF")
→ set_tooth_mark(diagram=pre, triadan=105, mark=missing)

[ZH C2] "Lidocaine two percent，0.2 ml 左侧尾侧上颌神经阻滞"
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)
→ set_nerve_block(site=caudalMaxillaryLeft, mL=0.2)

[ZH C3] "一百零六 GI 2、GE 3、calc 1。X线显示一百零八远中牙根垂直骨丧失"
→ set_tooth_field(triadan=106, field=gingivitis, value=2)
→ set_tooth_field(triadan=106, field=hyperplasia, value=3)
→ set_tooth_field(triadan=106, field=calculus, value=1)
→ append_radiographic_findings(text="108：远中牙根垂直骨丧失。")
`;

export const AR_EXAMPLES = `ARABIC EXAMPLES — Modern Standard Arabic clinical dictation.

[AR 1] "مائة وأربعة تخلخل اثنان، قلح درجة واحد"
→ set_tooth_field(triadan=104, field=mobility, value=2)
→ set_tooth_field(triadan=104, field=calculus, value=1)

[AR 2] "قد نحتاج إلى قلع مئتين وتسعة، لنر الصور أولا"
→ NO TOOL CALL — speculative, not a completed extraction.

[AR 3] "تم قلع مئتين وتسعة"
→ set_tooth_mark(diagram=post, triadan=209, mark=extracted)

[AR 4] "مائة وأربعة مفقود قبل الزيارة"
→ set_tooth_mark(diagram=pre, triadan=104, mark=missing)

[AR 5] "اللسان والحنك طبيعيان"
→ set_exam_finding(area=tongue, status=normal)
→ set_exam_finding(area=palate, status=normal)

[AR 6] "الفحص خارج الفم طبيعي والعقد اللمفاوية طبيعية"
→ set_exam_finding(area=extraoral, status=normal)
→ set_exam_finding(area=lymph, status=normal)

[AR 7] "مخاطية الفم غير طبيعية، تقرح خفيف في الخد الأيسر"
→ set_exam_finding(area=buccal, status=abnormal, comment="تقرح خفيف في الخد الأيسر")

[AR 8] "صفر فاصلة ثلاثة ملليلتر بوبيفاكايين، إحصار تحت الحجاج الأيمن"
→ set_anesthetic_drug(drug=Bupivacaine)
→ set_nerve_block(site=infraorbitalRight, mL=0.3)

[AR 9] "صفر فاصلة أربعة للإحصار الذقني الأيسر" (drug already discussed)
→ set_nerve_block(site=mentalLeft, mL=0.4)

[AR 9b] "خليط بوبيفاكايين صفر فاصلة خمسة بالمئة وليدوكايين اثنان بالمئة للإحصار"
→ set_anesthetic_drug(drug=Bupivacaine, concentration=0.5)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)

[AR C1] "مائة وأربعة T سلاش FX سلاش CCF، مائة وخمسة مفقود"
→ add_comment(diagram=pre, triadan=104, text="T/FX/CCF")
→ set_tooth_mark(diagram=pre, triadan=105, mark=missing)

[AR C2] "Lidocaine two percent، 0.2 ml إحصار فكي علوي ذيلي أيسر"
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)
→ set_nerve_block(site=caudalMaxillaryLeft, mL=0.2)

[AR C3] "مائة وستة GI 2 و GE 3 و calc 1. تظهر الأشعة فقدا عظميا عموديا عند الجذر الوحشي لمائة وثمانية"
→ set_tooth_field(triadan=106, field=gingivitis, value=2)
→ set_tooth_field(triadan=106, field=hyperplasia, value=3)
→ set_tooth_field(triadan=106, field=calculus, value=1)
→ append_radiographic_findings(text="108: فقد عظمي عمودي عند الجذر الوحشي.")
`;
