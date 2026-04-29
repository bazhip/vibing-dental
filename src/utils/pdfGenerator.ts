import { PDFDocument, PDFForm } from 'pdf-lib';
import download from 'downloadjs';
import { ToothData, PatientInfo, Species, DentalField } from '../types';

const DENTAL_FIELDS: DentalField[] = [
  'mobility',
  'recession',
  'pocket',
  'furcation',
  'hyperplasia',
  'calculus',
  'gingivitis',
  'pdstate',
];

// LaTeX/hyperref strips underscores from PDF form field names, so the names in
// the compiled template are e.g. "g110mob" rather than "g_110_mob".
// Maps internal DentalField → 3-char suffix used in the chart's form fields.
const FIELD_SUFFIX: Record<DentalField, string> = {
  mobility: 'mob',
  recession: 'rec',
  pocket: 'poc',
  furcation: 'fur',
  hyperplasia: 'hyp',
  calculus: 'cal',
  gingivitis: 'gin',
  pdstate: 'pds',
};

function setTextField(form: PDFForm, name: string, value: string | undefined): void {
  if (!value) return;
  try {
    form.getTextField(name).setText(value);
  } catch {
    // Field doesn't exist in this template (e.g. tooth not present for the species).
  }
}

function fillPatientInfo(form: PDFForm, patientInfo: PatientInfo): void {
  setTextField(form, 'date', patientInfo.date);
  setTextField(form, 'patient', patientInfo.patientName);
  setTextField(form, 'pid', patientInfo.patientNumber);
  setTextField(form, 'chief', patientInfo.complaint);
}

function fillToothGrid(form: PDFForm, toothData: ToothData[]): void {
  for (const tooth of toothData) {
    for (const field of DENTAL_FIELDS) {
      const value = tooth[field];
      if (!value) continue;
      const fieldName = `g${tooth.triadan}${FIELD_SUFFIX[field]}`;
      setTextField(form, fieldName, value);
    }
  }
}

export async function generateDentalChartPDF(
  patientInfo: PatientInfo,
  toothData: ToothData[],
  species: Species
): Promise<void> {
  const templateUrl = `${species}_chart.pdf`;
  const templateBytes = await fetch(templateUrl).then((res) => res.arrayBuffer());

  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  fillPatientInfo(form, patientInfo);
  fillToothGrid(form, toothData);

  const sanitize = (str: string) => str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${sanitize(patientInfo.patientName)}_${sanitize(patientInfo.patientNumber)}_${patientInfo.date}.pdf`;

  const pdfBytes = await pdfDoc.save();
  download(pdfBytes, filename, 'application/pdf');
}
