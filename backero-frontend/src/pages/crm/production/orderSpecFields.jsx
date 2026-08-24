import clsx from 'clsx';
import { Card } from '../sampleTheme';

// Leaf module (no imports from StageSteps.jsx / NewOrderModal.jsx / SampleLeadDetail.jsx) so
// both the Stage 0 "Orders" edit panel (StageSteps.jsx, existing orders) and the
// New Order Sheet (NewOrderModal.jsx, order creation) can share one definition of every
// SPEC/QC field and one section shell (OrderSpecTabs, despite the name — every section renders
// on one continuously-scrolling page, no tab switcher, matching the "New Order Sheet" reference
// file exactly). Same pattern as sampleTheme.jsx already uses for the same reason.

export const QC_SPECS = [
  { key: 'qcPhysico', label: 'Physicochemical Tests', defaultSpec: 'As per IS standard', iso: 'ISO 22716', presets: ['Per ISO 22716 QC plan', 'pH + viscosity + density at each stage'] },
  { key: 'qcPh', label: 'pH Testing', defaultSpec: '4.5 - 6.0', hint: 'Target ± tolerance; typical leave-on 4.5 – 6.0', presets: ['4.5 – 6.0', '5.5 ± 0.3', '3.0 – 3.5 (low-pH actives)', 'CM to propose'] },
  { key: 'qcViscosity', label: 'Viscosity', defaultSpec: '2000 - 8000 cP', hint: 'State spindle/speed where critical (e.g. Brookfield LV S64 @ 12 rpm)', presets: ['2000 – 8000 cP', '1000 – 5000 cP', '15000 – 20000 cP', 'CM to propose'] },
  { key: 'qcDensity', label: 'Density', defaultSpec: '0.95 - 1.05 g/ml', hint: 'At 25 °C', presets: ['0.95 – 1.05 g/ml', 'Match retained sample', 'CM to propose'] },
  { key: 'qcAppearance', label: 'Appearance / Form', defaultSpec: 'As per standard', hint: 'Form, opacity, freedom from separation / air inclusion', presets: ['Opaque cream', 'Clear gel', 'Pearly lotion', 'Hard-milled bar', 'No separation / no air inclusion'] },
  { key: 'qcAssay', label: 'Assay / Active Content', defaultSpec: 'Per approved formula', hint: '% w/w ± tolerance – critical for biotech actives', presets: ['Per approved formula', '10.0% w/w ± 0.5%', '5.0% w/w ± 0.3%'] },
  { key: 'qcMicrobial', label: 'Microbial Testing', defaultSpec: 'USP <61>', hint: 'Cat. 1 = eye area / mucous membranes / children <3 y', iso: 'ISO 17516', presets: ['Per ISO 17516 (Cat. 2)', 'Per ISO 17516 (Cat. 1 – strictest)'] },
  { key: 'qcTpc', label: 'TPC (CFU/g)', defaultSpec: '< 1000', iso: 'ISO 21149', presets: ['< 100 CFU/g', '< 1000 CFU/g'] },
  { key: 'qcYm', label: 'Yeast & Mold', defaultSpec: '< 100', iso: 'ISO 16212', presets: ['< 100 CFU/g', '< 10 CFU/g'] },
  { key: 'qcPathogen', label: 'Pathogen Test', defaultSpec: 'Absent', iso: 'ISO 18415', presets: ['Absent: P. aeruginosa, S. aureus, E. coli, C. albicans'] },
  { key: 'qcSensory', label: 'Sensory Evaluation', defaultSpec: 'As per standard', iso: 'ISO 6658', presets: ['Match approved std sample', 'Match retained reference'] },
  { key: 'qcColor', label: 'Color Check', defaultSpec: 'Standard / Off', hint: 'Objective shade or Pantone ref.; retained-sample match acceptable', presets: ['Pearly white', 'Clear / transparent', 'Cream beige', 'Soft pink', 'Match retained sample'] },
  { key: 'qcOdor', label: 'Odor Check', defaultSpec: 'Standard / Off', hint: 'Note IFRA compliance where applicable', presets: ['Fragrance-free', 'Mild floral (IFRA-compliant)', 'Sandalwood', 'Fresh aloe', 'Match retained sample'] },
  { key: 'qcTexture', label: 'Texture Check', defaultSpec: 'Smooth / Lumpy', hint: 'Rheology & skin-feel descriptors', presets: ['Smooth, non-greasy', 'Rich & creamy', 'Non-sticky gel', 'Fast-absorbing'] },
];
export const LAB_SPECS = [
  { key: 'labStability', label: 'Stability Testing', defaultSpec: '40C / 75% RH', iso: 'ISO/TR 18811', presets: ['40 °C / 75% RH (accelerated)', '25 °C / 60% RH (real-time)'] },
  { key: 'labAccelerated', label: 'Accelerated Stability', defaultSpec: '25C / 60% RH', presets: ['25 °C / 60% RH', '45 °C oven'] },
  { key: 'labDuration', label: 'Stability Duration', defaultSpec: '6 months', presets: ['3 months', '6 months', '12 months'] },
  { key: 'labFreezeThaw', label: 'Freeze-Thaw Cycling', defaultSpec: '3 cycles (-10C to 25C)', presets: ['3 cycles (–10 °C ↔ 25 °C)', '5 cycles (–10 °C ↔ 25 °C)', 'Not applicable'] },
  { key: 'labPackCompat', label: 'Pack-Product Compatibility', defaultSpec: 'Fill test + 40C / 8 weeks', presets: ['Fill test + 40 °C / 8 weeks', 'Fill test only'] },
  { key: 'labPreservative', label: 'Preservative Efficacy', defaultSpec: 'Pass USP <51>', iso: 'ISO 11930', presets: ['Meets ISO 11930 (Criteria A)', 'Meets ISO 11930 (Criteria B)', 'USP <51> pass'] },
  { key: 'labHeavyMetal', label: 'Heavy Metal Testing', defaultSpec: '< 10 ppm', presets: ['Pb/As/Hg/Cd < 10 ppm', 'Pb < 10, As < 2, Hg < 1, Cd < 5 ppm'] },
  { key: 'labDermatological', label: 'Dermatological Test', defaultSpec: 'HRIPT Pass', presets: ['HRIPT pass (n ≥ 50)', 'Patch test pass', 'Not required'] },
  { key: 'labDocumentation', label: 'Lab Documentation', defaultSpec: 'Complete COA', presets: ['Complete COA', 'Basic COA'] },
  { key: 'labCoa', label: 'Certificate of Analysis', defaultSpec: 'Required per batch', presets: ['Per batch, full panel'] },
  { key: 'labMethod', label: 'Test Method', defaultSpec: 'In-house + BP/USP', presets: ['In-house validated + ISO harmonised', 'ISO methods only'] },
  { key: 'docAllergen', label: 'Allergen Declaration', defaultSpec: 'IFRA fragrance allergen list', presets: ['IFRA fragrance allergen list', 'Not applicable'] },
  { key: 'docStabReport', label: 'Stability Report', defaultSpec: 'Full report at end of study', presets: ['Full end-of-study report', 'Summary only'] },
];
export const FQC_SPECS = [
  { key: 'fqcWeight', label: 'Weight Check', defaultSpec: '+-5%', presets: ['± 5%', '± 3%', '± 2%'] },
  { key: 'fqcSeal', label: 'Seal Integrity', defaultSpec: 'No leakage', presets: ['No leakage', '100% seal inspection'] },
  { key: 'fqcLeak', label: 'Leak Test', defaultSpec: 'Pass inverted 24h', presets: ['Inverted 24 h pass', 'Inverted 48 h pass'] },
  { key: 'fqcLabel', label: 'Label Verification', defaultSpec: '100% match to artwork', presets: ['100% match to artwork'] },
  { key: 'fqcPrint', label: 'Print Quality', defaultSpec: 'No smudge/cut', presets: ['No smudge / miscut'] },
  { key: 'fqcCarton', label: 'Carton Condition', defaultSpec: 'No dent/crush', presets: ['No dent / crush damage'] },
  { key: 'fqcAppearance', label: 'Appearance Check', defaultSpec: 'As per standard', presets: ['Match approved std sample'] },
  { key: 'fqcRelease', label: 'Release Criteria', defaultSpec: 'All tests pass', presets: ['All required tests pass', 'QA disposition + all required tests pass'] },
];

// One flat list, in the exact order/wording of the "New Order Sheet" reference file's Packaging
// Specification group (no Required/N/A toggle on any of these there, matched here by using
// PlainSpecRow not SpecSectionRow) — previously split into three side-by-side cards, which
// didn't match the reference's single continuous list.
export const PKG_SPEC_FIELDS = [
  { key: 'pkgFillWeight', label: 'Net Fill & Tolerance', placeholder: 'e.g. 50 g ± 2%', presets: ['50 g ± 2%', '100 ml ± 2%', '100 g ± 3%'] },
  { key: 'pkgContainerType', label: 'Primary Container', placeholder: 'e.g. 50ml Amber Glass Jar', presets: ['50 ml Amber Glass Jar', '100 ml Tube', '100 g Soap Bar', '30 ml Airless Pump'] },
  { key: 'pkgCap', label: 'Closure', placeholder: 'e.g. Gold Aluminium Wad Cap', presets: ['Gold Aluminium Wad Cap', 'Flip Top Cap', 'Wax Paper Wrap', 'Pump dispenser'] },
  { key: 'pkgSeal', label: 'Tamper / Seal Type', placeholder: 'e.g. Induction Seal', presets: ['Induction Seal', 'Heat Seal', 'None'] },
  { key: 'pkgLabel', label: 'Label Specification', placeholder: 'e.g. 50x30mm Digital Foil', presets: ['50x30 mm Digital Foil', '50x30 mm Paper', '40x25 mm Digital'] },
  { key: 'pkgMonoCarton', label: 'Mono Carton', placeholder: 'e.g. Matte Finish', presets: ['Matte Finish', 'Gloss Finish', 'Kraft Paper Box', 'Not required'] },
  { key: 'pkgIndShrinkWrap', label: 'Shrink Wrap', placeholder: 'e.g. PVC Film 40 micron', presets: ['PVC Film 40 micron', 'PVC Film', 'Not required'] },
  { key: 'pkgLeaflet', label: 'Leaflet / Insert', placeholder: 'e.g. Product info leaflet', presets: ['Product information leaflet', 'Not required'] },
  { key: 'pkgInnerPacking', label: 'Inner Packing', placeholder: 'e.g. Individual silk pouch', presets: ['Individual silk pouch', 'Individual box', 'Wax paper'] },
  { key: 'pkgOuterCarton', label: 'Shipper Carton', placeholder: 'e.g. 5-ply Corrugated', presets: ['5-ply Corrugated', '3-ply Corrugated'] },
  { key: 'pkgUnitsPerCarton', label: 'Units per Carton', placeholder: 'e.g. 24', presets: ['24', '36', '48'] },
  { key: 'pkgOuterShrinkWrap', label: 'Pallet Shrink / Stretch Film', placeholder: 'e.g. Stretch Film 23 micron', presets: ['Stretch Film', 'Stretch Film 23 micron'] },
  { key: 'pkgPalletInfo', label: 'Pallet Configuration', placeholder: 'e.g. 48 cartons per pallet', presets: ['48 cartons per pallet', '60 cartons per pallet'] },
  { key: 'pkgSpecialHandling', label: 'Special Handling / Marking', placeholder: 'e.g. Fragile, This Side Up', presets: ['Fragile, This Side Up', 'Keep Dry', 'Do Not Freeze'] },
  { key: 'pkgBatchCoding', label: 'Batch Coding Convention', placeholder: 'e.g. BATCH: M/Y/####; MFG & EXP inkjet on base' },
];
export const PAYMENT_FIELDS = [
  { key: 'paymentTerms', label: 'Payment Terms', placeholder: 'e.g. 30% Advance / 40% on QC / 30% on Dispatch' },
  { key: 'paymentMode', label: 'Payment Mode', placeholder: 'e.g. NEFT' },
  { key: 'creditPeriod', label: 'Credit Period', placeholder: 'e.g. Net 30 Days' },
  { key: 'gstTreatment', label: 'GST Treatment', placeholder: 'e.g. Regular GST (18%)' },
];

export function Field({ label, children }) {
  return <div><label className="text-xs font-semibold text-[#968871] uppercase tracking-wide mb-1 block">{label}</label>{children}</div>;
}

export const inputCls = 'w-full px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#d3c9b4] bg-[#f0eadd] text-[#2e241b] focus:outline-none focus:border-[#968871] placeholder:text-[#968871] disabled:opacity-50';
export const primaryBtn = 'px-4 py-2 bg-[#f2b23e] hover:brightness-95 text-[#2e241b] text-sm font-semibold rounded-xl disabled:opacity-50 transition';
export const secondaryBtn = 'px-4 py-2 bg-[#e2dac8] hover:bg-[#d3c9b4] text-[#4a3a29] text-sm font-semibold rounded-xl disabled:opacity-50 transition';

// Tap-to-fill preset chips — same "chipsHtml" idea as the reference file: click a chip to set
// the field's value to that exact text, free typing still always works underneath.
function PresetChips({ presets, disabled, onPick }) {
  if (!presets || !presets.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-1.5">
      {presets.map((p) => (
        <button key={p} type="button" disabled={disabled} onClick={() => onPick(p)}
          className="border border-dashed border-[#c98a1f] text-[#7a5a10] rounded-full px-2.5 py-0.5 text-[10px] hover:bg-[#f3e3c2] disabled:opacity-50 disabled:pointer-events-none">
          {p}
        </button>
      ))}
    </div>
  );
}

// Required/N/A as a two-button pill (matches the reference file's .yn toggle) instead of a
// dropdown select.
export function YesNoToggle({ value, onChange, disabled, className }) {
  const isRequired = value !== 'Not Required';
  return (
    <div className={clsx('inline-flex rounded-full border border-[#d3c9b4] overflow-hidden flex-shrink-0', className)}>
      <button type="button" disabled={disabled} onClick={() => onChange('Required')}
        className={clsx('px-2.5 py-1 text-[10px] font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none',
          isRequired ? 'bg-[#5c8a5f] text-white' : 'bg-[#f0eadd] text-[#6d5f4c] hover:bg-[#e7dfce]')}>
        Required
      </button>
      <button type="button" disabled={disabled} onClick={() => onChange('Not Required')}
        className={clsx('px-2.5 py-1 text-[10px] font-bold transition-colors disabled:opacity-50 disabled:pointer-events-none',
          !isRequired ? 'bg-[#8c3a30] text-white' : 'bg-[#f0eadd] text-[#6d5f4c] hover:bg-[#e7dfce]')}>
        N/A
      </button>
    </div>
  );
}

// Same row shape as the reference file's .spec-item (grid-template-columns: 240px 1fr 112px) —
// label+hint, chips+input, and the Required/N/A toggle all sit on one row/line instead of
// stacking, with the grid collapsing to a single column on narrow screens.
const gridRowCls = 'grid grid-cols-1 sm:grid-cols-[220px_1fr_104px] gap-x-3 gap-y-1 sm:items-center py-2 border-b border-[#e2dac8] last:border-none';

export function PlainSpecRow({ field, crmSpec, onChange, locked }) {
  return (
    <div className={gridRowCls}>
      <label className="text-xs text-[#6d5f4c] self-center">{field.label}</label>
      <div className="min-w-0">
        <PresetChips presets={field.presets} disabled={locked} onPick={(p) => onChange(field.key, p)} />
        <input disabled={locked} value={crmSpec[field.key] || ''} placeholder={field.placeholder} onChange={(e) => onChange(field.key, e.target.value)}
          className="w-full text-xs border border-[#d3c9b4] rounded-lg px-2 py-1.5 bg-[#f0eadd] disabled:opacity-50" />
      </div>
    </div>
  );
}

export function SpecSectionRow({ spec, crmSpec, onChange, locked }) {
  const status = crmSpec[spec.key + 'Status'] || 'Required';
  const value = crmSpec[spec.key + 'Spec'] ?? spec.defaultSpec;
  const fieldDisabled = locked || status === 'Not Required';
  return (
    <div className={clsx(gridRowCls, fieldDisabled && 'opacity-60')}>
      <div className="min-w-0 self-center">
        <span className="text-xs text-[#6d5f4c]">{spec.label}</span>
        {spec.iso && <span className="inline-block ml-1.5 bg-[#dde5ea] text-[#33526b] border border-[#4a8bc2]/30 rounded px-1 text-[9px] font-bold align-middle">{spec.iso}</span>}
        {spec.hint && <p className="text-[10px] text-[#968871] mt-0.5">{spec.hint}</p>}
      </div>
      <div className="min-w-0">
        <PresetChips presets={spec.presets} disabled={fieldDisabled} onPick={(p) => onChange(spec.key + 'Spec', p)} />
        <input disabled={fieldDisabled} value={value} onChange={(e) => onChange(spec.key + 'Spec', e.target.value)}
          className="w-full text-xs border border-[#d3c9b4] rounded-lg px-2 py-1.5 bg-[#f0eadd] disabled:opacity-40" />
      </div>
      <YesNoToggle value={status} disabled={locked} onChange={(v) => onChange(spec.key + 'Status', v)} className="sm:justify-self-end" />
    </div>
  );
}

export function DynamicSpecFields({ category, crmSpec, onChange, locked }) {
  const list = crmSpec[category + 'Extra'] || [];
  const update = (list2) => onChange(category + 'Extra', list2);
  return (
    <div className="mt-2 space-y-2">
      {list.map((f, i) => (
        <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[#e7dfce]">
          <input disabled={locked} value={f.label} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], label: e.target.value }; update(l); }}
            placeholder="Parameters" className="text-xs border border-[#d3c9b4] rounded-lg px-2 py-1.5 bg-[#f0eadd] flex-1 min-w-0" />
          <input disabled={locked} value={f.spec} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], spec: e.target.value }; update(l); }}
            placeholder="Requirements" className="text-xs border border-[#d3c9b4] rounded-lg px-2 py-1.5 bg-[#f0eadd] flex-1 min-w-0" />
          <YesNoToggle value={f.status || 'Required'} disabled={locked} onChange={(v) => { const l = [...list]; l[i] = { ...l[i], status: v }; update(l); }} />
          {!locked && <button onClick={() => update(list.filter((_, idx) => idx !== i))} className="text-red-500 text-sm flex-shrink-0 px-1">×</button>}
        </div>
      ))}
      {!locked && (
        <button onClick={() => update([...list, { label: '', status: 'Required', spec: '' }])} className="text-xs font-semibold text-[#7a5a10]">+ Add More Spec</button>
      )}
    </div>
  );
}

// Per-section attachment metadata (name/size/type) — files stay on the device that added them;
// only the metadata is saved on the order (in crmSpec[category + 'Attachments']), same as the
// "New Order Sheet" reference file's attach boxes.
export function AttachmentBox({ category, crmSpec, onChange, locked, hint }) {
  const list = crmSpec[category + 'Attachments'] || [];
  const addFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    onChange(category + 'Attachments', [...list, ...files.map((f) => ({ name: f.name, size: f.size, type: f.type || 'file' }))]);
    e.target.value = '';
  };
  const removeAt = (i) => onChange(category + 'Attachments', list.filter((_, idx) => idx !== i));
  return (
    <div className="mt-2 p-2.5 rounded-lg border border-dashed border-[#d3c9b4] bg-[#f0eadd]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <label className="text-xs font-bold uppercase tracking-wide text-[#6d5f4c]">Attachments</label>
        {!locked && <input type="file" multiple onChange={addFiles} className="text-[11px] text-[#968871] max-w-[220px]" />}
      </div>
      {hint && <p className="text-[10px] text-[#968871] mt-1">{hint} Files stay on this device — only the name/size is saved with the order.</p>}
      {list.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {list.map((f, i) => {
            const kb = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((f.size || 0) / 1024)) + ' KB';
            return (
              <div key={i} className="flex items-center justify-between gap-2 text-xs text-[#2e241b]">
                <span className="truncate">{f.name} <span className="text-[#968871]">({kb})</span></span>
                {!locked && <button onClick={() => removeAt(i)} className="text-[#8c3a30] flex-shrink-0 px-1">×</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── ORDER SPEC TABS ── top-tab navigation across every SPEC/QC/Packaging/Payment/Custom
// section, one visible at a time — mirrors the "New Order Sheet" reference file's layout.
// Shared by StageOrder (editing an existing order's Stage 0 "Orders") and
// NewOrderModal (creating a brand-new order) so both read the exact same field set.

export const byKeys = (list, keys) => list.filter((s) => keys.includes(s.key));

export const SENSORY_KEYS = ['qcSensory', 'qcColor', 'qcOdor', 'qcTexture', 'qcAppearance'];
export const PHYSICO_KEYS = ['qcPhysico', 'qcPh', 'qcViscosity', 'qcDensity', 'qcAssay'];
export const MICRO_KEYS = ['qcMicrobial', 'qcTpc', 'qcYm', 'qcPathogen'];
export const STABILITY_KEYS = ['labStability', 'labAccelerated', 'labDuration', 'labFreezeThaw', 'labPackCompat', 'labPreservative', 'labHeavyMetal', 'labDermatological'];
const DOC_KEYS = ['labDocumentation', 'labCoa', 'labMethod', 'docAllergen', 'docStabReport'];

function SectionHeading({ children }) {
  return <h4 className="text-xs font-bold uppercase tracking-wide text-[#6d5f4c] mb-2 pb-1.5 border-b border-[#e2dac8]">{children}</h4>;
}

// All sections render on one continuously-scrolling page — matches the "New Order Sheet"
// reference file exactly: its .panel{display:block !important} keeps every .sheet-sec visible
// at once, no per-section tab switcher — just section headings down the page.
export default function OrderSpecTabs({ crmSpec, onChange, locked, detailsContent }) {
  return (
    <div>
      <div className="space-y-6">
        <section>{detailsContent}</section>

        <section>
          <SectionHeading>👃 Sensory Targets</SectionHeading>
          <Card>
            {byKeys(QC_SPECS, SENSORY_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
            <AttachmentBox category="sensory" crmSpec={crmSpec} onChange={onChange} locked={locked} hint="Shade cards, fragrance blotters, retained-sample photos." />
          </Card>
        </section>

        <section>
          <SectionHeading>🧪 Physicochemical</SectionHeading>
          <Card>
            {byKeys(QC_SPECS, PHYSICO_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
            <AttachmentBox category="physico" crmSpec={crmSpec} onChange={onChange} locked={locked} hint="Customer spec sheets, method references, instrument parameters." />
          </Card>
        </section>

        <section>
          <SectionHeading>🎯 QC Plan — Micro &amp; Stability</SectionHeading>
          <Card>
            <p className="text-[10px] font-bold text-[#968871] uppercase mb-1">Microbiological &amp; Safety</p>
            {byKeys(QC_SPECS, MICRO_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
            <p className="text-[10px] font-bold text-[#968871] uppercase mt-3 mb-1">Stability &amp; Compatibility</p>
            {byKeys(LAB_SPECS, STABILITY_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
            <DynamicSpecFields category="qcplan" crmSpec={crmSpec} onChange={onChange} locked={locked} />
            <AttachmentBox category="qcplan" crmSpec={crmSpec} onChange={onChange} locked={locked} hint="Micro specs, challenge-test protocols, stability data." />
          </Card>
        </section>

        <section>
          <SectionHeading>✅ Final QC</SectionHeading>
          <Card>
            {FQC_SPECS.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
            <DynamicSpecFields category="fqc" crmSpec={crmSpec} onChange={onChange} locked={locked} />
            <AttachmentBox category="fqc" crmSpec={crmSpec} onChange={onChange} locked={locked} hint="AQL tables, defect classification lists, label verification samples." />
          </Card>
        </section>

        <section>
          <SectionHeading>📦 Packaging Specification (BOM)</SectionHeading>
          <Card>
            {PKG_SPEC_FIELDS.map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
            <DynamicSpecFields category="pkg" crmSpec={crmSpec} onChange={onChange} locked={locked} />
            <AttachmentBox category="pkg" crmSpec={crmSpec} onChange={onChange} locked={locked} hint="Artwork files, dielines, label PDFs, pack photos, BOM references." />
          </Card>
        </section>

        <section>
          <SectionHeading>💰 Payment</SectionHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Card>{PAYMENT_FIELDS.slice(0, 2).map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}</Card>
            <Card>{PAYMENT_FIELDS.slice(2).map((f) => <PlainSpecRow key={f.key} field={f} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}</Card>
          </div>
        </section>

        <section>
          <SectionHeading>📄 Documentation</SectionHeading>
          <Card>
            {byKeys(LAB_SPECS, DOC_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
            <DynamicSpecFields category="docs" crmSpec={crmSpec} onChange={onChange} locked={locked} />
            <AttachmentBox category="docs" crmSpec={crmSpec} onChange={onChange} locked={locked} hint="Regulatory files, PIF references, certificate templates." />
          </Card>
        </section>

        <section>
          <SectionHeading>🗂️ Custom Checks &amp; Requirements</SectionHeading>
          <Card>
            <p className="text-[11px] text-[#968871] mb-2">Examples: SPF in-vivo (ISO 24444), HRIPT patch test, heavy-metal screen, vegan/halal/organic certification, customer audit rights, third-party lab witness.</p>
            <DynamicSpecFields category="custom" crmSpec={crmSpec} onChange={onChange} locked={locked} />
            <AttachmentBox category="custom" crmSpec={crmSpec} onChange={onChange} locked={locked} hint="Certificates, claim substantiation, audit reports." />
          </Card>
        </section>
      </div>
    </div>
  );
}
