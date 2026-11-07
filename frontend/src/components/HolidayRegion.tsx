import { useMemo } from "react";
import { useHolidayRegions } from "../api/hooks";
import { Field } from "./ui";

export type Region = { country: string; subdiv: string | null };

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(["es"], { type: "region" });
  } catch {
    return null;
  }
})();

function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Región que se propone a quien crea una cuenta: la del navegador si se conoce, si no la de la instalación. */
export function useSuggestedRegion(): Region | null {
  const { data } = useHolidayRegions();
  return useMemo(() => {
    if (!data) return null;
    const fromBrowser = navigator.languages
      .map((l) => l.split("-")[1]?.toUpperCase())
      .find((c) => c && data.countries.some((x) => x.code === c));
    const country = fromBrowser ?? data.default_country;
    return { country, subdiv: country === data.default_country ? (data.default_subdiv ?? null) : null };
  }, [data]);
}

/** País y región cuyos festivos se usan para mover los pagos recurrentes a día hábil. */
export function HolidayRegionPicker({ value, onChange }: { value: Region; onChange: (r: Region) => void }) {
  const { data } = useHolidayRegions();
  const countries = useMemo(
    () => (data?.countries ?? []).map((c) => ({ ...c, name: countryName(c.code) })).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [data],
  );
  const subdivisions = countries.find((c) => c.code === value.country)?.subdivisions ?? [];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="País">
        {(id) => (
          <select id={id} className="input" value={value.country} disabled={!data} onChange={(e) => onChange({ country: e.target.value, subdiv: null })}>
            {!data && <option value={value.country}>{countryName(value.country)}</option>}
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {subdivisions.length > 0 && (
        <Field label="Región">
          {(id) => (
            <select id={id} className="input" value={value.subdiv ?? ""} onChange={(e) => onChange({ ...value, subdiv: e.target.value || null })}>
              <option value="">Solo festivos nacionales</option>
              {subdivisions.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
    </div>
  );
}
