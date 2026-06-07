import { useState, useEffect } from 'react';
import type { Claim } from '../types';
import { useAuth } from '../context/AuthContext';

interface ExtractedFields {
  doctor_name?: string;
  doctor_reg?: string;
  diagnosis?: string;
  medicines_prescribed?: string[];
  procedures?: string[];
  tests_prescribed?: string[];
  treatment?: string;
  bill_items?: Record<string, number>;
  total_amount?: number;
  hospital?: string;
  patient_name?: string;
}

interface Props {
  initialValues?: Partial<Claim>;
  extractedFields?: ExtractedFields | null;
  onSubmit: (claim: Claim) => void;
  loading: boolean;
  autoFillUser?: boolean;
}

interface BillLine { key: string; amount: string }

function parseTag(raw: string): string[] {
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export default function ClaimForm({ initialValues, extractedFields, onSubmit, loading, autoFillUser }: Props) {
  const { user } = useAuth();
  const iv = initialValues ?? {};

  const [memberId, setMemberId] = useState(iv.member_id ?? (autoFillUser ? (user?.member_id ?? user?.username ?? '') : ''));
  const [memberName, setMemberName] = useState(iv.member_name ?? (autoFillUser ? (user?.name ?? '') : ''));
  const [memberJoin, setMemberJoin] = useState(iv.member_join_date ?? '');
  const [treatDate, setTreatDate] = useState(iv.treatment_date ?? '');
  const [claimAmt, setClaimAmt] = useState(String(iv.claim_amount ?? ''));
  const [hospital, setHospital] = useState(iv.hospital ?? '');
  const [cashless, setCashless] = useState(iv.cashless_request ?? false);
  const [preAuth, setPreAuth] = useState(iv.pre_authorized ?? false);
  // previous_claims_same_day is auto-computed server-side — never shown to users

  const p = iv.prescription;
  const [docName, setDocName] = useState(p?.doctor_name ?? '');
  const [docReg, setDocReg] = useState(p?.doctor_reg ?? '');
  const [diagnosis, setDiagnosis] = useState(p?.diagnosis ?? '');
  const [medicines, setMedicines] = useState((p?.medicines_prescribed ?? []).join(', '));
  const [procedures, setProcedures] = useState((p?.procedures ?? []).join(', '));
  const [tests, setTests] = useState((p?.tests_prescribed ?? []).join(', '));
  const [treatment, setTreatment] = useState(p?.treatment ?? '');
  const [noPrescription, setNoPrescription] = useState(!p && Object.keys(iv).length > 0);

  const initBill: BillLine[] = Object.keys(iv.bill ?? {}).length
    ? Object.entries(iv.bill!).map(([k, v]) => ({ key: k, amount: String(v) }))
    : [{ key: '', amount: '' }];
  const [billLines, setBillLines] = useState<BillLine[]>(initBill);

  // Apply AI-extracted fields when they arrive
  useEffect(() => {
    if (!extractedFields) return;
    if (extractedFields.doctor_name) setDocName(extractedFields.doctor_name);
    if (extractedFields.doctor_reg)  setDocReg(extractedFields.doctor_reg);
    if (extractedFields.diagnosis)   setDiagnosis(extractedFields.diagnosis);
    if (extractedFields.medicines_prescribed?.length) setMedicines(extractedFields.medicines_prescribed.join(', '));
    if (extractedFields.procedures?.length)           setProcedures(extractedFields.procedures.join(', '));
    if (extractedFields.tests_prescribed?.length)     setTests(extractedFields.tests_prescribed.join(', '));
    if (extractedFields.treatment)   setTreatment(extractedFields.treatment);
    if (extractedFields.hospital)    setHospital(extractedFields.hospital);
    if (extractedFields.patient_name && !memberName) setMemberName(extractedFields.patient_name);
    if (extractedFields.total_amount) setClaimAmt(String(extractedFields.total_amount));
    if (extractedFields.bill_items && Object.keys(extractedFields.bill_items).length) {
      setBillLines(Object.entries(extractedFields.bill_items).map(([k, v]) => ({ key: k, amount: String(v) })));
    }
    if (Object.keys(extractedFields).some(k => ['doctor_name','doctor_reg','diagnosis'].includes(k))) {
      setNoPrescription(false);
    }
  }, [extractedFields]); // eslint-disable-line react-hooks/exhaustive-deps

  function addLine() { setBillLines(l => [...l, { key: '', amount: '' }]); }
  function removeLine(i: number) { setBillLines(l => l.filter((_, idx) => idx !== i)); }
  function setLine(i: number, field: 'key' | 'amount', val: string) {
    setBillLines(l => l.map((line, idx) => idx === i ? { ...line, [field]: val } : line));
  }

  function buildClaim(): Claim {
    const bill: Record<string, number> = {};
    billLines.forEach(({ key, amount }) => {
      const k = key.trim().replace(/\s+/g, '_').toLowerCase();
      const v = parseFloat(amount);
      if (k && !isNaN(v)) bill[k] = v;
    });

    return {
      member_id: memberId,
      member_name: memberName,
      treatment_date: treatDate,
      claim_amount: parseFloat(claimAmt) || 0,
      ...(memberJoin && { member_join_date: memberJoin }),
      ...(hospital && { hospital }),
      cashless_request: cashless,
      pre_authorized: preAuth,
      bill,
      ...(!noPrescription && {
        prescription: {
          ...(docName && { doctor_name: docName }),
          ...(docReg && { doctor_reg: docReg }),
          ...(diagnosis && { diagnosis }),
          ...(medicines && { medicines_prescribed: parseTag(medicines) }),
          ...(procedures && { procedures: parseTag(procedures) }),
          ...(tests && { tests_prescribed: parseTag(tests) }),
          ...(treatment && { treatment }),
        },
      }),
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(buildClaim());
  }

  const totalBill = billLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Member Details */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Member & Claim Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Member ID *" required>
            <Input value={memberId} onValueChange={setMemberId} placeholder="EMP001" required />
          </Field>
          <Field label="Member Name *" required>
            <Input value={memberName} onValueChange={setMemberName} placeholder="Full name" required />
          </Field>
          <Field label="Policy Start Date">
            <Input type="date" value={memberJoin} onValueChange={setMemberJoin} />
          </Field>
          <Field label="Treatment Date *">
            <Input type="date" value={treatDate} onValueChange={setTreatDate} required />
          </Field>
          <Field label="Claim Amount (₹) *">
            <Input type="number" value={claimAmt} onValueChange={setClaimAmt} placeholder="0" min="0" required />
          </Field>
          <Field label="Hospital">
            <Input value={hospital} onValueChange={setHospital} placeholder="Hospital name (if network)" />
          </Field>
          <div className="flex items-center gap-6 pt-5">
            <Toggle checked={cashless} onChange={setCashless} label="Cashless" />
            <Toggle checked={preAuth} onChange={setPreAuth} label="Pre-authorized" />
          </div>
        </div>
      </section>

      {/* Prescription */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Prescription</h3>
          <label className="flex items-center gap-2 text-sm text-red-600 cursor-pointer">
            <input type="checkbox" checked={noPrescription} onChange={e => setNoPrescription(e.target.checked)} className="rounded" />
            No prescription (missing documents)
          </label>
        </div>

        {!noPrescription && (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Doctor Name">
              <Input value={docName} onValueChange={setDocName} placeholder="Dr. Sharma" />
            </Field>
            <Field label="Registration Number">
              <Input value={docReg} onValueChange={setDocReg} placeholder="KA/45678/2015" />
            </Field>
            <Field label="Diagnosis" className="col-span-2">
              <Input value={diagnosis} onValueChange={setDiagnosis} placeholder="Viral fever, Gastroenteritis…" />
            </Field>
            <Field label="Medicines Prescribed">
              <Input value={medicines} onValueChange={setMedicines} placeholder="Paracetamol, Vitamin C" />
              <p className="text-xs text-gray-400 mt-1">Comma-separated</p>
            </Field>
            <Field label="Procedures">
              <Input value={procedures} onValueChange={setProcedures} placeholder="Root canal, Teeth whitening" />
              <p className="text-xs text-gray-400 mt-1">Comma-separated</p>
            </Field>
            <Field label="Tests Prescribed">
              <Input value={tests} onValueChange={setTests} placeholder="CBC, MRI Lumbar Spine" />
              <p className="text-xs text-gray-400 mt-1">Comma-separated</p>
            </Field>
            <Field label="Treatment (alternative medicine)">
              <Input value={treatment} onValueChange={setTreatment} placeholder="Panchakarma therapy" />
            </Field>
          </div>
        )}
      </section>

      {/* Bill */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Bill Line Items</h3>
        <div className="space-y-2">
          {billLines.map((line, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Item name (e.g. consultation_fee)"
                value={line.key}
                onChange={e => setLine(i, 'key', e.target.value)}
              />
              <div className="relative w-36">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                <input
                  className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="0"
                  type="number"
                  min="0"
                  value={line.amount}
                  onChange={e => setLine(i, 'amount', e.target.value)}
                />
              </div>
              {billLines.length > 1 && (
                <button type="button" onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add line item
          </button>
          {totalBill > 0 && (
            <p className="text-sm text-gray-500">Total: <span className="font-semibold text-gray-700">₹{totalBill.toLocaleString('en-IN')}</span></p>
          )}
        </div>
      </section>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
            Processing…
          </>
        ) : (
          'Submit Claim for Adjudication'
        )}
      </button>
    </form>
  );
}

function Field({ label, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ className = '', onValueChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onValueChange?: (v: string) => void; className?: string }) {
  return (
    <input
      className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${className}`}
      onChange={onValueChange ? e => onValueChange(e.target.value) : undefined}
      {...props}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
      {label}
    </label>
  );
}
