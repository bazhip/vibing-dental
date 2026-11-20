import { parseDailyMedLabel } from './dailyMed';

const id = '879f0b28-00c0-40e8-b224-afcf39b1fce7';
const label = (code: string, content: string) => `<document xmlns="urn:hl7-org:v3"><code code="${code}"/><setId root="${id}"/>
<component><structuredBody><component><section><code code="34068-7"/><title>Dosage and administration</title><text>${content}</text></section></component></structuredBody></component>
</document>`;

it('keeps label paragraphs intact and checks the veterinary document type and product', () => {
  expect(parseDailyMedLabel(label('50578-4', '<paragraph>Label paragraph one.</paragraph><paragraph>Label paragraph two.</paragraph>'), id).sections)
    .toEqual([{ title: 'Dosage and administration', text: 'Label paragraph one.\n\nLabel paragraph two.' }]);
  expect(() => parseDailyMedLabel(label('34391-3', 'Other label'), id)).toThrow();
  expect(() => parseDailyMedLabel(label('50578-4', 'Another product'), '00000000-0000-0000-0000-000000000000')).toThrow();
});

it('leaves tables and footnotes on the source label to preserve their context', () => {
  expect(parseDailyMedLabel(label('50578-4', '<paragraph>See the table.</paragraph><table><tbody><tr><td>Example</td></tr></tbody></table>'), id).sections)
    .toEqual([{ title: 'Dosage and administration', text: null }]);
  expect(() => parseDailyMedLabel('<!DOCTYPE document><document/>', id)).toThrow();
});


it('keeps strength and concentration units from the label', () => {
  const ingredient = '<ingredient classCode="ACTIB"><quantity><numerator value="5" unit="mg"/><denominator value="1" unit="mL"/></quantity><ingredientSubstance><name>Sample ingredient</name></ingredientSubstance></ingredient>';
  const xml = label('50578-4', '<paragraph>See label.</paragraph>').replace('</document>', ingredient + '</document>');
  expect(parseDailyMedLabel(xml, id).strengths).toEqual(['Sample ingredient 5 mg / 1 mL']);
});
