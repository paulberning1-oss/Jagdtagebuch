import { ChipGroup, Section, Sheet } from '../components/ui'
import { SIGHTING_SOURCES, type DayPeriod } from '../domain/hunt'
import { EMPTY_FILTER, MONTH_SHORT, RANGE_OPTIONS, type SightingFilter } from '../domain/sightings'
import type { Species } from '../domain/species'

const PERIODS: { id: DayPeriod; label: string }[] = [
  { id: 'Morgen', label: 'Morgen' },
  { id: 'Tag', label: 'Tag' },
  { id: 'Abend', label: 'Abend' },
  { id: 'Nacht', label: 'Nacht' },
]

export function activeFilterCount(f: SightingFilter) {
  return (f.speciesIds.length ? 1 : 0) + (f.range !== 'alle' ? 1 : 0) + (f.periods.length ? 1 : 0) + (f.months.length ? 1 : 0) + (f.sources.length ? 1 : 0)
}

export function FilterSheet({
  filter,
  species,
  onChange,
  onClose,
  resultText,
}: {
  filter: SightingFilter
  species: Species[]
  onChange: (f: SightingFilter) => void
  onClose: () => void
  resultText: string
}) {
  return (
    <Sheet
      title="Filter"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => onChange(EMPTY_FILTER)}>
            Zurücksetzen
          </button>
          <button className="btn btn-primary flex-1" onClick={onClose}>
            {resultText}
          </button>
        </>
      }
    >
      <Section title="Wildart">
        <ChipGroup multi options={species.map((s) => ({ id: s.id, label: s.name }))} value={filter.speciesIds} onChange={(speciesIds) => onChange({ ...filter, speciesIds })} />
      </Section>
      <Section title="Zeitraum">
        <ChipGroup options={RANGE_OPTIONS} value={[filter.range]} onChange={(v) => onChange({ ...filter, range: v[0] ?? 'alle' })} />
        <p className="mt-1 text-sm text-ink-dim">Jagdjahr = ab 1. April</p>
      </Section>
      <Section title="Tageszeit (nach Sonnenstand)">
        <ChipGroup multi options={PERIODS} value={filter.periods} onChange={(periods) => onChange({ ...filter, periods })} />
      </Section>
      <Section title="Monat">
        <ChipGroup
          multi
          options={MONTH_SHORT.map((m, i) => ({ id: String(i + 1), label: m }))}
          value={filter.months.map(String)}
          onChange={(v) => onChange({ ...filter, months: v.map(Number) })}
        />
      </Section>
      <Section title="Quelle">
        <ChipGroup multi options={SIGHTING_SOURCES} value={filter.sources} onChange={(sources) => onChange({ ...filter, sources })} />
      </Section>
    </Sheet>
  )
}
