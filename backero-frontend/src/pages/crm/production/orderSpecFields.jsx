import { useState } from 'react';
import { Button, Card, Input, Segmented, Space, Tag, Typography } from 'antd';
import { Paperclip, Wind, FlaskConical, Target, CheckCircle2, FileText, FolderCog, X, Plus } from 'lucide-react';

const { Text } = Typography;

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
export function Field({ label, children }) {
  return <div><Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>{label}</Text>{children}</div>;
}

export const inputCls = 'w-full px-3 py-2 text-sm rounded-[10px] border-[1.5px] border-[#ddd6c4] bg-[#fbfaf7] text-[#1c1917] focus:outline-none focus:border-[#8a8171] placeholder:text-[#8a8171] disabled:opacity-50';
export const primaryBtn = 'px-4 py-2 bg-[#a8781f] hover:brightness-95 text-[#1c1917] text-sm font-semibold rounded-xl disabled:opacity-50 transition';
export const secondaryBtn = 'px-4 py-2 bg-[#e7e2d6] hover:bg-[#ddd6c4] text-[#292521] text-sm font-semibold rounded-xl disabled:opacity-50 transition';

// Tap-to-fill preset chips — same "chipsHtml" idea as the reference file: click a chip to set
// the field's value to that exact text, free typing still always works underneath.
function PresetChips({ presets, disabled, onPick }) {
  if (!presets || !presets.length) return null;
  return (
    <Space size={4} wrap style={{ marginBottom: 4 }}>
      {presets.map((p) => (
        <Tag.CheckableTag key={p} checked={false} disabled={disabled} onClick={() => !disabled && onPick(p)} style={{ fontSize: 10, borderStyle: 'dashed' }}>
          {p}
        </Tag.CheckableTag>
      ))}
    </Space>
  );
}

// Required/N/A as a two-button pill (matches the reference file's .yn toggle) instead of a
// dropdown select.
export function YesNoToggle({ value, onChange, disabled, className }) {
  const isRequired = value !== 'Not Required';
  return (
    <Segmented
      className={className}
      disabled={disabled}
      size="small"
      value={isRequired ? 'Required' : 'Not Required'}
      onChange={onChange}
      options={[{ label: 'Required', value: 'Required' }, { label: 'N/A', value: 'Not Required' }]}
    />
  );
}

// Same row shape as the reference file's .spec-item — label+hint, chips+input, and the
// Required/N/A toggle (+ attach button) all sit on one row/line instead of stacking.
const rowStyle = { display: 'grid', gridTemplateColumns: '220px 1fr 170px', gap: '8px 12px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' };

// Small paperclip toggle shared by PlainSpecRow/SpecSectionRow — expands to that ONE field's
// own AttachmentBox underneath the row instead of only having one shared attachment box per
// whole section, so e.g. a specific shade card can sit on "Color Check" itself, not buried in
// a general Sensory Targets attachments pile.
function FieldAttachToggle({ fieldKey, crmSpec, locked, open, setOpen }) {
  const count = (crmSpec[fieldKey + 'Attachments'] || []).length;
  return (
    <Button
      size="small" type={count > 0 ? 'primary' : 'default'} ghost={count > 0}
      icon={<Paperclip size={11} />}
      onClick={() => setOpen((v) => !v)}
      title={count > 0 ? `${count} attachment(s)` : 'Attach a file to this field'}
    >
      {count > 0 ? count : ''}
    </Button>
  );
}

export function PlainSpecRow({ field, crmSpec, onChange, locked, extra }) {
  const [attachOpen, setAttachOpen] = useState(false);
  return (
    <div>
      <div style={rowStyle}>
        <Text style={{ fontSize: 12 }}>{field.label}</Text>
        <Input disabled={locked} size="small" value={crmSpec[field.key] || ''} placeholder={field.placeholder} onChange={(e) => onChange(field.key, e.target.value)} />
        <Space size={4} style={{ justifySelf: 'end' }}>
          {extra}
          <FieldAttachToggle fieldKey={field.key} crmSpec={crmSpec} locked={locked} open={attachOpen} setOpen={setAttachOpen} />
        </Space>
      </div>
      {attachOpen && <AttachmentBox category={field.key} crmSpec={crmSpec} onChange={onChange} locked={locked} />}
    </div>
  );
}

export function SpecSectionRow({ spec, crmSpec, onChange, locked }) {
  const [attachOpen, setAttachOpen] = useState(false);
  const status = crmSpec[spec.key + 'Status'] || 'Required';
  const value = crmSpec[spec.key + 'Spec'] ?? spec.defaultSpec;
  const fieldDisabled = locked || status === 'Not Required';
  return (
    <div>
      <div style={{ ...rowStyle, opacity: fieldDisabled ? 0.6 : 1 }}>
        <div>
          <Text style={{ fontSize: 12 }}>{spec.label}</Text>
          {spec.iso && <Tag style={{ marginInlineStart: 6, fontSize: 9, fontWeight: 700 }} color="gold">{spec.iso}</Tag>}
          {spec.hint && <div><Text type="secondary" style={{ fontSize: 10 }}>{spec.hint}</Text></div>}
        </div>
        <div>
          <PresetChips presets={spec.presets} disabled={fieldDisabled} onPick={(p) => onChange(spec.key + 'Spec', p)} />
          <Input disabled={fieldDisabled} size="small" value={value} onChange={(e) => onChange(spec.key + 'Spec', e.target.value)} />
        </div>
        <Space size={4} style={{ justifySelf: 'end' }}>
          <YesNoToggle value={status} disabled={locked} onChange={(v) => onChange(spec.key + 'Status', v)} />
          <FieldAttachToggle fieldKey={spec.key} crmSpec={crmSpec} locked={locked} open={attachOpen} setOpen={setAttachOpen} />
        </Space>
      </div>
      {attachOpen && <div style={{ paddingBottom: 8 }}><AttachmentBox category={spec.key} crmSpec={crmSpec} onChange={onChange} locked={locked} /></div>}
    </div>
  );
}

export function DynamicSpecFields({ category, crmSpec, onChange, locked }) {
  const list = crmSpec[category + 'Extra'] || [];
  const update = (list2) => onChange(category + 'Extra', list2);
  return (
    <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size={8}>
      {list.map((f, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, background: '#fafafa' }}>
          <Input size="small" disabled={locked} value={f.label} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], label: e.target.value }; update(l); }} placeholder="Parameters" style={{ flex: 1 }} />
          <Input size="small" disabled={locked} value={f.spec} onChange={(e) => { const l = [...list]; l[i] = { ...l[i], spec: e.target.value }; update(l); }} placeholder="Requirements" style={{ flex: 1 }} />
          <YesNoToggle value={f.status || 'Required'} disabled={locked} onChange={(v) => { const l = [...list]; l[i] = { ...l[i], status: v }; update(l); }} />
          {!locked && <Button size="small" type="text" danger icon={<X size={13} />} onClick={() => update(list.filter((_, idx) => idx !== i))} />}
        </div>
      ))}
      {!locked && (
        <Button size="small" icon={<Plus size={12} />} onClick={() => update([...list, { label: '', status: 'Required', spec: '' }])}>Add More Spec</Button>
      )}
    </Space>
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
    <Card size="small" style={{ borderStyle: 'dashed', background: '#fafafa' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>Attachments</Text>
        {!locked && <input type="file" multiple onChange={addFiles} style={{ fontSize: 11, maxWidth: 220 }} />}
      </div>
      {hint && <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 4 }}>{hint} Files stay on this device — only the name/size is saved with the order.</Text>}
      {list.length > 0 && (
        <Space direction="vertical" size={4} style={{ marginTop: 6, width: '100%' }}>
          {list.map((f, i) => {
            const kb = f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((f.size || 0) / 1024)) + ' KB';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                <Text ellipsis style={{ fontSize: 12 }}>{f.name} <Text type="secondary" style={{ fontSize: 11 }}>({kb})</Text></Text>
                {!locked && <Button size="small" type="text" danger icon={<X size={12} />} onClick={() => removeAt(i)} />}
              </div>
            );
          })}
        </Space>
      )}
    </Card>
  );
}

// ── ORDER SPEC TABS ── every SPEC/QC/Packaging/Payment/Custom section, all visible on one
// continuously-scrolling page (no tab switcher) — mirrors the "New Order Sheet" reference file's
// layout. Shared by StageOrder (editing an existing order's Stage 0 "Orders") and NewOrderModal
// (creating a brand-new order) so both read the exact same field set.

export const byKeys = (list, keys) => list.filter((s) => keys.includes(s.key));

export const SENSORY_KEYS = ['qcSensory', 'qcColor', 'qcOdor', 'qcTexture', 'qcAppearance'];
export const PHYSICO_KEYS = ['qcPhysico', 'qcPh', 'qcViscosity', 'qcDensity', 'qcAssay'];
export const MICRO_KEYS = ['qcMicrobial', 'qcTpc', 'qcYm', 'qcPathogen'];
export const STABILITY_KEYS = ['labStability', 'labAccelerated', 'labDuration', 'labFreezeThaw', 'labPackCompat', 'labPreservative', 'labHeavyMetal', 'labDermatological'];
export const DOC_KEYS = ['labDocumentation', 'labCoa', 'labMethod', 'docAllergen', 'docStabReport'];

function SectionHeading({ icon: Icon, children }) {
  return (
    <Space size={6} style={{ marginBottom: 8 }}>
      <Icon size={13} color="#8a8171" />
      <Text type="secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{children}</Text>
    </Space>
  );
}

// All sections render on one continuously-scrolling page — matches the "New Order Sheet"
// reference file exactly: its .panel{display:block !important} keeps every .sheet-sec visible
// at once, no per-section tab switcher — just section headings down the page.
export default function OrderSpecTabs({ crmSpec, onChange, locked, detailsContent }) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <section>{detailsContent}</section>

      <section>
        <SectionHeading icon={Wind}>Sensory Targets</SectionHeading>
        <Card size="small">
          {byKeys(QC_SPECS, SENSORY_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
        </Card>
      </section>

      <section>
        <SectionHeading icon={FlaskConical}>Physicochemical</SectionHeading>
        <Card size="small">
          {byKeys(QC_SPECS, PHYSICO_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
        </Card>
      </section>

      <section>
        <SectionHeading icon={Target}>QC Plan — Micro &amp; Stability</SectionHeading>
        <Card size="small">
          <Text type="secondary" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Microbiological &amp; Safety</Text>
          {byKeys(QC_SPECS, MICRO_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
          <div style={{ marginTop: 12 }}><Text type="secondary" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Stability &amp; Compatibility</Text></div>
          {byKeys(LAB_SPECS, STABILITY_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
          <DynamicSpecFields category="qcplan" crmSpec={crmSpec} onChange={onChange} locked={locked} />
        </Card>
      </section>

      <section>
        <SectionHeading icon={CheckCircle2}>Final QC</SectionHeading>
        <Card size="small">
          {FQC_SPECS.map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
          <DynamicSpecFields category="fqc" crmSpec={crmSpec} onChange={onChange} locked={locked} />
        </Card>
      </section>

      <section>
        <SectionHeading icon={FileText}>Documentation</SectionHeading>
        <Card size="small">
          {byKeys(LAB_SPECS, DOC_KEYS).map((s) => <SpecSectionRow key={s.key} spec={s} crmSpec={crmSpec} onChange={onChange} locked={locked} />)}
          <DynamicSpecFields category="docs" crmSpec={crmSpec} onChange={onChange} locked={locked} />
        </Card>
      </section>

      <section>
        <SectionHeading icon={FolderCog}>Custom Checks &amp; Requirements</SectionHeading>
        <Card size="small">
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>Examples: SPF in-vivo (ISO 24444), HRIPT patch test, heavy-metal screen, vegan/halal/organic certification, customer audit rights, third-party lab witness.</Text>
          <DynamicSpecFields category="custom" crmSpec={crmSpec} onChange={onChange} locked={locked} />
        </Card>
      </section>
    </Space>
  );
}
