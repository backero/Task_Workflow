// Ported verbatim from the standalone Document Wallet app
// (frontend/index.html BASE_CATEGORIES / TEMPLATES, lines 540-583).

export const BASE_CATEGORIES = [
  { id: 'corp', name: 'Incorporation & ROC' },
  { id: 'resolutions', name: 'Resolutions & Minutes' },
  { id: 'tax', name: 'Tax & GST' },
  { id: 'banking', name: 'Banking & KYC' },
  { id: 'licenses', name: 'Licenses & Registrations' },
  { id: 'cosmetic', name: 'Cosmetic Regulatory' },
  { id: 'factory', name: 'Factory, TNPCB & Labour' },
  { id: 'legal', name: 'Legal, Rent & Insurance' },
  { id: 'hr', name: 'HR & Director KYC' },
  { id: 'brand', name: 'Brand & Stationery' },
  { id: 'archive', name: 'Archive' },
];

// TEMPLATES[0] is the placeholder "choose a template" option for the <select>.
export const TEMPLATES = [
  { label: '— choose a template or fill manually —' },
  { label: 'Certificate of Incorporation', cat: 'corp', issuer: 'Ministry of Corporate Affairs (MCA)', notes: 'CIN is printed on the certificate. Permanent validity.' },
  { label: 'MOA & AOA', cat: 'corp', issuer: 'MCA / ROC', notes: 'As filed at incorporation; update after any alteration.' },
  { label: "ROC Annual Filing (AOC-4 / MGT-7)", cat: 'corp', issuer: 'Ministry of Corporate Affairs (MCA) / ROC', notes: "AOC-4 within 30 days of AGM; MGT-7 within 60 days. Register each year's filing as its own document here — don't upload it as a new version of the Certificate of Incorporation." },
  { label: 'Company PAN Card', cat: 'tax', issuer: 'Income Tax Department', notes: '10-character PAN.' },
  { label: 'TAN Allotment', cat: 'tax', issuer: 'Income Tax Department', notes: 'Required for TDS deduction.' },
  { label: 'GST Registration Certificate (REG-06)', cat: 'tax', issuer: 'GSTN / CBIC', notes: 'GSTR-1 & GSTR-3B monthly; GSTR-9 annual. Verify principal place of business.' },
  { label: 'Udyam (MSME) Registration', cat: 'licenses', issuer: 'Ministry of MSME', notes: 'Permanent; update when turnover / investment class changes.' },
  { label: 'Cosmetic Manufacturing Licence (Form 32 / COS-8)', cat: 'cosmetic', issuer: 'Tamil Nadu Drug Control Department (TNDCD)', notes: 'Apply in Form 31 / COS-2. Premises must meet Schedule M-II GMP. Keep retention-fee / renewal due date as expiry. Categories of cosmetics listed on the licence.' },
  { label: 'Cosmetic Loan Licence (Form 32-A / COS-3)', cat: 'cosmetic', issuer: 'TNDCD', notes: 'For brands manufacturing at a third-party licensed facility. Attach the agreement with the manufacturer.' },
  { label: 'Cosmetic Import Registration (Form COS-1 / COS-3)', cat: 'cosmetic', issuer: 'CDSCO via SUGAM portal', notes: 'Needs IEC, Free Sale Certificate, CoA per product. Track per-product registrations.' },
  { label: 'Cosmetic Wholesale / Retail Licence', cat: 'cosmetic', issuer: 'TNDCD', notes: 'Required to stock / sell cosmetics from premises.' },
  { label: 'ISO 22716:2007 — Cosmetics GMP Certificate', cat: 'cosmetic', issuer: 'Certification body', notes: '3-year cycle with annual surveillance audits — put surveillance date in expiry to get reminders.' },
  { label: 'TNPCB Consent to Establish / Operate', cat: 'factory', issuer: 'Tamil Nadu Pollution Control Board', notes: 'Validity is printed on the consent order — renew before expiry. Keep both CTE and CTO.' },
  { label: 'TN Shops & Establishments Registration', cat: 'factory', issuer: 'Labour Department, Govt of Tamil Nadu', notes: 'Registration under the TN Shops & Establishments Act.' },
  { label: 'Fire & Rescue Services NOC', cat: 'factory', issuer: 'TN Fire & Rescue Services', notes: 'Typically renewed annually — set expiry to get a reminder.' },
  { label: 'Trade Licence (Local Body)', cat: 'licenses', issuer: 'Municipal Corporation / Panchayat', notes: 'Annual renewal in most local bodies.' },
  { label: 'Legal Metrology — Packaged Commodities Registration', cat: 'cosmetic', issuer: 'Department of Legal Metrology', notes: 'Required for MRP / label declarations on packaged cosmetics.' },
  { label: 'FSSAI Licence', cat: 'licenses', issuer: 'FSSAI', notes: '14-digit number. Renewal before expiry via FoSCoS.' },
  { label: 'Import Export Code (IEC)', cat: 'licenses', issuer: 'DGFT', notes: 'Permanent; update details annually on DGFT portal.' },
  { label: 'Trademark Registration Certificate', cat: 'brand', issuer: 'CGPDTM (IP India)', notes: '10-year validity, renewable every 10 years.' },
  { label: 'EPF Registration', cat: 'hr', issuer: 'EPFO', notes: 'Monthly PF returns & payment by the 15th.' },
  { label: 'ESI Registration', cat: 'hr', issuer: 'ESIC', notes: 'Applicable at 10+ employees; monthly contribution.' },
  { label: 'Professional Tax Registration', cat: 'tax', issuer: 'Commercial Taxes Department, TN', notes: 'Employer + employee PT registrations.' },
];
