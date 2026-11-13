import type { AppLanguage } from '../../i18n/config';

// Prompt text for dictation in fr/de/it/es: a short language block and
// native versions of English EX 1–9b (same tool calls) plus three
// code-switching examples. Hand-written in the way a vet in each country
// actually dictates, using the glossary terms (src/locales/glossary.json)
// and the spoken synonyms in ./terms. The model also gets the auto-cleaned
// transcript (number words as digits), so examples may show either form.
// Tool-call values stay language-neutral; free text stays in the vet's
// language. English has no entry: its prompt is unchanged.

type DictationLanguage = Exclude<AppLanguage, 'en'>;

/** How each language is named in the (English) prompt, and how a decimal
 *  dose is said in it. */
const LANGUAGE: Record<DictationLanguage, { name: string; decimal: string; percent: string }> = {
  fr: { name: 'French', decimal: 'zéro virgule trois', percent: 'zéro virgule cinq pour cent' },
  de: { name: 'German', decimal: 'null Komma drei', percent: 'null Komma fünf Prozent' },
  it: { name: 'Italian', decimal: 'zero virgola tre', percent: 'zero virgola cinque per cento' },
  es: { name: 'Spanish', decimal: 'cero coma tres', percent: 'cero coma cinco por ciento' },
};

/** Inserted after the core rules for a non-English dictation. */
export function dictationLanguageBlock(lng: DictationLanguage): string {
  const { name, decimal, percent } = LANGUAGE[lng];
  const tag = lng.toUpperCase();
  return [
    `DICTATION LANGUAGE: ${name}.`,
    `- The vet dictates in ${name}. English AVDC codes ("T/FX", "CCF", "TR"), drug names and abbreviations ("GI 2", "GE 3", "calc 1", "PD2") are often mixed into ${name} sentences — read them as they are.`,
    '- Tool-call values stay language-neutral: Triadan numbers, field names, AVDC codes, exam area and nerve-block site ids, and bare numbers. Drug names use the chart spelling: Bupivacaine, Lidocaine, Ropivacaine, Mepivacaine.',
    `- Doses and strengths may be said with a decimal comma ("0,3", "${decimal}", "${percent}"); the auto-cleanup leaves these alone. In tool calls write a decimal point: mL=0.3, concentration=0.5.`,
    `- Free text — add_comment text for a finding with no AVDC code, exam comments, the treatment report and radiographic findings — is written in ${name}, in the vet's own wording. Don't translate it into English.`,
    `- The ${name} examples ([${tag} …]) follow the English ones.`,
  ].join('\n');
}

const FR = `FRENCH EXAMPLES — same patterns, as French vets dictate.

[FR 1] "cent quatre mobilité deux, tartre stade un"
→ set_tooth_field(triadan=104, field=mobility, value=2)
→ set_tooth_field(triadan=104, field=calculus, value=1)

[FR 2] "la deux cent neuf, on va sûrement l'extraire aujourd'hui" / "on va peut-être devoir enlever la deux cent neuf"
→ NO TOOL CALL — speculative. Wait for definitive language ("extraite", "je l'enlève", etc.).

[FR 3] "deux cent neuf extraite" / "je viens d'extraire la deux cent neuf" / "j'extrais la deux cent neuf"
→ set_tooth_mark(diagram=post, triadan=209, mark=extracted)

[FR 4] "cent quatre absente à l'examen" / "la cent quatre manque déjà"
→ set_tooth_mark(diagram=pre, triadan=104, mark=missing)

[FR 5] "langue normale, palais normal"
→ set_exam_finding(area=tongue, status=normal)
→ set_exam_finding(area=palate, status=normal)

[FR 6] "examen extra-oral sans particularité, nœuds lymphatiques normaux"
→ set_exam_finding(area=extraoral, status=normal)
→ set_exam_finding(area=lymph, status=normal)

[FR 7] "muqueuse buccale anormale, légère ulcération sur la joue droite"
→ set_exam_finding(area=buccal, status=abnormal, comment="Légère ulcération sur la joue droite")

[FR 8] "zéro virgule trois millilitres de bupivacaïne en infra-orbitaire droit" / "0,3 mL bupivacaïne infra-orbitaire droit"
→ set_anesthetic_drug(drug=Bupivacaine)
→ set_nerve_block(site=infraorbitalRight, mL=0.3)

[FR 9] "zéro virgule quatre en mentonnier gauche" (drug already discussed earlier)
→ set_nerve_block(site=mentalLeft, mL=0.4)

[FR 9b] "pour les blocs, un mélange de bupivacaïne à zéro virgule cinq pour cent et de lidocaïne à deux pour cent"
→ set_anesthetic_drug(drug=Bupivacaine, concentration=0.5)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)

[FR C1] "cent quatre T slash FX slash CCF, cent cinq absente" (English AVDC code inside French)
→ add_comment(diagram=pre, triadan=104, text="T/FX/CCF")
→ set_tooth_mark(diagram=pre, triadan=105, mark=missing)

[FR C2] "Lidocaine two percent, 0,2 mL en maxillaire caudal gauche" (English drug phrase, decimal comma)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)
→ set_nerve_block(site=caudalMaxillaryLeft, mL=0.2)

[FR C3] "cent six GI 2, GE 3, calc 1. À la radio, cent huit, alvéolyse verticale sur la racine distale"
→ set_tooth_field(triadan=106, field=gingivitis, value=2)
→ set_tooth_field(triadan=106, field=hyperplasia, value=3)
→ set_tooth_field(triadan=106, field=calculus, value=1)
→ append_radiographic_findings(text="108 : alvéolyse verticale, racine distale.")
`;

const DE = `GERMAN EXAMPLES — same patterns, as German vets dictate.

[DE 1] "Zahn hundertvier Lockerungsgrad zwei, Zahnstein Grad eins"
→ set_tooth_field(triadan=104, field=mobility, value=2)
→ set_tooth_field(triadan=104, field=calculus, value=1)

[DE 2] "die zweihundertneun muss heute wahrscheinlich raus" / "zwei null neun müssen wir eventuell ziehen"
→ NO TOOL CALL — speculative. Wait for definitive language ("extrahiert", "ist raus", etc.).

[DE 3] "zweihundertneun extrahiert" / "zwei null neun ist raus" / "ich ziehe jetzt die zweihundertneun"
→ set_tooth_mark(diagram=post, triadan=209, mark=extracted)

[DE 4] "hundertvier fehlt bei der Untersuchung" / "die hundertvier fehlt schon"
→ set_tooth_mark(diagram=pre, triadan=104, mark=missing)

[DE 5] "Zunge unauffällig, Gaumen unauffällig"
→ set_exam_finding(area=tongue, status=normal)
→ set_exam_finding(area=palate, status=normal)

[DE 6] "extraoral ohne besonderen Befund, Lymphknoten unauffällig"
→ set_exam_finding(area=extraoral, status=normal)
→ set_exam_finding(area=lymph, status=normal)

[DE 7] "Mundschleimhaut auffällig, leichte Ulzeration an der rechten Wange"
→ set_exam_finding(area=buccal, status=abnormal, comment="Leichte Ulzeration an der rechten Wange")

[DE 8] "null Komma drei Milliliter Bupivacain, Infraorbitalis rechts" / "0,3 ml Bupivacain infraorbital rechts"
→ set_anesthetic_drug(drug=Bupivacaine)
→ set_nerve_block(site=infraorbitalRight, mL=0.3)

[DE 9] "null Komma vier Mentalis links" (drug already discussed earlier)
→ set_nerve_block(site=mentalLeft, mL=0.4)

[DE 9b] "Blockaden mit einer Mischung aus Bupivacain null Komma fünf Prozent und Lidocain zwei Prozent"
→ set_anesthetic_drug(drug=Bupivacaine, concentration=0.5)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)

[DE C1] "hundertvier T Schrägstrich FX Schrägstrich CCF, hundertfünf fehlt" (English AVDC code inside German)
→ add_comment(diagram=pre, triadan=104, text="T/FX/CCF")
→ set_tooth_mark(diagram=pre, triadan=105, mark=missing)

[DE C2] "Lidocaine two percent, 0,2 ml Maxillaris kaudal links" (English drug phrase, decimal comma)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)
→ set_nerve_block(site=caudalMaxillaryLeft, mL=0.2)

[DE C3] "hundertsechs GI 2, GE 3, calc 1. Im Röntgen hundertacht vertikaler Knochenabbau an der distalen Wurzel"
→ set_tooth_field(triadan=106, field=gingivitis, value=2)
→ set_tooth_field(triadan=106, field=hyperplasia, value=3)
→ set_tooth_field(triadan=106, field=calculus, value=1)
→ append_radiographic_findings(text="108: vertikaler Knochenabbau, distale Wurzel.")
`;

const IT = `ITALIAN EXAMPLES — same patterns, as Italian vets dictate.

[IT 1] "centoquattro mobilità due, tartaro grado uno"
→ set_tooth_field(triadan=104, field=mobility, value=2)
→ set_tooth_field(triadan=104, field=calculus, value=1)

[IT 2] "il duecentonove oggi probabilmente lo togliamo" / "forse dovremo estrarre il duecentonove"
→ NO TOOL CALL — speculative. Wait for definitive language ("estratto", "lo sto togliendo", etc.).

[IT 3] "duecentonove estratto" / "ho appena tolto il duecentonove" / "sto estraendo il duecentonove"
→ set_tooth_mark(diagram=post, triadan=209, mark=extracted)

[IT 4] "centoquattro mancante all'esame" / "il centoquattro manca già" / "uno zero quattro mancante"
→ set_tooth_mark(diagram=pre, triadan=104, mark=missing)

[IT 5] "lingua nella norma, palato nella norma"
→ set_exam_finding(area=tongue, status=normal)
→ set_exam_finding(area=palate, status=normal)

[IT 6] "esame extraorale nella norma, linfonodi nella norma"
→ set_exam_finding(area=extraoral, status=normal)
→ set_exam_finding(area=lymph, status=normal)

[IT 7] "mucosa orale alterata, lieve ulcerazione sulla guancia destra"
→ set_exam_finding(area=buccal, status=abnormal, comment="Lieve ulcerazione sulla guancia destra")

[IT 8] "zero virgola tre millilitri di bupivacaina, infraorbitario destro" / "0,3 ml bupivacaina infraorbitario destro"
→ set_anesthetic_drug(drug=Bupivacaine)
→ set_nerve_block(site=infraorbitalRight, mL=0.3)

[IT 9] "zero virgola quattro sul mentale sinistro" (drug already discussed earlier)
→ set_nerve_block(site=mentalLeft, mL=0.4)

[IT 9b] "per i blocchi una miscela di bupivacaina allo zero virgola cinque per cento e lidocaina al due per cento"
→ set_anesthetic_drug(drug=Bupivacaine, concentration=0.5)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)

[IT C1] "centoquattro T barra FX barra CCF, centocinque mancante" (English AVDC code inside Italian)
→ add_comment(diagram=pre, triadan=104, text="T/FX/CCF")
→ set_tooth_mark(diagram=pre, triadan=105, mark=missing)

[IT C2] "Lidocaine two percent, 0,2 ml mascellare caudale sinistro" (English drug phrase, decimal comma)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)
→ set_nerve_block(site=caudalMaxillaryLeft, mL=0.2)

[IT C3] "centosei GI 2, GE 3, calc 1. Alla radiografia, centootto, perdita ossea verticale sulla radice distale"
→ set_tooth_field(triadan=106, field=gingivitis, value=2)
→ set_tooth_field(triadan=106, field=hyperplasia, value=3)
→ set_tooth_field(triadan=106, field=calculus, value=1)
→ append_radiographic_findings(text="108: perdita ossea verticale, radice distale.")
`;

const ES = `SPANISH EXAMPLES — same patterns, as Spanish-speaking vets dictate.

[ES 1] "ciento cuatro movilidad dos, sarro grado uno"
→ set_tooth_field(triadan=104, field=mobility, value=2)
→ set_tooth_field(triadan=104, field=calculus, value=1)

[ES 2] "el doscientos nueve seguramente hoy sale" / "puede que tengamos que extraer el doscientos nueve"
→ NO TOOL CALL — speculative. Wait for definitive language ("extraído", "lo estoy sacando", etc.).

[ES 3] "doscientos nueve extraído" / "acabo de sacar el doscientos nueve" / "extrayendo el doscientos nueve"
→ set_tooth_mark(diagram=post, triadan=209, mark=extracted)

[ES 4] "ciento cuatro ausente en la exploración" / "ya le falta el ciento cuatro" / "uno cero cuatro ausente"
→ set_tooth_mark(diagram=pre, triadan=104, mark=missing)

[ES 5] "lengua normal, paladar normal"
→ set_exam_finding(area=tongue, status=normal)
→ set_exam_finding(area=palate, status=normal)

[ES 6] "exploración extraoral sin hallazgos, ganglios linfáticos normales"
→ set_exam_finding(area=extraoral, status=normal)
→ set_exam_finding(area=lymph, status=normal)

[ES 7] "mucosa bucal anormal, ligera ulceración en la mejilla derecha"
→ set_exam_finding(area=buccal, status=abnormal, comment="Ligera ulceración en la mejilla derecha")

[ES 8] "cero coma tres mililitros de bupivacaína, infraorbitario derecho" / "0,3 ml bupivacaína infraorbitario derecho"
→ set_anesthetic_drug(drug=Bupivacaine)
→ set_nerve_block(site=infraorbitalRight, mL=0.3)

[ES 9] "cero coma cuatro en el mentoniano izquierdo" (drug already discussed earlier)
→ set_nerve_block(site=mentalLeft, mL=0.4)

[ES 9b] "los bloqueos con una mezcla de bupivacaína al cero coma cinco por ciento y lidocaína al dos por ciento"
→ set_anesthetic_drug(drug=Bupivacaine, concentration=0.5)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)

[ES C1] "ciento cuatro T barra FX barra CCF, ciento cinco ausente" (English AVDC code inside Spanish)
→ add_comment(diagram=pre, triadan=104, text="T/FX/CCF")
→ set_tooth_mark(diagram=pre, triadan=105, mark=missing)

[ES C2] "Lidocaine two percent, 0,2 ml maxilar caudal izquierdo" (English drug phrase, decimal comma)
→ set_anesthetic_drug(drug=Lidocaine, concentration=2)
→ set_nerve_block(site=caudalMaxillaryLeft, mL=0.2)

[ES C3] "ciento seis GI 2, GE 3, calc 1. En la radiografía, ciento ocho, pérdida ósea vertical en la raíz distal"
→ set_tooth_field(triadan=106, field=gingivitis, value=2)
→ set_tooth_field(triadan=106, field=hyperplasia, value=3)
→ set_tooth_field(triadan=106, field=calculus, value=1)
→ append_radiographic_findings(text="108: pérdida ósea vertical, raíz distal.")
`;

/** Native few-shot examples, appended after the English ones. */
export const NATIVE_FEW_SHOT: Record<DictationLanguage, string> = { fr: FR, de: DE, it: IT, es: ES };
