import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

const CUSTOM_OPTION = '__custom__'

const BLANK_FORM = {
  category: '',
  brand: '',
  modelName: '',
  name: '',
  wattage: '',
  quantity: '1',
  hoursPerDay: '',
}

// `editingAppliance` (optional): if provided, the modal switches to Edit
// mode — pre-fills fields from this row and does an UPDATE instead of an
// INSERT on submit. Pass `null`/omit for Add mode.
export default function AddApplianceModal({
  isOpen,
  onClose,
  categories,
  applianceChoices = [],
  editingAppliance = null,
  onSaved,
}) {
  const isEditing = Boolean(editingAppliance)

  const [selectedChoiceId, setSelectedChoiceId] = useState(CUSTOM_OPTION)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Re-sync form contents whenever the modal opens, or whichever
  // appliance it's editing changes.
  useEffect(() => {
    if (!isOpen) return

    if (editingAppliance) {
      setForm({
        category: editingAppliance.category || '',
        brand: '',
        modelName: '',
        name: editingAppliance.name || '',
        wattage: String(editingAppliance.wattage ?? ''),
        quantity: String(editingAppliance.quantity ?? '1'),
        hoursPerDay: String(editingAppliance.hours_per_day ?? ''),
      })
    } else {
      setForm(BLANK_FORM)
      setSelectedChoiceId(CUSTOM_OPTION)
    }
    setError('')
  }, [isOpen, editingAppliance])

  if (!isOpen) return null

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  const selectedChoice =
    selectedChoiceId !== CUSTOM_OPTION
      ? applianceChoices.find((c) => String(c.id) === selectedChoiceId)
      : null

  function handleChoiceSelect(e) {
    const id = e.target.value
    setSelectedChoiceId(id)

    if (id === CUSTOM_OPTION) return

    const choice = applianceChoices.find((c) => String(c.id) === id)
    if (!choice) return

    setForm((f) => ({
      ...f,
      category: choice.category ?? f.category,
      brand: choice.brand ?? f.brand,
      modelName: choice.model_name ?? f.modelName,
      wattage: choice.typical_wattage != null ? String(choice.typical_wattage) : f.wattage,
      hoursPerDay:
        choice.typical_hours_per_day != null
          ? String(choice.typical_hours_per_day)
          : f.hoursPerDay,
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      setError('You need to be signed in to save an appliance.')
      setSaving(false)
      return
    }

    if (isEditing) {
      const { error: updateError } = await supabase
        .from('appliances')
        .update({
          name: form.name,
          category: form.category,
          wattage: Number(form.wattage),
          quantity: Number(form.quantity),
          hours_per_day: Number(form.hoursPerDay),
        })
        .eq('id', editingAppliance.id)

      setSaving(false)

      if (updateError) {
        console.error('Failed to update appliance:', updateError)
        setError('Something went wrong saving your changes. Please try again.')
        return
      }
    } else {
      const name = `${form.brand} ${form.modelName}`.trim()

      const { error: insertError } = await supabase.from('appliances').insert({
        user_id: user.id,
        name,
        category: form.category,
        wattage: Number(form.wattage),
        quantity: Number(form.quantity),
        hours_per_day: Number(form.hoursPerDay),
        is_active: true,
      })

      setSaving(false)

      if (insertError) {
        console.error('Failed to add appliance:', insertError)
        setError('Something went wrong saving this appliance. Please try again.')
        return
      }
    }

    onSaved?.()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-gray-900/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-card shadow-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">
            {isEditing ? 'Edit Appliance' : 'Add Appliance'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Catalog picker — Add mode only */}
          {!isEditing && applianceChoices.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Choose from Catalog
              </label>
              <select
                value={selectedChoiceId}
                onChange={handleChoiceSelect}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
              >
                <option value={CUSTOM_OPTION}>Custom / Not Listed</option>
                {applianceChoices.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.brand} {c.model_name}
                    {c.typical_wattage ? ` — ${c.typical_wattage}W` : ''}
                  </option>
                ))}
              </select>

              {selectedChoice && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  {selectedChoice.energy_rating && `${selectedChoice.energy_rating} rating. `}
                  Fields below are filled in — you can still edit them.
                  {selectedChoice.notes && ` Note: ${selectedChoice.notes}`}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Category
            </label>
            <select
              required
              value={form.category}
              onChange={update('category')}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
            >
              <option value="" disabled>Select a category</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {isEditing ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Appliance Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Samsung WindFree 1.0 HP Split Type"
                value={form.name}
                onChange={update('name')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Brand
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Samsung"
                  value={form.brand}
                  onChange={update('brand')}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Model Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RT38 Inverter"
                  value={form.modelName}
                  onChange={update('modelName')}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
                />
              </div>
            </>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Wattage (W)
              </label>
              <input
                type="number"
                required
                min="1"
                placeholder="1200"
                value={form.wattage}
                onChange={update('wattage')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Quantity
              </label>
              <input
                type="number"
                required
                min="1"
                step="1"
                placeholder="1"
                value={form.quantity}
                onChange={update('quantity')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Hours/Day
              </label>
              <input
                type="number"
                required
                min="0"
                max="24"
                step="0.5"
                placeholder="8"
                value={form.hoursPerDay}
                onChange={update('hoursPerDay')}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none transition text-sm"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-danger bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold shadow-sm hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Appliance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}