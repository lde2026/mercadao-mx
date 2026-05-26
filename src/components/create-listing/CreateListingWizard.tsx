'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Brand, Displacement, EngineType, Category, MotoListing } from '@/types';
import { useApp } from '@/context/AppContext';
import { CURRENT_USER } from '@/data/mockData';
import {
  BRANDS, DISPLACEMENTS, CATEGORIES, CATEGORY_LABELS, STATES,
  DOCUMENTATION_OPTIONS, CONDITION_OPTIONS, generateQuickDescription,
} from '@/lib/utils';
import UploadMediaStep from './UploadMediaStep';

interface FormData {
  title: string;
  brand: Brand | '';
  model: string;
  year: string;
  displacement: Displacement | '';
  engineType: EngineType | '';
  category: Category | '';
  price: string;
  acceptsTrade: boolean;
  city: string;
  state: string;
  photos: File[];
  photoPreviewUrls: string[];
  videoUrl: string;
  description: string;
  documentation: string;
  condition: string;
}

const INITIAL: FormData = {
  title: '', brand: '', model: '', year: '', displacement: '', engineType: '', category: '',
  price: '', acceptsTrade: false, city: '', state: '',
  photos: [], photoPreviewUrls: [], videoUrl: '',
  description: '', documentation: '', condition: '',
};

const STEPS = ['Informações básicas', 'Preço e localização', 'Fotos e mídia', 'Descrição e publicação'];

export default function CreateListingWizard() {
  const router = useRouter();
  const { addListing } = useApp();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [published, setPublished] = useState(false);
  const [newListingId] = useState(`listing-new-${Date.now()}`);

  const update = (partial: Partial<FormData>) => setForm((p) => ({ ...p, ...partial }));

  const canAdvance = (): boolean => {
    if (step === 0) return !!(form.brand && form.category);
    if (step === 1) return !!(form.price && form.city && form.state);
    if (step === 2) return true; // fotos opcionais
    if (step === 3) return true; // description, docs, condition are optional
    return false;
  };

  const handlePublish = () => {
    const now = new Date().toISOString();
    const id = `listing-${Date.now()}`;
    const newListing: MotoListing = {
      id,
      userId: CURRENT_USER.id,
      productType: 'moto',
      title: form.title || `${form.brand} ${form.model || ''} ${form.year || ''}`.trim(),
      description: form.description,
      brand: form.brand as MotoListing['brand'],
      model: form.model,
      year: Number(form.year) || new Date().getFullYear(),
      displacement: (form.displacement || '250cc') as MotoListing['displacement'],
      engineType: (form.engineType || 'four_stroke') as MotoListing['engineType'],
      category: form.category as MotoListing['category'],
      price: Number(form.price) || 0,
      acceptsTrade: form.acceptsTrade,
      acceptsProposals: true,
      city: form.city,
      state: form.state,
      documentation: form.documentation || 'Com documento',
      condition: form.condition || 'Seminovo',
      status: 'active',
      photos: form.photoPreviewUrls.length > 0 ? form.photoPreviewUrls : ['/placeholder-moto.svg'],
      mainPhoto: form.photoPreviewUrls[0] ?? '/placeholder-moto.svg',
      views: 0,
      featured: false,
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    };
    addListing(newListing);
    setPublished(true);
  };

  if (published) {
    return <SuccessScreen listingId={newListingId} onNewListing={() => { setForm(INITIAL); setStep(0); setPublished(false); }} />;
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((label, idx) => (
            <div key={idx} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 transition-colors ${
                idx < step ? 'bg-orange-500 text-white' :
                idx === step ? 'bg-orange-500 text-white ring-2 ring-orange-500/30' :
                'bg-slate-200 text-slate-400'
              }`}>
                {idx < step ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : idx + 1}
              </div>
              {idx < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 transition-colors ${idx < step ? 'bg-orange-500' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          {STEPS.map((label, idx) => (
            <span key={idx} className={`text-xs font-medium hidden sm:block ${idx === step ? 'text-orange-500' : idx < step ? 'text-slate-500' : 'text-slate-300'}`}>
              {label}
            </span>
          ))}
        </div>
        <p className="sm:hidden text-sm font-semibold text-orange-500 mt-1">
          Passo {step + 1} de {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      {/* Step content */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        {step === 0 && <Step1 form={form} update={update} />}
        {step === 1 && <Step2 form={form} update={update} />}
        {step === 2 && <UploadMediaStep form={form} update={update} />}
        {step === 3 && <Step4 form={form} update={update} />}
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-6">
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-colors"
          >
            Voltar
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canAdvance()}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors"
          >
            Continuar
          </button>
        ) : (
          <button
            onClick={handlePublish}
            disabled={!canAdvance()}
            className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-black py-3.5 rounded-xl transition-colors"
          >
            Publicar anúncio
          </button>
        )}
      </div>
    </div>
  );
}

function Step1({ form, update }: { form: FormData; update: (p: Partial<FormData>) => void }) {
  return (
    <div className="space-y-5">
      <h2 className="text-slate-900 font-black text-xl mb-1">Informações básicas</h2>
      <p className="text-slate-500 text-sm">Conte-nos sobre a moto que você está vendendo.</p>

      <Field label="Título do anúncio" required>
        <input
          type="text"
          placeholder="Ex: Honda CRF 250R 2020 — Impecável"
          value={form.title}
          onChange={(e) => update({ title: e.target.value })}
          className="input-base"
          maxLength={80}
        />
        <span className="text-slate-400 text-xs mt-1">{form.title.length}/80 caracteres</span>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Marca" required>
          <select value={form.brand} onChange={(e) => update({ brand: e.target.value as Brand })} className="input-base">
            <option value="">Selecionar</option>
            {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Modelo" required>
          <input
            type="text"
            placeholder="Ex: CRF 250R"
            value={form.model}
            onChange={(e) => update({ model: e.target.value })}
            className="input-base"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Ano" required>
          <input
            type="number"
            placeholder="Ex: 2020"
            value={form.year}
            onChange={(e) => update({ year: e.target.value })}
            className="input-base"
            min={1990}
            max={2026}
          />
        </Field>
        <Field label="Cilindrada" required>
          <select value={form.displacement} onChange={(e) => update({ displacement: e.target.value as Displacement })} className="input-base">
            <option value="">Selecionar</option>
            {DISPLACEMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Tipo de motor" required>
        <div className="flex gap-3">
          {([['two_stroke', 'Dois Tempos'], ['four_stroke', 'Quatro Tempos']] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => update({ engineType: val })}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                form.engineType === val
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Modalidade" required>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => update({ category: cat })}
              className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                form.category === cat
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function Step2({ form, update }: { form: FormData; update: (p: Partial<FormData>) => void }) {
  return (
    <div className="space-y-5">
      <h2 className="text-slate-900 font-black text-xl mb-1">Preço e localização</h2>
      <p className="text-slate-500 text-sm">Defina o preço e onde a moto está localizada.</p>

      <Field label="Preço (R$)" required>
        <input
          type="number"
          placeholder="Ex: 28500"
          value={form.price}
          onChange={(e) => update({ price: e.target.value })}
          className="input-base"
          min={0}
        />
      </Field>

      <Field label="Aceita troca?">
        <div className="flex gap-3">
          {([['true', 'Sim, aceito troca'] as const, ['false', 'Não aceito troca'] as const] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => update({ acceptsTrade: val === 'true' })}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                (form.acceptsTrade ? 'true' : 'false') === val
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Cidade" required>
          <input
            type="text"
            placeholder="Ex: Curitiba"
            value={form.city}
            onChange={(e) => update({ city: e.target.value })}
            className="input-base"
          />
        </Field>
        <Field label="Estado" required>
          <select value={form.state} onChange={(e) => update({ state: e.target.value })} className="input-base">
            <option value="">UF</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Step4({ form, update }: { form: FormData; update: (p: Partial<FormData>) => void }) {
  const handleQuickDesc = () => {
    const desc = generateQuickDescription({
      brand: form.brand, model: form.model, year: Number(form.year),
      engineType: form.engineType, category: form.category,
      city: form.city, state: form.state, displacement: form.displacement,
    });
    update({ description: desc });
  };

  return (
    <div className="space-y-5">
      <h2 className="text-slate-900 font-black text-xl mb-1">Descrição e publicação</h2>
      <p className="text-slate-500 text-sm">Descreva a moto e adicione os últimos detalhes.</p>

      <Field label="Descrição">
        <div className="relative">
          <textarea
            rows={5}
            placeholder="Conte tudo sobre a moto: estado de conservação, modificações, histórico de manutenção..."
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
            className="input-base resize-none"
          />
          <button
            type="button"
            onClick={handleQuickDesc}
            className="absolute bottom-2 right-2 text-xs text-orange-500 hover:text-orange-600 bg-white hover:bg-orange-50 border border-orange-200 px-2 py-1 rounded-lg transition-colors"
          >
            ✨ Gerar descrição rápida
          </button>
        </div>
      </Field>

      <Field label="Documentação">
        <select value={form.documentation} onChange={(e) => update({ documentation: e.target.value })} className="input-base">
          <option value="">Selecionar</option>
          {DOCUMENTATION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>

      <Field label="Estado de conservação">
        <div className="grid grid-cols-2 gap-2">
          {CONDITION_OPTIONS.map((cond) => (
            <button
              key={cond}
              type="button"
              onClick={() => update({ condition: cond })}
              className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                form.condition === cond
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900'
              }`}
            >
              {cond}
            </button>
          ))}
        </div>
      </Field>

      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <p className="text-orange-600 text-sm font-medium mb-1">Quase lá!</p>
        <p className="text-slate-500 text-xs">
          Seu anúncio ficará visível imediatamente após publicação. Você poderá editá-lo a qualquer momento pela sua área.
        </p>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-slate-700 text-sm font-medium mb-1.5">
        {label} {required && <span className="text-orange-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function SuccessScreen({
  listingId,
  onNewListing,
}: {
  listingId: string;
  onNewListing: () => void;
}) {
  const router = useRouter();

  return (
    <div className="max-w-md mx-auto text-center py-12">
      <div className="w-20 h-20 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-2xl font-black text-slate-900 mb-3">Anúncio publicado!</h2>
      <p className="text-slate-500 mb-8">
        Sua moto está no ar. Compradores interessados já podem encontrá-la no Mercadão MX.
      </p>
      <div className="flex flex-col gap-3">
        <button
          onClick={() => router.push(`/motos/${listingId}`)}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl transition-colors"
        >
          Ver meu anúncio
        </button>
        <button
          onClick={onNewListing}
          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3.5 rounded-xl transition-colors"
        >
          Anunciar outra moto
        </button>
        <button
          onClick={() => router.push('/dashboard/anuncios')}
          className="text-slate-500 hover:text-slate-900 text-sm transition-colors py-2"
        >
          Gerenciar meus anúncios
        </button>
      </div>
    </div>
  );
}
