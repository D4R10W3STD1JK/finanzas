import { Globe, MapPin } from "lucide-react";
import { useMemo } from "react";
import { useHolidayRegions } from "../api/hooks";
import { Combobox } from "./Combobox";
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

/** Región que se propone a quien crea una cuenta: la de la instalación (.env), por defecto España. */
export function useSuggestedRegion(): Region | null {
  const { data } = useHolidayRegions();
  return useMemo(() => (data ? { country: data.default_country, subdiv: data.default_subdiv ?? null } : null), [data]);
}

/** País y región cuyos festivos se usan para mover los pagos recurrentes a día hábil. */
export function HolidayRegionPicker({ value, onChange }: { value: Region; onChange: (r: Region) => void }) {
  const { data } = useHolidayRegions();
  const countries = useMemo(
    () => (data?.countries ?? []).map((c) => ({ ...c, name: countryName(c.code) })).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [data],
  );
  const countryOptions = useMemo(() => countries.map((c) => ({ value: c.code, label: c.name })), [countries]);
  const subdivisions = countries.find((c) => c.code === value.country)?.subdivisions ?? [];
  const regionOptions = useMemo(
    () => [
      { value: "", label: "Solo festivos nacionales", hint: "Sin los festivos propios de una región" },
      ...subdivisions.map((s) => ({ value: s.code, label: s.name })),
    ],
    [subdivisions],
  );

  return (
    <div className="space-y-4">
      <Field label="País">
        {(id) => (
          <Combobox
            id={id}
            value={value.country}
            options={data ? countryOptions : [{ value: value.country, label: countryName(value.country) }]}
            onChange={(country) => onChange({ country, subdiv: null })}
            icon={<Globe className="size-4" aria-hidden />}
            searchPlaceholder="Buscar país…"
            disabled={!data}
          />
        )}
      </Field>
      {subdivisions.length > 0 && (
        <Field label="Región">
          {(id) => (
            <Combobox
              id={id}
              value={value.subdiv ?? ""}
              options={regionOptions}
              onChange={(subdiv) => onChange({ ...value, subdiv: subdiv || null })}
              icon={<MapPin className="size-4" aria-hidden />}
              searchPlaceholder="Buscar región…"
            />
          )}
        </Field>
      )}
    </div>
  );
}
